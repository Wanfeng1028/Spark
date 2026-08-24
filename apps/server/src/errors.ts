/**
 * 错误映射（doc/02 §7.4）：引擎语义错误 → HTTP 状态码 + `{code, message}` JSON。
 * zod 校验失败 400（issues 透出）；未知会话/请求 404；审批已答复 409；
 * 引擎 shutdown 503；其余一律 500 E_INTERNAL（详情只进日志，不透出）。
 */
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface ErrorBody {
  code: string
  message: string
  issues?: unknown
}

/** 带语义前缀的引擎错误（`E_NOT_FOUND: ...` 形态，Engine/SessionStore 抛出） */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message)
  }
}

const NOT_FOUND = new ApiError(404, 'E_NOT_FOUND', 'not found')

export function validationError(message: string, issues: unknown): ApiError {
  return new ApiError(400, 'E_VALIDATION', message, issues)
}

/** POST /api/permissions/:requestId 三态 → 200 / 409 / 404 */
export function replyOutcomeError(outcome: 'already-resolved' | 'unknown'): ApiError {
  if (outcome === 'already-resolved') {
    return new ApiError(409, 'E_ALREADY_RESOLVED', '审批请求已答复过')
  }
  return NOT_FOUND
}

/** Error → ApiError（按前缀识别语义错误；E_INTERNAL 不透出详情） */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.startsWith('E_NOT_FOUND')) return NOT_FOUND
  if (msg.startsWith('E_ALREADY_RESOLVED')) {
    return new ApiError(409, 'E_ALREADY_RESOLVED', '审批请求已答复过')
  }
  if (msg.startsWith('E_SHUTTING_DOWN')) {
    return new ApiError(503, 'E_SHUTTING_DOWN', '引擎正在关闭，拒绝新请求')
  }
  return new ApiError(500, 'E_INTERNAL', 'internal error')
}

/** 统一错误响应器（路由层 catch 后调用；500 详情只进日志） */
export function sendError(
  req: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
): FastifyReply {
  const api = toApiError(err)
  if (api.status >= 500) req.log.error({ err }, 'internal error')
  const body: ErrorBody = { code: api.code, message: api.message }
  if (api.issues !== undefined) body.issues = api.issues
  return reply.code(api.status).send(body)
}
