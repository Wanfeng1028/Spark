/**
 * Transport 接口（doc/02 §4.7）：前端唯一的数据通道抽象。
 * HttpTransport 与 MockTransport 同构实现——后端不存在时前端可全量开发（协议先行/前端先行）。
 * 阶段三（doc/02 §6.6）：sendMessage/interrupt 显式携带 sessionId（HttpTransport 多会话路由；
 * MockTransport 单场景忽略）；getSession 为打开会话的全量 durable 回放入口（冷启动与断线重连同一路径）。
 */
import type { SparkEventEnvelope } from './events.js'
import type { Delivery, PermissionReply } from './primitives.js'
import type {
  AuditEntryDto,
  AuditQuery,
  AutomationCreate,
  AutomationRunDto,
  AutomationTriggerDto,
  CheckpointDto,
  CommandDto,
  McpServerDto,
  MemoryDto,
  ModelTestResultDto,
  ModelsDto,
  PairCodeDto,
  PairRedeemBody,
  PairStatusDto,
  PairTokenDto,
  PermissionPreset,
  PermissionRuleDto,
  RoutingDto,
  RoutingUpdate,
  SearchHitDto,
  SecretStatusDto,
  SessionDto,
  SessionEventsQuery,
  SkillDto,
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
  /**
   * GET /api/sessions/:id：meta + durable 事件（seq 升序——冷启动回放数据源）。
   * query 分页（工单 9.3）：limit 升序尾部切片 / before=seq 游标；无参 = 全量（向后兼容）。
   */
  getSession(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto>
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
  /** GET /api/routing：fallback 链 + 任务路由档 + 成本上限与累计（工单 7.7） */
  getRouting(): Promise<RoutingDto>
  /** PUT /api/routing：热更新路由配置（校验失败 400；下一请求生效；写回 models.json） */
  updateRouting(patch: RoutingUpdate): Promise<RoutingDto>
  /** DELETE /api/routing/usage：清零成本累计（解除熔断） */
  resetUsage(): Promise<RoutingDto>
  /** GET /api/commands：命令注册表（内置 action/client + ~/.spark/commands/*.md prompt，工单 7.4） */
  listCommands(): Promise<CommandDto[]>
  /** POST /api/sessions/:id/commands/:name：执行引擎命令（action=compact / prompt=自定义展开，工单 7.4） */
  executeCommand(sessionId: SessionId, name: string, args?: string): Promise<void>
  /** GET /api/mcp：MCP 服务器只读状态（连接失败也列出 connected:false，工单 7.4） */
  listMcpServers(): Promise<McpServerDto[]>
  /** GET /api/skills：已加载技能只读清单（工单 7.4） */
  listSkills(): Promise<SkillDto[]>
  /** GET /api/memories：长期记忆列表（设置页管理数据源，工单 7.5） */
  listMemories(): Promise<MemoryDto[]>
  /** DELETE /api/memories/:id：删除一条记忆（无此条 → E_NOT_FOUND） */
  removeMemory(id: number): Promise<void>
  /** GET /api/automation：自动化触发器清单（工单 7.6） */
  listAutomation(): Promise<AutomationTriggerDto[]>
  /** POST /api/automation：创建触发器（cron/watch/webhook 至少一种） */
  createAutomation(input: AutomationCreate): Promise<AutomationTriggerDto>
  /** DELETE /api/automation/:id：删除触发器（无此条 → E_NOT_FOUND） */
  removeAutomation(id: string): Promise<void>
  /** PUT /api/automation/:id/enabled：启停触发器 */
  setAutomationEnabled(id: string, enabled: boolean): Promise<void>
  /** GET /api/automation/runs?limit：运行历史（新→旧） */
  listAutomationRuns(limit?: number): Promise<AutomationRunDto[]>
  /** POST /api/automation/webhook/:id：外部触发（未启用 webhook 或停用 → 拒绝） */
  fireAutomationWebhook(id: string): Promise<void>
  /** POST /api/automation/:id/run：手动触发（测试/调试） */
  fireAutomationManual(id: string): Promise<void>
  /** GET /api/audit：审计日志明细流（新→旧；设置页查看器数据源，工单 7.12） */
  listAudit(query?: AuditQuery): Promise<AuditEntryDto[]>
  /** GET /api/search?q：会话全文搜索（事件内容命中；工单 7.13） */
  search(q: string, limit?: number): Promise<SearchHitDto[]>
  /** GET /api/pair：配对状态（监听地址/鉴权启用态/已配对设备；工单 9.1 / ADR D24） */
  getPairStatus(): Promise<PairStatusDto>
  /** POST /api/pair/code：签发配对码（6 位短码 60s 有效 + QR 出示内容） */
  createPairCode(): Promise<PairCodeDto>
  /** POST /api/pair：短码兑长效 token（移动端兑换口，鉴权自举；工单 9.1 / ADR D24） */
  redeemPair(body: PairRedeemBody): Promise<PairTokenDto>
  /** DELETE /api/pair/devices/:id：撤销设备（撤销后已连 SSE 立即断开） */
  revokePairDevice(id: string): Promise<void>
  dispose(): void
}
