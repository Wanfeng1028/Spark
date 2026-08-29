/**
 * 配对鉴权路由（阶段九工单 9.1 / ADR D24，DESIGN §13.J.2.9 扫码为主手输兜底）：
 * - GET    /api/pair            配对状态（监听地址/鉴权启用态/设备列表）
 * - POST   /api/pair            移动端兑换：6 位短码 → 长效 token（鉴权自举口，钩子豁免）
 * - POST   /api/pair/code       桌面端签发短码（60s 有效 + QR 出示内容）
 * - DELETE /api/pair/devices/:id 撤销设备（撤销后已连 SSE 立即断开）
 */
import type { FastifyPluginCallback } from 'fastify'
import { z } from 'zod'
import { PairRedeemBodySchema } from '@spark/protocol'
import type { PairCodeDto, PairStatusDto } from '@spark/protocol'
import { sendError, validationError } from './errors.js'
import type { DeviceStore, PairService } from './pairing.js'

export interface PairingRoutesOptions {
  store: DeviceStore
  pair: PairService
  /** server 实际监听地址与端口（状态展示 + QR 内容） */
  host: string
  port: number
  loopback: boolean
}

const DeviceIdParams = z.strictObject({ id: z.string().min(1) })

/** zod 失败 → 400（与 routes.ts 同构） */
function parseOr400<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw validationError('参数校验失败', parsed.error.issues)
  }
  return parsed.data
}

export const registerPairingRoutes: FastifyPluginCallback<PairingRoutesOptions> = (app, opts) => {
  const { store, pair, host, port, loopback } = opts

  app.get('/api/pair', () => {
    const status: PairStatusDto = {
      host,
      port,
      loopback,
      authEnabled: store.enabled,
      devices: store.list().map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt,
      })),
    }
    return status
  })

  // 兑换口：鉴权钩子豁免（自举）；短码 60s 一次性保护（错码/过期/重放一律拒绝）
  app.post('/api/pair', async (req, reply) => {
    try {
      const parsed = PairRedeemBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return sendError(req, reply, validationError('参数校验失败', parsed.error.issues))
      }
      const { token } = pair.redeem(parsed.data.code, parsed.data.name ?? '移动设备')
      return reply.send({ token })
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  app.post('/api/pair/code', async (req, reply) => {
    try {
      const { code, expiresAt } = pair.createCode()
      const dto: PairCodeDto = {
        code,
        expiresAt,
        qr: `spark://pair?host=${host}&port=${port}&code=${code}`,
      }
      return reply.send(dto)
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  app.delete('/api/pair/devices/:id', async (req, reply) => {
    try {
      const { id } = parseOr400(DeviceIdParams, req.params)
      const removed = store.remove(id)
      if (removed === undefined) {
        return reply.code(404).send({ code: 'E_NOT_FOUND', message: '无此配对设备' })
      }
      app.sseRevokeToken(removed.tokenHash) // 撤销即断（D24）
      return reply.send({ ok: true })
    } catch (err) {
      return sendError(req, reply, err)
    }
  })
}
