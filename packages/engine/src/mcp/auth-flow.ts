/**
 * MCP OAuth 授权流程装配（CK-5 批 2 第二步）：判据（oauth.ts）+ 本机 loopback 回调 +
 * 系统浏览器唤起，编排为一次可等待的 runAuthFlow()。副作用全部注入（fetch / 浏览器 /
 * loopback 工厂 / 总超时），单测用桩回路对全流程逐段断言；真实 OAuth server 全流程
 * 走查留用户（工单验收原口径）。
 *
 * 安全口径：① state 生成与对账在本流程内闭环（CSRF——回调 state 不匹配即整流程失败）；
 * ② 总超时缺省 5min fail-closed（授权页挂起不悬空）；③ verifier/refreshToken 不进日志
 * （错误信息只含端点与状态码）；④ client_secret 只在内存与令牌仓（0o600）出现。
 */
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import {
  buildAuthorizeUrl,
  exchangeToken,
  makePkcePair,
  parseAuthorizationServerMetadata,
  registerDynamicClient,
  type AuthorizationServerMetadata,
  type DynamicClientRegistration,
  type FetchLike,
} from './oauth.js'
import type { StoredTokenSet } from './token-store.js'

const DEFAULT_AUTH_TIMEOUT_MS = 5 * 60 * 1000

export interface AuthFlowConfig {
  /** mcp.json 里的 server 名（动态注册的 client_name 与错误信息用） */
  serverName: string
  /** issuer 基址（well-known 元数据由此推导，尾斜杠容忍） */
  issuerBaseUrl: string
  /** server 不支持动态注册时的静态客户端（mcp.json servers 配置项） */
  staticClientId?: string
  staticClientSecret?: string
  scope?: string
}

export interface LoopbackHandle {
  /** 含回调路径的完整重定向地址（127.0.0.1 随机口） */
  redirectUri: string
  /** 等授权 server 回跳（resolve = 拿到 code+state；流程超时由外层统一裁决） */
  waitForCode: Promise<{ code: string; state: string }>
  close: () => void
}

export interface AuthFlowDeps {
  fetchLike: FetchLike
  /** 唤起系统浏览器打开授权 URL（缺省按平台 spawn；注入可测） */
  openBrowser?: (url: string) => Promise<void>
  /** 起 loopback 回调（缺省 node:http 127.0.0.1 随机口；注入可测） */
  startLoopback?: (callbackPath: string) => LoopbackHandle
  /** 授权总超时（fail-closed；缺省 5min） */
  timeoutMs?: number
}

/** 平台默认浏览器唤起（win32 start / darwin open / 其余 xdg-open；spawn 失败如实抛） */
function defaultOpenBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true })
      child.on('error', reject)
      child.unref()
      resolve()
      return
    }
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
    const child = spawn(cmd, [url], { stdio: 'ignore', detached: true })
    child.on('error', reject)
    child.unref()
    resolve()
  })
}

/** 默认 loopback 回调：127.0.0.1 随机口；首个匹配路径的请求取码后关站并回一句提示 */
function defaultStartLoopback(callbackPath: string): LoopbackHandle {
  let settle: (v: { code: string; state: string }) => void = () => {}
  const waitForCode = new Promise<{ code: string; state: string }>((resolve) => {
    settle = resolve
  })
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== callbackPath) {
      res.statusCode = 404
      res.end()
      return
    }
    const code = url.searchParams.get('code') ?? ''
    const state = url.searchParams.get('state') ?? ''
    res.statusCode = 200
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<!doctype html><meta charset="utf-8"><title>Spark</title><p>授权完成，可回到 Spark 继续操作。</p>')
    settle({ code, state })
    server.close()
  })
  server.listen(0, '127.0.0.1')
  const port = (server.address() as AddressInfo).port
  return {
    redirectUri: `http://127.0.0.1:${port}${callbackPath}`,
    waitForCode,
    close: () => server.close(),
  }
}

/** RFC 8414 well-known 地址（issuer 尾斜杠归一） */
export function wellKnownUrlOf(issuerBaseUrl: string): string {
  return `${issuerBaseUrl.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`
}

