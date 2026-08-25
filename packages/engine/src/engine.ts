/**
 * Engine 门面（doc/02 §5.2 / §5.0 组装根）：server 唯一的引擎入口。
 *
 * 组装：loadConfig → EventBus（sink 按 sessionId 路由到对应 SessionStore）
 * → ToolRegistry（内置四工具）→ PermissionService（用户级规则；项目级按会话
 * cwd 加载）→ LlmGateway（缺省 PiGateway，测试注入 ScriptedLlm）。
 * 每会话：SessionStore + SessionRuntime + Projector + Compactor + ToolPipeline
 * + runSessionLoop 后台循环（per-session 串行，跨会话并发）。
 *
 * 并发防护：同 id 并发 create/resume 只初始化一次（in-flight Promise 表）。
 * shutdown 序列（§5.2）：拒新 → 逐会话 interrupt + 关输入队列 → 等待 run-loop
 * 退出 → 审批 pending 全部 fail-closed → 全量 flush + close。
 */
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type {
  CheckpointId,
  Delivery,
  EventId,
  PermissionReply,
  RequestId,
  SessionId,
  SparkEventEnvelope,
  SparkEventMap,
  TurnId,
} from '@spark/protocol'
import type { SessionStatus } from '@spark/protocol'
import { EventBus } from './bus.js'
import type { EventSink, SubscribeHandle } from './bus.js'
import { CompactorImpl } from './compaction.js'
import { GitCheckpointer } from './checkpoint.js'
import type { CheckpointRecord } from './checkpoint.js'
import { loadConfig, loadProjectRules } from './config.js'
import type { PermissionRule } from './config.js'
import type { EngineConfig, ModelRef } from './config.js'
import type { LlmGateway, ResolvedModel } from './llm-gateway.js'
import type { Compactor } from './run-loop.js'
import { PiGateway } from './pi-gateway.js'
import { buildSystemPrompt } from './prompts.js'
import { ProjectorImpl } from './projector.js'
import { reasoningIncluded } from './projector.js'
import { runSessionLoop } from './run-loop.js'
import type { RunLoopDeps } from './run-loop.js'
import { PermissionServiceImpl } from './permission/service.js'
import { UserRuleStore } from './permission/store.js'
import { SessionIndex } from './session/index.js'
import type { SessionIndexRow } from './session/index.js'
import { Metrics } from './observability/metrics.js'
import { SessionRuntime } from './session/runtime.js'
import { SessionStore, danglingTurnIds, mungeDir, sessionFileName } from './session/store.js'
import type { SubmitResult } from './session/input-queue.js'
import { TitleGenerator } from './title.js'
import { ToolOutputStore } from './tools/output-store.js'
import { ToolPipelineImpl } from './tools/pipeline.js'
import { ToolRegistry } from './tools/registry.js'
import { registerBuiltinTools } from './tools/builtin/index.js'
import { newIds } from './ulid.js'
import { Logger } from './logger.js'
import type { SparkLogger } from './logger.js'

export const SPARK_VERSION = '0.1.0'

/** §5.2 SessionMeta：引擎层会话元数据（server 转 SessionMetaDto） */
export interface SessionMeta {
  id: SessionId
  title: string // 空字符串 = 前端显示"新会话"（自动标题阶段四）
  model: string // provider/model 形式
  cwd: string
  createdAt: number
  updatedAt: number // = 最近 durable 事件 time（列表排序键）
  lastSeq: number
}

export interface SessionHandle {
  readonly id: SessionId
  readonly meta: SessionMeta
  /** 三态直通受理结果（HTTP 只表达"已受理"） */
  send(text: string, delivery?: Delivery): Promise<SubmitResult>
  interrupt(): Promise<void>
  /** 手动压缩（§5.8.5）：turn 进行中拒绝（E_TURN_ACTIVE——压缩读全路径，避开运行竞态） */
  compact(): Promise<void>
  /** §5.8.6 fork：从指定事件分叉新会话（三拒绝码见 forkSession） */
  fork(fromEventId: EventId): Promise<SessionHandle>
  /** 实时状态（SessionRuntime + 审批挂起表合成） */
  status(): SessionStatus
  /** 全部 durable 事件按 seq 升序（GET /api/sessions/:id 回放数据源） */
  events(): SparkEventEnvelope[]
}

/** §5.8.6 树视图节点（server 转 TreeNodeDto；event 供 label 摘要） */
export interface SessionTreeNode {
  event: SparkEventEnvelope
  parentId: EventId | null
  childIds: EventId[]
}

/** 从某事件分叉出去的子会话 */
export interface ForkChildInfo {
  sessionId: SessionId
  title: string
  createdAt: number
}

/** GET /api/sessions/:id/tree 的引擎数据源 */
export interface SessionTreeInfo {
  nodes: SessionTreeNode[]
  /** 各节点分叉出的子会话（磁盘 header 扫描；v1 本地量级全量读） */
  forks: { fromEventId: EventId; child: ForkChildInfo }[]
}

