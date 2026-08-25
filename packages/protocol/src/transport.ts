/**
 * Transport 接口（doc/02 §4.7）：前端唯一的数据通道抽象。
 * HttpTransport 与 MockTransport 同构实现——后端不存在时前端可全量开发（协议先行/前端先行）。
 * 阶段三（doc/02 §6.6）：sendMessage/interrupt 显式携带 sessionId（HttpTransport 多会话路由；
 * MockTransport 单场景忽略）；getSession 为打开会话的全量 durable 回放入口（冷启动与断线重连同一路径）。
 */
import type { SparkEventEnvelope } from './events.js'
import type { Delivery, PermissionReply } from './primitives.js'
import type { CheckpointDto, PermissionRuleDto, SessionDto, TreeNodeDto } from './api.js'
import type { CheckpointId, EventId, RequestId, SessionId } from './ids.js'

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
  /** GET /api/sessions/:id/tree：树视图数据（doc/02 §5.8.6，阶段四工单 4.5） */
  getTree(sessionId: SessionId): Promise<TreeNodeDto[]>
  /** POST /api/sessions/:id/fork：从指定事件分叉新会话（三拒绝码经错误消息透出，§5.8.6） */
  fork(sessionId: SessionId, fromEventId: EventId): Promise<SessionDto>
  /** GET /api/sessions/:id/checkpoints：turn 边界快照列表（旧→新，工单 4.6） */
  listCheckpoints(sessionId: SessionId): Promise<CheckpointDto[]>
  /** POST /api/sessions/:id/checkpoints/:cid/rollback：工作区+会话文件复位到快照（回滚后 seq 回退，调用方须全量重放） */
  rollbackCheckpoint(sessionId: SessionId, checkpointId: CheckpointId): Promise<SessionDto>
  /** GET /api/permissions/rules：用户级权限规则列表（工单 4.7 规则管理数据源） */
  listPermissionRules(): Promise<PermissionRuleDto[]>
  /** POST /api/permissions/rules：新增/覆盖一条规则（action+resource 精确匹配去重） */
  addPermissionRule(rule: PermissionRuleDto): Promise<void>
  /** DELETE /api/permissions/rules：精确匹配删除（无此规则拒绝） */
  removePermissionRule(action: string, resource: string): Promise<void>
  dispose(): void
}
