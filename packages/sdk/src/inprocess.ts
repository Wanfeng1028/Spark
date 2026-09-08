/**
 * 进程内通道（工单 14.4 / ADR D30、D31）：直连 Engine，不起 server、不占端口、不经序列化。
 *
 * 与 HTTP 通道的关系（ADR D31）：
 * - **同一合同**：实现 `@spark/protocol` 的 `Transport` 全接口，逐方法与 HTTP 通道一致；
 *   两通道各实例化同一份契约套件（`apps/server/tests/transport-contract.ts`）跑 parity。
 * - **同一装配**：便利分组走 `./client.ts` 的 `assembleClient`（结构保证，不是两份碰巧一样）。
 * - **错误同形**：引擎的错误消息本就带 `E_*` 原码（如 `E_NOT_FOUND: 会话 x 不存在`），与
 *   HTTP 通道 `code: message` 的抛法一致；引擎的**同步抛错**由 `sync()` 统一转成拒绝
 *   （否则同一失败在两通道上一个 throw 一个 reject，消费方的 catch 写不通用）。
 * - **不支持项显式报错**：服务端专有能力（目录列举、附件、配对）抛 `E_UNSUPPORTED`，
 *   不返回空值、不静默成功、不本地模拟（禁假实现）。
 *
 * 生命周期红线：`dispose()` **只退订与清 handler，不关引擎**——引擎属宿主
 * （`new Engine(...)` 与 `engine.shutdown()` 由嵌入方自己管；sdk 无权替宿主决定何时关）。
 *
 * 依赖方向（ADR D30）：本文件是子入口 `@spark/sdk/inprocess`，`@spark/engine` 声明为
 * optional peerDependency——主入口 `.`（HTTP）零 engine 依赖，浏览器端永不牵连引擎依赖面。
 */
import { buildTrace, sessionDtoOf, sessionMetaDtoOf, sessionTreeToDto, writeMcpConfig } from '@spark/engine'
import type { Engine, SessionHandle } from '@spark/engine'
import { ids } from '@spark/protocol'
import type {
  AgentPresetDto,
  AttachmentDto,
  AuditEntryDto,
  AuditQuery,
  AutomationCreate,
  AutomationRunDto,
  AutomationTriggerDto,
  CheckpointDto,
  CheckpointId,
  CommandDto,
  EventId,
  FsListDto,
  FsTreeDto,
  McpConfigInput,
  McpServerDto,
  MemoryDto,
  ModelTestResultDto,
  ModelsDto,
  PairCodeDto,
  PairRedeemBody,
  PairStatusDto,
  PairTokenDto,
  PermissionPreset,
  PermissionReply,
  PermissionRuleDto,
  ReasoningEffort,
  RequestId,
  RoutingDto,
  RoutingUpdate,
  SearchHitDto,
  SecretStatusDto,
  SendMessageOptions,
  SessionDto,
  SessionEventsQuery,
  SessionId,
  SettingsDto,
  SettingsUpdate,
  SkillDto,
  SparkEventEnvelope,
  SubmitOutcome,
  TraceDto,
  Transport,
  TreeNodeDto,
  UsageSummaryDto,
} from '@spark/protocol'
import { assembleClient } from './client.js'
import type { SparkClient } from './client.js'

/** engine.subscribe 的句柄类型不在 engine 公共面上（属内部件），故用 ReturnType 取名不 import */
type Subscription = ReturnType<Engine['subscribe']>

const DISPOSED = 'E_DISPOSED: 客户端已收口——进程内通道不再受理请求'

export class InProcessTransport implements Transport {
  private readonly engine: Engine
  private readonly handlers = new Set<(e: SparkEventEnvelope) => void>()
  private subscription: Subscription | null = null
  private disposed = false

  constructor(engine: Engine) {
    this.engine = engine
  }

