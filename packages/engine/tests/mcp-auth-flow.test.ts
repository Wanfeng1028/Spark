/**
 * MCP OAuth 授权流程单测（CK-5 批 2 第二步）：全副作用注入（fetch / 浏览器 / loopback
 * 桩），对桩回路逐段断言——元数据获取、动态注册 redirectUri 一致、授权 URL 的 state 与
 * 回调对账、state 不匹配与空 code 拒绝、超时 fail-closed、静态 client 优先不注册。
 */
import { describe, expect, it } from 'vitest'
import {
  defaultStartLoopback,
  runAuthFlow,
  wellKnownUrlOf,
  type LoopbackHandle,
} from '../src/mcp/auth-flow.js'
import type { AuthFlowConfig } from '../src/mcp/auth-flow.js'

const METADATA = {
  issuer: 'https://idp.example',
  authorization_endpoint: 'https://idp.example/authorize',
  token_endpoint: 'https://idp.example/token',
  registration_endpoint: 'https://idp.example/register',
}

/** fetch 桩：well-known 回元数据，注册回 client_id，token 端点回 access_token 并记录请求 */
function stubFetch(opts?: { register?: boolean; tokenStatus?: number }): {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  tokenBodies: URLSearchParams[]
  registered: Array<Record<string, unknown>>
} {
  const tokenBodies: URLSearchParams[] = []
  const registered: Array<Record<string, unknown>> = []
  return {
    tokenBodies,
    registered,
    fetch: async (url, init) => {
      if (url.includes('/.well-known/')) {
        return { ok: true, status: 200, json: async () => METADATA } as unknown as Response
      }
      if (url.includes('/register')) {
        registered.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        return {
          ok: true,
          status: 201,
          json: async () => ({ client_id: 'dyn-1' }),
        } as unknown as Response
      }
      if (url.includes('/token')) {
        tokenBodies.push(new URLSearchParams(String(init.body)))
        if (opts?.tokenStatus !== undefined && opts.tokenStatus !== 200) {
          return { ok: false, status: opts.tokenStatus, json: async () => ({}) } as unknown as Response
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 }),
        } as unknown as Response
      }
      throw new Error(`unexpected fetch ${url}`)
    },
  }
}

/** loopback 桩：记录 redirectUri 与授权 URL；测试手动注入 code/state 完成"回跳" */
function stubLoopback(): {
  start: (callbackPath: string) => LoopbackHandle
  redirectUris: string[]
  authorizeUrls: string[]
  complete: (state: string, code?: string) => void
} {
  const redirectUris: string[] = []
  const authorizeUrls: string[] = []
  let pending: ((v: { code: string; state: string }) => void) | null = null
  return {
    redirectUris,
    authorizeUrls,
    complete: (state, code = 'code-1') => {
      const resolve = pending
      if (resolve === null) throw new Error('no pending callback')
      resolve({ code, state })
    },
    start: (callbackPath) => {
      const redirectUri = `http://127.0.0.1:41234${callbackPath}`
      redirectUris.push(redirectUri)
      return {
        redirectUri,
        waitForCode: new Promise((resolve) => {
          pending = resolve
        }),
        close: () => {},
      }
    },
  }
}

function captureBrowser(urls: string[]): (url: string) => Promise<void> {
  return async (url) => {
    urls.push(url)
  }
}

const BASE_CONFIG: AuthFlowConfig = {
  serverName: 'demo',
  issuerBaseUrl: 'https://idp.example/',
}

