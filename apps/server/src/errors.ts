/**
 * 错误映射（doc/02 §7.4）：引擎语义错误 → HTTP 状态码 + `{code, message}` JSON。
 * zod 校验失败 400（issues 透出）；未知会话/请求/快照 404；审批已答复 409；
 * turn 进行中（手动压缩/回滚）409；分叉三拒绝码 400/409；引擎 shutdown 503；
 * 回滚 git 失败 500（详情只进日志）；其余一律 500 E_INTERNAL（详情只进日志，不透出）。
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
  if (msg.startsWith('E_TURN_ACTIVE')) {
    return new ApiError(409, 'E_TURN_ACTIVE', 'turn 进行中，暂不能执行该操作')
  }
  if (msg.startsWith('E_TURN_MISMATCH')) {
    return new ApiError(409, 'E_TURN_MISMATCH', '期望 turn 与活动 turn 不符')
  }
  if (msg.startsWith('E_INVALID_BOUNDARY')) {
    return new ApiError(400, 'E_INVALID_BOUNDARY', '分叉边界事件不存在')
  }
  if (msg.startsWith('E_OPEN_TURN')) {
    return new ApiError(409, 'E_OPEN_TURN', 'turn 进行中，不可分叉')
  }
  if (msg.startsWith('E_ALREADY_EXISTS')) {
    return new ApiError(409, 'E_ALREADY_EXISTS', '目标会话已存在')
  }
  if (msg.startsWith('E_CHECKPOINT_ROLLBACK')) {
    // git 失败详情只进日志（sendError 对 >=500 记 req.log.error）
    return new ApiError(500, 'E_CHECKPOINT_ROLLBACK', '回滚失败：git 操作异常')
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