/** UI 审批回复的三态（server 层映射 200 / 409 / 404） */
export type ReplyOutcome = 'ok' | 'already-resolved' | 'unknown'

export interface EngineDeps {
  /** 配置根目录（缺省 ~/.spark）；测试用临时目录 */
  root?: string
  /** 默认工作目录（createSession 未指定 cwd 时用；缺省 process.cwd()） */
  cwd?: string
  /** LLM 网关（缺省 PiGateway；测试注入 ScriptedLlm） */
  gateway?: LlmGateway
  /** 配置直注入（测试用；缺省 loadConfig(root)） */
  config?: EngineConfig
  now?: () => number
  /** 会话 id 生成器（缺省 UUID ULID 构造；测试注入固定值触发 ALREADY_EXISTS 拒绝码） */
  newSessionId?: () => SessionId
  /** 日志器（缺省 `new Logger({ root })` → stdout + `<root>/logs/engine.log` §5.10 双路） */
  logger?: SparkLogger
}

interface SessionEntry {
  store: SessionStore
  runtime: SessionRuntime
  meta: SessionMeta
  /** 手动压缩入口（§5.8.5；自动触发在 run-loop step ②） */
  compactor: Compactor
  /** turn 边界快照（工单 4.6；config.engine.checkpoints=false 时 null） */
  checkpointer: GitCheckpointer | null
  /** 会话自动标题入口（§5.11；turn.completed 后由 meta 订阅器触发） */
  titler: TitleGenerator
  /** 在途标题任务（null=无；触发去重 + shutdown 收尾） */
  titleTask: Promise<void> | null
  /** run-loop 后台循环体（shutdown 等待用） */
  loop: Promise<void>
}

export class Engine {
  private readonly root: string
  private readonly defaultCwd: string
  private readonly config: EngineConfig
  private readonly now: () => number
  private readonly newSessionId: () => SessionId
  private readonly bus: EventBus
  private readonly gateway: LlmGateway
  private readonly permission: PermissionServiceImpl
  /** 用户级权限规则仓（~/.spark/permissions.json；always 固化与规则管理 UI 的持久层） */
  private readonly ruleStore: UserRuleStore
  /** 进程内指标计数器（§5.10 清单；GET /api/metrics 数据源，工单 4.8） */
  private readonly metrics = new Metrics()
  /** 会话索引（node:sqlite；JSONL 恒为权威——损坏即降级磁盘扫描，工单 4.8） */
  private readonly index: SessionIndex | null
  private indexBroken = false
  private indexClosed = false
  private readonly indexReady: Promise<void>
  private readonly registry: ToolRegistry
  private readonly outputs: ToolOutputStore
  private readonly sessions = new Map<SessionId, SessionEntry>()
  private readonly inflight = new Map<SessionId, Promise<SessionEntry>>()
  /** 已答复过的 requestId（区分 409 与 404；进程生命周期内有效） */
  private readonly settledRequests = new Set<RequestId>()
  private shuttingDown = false
  private shutdownPromise: Promise<void> | null = null
  private readonly logger: SparkLogger
  private readonly ownsLogger: boolean

  constructor(deps: EngineDeps = {}) {
    this.root = deps.root ?? join(homedir(), '.spark')
    this.defaultCwd = deps.cwd ?? process.cwd()
    this.config = deps.config ?? loadConfig(this.root)
    this.now = deps.now ?? Date.now
    this.newSessionId = deps.newSessionId ?? newIds.session
    this.gateway = deps.gateway ?? new PiGateway()
    if (deps.logger !== undefined) {
      this.logger = deps.logger
      this.ownsLogger = false
    } else {
      this.logger = new Logger({ root: this.root })
      this.ownsLogger = true
    }
    this.logger.info('engine.start', { root: this.root, cwd: this.defaultCwd })

    // 会话索引：建库失败即降级（JSONL 权威不受影响）；启动重建对齐磁盘
    this.index = this.openIndex()
    this.indexReady = this.rebuildIndex().catch((err: unknown) => {
      this.disableIndex(err, 'session.index.rebuild.error')
    })

    // sink 路由：EventBus 单例 → 按 sessionId 找到对应 SessionStore（单写者）
    const sink: EventSink = {
      append: (e) => {
        const entry = this.sessions.get(e.sessionId)
        if (entry === undefined) {
          return Promise.reject(
            new Error(`E_ENGINE_NO_SESSION: 会话 ${e.sessionId} 未加载，拒绝落盘`),
          )
        }
        return entry.store.append(e)
      },
    }
    this.bus = new EventBus({
      sink,
      onSubscriberError: (err, e) => {
        this.logger.warn('bus.subscriber.error', {
          sid: e.sessionId,
          type: e.type,
          eventId: e.id,
          err,
        })
      },
    })

    this.registry = new ToolRegistry()
    registerBuiltinTools(this.registry)
    this.outputs = new ToolOutputStore(
      this.config.spark.engine.toolOutputLimitKB * 1024,
      join(this.root, 'tool-outputs'),
    )
    this.ruleStore = new UserRuleStore(
      join(this.root, 'permissions.json'),
      this.config.permissions.rules,
    )
    this.permission = new PermissionServiceImpl({
      bus: this.bus,
      ruleStore: this.ruleStore,
      projectRules: loadProjectRules(this.defaultCwd),
      timeoutMs: this.config.spark.engine.permissionTimeoutMs,
      metrics: this.metrics,
    })

    // meta 增量维护：durable 事件更新 updatedAt/lastSeq；session.title 更新标题
    this.bus.subscribe((e) => {
      const entry = this.sessions.get(e.sessionId)
      if (entry === undefined) return
      if (e.seq !== undefined && e.seq > entry.meta.lastSeq) {
        entry.meta.lastSeq = e.seq
        entry.meta.updatedAt = e.time
        this.touchIndex(e.sessionId, e.seq, e.time) // 索引增量（工单 4.8）
      }
      if (e.seq !== undefined) {
        this.metrics.inc('spark_events_durable_total')
      }
      if (e.type === 'session.title') {
        entry.meta.title = (e.data as { title: string }).title
        this.titleIndex(e.sessionId, entry.meta.title)
      }
      // 会话自动标题（§5.11 / 工单 4.4）：turn 完成后异步触发（无标题且无在途任务；
      // 失败不 emit error——空标题不悬空 UI，下一 turn.completed 重触发）
      if (
        e.type === 'turn.completed' &&
        entry.meta.title === '' &&
        entry.titleTask === null &&
        !this.shuttingDown
      ) {
        entry.titleTask = entry.titler
          .generate()
          .catch((err) => {
            this.logger.warn('session.title.error', { sid: e.sessionId, err })
          })
          .finally(() => {
            entry.titleTask = null
          })
      }
    })
  }