describe('runAuthFlow', () => {
  it('全流程：注册 redirectUri 与回调一致、授权 URL 带同 state、交换用回调 code、令牌落形状', async () => {
    const stub = stubFetch()
    const loop = stubLoopback()
    const browserUrls: string[] = []
    const pending = runAuthFlow(BASE_CONFIG, {
      fetchLike: stub.fetch,
      openBrowser: captureBrowser(browserUrls),
      startLoopback: loop.start,
    })
    // openBrowser 已被 await——授权 URL 就绪，模拟用户授权后回跳（state 从 URL 取回）
    await new Promise((r) => setTimeout(r, 0))
    const state = new URL(browserUrls[0] ?? 'http://x?state=bad').searchParams.get('state') ?? ''
    loop.complete(state)
    const tokens = await pending
    expect(loop.redirectUris).toHaveLength(1)
    expect(stub.registered).toHaveLength(1)
    expect(stub.registered[0]?.['redirect_uris']).toEqual([loop.redirectUris[0]])
    expect(browserUrls).toHaveLength(1)
    const authorize = new URL(browserUrls[0] ?? 'http://x')
    expect(authorize.searchParams.get('client_id')).toBe('dyn-1')
    expect(authorize.searchParams.get('redirect_uri')).toBe(loop.redirectUris[0])
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(stub.tokenBodies).toHaveLength(1)
    expect(stub.tokenBodies[0]?.get('code')).toBe('code-1')
    expect(stub.tokenBodies[0]?.get('redirect_uri')).toBe(loop.redirectUris[0])
    expect(tokens.clientId).toBe('dyn-1')
    expect(tokens.accessToken).toBe('at-1')
    expect(tokens.refreshToken).toBe('rt-1')
    expect(tokens.expiresAt).toBeDefined()
  })

  it('静态 client_id 优先：不注册；state 不匹配整流程失败（CSRF 对账）', async () => {
    const stub = stubFetch()
    const loop = stubLoopback()
    const browserUrls: string[] = []
    const pending = runAuthFlow(
      { ...BASE_CONFIG, staticClientId: 'static-1', staticClientSecret: 'shh' },
      { fetchLike: stub.fetch, openBrowser: captureBrowser(browserUrls), startLoopback: loop.start },
    )
    await new Promise((r) => setTimeout(r, 0))
    loop.complete('wrong-state')
    await expect(pending).rejects.toThrow('state 不匹配')
    expect(stub.registered).toHaveLength(0)
    expect(new URL(browserUrls[0] ?? 'http://x').searchParams.get('client_id')).toBe('static-1')
  })

  it('回调空 code（授权页失败态）如实拒绝；元数据 404 带状态码抛错', async () => {
    const stub = stubFetch({ tokenStatus: 400 })
    const loop = stubLoopback()
    const browserUrls: string[] = []
    const pending = runAuthFlow(BASE_CONFIG, {
      fetchLike: stub.fetch,
      openBrowser: captureBrowser(browserUrls),
      startLoopback: loop.start,
    })
    await new Promise((r) => setTimeout(r, 0))
    const state = new URL(browserUrls[0] ?? 'http://x?state=bad').searchParams.get('state') ?? ''
    loop.complete(state, '')
    await expect(pending).rejects.toThrow('未携带 code')
  })

  it('总超时 fail-closed：回调一直不来，timeoutMs 到点整流程失败', async () => {
    const stub = stubFetch()
    const loop = stubLoopback()
    const pending = runAuthFlow(BASE_CONFIG, {
      fetchLike: stub.fetch,
      openBrowser: captureBrowser([]),
      startLoopback: loop.start,
      timeoutMs: 30,
    })
    await expect(pending).rejects.toThrow('授权超时')
  })

  it('无 registration_endpoint 且无静态 client_id：如实失败指路 mcp.json', async () => {
    const stub = stubFetch()
    const loop = stubLoopback()
    await expect(
      runAuthFlow(BASE_CONFIG, {
        fetchLike: (url, init) =>
          url.includes('/.well-known/')
            ? Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({ ...METADATA, registration_endpoint: undefined }),
              } as unknown as Response)
            : stub.fetch(url, init),
        openBrowser: captureBrowser([]),
        startLoopback: loop.start,
      }),
    ).rejects.toThrow('mcp.json')
  })

  it('wellKnownUrlOf：尾斜杠归一，不双写', () => {
    expect(wellKnownUrlOf('https://idp.example')).toBe('https://idp.example/.well-known/oauth-authorization-server')
    expect(wellKnownUrlOf('https://idp.example/')).toBe('https://idp.example/.well-known/oauth-authorization-server')
  })
})