  // ---------- 内部件 ----------

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error(DISPOSED)
  }

  /**
   * 同步门面方法 → Promise：Transport 合同是异步的，而引擎大半方法是同步的。
   * 顺带两件事：收口断言（失败闭合）、**同步抛错转拒绝**（与 HTTP 通道错误形状一致）。
   * 只用于引擎的同步方法；引擎的异步方法直接写 async 方法（避免 Promise 套 Promise）。
   */
  private sync<T>(produce: () => T): Promise<T> {
    if (this.disposed) return Promise.reject(new Error(DISPOSED))
    try {
      return Promise.resolve(produce())
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /** 服务端专有能力的如实报错（ADR D31 结论 3：禁假实现） */
  private unsupported<T>(method: string, reason: string): Promise<T> {
    return Promise.reject(new Error(`E_UNSUPPORTED: ${method} 需要 HTTP 通道（${reason}）`))
  }

  /** :id 通用入口：已加载直接用，未加载先 resume（与 server 的 requireHandle 同纪律） */
  private async handleOf(sessionId: SessionId): Promise<SessionHandle> {
    this.assertNotDisposed()
    return this.engine.getSession(sessionId) ?? (await this.engine.resumeSession(sessionId))
  }

  private dtoOf(handle: SessionHandle): SessionDto {
    return sessionMetaDtoOf(handle.meta, this.engine.statusOf(handle.id))
  }

  /** 首个订阅者到来时才向引擎订阅（惰性；单个退订不动引擎侧订阅，dispose 才收） */
  private ensureSubscribed(): void {
    if (this.subscription !== null || this.disposed) return
    this.subscription = this.engine.subscribe((e) => {
      for (const handler of [...this.handlers]) handler(e)
    })
  }

  // ---------- 事件流 ----------

  onEvent(handler: (e: SparkEventEnvelope) => void): () => void {
    this.assertNotDisposed()
    this.handlers.add(handler)
    this.ensureSubscribed()
    return () => {
      this.handlers.delete(handler)
    }
  }

  /** 只退订 + 清 handler；**不关引擎**（引擎生命周期属宿主，见头注） */
  dispose(): void {
    this.disposed = true
    this.subscription?.unsubscribe()
    this.subscription = null
    this.handlers.clear()
  }

  // ---------- 回合 ----------

  async sendMessage(sessionId: SessionId, text: string, opts?: SendMessageOptions): Promise<SubmitOutcome> {
    const handle = await this.handleOf(sessionId)
    // attachments 不透传：引擎的 send 不收附件（HTTP 通道同样"暂不发送"，两通道一致）
    const result = await handle.send(text, opts?.delivery, opts?.expectedTurnId)
    return {
      result: result.result,
      ...(result.turnId !== undefined ? { turnId: result.turnId } : {}),
    }
  }

  async interrupt(sessionId: SessionId): Promise<void> {
    const handle = await this.handleOf(sessionId)
    await handle.interrupt()
  }

  async compact(sessionId: SessionId): Promise<void> {
    const handle = await this.handleOf(sessionId)
    await handle.compact()
  }

  // ---------- 审批 ----------

  async replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void> {
    this.assertNotDisposed()
    const outcome = await this.engine.replyPermission(requestId, reply, feedback)
    // 三态映射与 server 的 replyOutcomeError 同码（ADR D31：审批同一路径、错误同形）
    if (outcome === 'already-resolved') throw new Error('E_ALREADY_RESOLVED: 审批请求已答复过')
    if (outcome !== 'ok') throw new Error(`E_NOT_FOUND: 审批请求 ${requestId} 不存在`)
  }

  listPermissionRules(): Promise<PermissionRuleDto[]> {
    return this.sync(() => this.engine.listPermissionRules())
  }

  addPermissionRule(rule: PermissionRuleDto): Promise<void> {
    return this.sync(() => this.engine.addPermissionRule(rule))
  }

  removePermissionRule(action: string, resource: string): Promise<void> {
    return this.sync(() => {
      if (!this.engine.removePermissionRule(action, resource)) throw new Error('E_NOT_FOUND: 规则不存在')
    })
  }

  async getPermissionPreset(sessionId: SessionId): Promise<PermissionPreset> {
    await this.handleOf(sessionId) // 存在性校验（与 server 的 :id 端点同纪律）
    return this.engine.permissionPresetOf(sessionId)
  }

  async setPermissionPreset(sessionId: SessionId, preset: PermissionPreset): Promise<void> {
    await this.handleOf(sessionId)
    this.engine.setPermissionPreset(sessionId, preset)
  }

  // ---------- 会话 ----------

  async createSession(opts?: { title?: string; model?: string }): Promise<SessionDto> {
    this.assertNotDisposed()
    const handle = await this.engine.createSession({
      ...(opts?.title !== undefined ? { title: opts.title } : {}),
      ...(opts?.model !== undefined ? { model: opts.model } : {}),
    })
    return this.dtoOf(handle)
  }

  /**
   * 会话列表。**已知差异（如实登记，不假造 parity）**：HTTP 通道受路由 `limit` 缺省 50 的
   * 分页约束，进程内通道没有传输上限故返回全量——契约套件不断言条数上限（doc/02 §4.7）。
   */
  async listSessions(archived?: boolean): Promise<SessionDto[]> {
    this.assertNotDisposed()
    const metas = await this.engine.listSessions(archived === undefined ? {} : { archived })
    return metas.map((m) => sessionMetaDtoOf(m, this.engine.statusOf(m.id)))
  }

  async getSession(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto> {
    const handle = await this.handleOf(sessionId)
    // 事件分页与 server 的 GET /:id 逐行同语义（工单 9.3）：before 游标过滤 → limit 尾部切片；
    // 两参缺省 = 全量（缺省行为不变红线）
    let events = handle.events()
    if (query?.before !== undefined) {
      const before = query.before
      events = events.filter((e) => e.seq !== undefined && e.seq < before)
    }
    if (query?.limit !== undefined) events = events.slice(-query.limit)
    return sessionDtoOf(handle.meta, this.engine.statusOf(sessionId), events)
  }

  async archiveSession(sessionId: SessionId, archived: boolean): Promise<SessionDto> {
    this.assertNotDisposed()
    const meta = await this.engine.archiveSession(sessionId, archived)
    return sessionMetaDtoOf(meta, this.engine.statusOf(sessionId))
  }

  async deleteSession(sessionId: SessionId): Promise<void> {
    this.assertNotDisposed()
    await this.engine.deleteSession(sessionId)
  }

  async getTree(sessionId: SessionId): Promise<TreeNodeDto[]> {
    this.assertNotDisposed()
    return sessionTreeToDto(await this.engine.treeOf(sessionId))
  }

  async getSessionTrace(sessionId: SessionId): Promise<TraceDto> {
    const handle = await this.handleOf(sessionId)
    return buildTrace(sessionId, handle.events())
  }

  async fork(sessionId: SessionId, fromEventId: EventId): Promise<SessionDto> {
    this.assertNotDisposed()
    return this.dtoOf(await this.engine.forkSession(sessionId, fromEventId))
  }

  async listCheckpoints(sessionId: SessionId): Promise<CheckpointDto[]> {
    this.assertNotDisposed()
    // commit sha 不上线（与 server 同口径，CheckpointDto §4.5.1）
    return (await this.engine.checkpointsOf(sessionId)).map((r) => ({
      checkpointId: r.checkpointId,
      turnId: r.turnId,
      createdAt: r.createdAt,
      files: r.files,
    }))
  }

  async rollbackCheckpoint(sessionId: SessionId, checkpointId: CheckpointId): Promise<SessionDto> {
    this.assertNotDisposed()
    return this.dtoOf(await this.engine.rollbackToCheckpoint(sessionId, checkpointId))
  }

  // ---------- 模型与路由 ----------

  listModels(): Promise<ModelsDto> {
    return this.sync(() => this.engine.listModels())
  }

  async testModelProvider(providerId: string): Promise<ModelTestResultDto> {
    this.assertNotDisposed()
    return this.engine.testModel(providerId)
  }

  async setSessionModel(sessionId: SessionId, model: string): Promise<string> {
    await this.handleOf(sessionId) // 存在性校验（与 server 的 :id 端点同纪律）
    return this.engine.setSessionModel(sessionId, model)
  }

  async setSessionEffort(sessionId: SessionId, effort: ReasoningEffort): Promise<ReasoningEffort> {
    await this.handleOf(sessionId)
    return this.engine.setSessionEffort(sessionId, effort)
  }

  getRouting(): Promise<RoutingDto> {
    return this.sync(() => this.engine.getRouting())
  }

  updateRouting(patch: RoutingUpdate): Promise<RoutingDto> {
    return this.sync(() => this.engine.updateRouting(patch))
  }

  resetUsage(): Promise<RoutingDto> {
    return this.sync(() => this.engine.resetUsage())
  }

  // ---------- 设置与命令 ----------

  getSettings(): Promise<SettingsDto> {
    return this.sync(() => this.engine.getSettings())
  }

  updateSettings(patch: SettingsUpdate): Promise<SettingsDto> {
    return this.sync(() => this.engine.updateSettings(patch))
  }

  listCommands(): Promise<CommandDto[]> {
    return this.sync(() => this.engine.listCommands())
  }

  async executeCommand(sessionId: SessionId, name: string, args?: string): Promise<void> {
    this.assertNotDisposed()
    await this.engine.executeCommand(sessionId, name, args)
  }

  updateMcpConfig(config: McpConfigInput): Promise<{ ok: true }> {
    return this.sync(() => {
      writeMcpConfig(this.engine.dataRoot, { servers: config.servers })
      return { ok: true }
    })
  }

  // ---------- 只读面 ----------

  listMcpServers(): Promise<McpServerDto[]> {
    return this.sync(() => this.engine.listMcpServers())
  }

  listSkills(): Promise<SkillDto[]> {
    return this.sync(() => this.engine.listSkills())
  }

  listAgentPresets(): Promise<AgentPresetDto[]> {
    // 引擎回 readonly 数组（它对外只读），Transport 合同是可变数组——拷一份不泄露引擎内部引用
    return this.sync(() => [...this.engine.listAgentPresets()])
  }

  usageSummary(since?: string): Promise<UsageSummaryDto> {
    return this.sync(() => this.engine.usageSummary(since))
  }

  listMemories(): Promise<MemoryDto[]> {
    return this.sync(() => this.engine.listMemories())
  }

  removeMemory(id: number): Promise<void> {
    return this.sync(() => {
      if (!this.engine.removeMemory(id)) throw new Error(`E_NOT_FOUND: 记忆 ${id} 不存在`)
    })
  }

  listAudit(query?: AuditQuery): Promise<AuditEntryDto[]> {
    // 缺省与 server 路由一致（limit 200）；过滤器逐项按需透传。
    // sessionId 补品牌：引擎审计流的 `sessionId?: string`，而 DTO 合同是 `SessionId`（品牌化）——
    // HTTP 通道是 JSON 往返后裸 cast，本通道如实补上（比 HTTP 侧更严，不是更宽）
    return this.sync(() =>
      this.engine
        .listAudit({
          limit: query?.limit ?? 200,
          ...(query?.kind !== undefined ? { kind: query.kind } : {}),
          ...(query?.result !== undefined ? { result: query.result } : {}),
          ...(query?.tool !== undefined ? { tool: query.tool } : {}),
          ...(query?.since !== undefined ? { since: query.since } : {}),
        })
        .map(({ sessionId, ...rest }): AuditEntryDto =>
          // 不用条件展开：`...(cond ? { sessionId: branded } : {})` 会让 TS 把 SessionId 与
          // 引擎侧的 string 并成 string（品牌被吃掉）；解构重建的两个分支各自合法，
          // 也不踩 exactOptionalPropertyTypes（不得给可选属性赋 undefined）
          sessionId === undefined ? rest : { ...rest, sessionId: ids.session(sessionId) },
        ),
    )
  }

  search(q: string, limit?: number): Promise<SearchHitDto[]> {
    return this.sync(() => this.engine.searchSessions(q, limit ?? 20))
  }

  // ---------- 密钥 ----------

  listSecrets(): Promise<SecretStatusDto[]> {
    return this.sync(() => this.engine.listSecrets())
  }

  setSecret(provider: string, value: string): Promise<void> {
    return this.sync(() => this.engine.setSecret(provider, value))
  }

  removeSecret(provider: string): Promise<void> {
    return this.sync(() => {
      if (!this.engine.removeSecret(provider)) throw new Error(`E_NOT_FOUND: 密钥 ${provider} 不存在`)
    })
  }

  // ---------- 自动化 ----------

  listAutomation(): Promise<AutomationTriggerDto[]> {
    return this.sync(() => this.engine.listAutomations())
  }

  createAutomation(input: AutomationCreate): Promise<AutomationTriggerDto> {
    return this.sync(() => this.engine.createAutomation(input))
  }

  removeAutomation(id: string): Promise<void> {
    return this.sync(() => {
      if (!this.engine.removeAutomation(id)) throw new Error(`E_NOT_FOUND: 触发器 ${id} 不存在`)
    })
  }

  setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
    return this.sync(() => {
      if (!this.engine.setAutomationEnabled(id, enabled)) throw new Error(`E_NOT_FOUND: 触发器 ${id} 不存在`)
    })
  }

  listAutomationRuns(limit?: number): Promise<AutomationRunDto[]> {
    return this.sync(() => this.engine.listAutomationRuns(limit ?? 100))
  }

  async fireAutomationWebhook(id: string): Promise<void> {
    this.assertNotDisposed()
    await this.engine.fireAutomationWebhook(id)
  }

  async fireAutomationManual(id: string): Promise<void> {
    this.assertNotDisposed()
    await this.engine.fireAutomationManual(id)
  }

  // ---------- 服务端专有：如实 E_UNSUPPORTED（ADR D31 结论 3，禁假实现） ----------

  listFs(): Promise<FsListDto> {
    // 目录列举与 resolveInRoot 硬边界规则住在 server；本地重写一份就是规则双源
    return this.unsupported('listFs', '目录列举与 cwd 硬边界规则由 server 实现')
  }

  listFsTree(): Promise<FsTreeDto> {
    return this.unsupported('listFsTree', '递归文件树由 server 实现（深度/条目上限同属该实现）')
  }

  uploadAttachment(): Promise<AttachmentDto> {
    return this.unsupported('uploadAttachment', '附件落盘 ~/.spark/attachments 由 server 实现')
  }

  getPairStatus(): Promise<PairStatusDto> {
    return this.unsupported('getPairStatus', '配对状态属 server 的监听面；嵌入场景宿主就是本机')
  }

  createPairCode(): Promise<PairCodeDto> {
    return this.unsupported('createPairCode', '配对码签发属 server 的监听面')
  }

  redeemPair(): Promise<PairTokenDto> {
    return this.unsupported('redeemPair', '短码兑换属 server 的鉴权自举面')
  }

  revokePairDevice(): Promise<void> {
    return this.unsupported('revokePairDevice', '设备撤销属 server 的 DeviceStore')
  }
}

/**
 * 装配一个进程内通道客户端（不起 server、不占端口、不经序列化）。
 *
 * ```ts
 * const engine = new Engine({ root: process.cwd() })
 * await engine.ready()
 * const client = createInProcessClient(engine)
 * client.events.subscribe((e) => console.log(e.type))
 * const session = await client.sessions.create()
 * await client.sessions.send(session.id, '你好')
 * client.close()          // 只退订，不关引擎
 * await engine.shutdown() // 引擎生命周期属宿主
 * ```
 *
 * 引擎需已 `ready()`（或调用方自行保证时序）；本函数不代宿主启动/关闭引擎。
 */
export function createInProcessClient(engine: Engine): SparkClient<InProcessTransport> {
  return assembleClient(new InProcessTransport(engine))
}
