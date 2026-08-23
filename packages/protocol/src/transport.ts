/**
 * Transport 接口（doc/02 §4.7）：前端唯一的数据通道抽象。
 * HttpTransport 与 MockTransport 同构实现——后端不存在时前端可全量开发（协议先行/前端先行）。
 */
import type { SparkEventEnvelope } from './events.js'
import type { Delivery, PermissionReply } from './primitives.js'
import type { SessionDto } from './api.js'
import type { RequestId } from './ids.js'

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
  sendMessage(text: string, opts?: SendMessageOptions): Promise<SubmitOutcome>
  interrupt(): Promise<void>
  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  listSessions(): Promise<SessionDto[]>
  createSession(opts?: { title?: string }): Promise<SessionDto>
  dispose(): void
}