  /** §5.3 订阅透传（server SSE 的数据源；resume 供 SSE 背压 drain 恢复） */
  subscribe(
    handler: (e: SparkEventEnvelope) => void | false | Promise<void | false>,
    filter?: { sessionId?: SessionId },
  ): SubscribeHandle {
    return this.bus.subscribe(handler, filter)
  }

  async createSession(
    opts: { title?: string; model?: string; cwd?: string } = {},
  ): Promise<SessionHandle> {
    this.assertNotShutdown()
    const cwd = opts.cwd ?? this.defaultCwd
    const modelRef = this.resolveModelRef(opts.model)
    const modelStr = `${modelRef.provider}/${modelRef.model}`
    const sessionId = this.newSessionId()
    const createdAt = this.now()

    const dir = join(this.root, 'sessions', mungeDir(cwd))
    const path = join(dir, sessionFileName(createdAt, sessionId))
    const store = await SessionStore.create(
      path,
      {
        sparkVersion: SPARK_VERSION,
        cwd,
        createdAt,
        model: modelStr,
      },
      {
        onTailTorn: (reason) => {
          this.logger.warn('store.tail.torn', { path, reason })
        },
      },
    )
    const meta: SessionMeta = {
      id: sessionId,
      title: opts.title ?? '',
      model: modelStr,
      cwd,
      createdAt,
      updatedAt: createdAt,
      lastSeq: 0,
    }
    const entry = this.wireSession(store, meta, modelRef)
    this.sessions.set(sessionId, entry)
    await this.bus.emit(sessionId, 'session.created', {
      cwd,
      model: modelStr,
      ...(opts.title !== undefined ? { title: opts.title } : {}),
    })
    return this.handleOf(entry)
  }

  /** §5.2.1：定位文件 → read（坏行策略）→ 重建树 → 补闭合 → resumed{fromSeq} */
  async resumeSession(id: SessionId): Promise<SessionHandle> {
    this.assertNotShutdown()
    return this.handleOf(await this.requireEntry(id))
  }

  /** 已加载直用；未加载走 loadSession（inflight 去重）——resume/treeOf/fork 共用入口 */
  private async requireEntry(id: SessionId): Promise<SessionEntry> {
    const existing = this.sessions.get(id)
    if (existing !== undefined) return existing
    const inflight = this.inflight.get(id)
    if (inflight !== undefined) return inflight

    const task = this.loadSession(id)
    this.inflight.set(id, task)
    try {
      return await task
    } finally {
      this.inflight.delete(id)
    }
  }

  private async loadSession(id: SessionId): Promise<SessionEntry> {
    const path = await this.locateSessionFile(id)
    const store = await SessionStore.resume(path, {
      onTailTorn: (reason) => {
        this.logger.warn('store.tail.torn', { path, reason, sid: id })
      },
    })
    const events = store.tree.pathToRoot() // root → leaf = seq 升序
    const last = events[events.length - 1]
    const modelRef = this.resolveModelRef(store.header.model)
    const meta: SessionMeta = {
      id,
      title: titleOf(events),
      model: store.header.model,
      cwd: store.header.cwd,
      createdAt: store.header.createdAt,
      updatedAt: last?.time ?? store.header.createdAt,
      lastSeq: last?.seq ?? 0,
    }
    // seq 起点恢复（磁盘最后一行 durable seq），先于补闭合事件
    this.bus.restoreSeq(id, meta.lastSeq)
    const entry = this.wireSession(store, meta, modelRef)
    this.sessions.set(id, entry)
    // 崩溃遗留悬挂 turn：逐个补 turn.completed{aborted}（Codex interrupted 语义）
    for (const turnId of danglingTurnIds(events)) {
      await this.bus.emit(id, 'turn.completed', { turnId, finish: 'aborted' })
    }
    await this.bus.emit(id, 'session.resumed', { fromSeq: meta.lastSeq })
    return entry
  }

