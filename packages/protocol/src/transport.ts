/**
 * Transport 接口（doc/02 §4.7）：前端唯一的数据通道抽象。
 * HttpTransport 与 MockTransport 同构实现——后端不存在时前端可全量开发（协议先行/前端先行）。
 * 阶段三（doc/02 §6.6）：sendMessage/interrupt 显式携带 sessionId（HttpTransport 多会话路由；
 * MockTransport 单场景忽略）；getSession 为打开会话的全量 durable 回放入口（冷启动与断线重连同一路径）。
 */
import type { SparkEventEnvelope } from './events.js'
import type { Delivery, PermissionReply } from './primitives.js'
import type {
  CheckpointDto,
  ModelTestResultDto,
  ModelsDto,
  PermissionPreset,
  PermissionRuleDto,
  SecretStatusDto,
  SessionDto,
  TreeNodeDto,
} from './api.js'
import type { CheckpointId, EventId, RequestId, SessionId, TurnId } from './ids.js'

export interface SendMessageOptions {
  delivery?: Delivery
  attachments?: string[]
  /** steer 目标 turn 校验（§5.4，阶段五工单 5.4）：与活动 turn 不符 → E_TURN_MISMATCH */
  expectedTurnId?: TurnId
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
  /** 新建会话（model 为 "provider/model"；缺省 = 引擎 defaultModel） */
  createSession(opts?: { title?: string; model?: string }): Promise<SessionDto>
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
  /** GET /api/secrets：provider 密钥状态（store/env/none；值永不回传，阶段七工单 7.1） */
  listSecrets(): Promise<SecretStatusDto[]>
  /** PUT /api/secrets/:provider：新增/覆盖一条密钥（写入 ~/.spark/secrets.json） */
  setSecret(provider: string, value: string): Promise<void>
  /** DELETE /api/secrets/:provider：删除密钥仓条目（env 来源不可删） */
  removeSecret(provider: string): Promise<void>
  /** GET /api/sessions/:id/permission-preset：会话当前权限档位（内存态，重启回缺省） */
  getPermissionPreset(sessionId: SessionId): Promise<PermissionPreset>
  /** PUT /api/sessions/:id/permission-preset：设置权限档位（D7 补记预设层，写会话临时层） */
  setPermissionPreset(sessionId: SessionId, preset: PermissionPreset): Promise<void>
  /** GET /api/models：供应商清单（内置/自定义）+ 可选模型 + defaultModel（工单 6.5） */
  listModels(): Promise<ModelsDto>
  /** POST /api/models/:id/test：连通测试（时延/错误人话文案；ok=false 不算传输失败） */
  testModelProvider(providerId: string): Promise<ModelTestResultDto>
  /** PUT /api/sessions/:id/model：会话级换模型（内存态，下一个 turn 生效；重启回会话文件模型） */
  setSessionModel(sessionId: SessionId, model: string): Promise<string>
  dispose(): void
}
