/**
 * Transport 接口（doc/02 §4.7）：前端唯一的数据通道抽象。
 * HttpTransport 与 MockTransport 同构实现——后端不存在时前端可全量开发（协议先行/前端先行）。
 * 阶段三（doc/02 §6.6）：sendMessage/interrupt 显式携带 sessionId（HttpTransport 多会话路由；
 * MockTransport 单场景忽略）；getSession 为打开会话的全量 durable 回放入口（冷启动与断线重连同一路径）。
 */
import type { SparkEventEnvelope } from './events.js'
import type { Delivery, PermissionReply } from './primitives.js'
import type { SessionDto } from './api.js'
import type { RequestId, SessionId } from './ids.js'

export interface SendMessageOptions {
  delivery?: Delivery
  attachments?: string[]
}

export interface SubmitOutcome {
  result: 'started' | 'steered' | 'queued'
  turnId?: string
}

export interface Transport {
  /** 订阅事件流；返回退订函数 */
  onEvent(handler: (e: SparkEventEnvelope) => void): () => void
  sendMessage(sessionId: SessionId, text: string, opts?: SendMessageOptions): Promise<SubmitOutcome>
  interrupt(sessionId: SessionId): Promise<void>
  /** 手动压缩（doc/02 §5.8.5）：触发 compaction.* 事件对（SSE 推送；turn 进行中拒绝） */
  compact(sessionId: SessionId): Promise<void>
  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  /** GET /api/sessions/:id：meta + 全部 durable 事件（seq 升序——冷启动回放数据源） */
  getSession(sessionId: SessionId): Promise<SessionDto>
  listSessions(): Promise<SessionDto[]>
  createSession(opts?: { title?: string }): Promise<SessionDto>
  dispose(): void
}
