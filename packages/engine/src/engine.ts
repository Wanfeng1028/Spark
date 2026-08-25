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
import { join } from 'node:path'
import type {
  Delivery,
  PermissionReply,
  RequestId,
  SessionId,
  SparkEventEnvelope,
} from '@spark/protocol'
import type { SessionStatus } from '@spark/protocol'
import { EventBus } from './bus.js'
import type { EventSink, SubscribeHandle } from './bus.js'
import { CompactorImpl } from './compaction.js'
import { loadConfig, loadProjectRules } from './config.js'
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
  /** 实时状态（SessionRuntime + 审批挂起表合成） */
  status(): SessionStatus
  /** 全部 durable 事件按 seq 升序（GET /api/sessions/:id 回放数据源） */
  events(): SparkEventEnvelope[]
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
  /** 日志器（缺省 `new Logger({ root })` → stdout + `<root>/logs/engine.log` §5.10 双路） */
  logger?: SparkLogger
}

interface SessionEntry {
  store: SessionStore
  runtime: SessionRuntime
  meta: SessionMeta
  /** 手动压缩入口（§5.8.5；自动触发在 run-loop step ②） */
  compactor: Compactor
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
  private readonly bus: EventBus
  private readonly gateway: LlmGateway
  private readonly permission: PermissionServiceImpl
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
    this.gateway = deps.gateway ?? new PiGateway()
    if (deps.logger !== undefined) {
      this.logger = deps.logger
      this.ownsLogger = false
    } else {
      this.logger = new Logger({ root: this.root })
      this.ownsLogger = true
    }
    this.logger.info('engine.start', { root: this.root, cwd: this.defaultCwd })

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
    this.permission = new PermissionServiceImpl({
      bus: this.bus,
      userRules: this.config.permissions.rules,
      projectRules: loadProjectRules(this.defaultCwd),
      timeoutMs: this.config.spark.engine.permissionTimeoutMs,
    })

    // meta 增量维护：durable 事件更新 updatedAt/lastSeq；session.title 更新标题
    this.bus.subscribe((e) => {
      const entry = this.sessions.get(e.sessionId)
      if (entry === undefined) return
      if (e.seq !== undefined && e.seq > entry.meta.lastSeq) {
        entry.meta.lastSeq = e.seq
        entry.meta.updatedAt = e.time
      }
      if (e.type === 'session.title') {
        entry.meta.title = (e.data as { title: string }).title
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
    const sessionId = newIds.session()
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
    const existing = this.sessions.get(id)
    if (existing !== undefined) return this.handleOf(existing)
    const inflight = this.inflight.get(id)
    if (inflight !== undefined) return this.handleOf(await inflight)

    const task = this.loadSession(id)
    this.inflight.set(id, task)
    try {
      return this.handleOf(await task)
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
    const sessionsRoot = join(this.root, 'sessions')
    let dirs: string[]
    try {
      dirs = await readdir(sessionsRoot)
    } catch {
      throw new Error(`E_NOT_FOUND: 会话 ${id} 不存在（sessions 目录缺失）`)
    }
    const suffix = `_${id}.jsonl`
    for (const dir of dirs) {
      const files = await readdir(join(sessionsRoot, dir))
      const hit = files.find((f) => f.endsWith(suffix))
      if (hit !== undefined) return join(sessionsRoot, dir, hit)
    }
    throw new Error(`E_NOT_FOUND: 会话 ${id} 不存在`)
  }

  /** §5.2.1 listSessions：v1 全量扫描磁盘（单用户本地量级）；已加载用内存态 */
  async listSessions(): Promise<SessionMeta[]> {
    const out: SessionMeta[] = []
    const onDisk = new Set<SessionId>()
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
          onDisk.add(id)
          const loaded = this.sessions.get(id)
          if (loaded !== undefined) {
            out.push({ ...loaded.meta })
            continue
          }
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
    // 已加载但文件已被外部移除的（v1 不存在此路径，防御性跳过）
    for (const entry of this.sessions.values()) {
      if (!onDisk.has(entry.meta.id)) out.push({ ...entry.meta })
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt)
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
    const tools = new ToolPipelineImpl({
      sessionId: meta.id,
      bus: this.bus,
      registry: this.registry,
      permission: this.permission,
      outputs: this.outputs,
      cwd: meta.cwd,
      maxToolParallel: this.config.spark.engine.maxToolParallel,
      progressThrottleMs: this.config.spark.engine.progressThrottleMs,
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
    }
    const loop = runSessionLoop(runtime, deps)
    return { store, runtime, meta, compactor, titler, titleTask: null, loop }
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