  /** 遍历 sessions 目录下的 `<ts>_<id>.jsonl` 定位会话文件；未找到 → E_NOT_FOUND 语义错误 */
  private async locateSessionFile(id: SessionId): Promise<string> {
    const path = await this.findSessionFile(id)
    if (path === null) throw new Error(`E_NOT_FOUND: 会话 ${id} 不存在`)
    return path
  }

  /** 同 locateSessionFile 但未找到返回 null（fork 的 ALREADY_EXISTS 碰撞检测用） */
  private async findSessionFile(id: SessionId): Promise<string | null> {
    const sessionsRoot = join(this.root, 'sessions')
    let dirs: string[]
    try {
      dirs = await readdir(sessionsRoot)
    } catch {
      return null
    }
    const suffix = `_${id}.jsonl`
    for (const dir of dirs) {
      const files = await readdir(join(sessionsRoot, dir))
      const hit = files.find((f) => f.endsWith(suffix))
      if (hit !== undefined) return join(sessionsRoot, dir, hit)
    }
    return null
  }

  /**
   * §5.8.6 forkFrom：复制 root→边界事件的路径行到新文件——重编 seq（1..k）、
   * 重链 parentId、改写 sessionId（事件 id 保留：compaction 锚点/引用完整性）；
   * header 记 parentSession/parentPath/parentEventId。
   * 三拒绝码（dsh SessionForkErrorCode 对照）：
   *   E_INVALID_BOUNDARY 边界事件不存在 / E_OPEN_TURN 边界落在未闭合 turn 中
   *   （含运行中会话）/ E_ALREADY_EXISTS 目标会话 id 已占用。
   */
  async forkSession(id: SessionId, fromEventId: EventId): Promise<SessionHandle> {
    this.assertNotShutdown()
    const source = await this.requireEntry(id)

    if (!source.store.tree.has(fromEventId)) {
      throw new Error(`E_INVALID_BOUNDARY: 分叉边界事件 ${fromEventId} 不存在`)
    }
    // OPEN_TURN ①：会话运行中（尾部可能正产生半成品 turn，复制会撕裂事件流）
    if (source.runtime.state === 'running') {
      throw new Error('E_OPEN_TURN: turn 进行中，不可分叉——请等本轮结束')
    }
    // OPEN_TURN ②：边界落在历史 turn 中间（turn.started 之后、turn.completed 之前）
    const path = source.store.tree.pathToRoot(fromEventId)
    const openTurns = new Set<TurnId>()
    for (const e of path) {
      if (e.id === fromEventId && openTurns.size > 0) {
        throw new Error('E_OPEN_TURN: 分叉边界落在未闭合 turn 中间')
      }
      if (e.type === 'turn.started') {
        openTurns.add((e.data as SparkEventMap['turn.started']).turnId)
      } else if (e.type === 'turn.completed') {
        openTurns.delete((e.data as SparkEventMap['turn.completed']).turnId)
      }
    }
    // ALREADY_EXISTS：目标 id 与已加载会话或磁盘文件碰撞（注入生成器可测）
    const newId = this.newSessionId()
    if (this.sessions.has(newId) || (await this.findSessionFile(newId)) !== null) {
      throw new Error(`E_ALREADY_EXISTS: 目标会话 ${newId} 已存在`)
    }

    const createdAt = this.now()
    const dir = join(this.root, 'sessions', mungeDir(source.meta.cwd))
    const forkPath = join(dir, sessionFileName(createdAt, newId))
    const store = await SessionStore.create(
      forkPath,
      {
        sparkVersion: SPARK_VERSION,
        cwd: source.meta.cwd,
        createdAt,
        model: source.meta.model,
        parentSession: id,
        parentPath: source.store.path,
        parentEventId: fromEventId,
      },
      {
        onTailTorn: (reason) => {
          this.logger.warn('store.tail.torn', { path: forkPath, reason, sid: newId })
        },
      },
    )
    let prev: EventId | null = null
    const copied = path.map((e, i) => {
      const c: SparkEventEnvelope = { ...e, sessionId: newId, seq: i + 1, parentId: prev }
      prev = e.id
      return c
    })
    await store.seed(copied)
    const last = copied[copied.length - 1]
    const meta: SessionMeta = {
      id: newId,
      title: titleOf(path), // 标题继承（复制行含源 session.created/session.title）
      model: source.meta.model,
      cwd: source.meta.cwd,
      createdAt,
      updatedAt: last?.time ?? createdAt, // 不变式：最近 durable 事件 time（fork 即边界事件 time）
      lastSeq: copied.length,
    }
    this.bus.restoreSeq(newId, meta.lastSeq) // 后续 emit 从 k+1 继续（无断洞）
    const modelRef = this.resolveModelRef(source.meta.model)
    const entry = this.wireSession(store, meta, modelRef)
    this.sessions.set(newId, entry)
    this.logger.info('session.forked', {
      sid: newId,
      parent: id,
      fromEventId,
      events: copied.length,
    })
    return this.handleOf(entry)
  }

