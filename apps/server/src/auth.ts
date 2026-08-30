/**
 * 配对鉴权钩子（阶段九工单 9.1 / ADR D24：REST 与 SSE 同口径）：
 * - 环回绑定（缺省红线形态）：钩子只登记 token 哈希（撤销即断可用），绝不拒绝；
 * - 非环回绑定：对端环回地址豁免（本机浏览器/桌面壳照常）；其余请求须携
 *   Bearer token（REST）或 ?token=（SSE，EventSource 无法自定义头），同一
 *   校验函数同口径；未过 → 401 E_AUTH（fail-closed）。
 * - 拒绝判定在 **preHandler** 钩子、基于路由器解码后的匹配模式（`req.routeOptions.url`，
 *   如 `/api/sessions`）：防百分号编码路径绕过（`/%61pi/...` 原始前缀判断会误当静态资源，
 *   路由器解码后却命中数据面）；未匹配路由（静态 404 兜底）无模式可读，按非数据面豁免。
 * - 豁免路径：非 /api 静态资源（仅页面壳，数据面仍 401）与 /api/healthz、
 *   POST /api/pair（配对兑换是鉴权自举口，短码 60s 一次性 + 5 次失败锁定保护）。
 */
import type { FastifyPluginCallback, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { hashToken, isLoopbackRemote } from './pairing.js'
import type { DeviceStore } from './pairing.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** 鉴权通过的设备 token 哈希（SSE 撤销断连的追踪键；未鉴权请求为 undefined） */
    pairTokenHash?: string
  }
}

export interface AuthOptions {
  /** 非环回绑定才置 true（缺省环回 → 钩子只登记哈希不拒绝，红线不变） */
  required: boolean
  store: DeviceStore
}

/** 取请求携带的 token：Authorization: Bearer 优先，其次 ?token= 查询参数（SSE 同口径） */
export function tokenOf(req: FastifyRequest): string | undefined {
  const auth = req.headers.authorization
  if (auth !== undefined && auth.startsWith('Bearer ')) {
    const t = auth.slice('Bearer '.length).trim()
    if (t !== '') return t
  }
  const query = req.query as Record<string, unknown>
  return typeof query.token === 'string' && query.token !== '' ? query.token : undefined
}

/** 请求日志 URL 脱敏（secrets 纪律：?token= 明文长效 token 绝不进 pino 日志；其余查询参数保留） */
export function redactTokenQuery(url: string): string {
  return url.replace(/([?&]token=)[^&]*/g, '$1***')
}

const authPlugin: FastifyPluginCallback<AuthOptions> = (app, opts) => {
  // async 声明确保 Fastify 按 promise 风格识别（同步单参会被当 callback 风格等 done 而挂死）
  // eslint-disable-next-line @typescript-eslint/require-await -- 钩子体内无异步，但风格声明不可省
  app.addHook('onRequest', async (req) => {
    // 带有效 token 的连接一律登记哈希（撤销即断对环回/非环回同语义；
    // 环回无 token 请求不受影响 = 缺省行为不变红线）
    const token = tokenOf(req)
    const hash = token !== undefined ? hashToken(token) : undefined
    const device = hash !== undefined ? opts.store.findByTokenHash(hash) : undefined
    if (hash !== undefined && device !== undefined) {
      req.pairTokenHash = hash
      opts.store.touch(hash, Date.now())
    }
  })

  app.addHook('preHandler', async (req, reply) => {
    // 环回绑定只登记不拒绝（红线：缺省形态行为不变，但撤销即断仍成立）
    if (!opts.required) return

    // 基于路由器解码后的匹配模式判断（与路由器同源，免疫百分号编码绕过）；
    // 未匹配路由（静态 404 兜底）无模式可读——非数据面，豁免（响应无敏感数据）
    const pattern: string | undefined = req.routeOptions.url
    if (pattern === undefined) return
    if (!pattern.startsWith('/api') || pattern === '/api/healthz') return
    if (pattern === '/api/pair' && req.method === 'POST') return
    if (isLoopbackRemote(req.socket.remoteAddress)) return

    if (req.pairTokenHash === undefined) {
      return reply.code(401).send({ code: 'E_AUTH', message: '连接未通过鉴权：请配对设备或检查 token' })
    }
  })
}

// fastify-plugin 破封装：钩子挂根实例，覆盖全部路由插件（含 SSE）
export const registerAuth = fp(authPlugin, { name: 'spark-auth' })
