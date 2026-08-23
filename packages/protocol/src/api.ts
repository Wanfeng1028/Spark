/**
 * HTTP API DTO（doc/02 §4.5.1）——SessionMeta 的线上形状。
 */
import { z } from 'zod'
import { SessionIdSchema } from './ids.js'
import type { SparkEventEnvelope } from './events.js'
import type { TurnId } from './ids.js'

export const SessionStatusSchema = z.enum(['idle', 'running', 'waiting-approval'])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const SessionMetaDtoSchema = z.strictObject({
  id: SessionIdSchema,
  title: z.string(), // 空字符串 = 前端显示"新会话"（自动标题阶段四）
  model: z.string(), // provider/model 形式
  cwd: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(), // = 最近 durable 事件 time（列表排序键）
  lastSeq: z.number().int().nonnegative(),
  status: SessionStatusSchema, // 引擎从 SessionRuntime 实时填充
})
export type SessionMetaDto = z.infer<typeof SessionMetaDtoSchema>

/** 仅 GET /api/sessions/:id 携带 events（全部 durable 按 seq 升序——冷启动回放） */
export interface SessionDto extends SessionMetaDto {
  events?: SparkEventEnvelope[]
}

/** POST /:id/messages 响应：三态直通（HTTP 只表达"已受理"，不等 turn 结果） */
export interface SubmitResult {
  result: 'started' | 'steered' | 'queued'
  turnId?: TurnId
}