  /** §5.8.6 树视图：会话内事件节点（v1 线性链）+ 从各节点分叉出去的子会话 */
  async treeOf(id: SessionId): Promise<SessionTreeInfo> {
    const entry = await this.requireEntry(id)
    const childrenOf = new Map<EventId, EventId[]>()
    const nodes: SessionTreeNode[] = entry.store.tree.list().map((n) => {
      if (n.parentId !== null) {
        const siblings = childrenOf.get(n.parentId) ?? []
        siblings.push(n.event.id)
        childrenOf.set(n.parentId, siblings)
      }
      return { event: n.event, parentId: n.parentId, childIds: [] }
    })
    for (const n of nodes) {
      n.childIds = childrenOf.get(n.event.id) ?? []
    }
    return { nodes, forks: await this.scanForkChildren(id) }
  }

  /** 工单 4.6：快照列表（创建序 = 旧→新；未启用/无快照 → []） */
  async checkpointsOf(id: SessionId): Promise<CheckpointRecord[]> {
    const entry = await this.requireEntry(id)
    return entry.checkpointer === null ? [] : entry.checkpointer.list()
  }

  // ---- 权限规则管理（§5.7 规则表 / 工单 4.7：用户级 permissions.json 的线上入口） ----

  listPermissionRules(): PermissionRule[] {
    return [...this.ruleStore.list()]
  }

  addPermissionRule(rule: PermissionRule): void {
    this.ruleStore.add(rule)
  }

  removePermissionRule(action: string, resource: string): boolean {
    return this.ruleStore.remove(action, resource)
  }

  // ---- 会话索引（工单 4.8：node:sqlite；JSONL 恒为权威，损坏降级磁盘扫描） ----

  private openIndex(): SessionIndex | null {
    try {
      return new SessionIndex(join(this.root, 'index.db'))
    } catch (err) {
      this.logger.error('session.index.open.error', { err })
      this.indexBroken = true
      return null
    }
  }

  /** boot 重建：磁盘扫描 → 全量写入（对齐 JSONL 权威）；已关闭（shutdown 先至）则跳过 */
  private async rebuildIndex(): Promise<void> {
    if (this.index === null || this.indexClosed) return
    const rows = await this.scanDiskSessions()
    this.index.rebuild(
      rows.map((m) => ({
        id: m.id,
        title: m.title,
        model: m.model,
        cwd: m.cwd,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        lastSeq: m.lastSeq,
      })),
    )
  }

  private touchIndex(id: SessionId, seq: number, time: number): void {
    if (this.index === null || this.indexBroken || this.indexClosed) return
    try {
      this.index.touch(id, seq, time)
    } catch (err) {
      this.disableIndex(err, 'session.index.touch.error')
    }
  }

  private titleIndex(id: SessionId, title: string): void {
    if (this.index === null || this.indexBroken || this.indexClosed) return
    try {
      this.index.setTitle(id, title)
    } catch (err) {
      this.disableIndex(err, 'session.index.title.error')
    }
  }

  /** 索引写失败：置降级标记并落结构化日志——主流程不受影响（JSONL 权威） */
  private disableIndex(err: unknown, msg: string): void {
    if (this.indexBroken) return
    this.indexBroken = true
    this.logger.error(msg, { err })
  }

  // ---- 指标（§5.10 清单 / 工单 4.8） ----

  /** Prometheus exposition 文本（sessions_active 为快照时点 gauge） */
  renderMetrics(): string {
    return this.metrics.render({ spark_sessions_active: this.sessions.size })
  }

  /** 结构化序列快照（测试断言用） */
  metricsSnapshot() {
    return this.metrics.snapshot()
  }