async function fetchMetadata(issuerBaseUrl: string, fetchLike: FetchLike): Promise<AuthorizationServerMetadata> {
  const res = await fetchLike(wellKnownUrlOf(issuerBaseUrl), { method: 'GET' })
  if (!res.ok) {
    throw new Error(`OAuth 元数据获取失败（${res.status}）——${wellKnownUrlOf(issuerBaseUrl)}`)
  }
  return parseAuthorizationServerMetadata(await res.json())
}

/** 一次完整授权：loopback 先起（随机口全程固定——注册与授权的 redirect_uri 必须一致）→
 *  元数据 → 客户端（动态注册或静态）→ 授权页 → 回调 state 对账 → 换 token */
export async function runAuthFlow(config: AuthFlowConfig, deps: AuthFlowDeps): Promise<StoredTokenSet> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS
  const openBrowser = deps.openBrowser ?? defaultOpenBrowser
  const startLoopback = deps.startLoopback ?? defaultStartLoopback

  const deadline = Date.now() + timeoutMs
  const metadata = await fetchMetadata(config.issuerBaseUrl, deps.fetchLike)

  const loopback = startLoopback('/callback')
  try {
    // 客户端：静态 client_id 优先（mcp.json 配置）；否则动态注册；两者皆无如实失败
    let client: DynamicClientRegistration
    if (config.staticClientId !== undefined) {
      client = {
        clientId: config.staticClientId,
        ...(config.staticClientSecret !== undefined ? { clientSecret: config.staticClientSecret } : {}),
      }
    } else if (metadata.registration_endpoint !== undefined) {
      client = await registerDynamicClient(
        metadata.registration_endpoint,
        { redirectUri: loopback.redirectUri, clientName: `spark-${config.serverName}` },
        deps.fetchLike,
      )
    } else {
      throw new Error(`server ${config.serverName} 无 registration_endpoint 且未配置静态 client_id——请在 mcp.json 补充`)
    }

    const { verifier, challenge } = makePkcePair()
    const state = randomBytes(16).toString('base64url')
    const authorizeUrl = buildAuthorizeUrl({
      authorizationEndpoint: metadata.authorization_endpoint,
      clientId: client.clientId,
      redirectUri: loopback.redirectUri,
      codeChallenge: challenge,
      state,
      ...(config.scope !== undefined ? { scope: config.scope } : {}),
    })

    const withDeadline = async <T>(p: Promise<T>, what: string): Promise<T> => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error(`OAuth 授权超时（${what}）——fail-closed`)
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`OAuth 授权超时（${what}）——fail-closed`)), remaining)
      })
      try {
        return await Promise.race([p, timeout])
      } finally {
        clearTimeout(timer)
      }
    }

    await withDeadline(openBrowser(authorizeUrl), '打开浏览器')
    const callback = await withDeadline(loopback.waitForCode, '等待授权回调')
    if (callback.state !== state) {
      throw new Error('OAuth 回调 state 不匹配——疑似 CSRF 或旧授权页残留，流程终止')
    }
    if (callback.code === '') {
      throw new Error('OAuth 回调未携带 code——授权页返回了失败态')
    }
    const tokenSet = await withDeadline(
      exchangeToken(
        {
          tokenEndpoint: metadata.token_endpoint,
          code: callback.code,
          verifier,
          clientId: client.clientId,
          ...(client.clientSecret !== undefined ? { clientSecret: client.clientSecret } : {}),
          redirectUri: loopback.redirectUri,
        },
        deps.fetchLike,
      ),
      'token 交换',
    )
    return {
      clientId: client.clientId,
      ...(client.clientSecret !== undefined ? { clientSecret: client.clientSecret } : {}),
      accessToken: tokenSet.accessToken,
      ...(tokenSet.refreshToken !== undefined ? { refreshToken: tokenSet.refreshToken } : {}),
      ...(tokenSet.expiresAt !== undefined ? { expiresAt: tokenSet.expiresAt } : {}),
      ...(tokenSet.scope !== undefined ? { scope: tokenSet.scope } : {}),
      // token 端点随仓落盘——manager 静默刷新免二次元数据发现
      tokenEndpoint: metadata.token_endpoint,
    }
  } finally {
    loopback.close()
  }
}
