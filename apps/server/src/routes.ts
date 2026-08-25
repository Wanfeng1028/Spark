/**
 * REST 路由（doc/02 §7.2）：zod 解析 → engine 调用 → DTO 序列化；错误经 errors.ts 映射。
 * 端点清单 = §4.5 表（tree/fork 阶段四，不注册）；并发安全由引擎单写者保证，路由层无锁。
 */
import type { FastifyPluginCallback } from 'fastify'
import { z } from 'zod'
import {
  DeliverySchema,
  PermissionReplySchema,
  RequestIdSchema,
  SessionIdSchema,
} from '@spark/protocol'
import type { SessionId } from '@spark/protocol'
import type { Engine, SessionHandle, SessionMeta } from '@spark/engine'
import type { SessionMetaDto } from '@spark/protocol'
import { sendError, validationError } from './errors.js'

export interface RoutesOptions {
  engine: Engine
}

/** 引擎 SessionMeta + 实时状态 → 线上 DTO（§4.5.1） */
function toDto(engine: Engine, meta: SessionMeta): SessionMetaDto {
  return {
    id: meta.id,
    title: meta.title,
    model: meta.model,
    cwd: meta.cwd,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    lastSeq: meta.lastSeq,
    status: engine.statusOf(meta.id),
  }
}

/** :id 路由通用入口：已加载直接用，未加载先 resumeSession（§7.2 GET 规格） */
async function requireHandle(engine: Engine, id: SessionId): Promise<SessionHandle> {
  return engine.getSession(id) ?? engine.resumeSession(id)
}

/** zod 失败 → 400（issues 透出，§7.4） */
function parseOr400<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw validationError('参数校验失败', parsed.error.issues)
  }
  return parsed.data
}

const CreateSessionBody = z.strictObject({
  title: z.string().optional(),
  model: z.string().optional(),
  cwd: z.string().optional(),
})

const ListSessionsQuery = z.object({
  limit: z.coerce.number().int().positive().default(50),
  cursor: SessionIdSchema.optional(),
})

const SendMessageBody = z.strictObject({
  text: z.string().min(1),
  delivery: DeliverySchema.default('now'),
})

const ReplyBody = z.strictObject({
  reply: PermissionReplySchema,
  feedback: z.string().optional(),
})

const IdParams = z.strictObject({ id: SessionIdSchema })
const RequestIdParams = z.strictObject({ requestId: RequestIdSchema })

export const registerRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

  app.post('/api/sessions', async (req, reply) => {
    try {
      const body = parseOr400(CreateSessionBody, req.body)
      const handle = await engine.createSession({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.cwd !== undefined ? { cwd: body.cwd } : {}),
      })
      return reply.code(201).send(toDto(engine, handle.meta))
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  app.get('/api/sessions', async (req, reply) => {
    try {
      const query = parseOr400(ListSessionsQuery, req.query)
      const all = await engine.listSessions() // 已按 updatedAt 倒序
      let start = 0
      if (query.cursor !== undefined) {
        const idx = all.findIndex((m) => m.id === query.cursor)
        if (idx === -1) {
          return reply.code(404).send({ code: 'E_NOT_FOUND', message: 'not found' })
        }
        start = idx + 1
      }
      return reply.send(all.slice(start, start + query.limit).map((m) => toDto(engine, m)))
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  app.get('/api/sessions/:id', async (req, reply) => {
    try {
      const { id } = parseOr400(IdParams, req.params)
      const handle = await requireHandle(engine, id)
      return reply.send({ ...toDto(engine, handle.meta), events: handle.events() })
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  app.post('/api/sessions/:id/messages', async (req, reply) => {
    try {
      const { id } = parseOr400(IdParams, req.params)
      const body = parseOr400(SendMessageBody, req.body)
      const handle = await requireHandle(engine, id)
      // 三态直通：HTTP 只表达"已受理"，不等 turn 结果（§7.2）
      return reply.send(await handle.send(body.text, body.delivery))
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  app.post('/api/sessions/:id/interrupt', async (req, reply) => {
    try {
      const { id } = parseOr400(IdParams, req.params)
      const handle = await requireHandle(engine, id)
      await handle.interrupt() // idle 时同样 200（幂等，§7.2）
      return reply.send({ ok: true })
    } catch (err) {
      return sendError(req, reply, err)
    }
  })

  app.post('/api/permissions/:requestId', async (req, reply) => {
    try {
      const { requestId } = parseOr400(RequestIdParams, req.params)
      const body = parseOr400(ReplyBody, req.body)
      const outcome = await engine.replyPermission(
        requestId,
        body.reply,
        ...(body.feedback !== undefined ? [body.feedback] : []),
      )
      if (outcome !== 'ok') {
        return reply.code(outcome === 'already-resolved' ? 409 : 404).send({
          code: outcome === 'already-resolved' ? 'E_ALREADY_RESOLVED' : 'E_NOT_FOUND',
          message: outcome === 'already-resolved' ? '审批请求已答复过' : 'not found',
        })
      }
      return reply.send({ ok: true })
    } catch (err) {
      return sendError(req, reply, err)
    }
  })
}