  /**
   * 工单 4.6 回滚：工作区 + 会话文件复位到快照。前置：会话 idle（运行中 →
   * E_TURN_ACTIVE）。停旧 run-loop/store → 覆写两域 → 重载（重建树、续 seq、
   * emit session.resumed）。E_NOT_FOUND 快照不存在；E_CHECKPOINT_ROLLBACK git 失败。
   */
  async rollbackToCheckpoint(id: SessionId, checkpointId: CheckpointId): Promise<SessionHandle> {
    this.assertNotShutdown()
    const entry = await this.requireEntry(id)
    if (entry.runtime.state === 'running') {
      throw new Error('E_TURN_ACTIVE: turn 进行中，不可回滚——请等本轮结束')
    }
    if (entry.checkpointer === null) {
      throw new Error(`E_NOT_FOUND: checkpoint ${checkpointId} 不存在（checkpoint 未启用）`)
    }
    // 单写者纪律：覆写会话文件前先停 run-loop、flush + close 旧 store
    entry.runtime.interrupt()
    entry.runtime.shutdown()
    await entry.loop
    await entry.store.close()
    this.sessions.delete(id)
    this.bus.forgetSession(id) // 总线水位随旧 store 一并清除——重载 restoreSeq 才能重设截断后的 seq 起点
    await entry.checkpointer.rollback(checkpointId)
    this.logger.info('session.rollback', { sid: id, checkpointId })
    return this.handleOf(await this.requireEntry(id)) // 重载：requireEntry → loadSession（树重建 + session.resumed）
  }

  /** 磁盘扫描 header.parentSession === id 的会话 → 边界事件 + 子会话信息（标题须读事件） */
  private async scanForkChildren(
    id: SessionId,
  ): Promise<{ fromEventId: EventId; child: ForkChildInfo }[]> {
    const out: { fromEventId: EventId; child: ForkChildInfo }[] = []
    const sessionsRoot = join(this.root, 'sessions')
    try {
      const dirs = await readdir(sessionsRoot, { withFileTypes: true })
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue
        for (const file of await readdir(join(sessionsRoot, dir.name))) {
          if (!file.endsWith('.jsonl')) continue
          const childId = idOfFileName(file)
          if (childId === null) continue
          const file_ = await SessionStore.read(join(sessionsRoot, dir.name, file))
          const h = file_.header
          if (h.parentSession !== id || h.parentEventId === undefined) continue
          out.push({
            fromEventId: h.parentEventId,
            child: { sessionId: childId, title: titleOf(file_.events), createdAt: h.createdAt },
          })
        }
      }
    } catch {
      // sessions 目录缺失 = 无分叉（首次运行）
    }
    return out
  }

  /** §5.2.1 listSessions：索引驱动（工单 4.8）；已加载会话以内存 meta 为准；q = 标题子串过滤 */
  async listSessions(opts?: { q?: string }): Promise<SessionMeta[]> {
    await this.indexReady
    let out: SessionMeta[]
    if (this.index !== null && !this.indexBroken && !this.indexClosed) {
      const rows = this.index.list(opts?.q)
      const byId = new Map<SessionId, SessionMeta>(rows.map((r) => [r.id, { ...r }]))
      // 已加载会话内存态覆盖（同样过 q 过滤）；索引缺失的已加载会话防御性补充
      const lower =
        opts?.q !== undefined && opts.q !== '' ? opts.q.toLowerCase() : undefined
      for (const entry of this.sessions.values()) {
        if (lower !== undefined && !entry.meta.title.toLowerCase().includes(lower)) continue
        byId.set(entry.meta.id, { ...entry.meta })
      }
      out = [...byId.values()]
    } else {
      out = await this.scanDiskSessions()
      if (opts?.q !== undefined && opts.q !== '') {
        const needle = opts.q.toLowerCase()
        out = out.filter((m) => m.title.toLowerCase().includes(needle))
      }
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt)
    return out
  }

  /**
   * 磁盘全量扫描（§5.2.1 v1 路径）：boot 索引重建与索引不可用降级共用。
   * 单用户本地量级全量读即可；文件名即 id（列表排序免读 header，pi 做法）。
   */
  private async scanDiskSessions(): Promise<SessionMeta[]> {
    const out: SessionMeta[] = []
    const sessionsRoot = join(this.root, 'sessions')
    try {
      const dirs = await readdir(sessionsRoot, { withFileTypes: true })
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue
        for (const file of await readdir(join(sessionsRoot, dir.name))) {
          if (!file.endsWith('.jsonl')) continue
          const path = join(sessionsRoot, dir.name, file)
          const id = idOfFileName(file)
          if (id === null) continue
          const file_ = await SessionStore.read(path)
          const events = file_.events
          const last = events[events.length - 1]
          out.push({
            id,
            title: titleOf(events),
            model: file_.header.model,
            cwd: file_.header.cwd,
            createdAt: file_.header.createdAt,
            updatedAt: last?.time ?? file_.header.createdAt,
            lastSeq: last?.seq ?? 0,
          })
        }
      }
    } catch {
      // sessions 目录缺失 = 空列表（首次运行）
    }
    return out
  }

  getSession(id: SessionId): SessionHandle | undefined {
    const entry = this.sessions.get(id)
    return entry === undefined ? undefined : this.handleOf(entry)
  }

  /** 已加载会话的实时状态；未加载一律 idle（无 runtime） */
  statusOf(id: SessionId): SessionStatus {
    const entry = this.sessions.get(id)
    if (entry === undefined) return 'idle'
    if (entry.runtime.state === 'running' && this.permission.isWaitingApproval(id)) {
      return 'waiting-approval'
    }
    return entry.runtime.state
  }

  /** UI 审批回复（server POST /api/permissions/:requestId 的引擎入口） */
  async replyPermission(
    requestId: RequestId,
    reply: PermissionReply,
    feedback?: string,
  ): Promise<ReplyOutcome> {
    const ok = await this.permission.reply(requestId, reply, feedback)
    if (ok) {
      this.settledRequests.add(requestId)
      return 'ok'
    }
    return this.settledRequests.has(requestId) ? 'already-resolved' : 'unknown'
  }

  /** §5.2 shutdown 序列（幂等） */
  shutdown(): Promise<void> {
    if (this.shutdownPromise !== null) return this.shutdownPromise
    this.shuttingDown = true
    this.shutdownPromise = this.doShutdown()
    return this.shutdownPromise
  }

  private async doShutdown(): Promise<void> {
    this.logger.info('engine.shutdown.start', { sessions: this.sessions.size })
    try {
      // 1) 拒新（assertNotShutdown 已生效）2) 逐会话 interrupt + 关输入队列
      for (const entry of this.sessions.values()) {
        entry.runtime.interrupt()
        entry.runtime.shutdown()
      }
      // 3) 等待 run-loop 退出（turn 收尾事件闭合）
      await Promise.all([...this.sessions.values()].map((e) => e.loop))
      // 3.5) 自动标题后台任务收尾（fire-and-forget 的 generateOnce；防 append-after-close）
      await Promise.all([...this.sessions.values()].map((e) => e.titleTask ?? Promise.resolve()))
      // 4) 审批 pending 全部 fail-closed（§5.7 补强 7）
      await this.permission.dispose()
      // 5) 全量 flush + close（fsync）
      for (const entry of this.sessions.values()) {
        await entry.store.close()
      }
      // 6) 会话索引收尾（工单 4.8）：先等 boot 重建完成再关库——防迟到的重建写库
      //    撞上已关闭句柄；closed 标记使后续增量写全部短路
      await this.indexReady
      if (this.index !== null && !this.indexClosed) {
        try {
          this.index.close()
        } catch (err) {
          this.logger.warn('session.index.close.error', { err })
        }
        this.indexClosed = true
      }
      this.logger.info('engine.shutdown.done')
    } catch (err) {
      this.logger.error('engine.shutdown.error', { err })
      throw err
    } finally {
      if (this.ownsLogger) await this.logger.close()
    }
  }

  // ---- 组装辅助 ----

  /** per-session 组件接线：Runtime/Projector/Compactor/Pipeline + run-loop 启动 */
  private wireSession(store: SessionStore, meta: SessionMeta, modelRef: ModelRef): SessionEntry {
    const model = this.resolveModel(modelRef)
    const runtime = new SessionRuntime(meta.id)
    const projector = new ProjectorImpl({
      tree: store.tree,
      includeReasoning: reasoningIncluded(model.provider),
      // 悬空锚点（数据损坏兜底被触发）：结构化 warning 可 grep，不静默退化
      onDanglingAnchor: (anchorId) => {
        this.logger.warn('projector.dangling_anchor', { sid: meta.id, anchorId })
      },
    })
    const compactionModel = this.resolveModel(this.config.models.compactionModel)
    const compactor = new CompactorImpl({
      sessionId: meta.id,
      bus: this.bus,
      gateway: this.gateway,
      projector,
      tree: store.tree,
      model: compactionModel,
      keepTokens: Math.round(
        (this.config.spark.engine.compactionThreshold * model.contextWindow) / 2,
      ),
    })
    const titler = new TitleGenerator({
      sessionId: meta.id,
      bus: this.bus,
      gateway: this.gateway,
      projector,
      model: compactionModel, // §5.11 辅助提示词同一廉价通道
    })
    const checkpointer = this.config.spark.engine.checkpoints
      ? new GitCheckpointer({
          sessionId: meta.id,
          cwd: meta.cwd,
          sessionPath: store.path,
          checkpointRoot: join(dirname(store.path), 'checkpoints'),
          bus: this.bus,
          logger: this.logger,
          now: this.now,
        })
      : null
    const tools = new ToolPipelineImpl({
      sessionId: meta.id,
      bus: this.bus,
      registry: this.registry,
      permission: this.permission,
      outputs: this.outputs,
      cwd: meta.cwd,
      maxToolParallel: this.config.spark.engine.maxToolParallel,
      progressThrottleMs: this.config.spark.engine.progressThrottleMs,
      metrics: this.metrics,
    })
    const deps: RunLoopDeps = {
      sessionId: meta.id,
      bus: this.bus,
      gateway: this.gateway,
      projector,
      compactor,
      tools,
      model,
      system: buildSystemPrompt(meta.cwd),
      maxStepsPerTurn: this.config.spark.engine.maxStepsPerTurn,
      compactionThreshold: this.config.spark.engine.compactionThreshold,
      metrics: this.metrics,
      ...(checkpointer !== null
        ? {
            checkpoint: {
              // 快照读会话文件前先 fsync（append 已落 page cache，fsync 保崩溃一致）
              snapshot: async (turnId: TurnId) => {
                await store.flush()
                await checkpointer.snapshot(turnId)
              },
            },
          }
        : {}),
    }
    const loop = runSessionLoop(runtime, deps)
    // 装载点同步索引（create/resume/fork/rollback 重载共用本单点，工单 4.8）
    this.syncIndex(meta)
    return { store, runtime, meta, compactor, checkpointer, titler, titleTask: null, loop }
  }

  /** 装载点 upsert：以内存 meta 全量覆盖索引行 */
  private syncIndex(meta: SessionMeta): void {
    if (this.index === null || this.indexBroken || this.indexClosed) return
    try {
      const row: SessionIndexRow = {
        id: meta.id,
        title: meta.title,
        model: meta.model,
        cwd: meta.cwd,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        lastSeq: meta.lastSeq,
      }
      this.index.upsert(row)
    } catch (err) {
      this.disableIndex(err, 'session.index.upsert.error')
    }
  }

  private handleOf(entry: SessionEntry): SessionHandle {
    return {
      id: entry.meta.id,
      get meta(): SessionMeta {
        return entry.meta
      },
      send: (text, delivery) => {
        if (this.shuttingDown) {
          return Promise.reject(new Error('E_SHUTTING_DOWN: 引擎正在关闭，拒绝新请求'))
        }
        return Promise.resolve(entry.runtime.submit(text, delivery))
      },
      interrupt: () => {
        entry.runtime.interrupt()
        return Promise.resolve()
      },
      compact: () => {
        if (this.shuttingDown) {
          return Promise.reject(new Error('E_SHUTTING_DOWN: 引擎正在关闭，拒绝新请求'))
        }
        // 压缩读全路径并落锚点事件——运行中 turn 会与之竞态，idle 才受理（§5.8.5）
        if (entry.runtime.state === 'running') {
          return Promise.reject(
            new Error('E_TURN_ACTIVE: turn 进行中，暂不能手动压缩——请等本轮结束'),
          )
        }
        return entry.compactor.compact()
      },
      fork: (fromEventId) => {
        if (this.shuttingDown) {
          return Promise.reject(new Error('E_SHUTTING_DOWN: 引擎正在关闭，拒绝新请求'))
        }
        return this.forkSession(entry.meta.id, fromEventId)
      },
      status: () => this.statusOf(entry.meta.id),
      events: () => entry.store.tree.pathToRoot(),
    }
  }

  private assertNotShutdown(): void {
    if (this.shuttingDown) {
      throw new Error('E_SHUTTING_DOWN: 引擎正在关闭，拒绝新请求')
    }
  }

  /** "provider/model" → ModelRef（缺省 defaultModel；provider 未配置 → E_CONFIG） */
  private resolveModelRef(model?: string): ModelRef {
    if (model === undefined) return this.config.models.defaultModel
    const slash = model.indexOf('/')
    if (slash <= 0 || slash === model.length - 1) {
      throw new Error(`E_CONFIG: model "${model}" 须为 provider/model 形式`)
    }
    const provider = model.slice(0, slash)
    if (this.config.models.providers[provider] === undefined) {
      throw new Error(`E_CONFIG: models.json 未配置 provider "${provider}"`)
    }
    return {
      provider,
      model: model.slice(slash + 1),
      contextWindow: this.config.models.defaultModel.contextWindow,
    }
  }

  /** ModelRef + providers 表 + 环境变量 → ResolvedModel（apiKey 只在此注入） */
  private resolveModel(ref: ModelRef): ResolvedModel {
    const provider = this.config.models.providers[ref.provider]
    if (provider === undefined) {
      throw new Error(`E_CONFIG: models.json 未配置 provider "${ref.provider}"`)
    }
    const apiKey =
      provider.apiKeyEnv === null ? undefined : process.env[provider.apiKeyEnv]
    return {
      provider: ref.provider,
      model: ref.model,
      contextWindow: ref.contextWindow,
      ...(apiKey !== undefined && apiKey !== '' ? { apiKey } : {}),
      ...(provider.baseUrl !== undefined ? { baseUrl: provider.baseUrl } : {}),
    }
  }
}

/** 文件名 `<ts>_<ses_id>.jsonl` → SessionId；不匹配返回 null */
function idOfFileName(file: string): SessionId | null {
  if (!file.endsWith('.jsonl')) return null
  const stem = file.slice(0, -'.jsonl'.length)
  const sep = stem.indexOf('_')
  // ISO 时间戳含 '-' 不含 '_'；首个 '_' 即分隔（ses_id 本身无 '_'）
  if (sep <= 0 || sep === stem.length - 1) return null
  return stem.slice(sep + 1) as SessionId
}

/** 路径上 session.created/session.title 的最新标题（无 → 空字符串） */
function titleOf(events: readonly SparkEventEnvelope[]): string {
  let title = ''
  for (const e of events) {
    if (e.type === 'session.created' || e.type === 'session.title') {
      title = (e.data as { title?: string }).title ?? ''
    }
  }
  return title
}
