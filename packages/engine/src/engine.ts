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
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type {
  AutomationCreate,
  AutomationRunDto,
  AutomationTriggerDto,
  CheckpointId,
  CommandDto,
  EventId,
  McpServerDto,
  MemoryDto,
  ModelTestResultDto,
  ModelsDto,
  PermissionPreset,
  PermissionReply,
  ReasoningEffort,
  RequestId,
  RoutingDto,
  RoutingUpdate,
  SessionId,
  SettingsDto,
  SettingsUpdate,
  SkillDto,
  SparkEventEnvelope,
  SparkEventMap,
  TurnFinish,
  TurnId,
} from '@spark/protocol'
import { SETTINGS_RESTART_REQUIRED } from '@spark/protocol'
import type { SessionStatus } from '@spark/protocol'
import { EventBus } from './bus.js'
import type { EventSink, SubscribeHandle } from './bus.js'
import { CompactorImpl } from './compaction.js'
import { GitCheckpointer } from './checkpoint.js'
import type { CheckpointRecord } from './checkpoint.js'
import { gitBranchOf } from './git.js'
import { loadConfig, loadProjectRules } from './config.js'
import type { PermissionRule } from './config.js'
import type { EngineConfig, ModelRef } from './config.js'
import type { LlmGateway, ResolvedModel } from './llm-gateway.js'
import { listModels, testProvider } from './model-catalog.js'
import { PiGateway } from './pi-gateway.js'
import { FallbackGateway } from './fallback-gateway.js'
import { CostTracker } from './cost-tracker.js'
import { buildSystemPrompt, PLAN_MODE_DIRECTIVE } from './prompts.js'
import { ProjectorImpl } from './projector.js'
import { reasoningIncluded } from './projector.js'
import { runSessionLoop } from './run-loop.js'
import type { RunLoopDeps } from './run-loop.js'
import { PermissionServiceImpl } from './permission/service.js'
import { UserRuleStore } from './permission/store.js'
import { SessionIndexMaintainer } from './session/index-maintainer.js'
import { findSessionFile as findSessionFileOnDisk, scanDiskSessions as scanDiskSessionsOnDisk, scanForkChildren as scanForkChildrenOnDisk, titleOf } from './session/scan.js'
import { Metrics } from './observability/metrics.js'
import { SessionRuntime } from './session/runtime.js'
import { SessionStore, danglingTurnIds, mungeDir, sessionFileName } from './session/store.js'
import { TitleGenerator } from './title.js'
import { ToolOutputStore } from './tools/output-store.js'
import { ToolPipelineImpl } from './tools/pipeline.js'
import { IoGuard } from './tools/guard.js'
import { ToolRegistry } from './tools/registry.js'
import type { ToolContext, ToolOutput } from './tools/definition.js'
import { registerBuiltinTools } from './tools/builtin/index.js'
import { makeTaskTool } from './tools/builtin/task.js'
import type { TaskInput } from './tools/builtin/task.js'
import { newIds } from './ulid.js'
import { Logger } from './logger.js'
import type { SparkLogger } from './logger.js'
import { loadMcpConfig } from './mcp/config.js'
import { McpManager } from './mcp/manager.js'
import { loadSkills } from './skills/loader.js'
import type { LoadedSkill } from './skills/loader.js'
import { BUILTIN_COMMANDS, expandCommandPrompt, loadCommands } from './commands/loader.js'
import type { LoadedCommand } from './commands/loader.js'
import { MemoryStore } from './memory/store.js'
import { memorySaveTool, memorySearchTool } from './tools/builtin/memory.js'
import { AutomationManager } from './automation/manager.js'
import { AutomationRegistry } from './automation/registry.js'
import { DEFAULT_HOOK_TIMEOUT_MS, UserHookRunner } from './hooks/runner.js'
import { SecretStore, resolveApiKey } from './secrets/store.js'
import type { SecretSource } from './secrets/store.js'
import { AuditLog, type AuditEntry, type AuditQuery } from './audit/log.js'
import { SearchIndexer } from './search/indexer.js'
import { asError } from './errs.js'
import { persistSparkPatch, SettingsStore, type RoutingState } from './settings-store.js'
import { BrowserManager } from './browser/driver.js'
import { createPlaywrightDriver, SHOT_FILE_RE } from './browser/playwright.js'
import { makeBrowserTools } from './tools/builtin/browser.js'

import type {
  EngineDeps,
  ForkChildInfo,
  ReplyOutcome,
  SearchHit,
  SessionEntry,
  SessionHandle,
  SessionMeta,
  SessionTreeInfo,
  SessionTreeNode,
} from './engine-types.js'
import { SPARK_VERSION } from './engine-types.js'

export { SPARK_VERSION } from './engine-types.js'
export type {
  EngineDeps,
  ForkChildInfo,
  ReplyOutcome,
  SearchHit,
  SessionHandle,
  SessionMeta,
  SessionTreeInfo,
  SessionTreeNode,
} from './engine-types.js'

export class Engine {
  private readonly root: string
  private readonly defaultCwd: string
  /** 可在设置写盘成功后整体重载（工单 10.20 B / D28；启动期注入的子系统不受影响=重启档语义） */
  private config: EngineConfig
  private readonly now: () => number
  private readonly newSessionId: () => SessionId
  private readonly bus: EventBus
  private readonly gateway: LlmGateway
  private readonly permission: PermissionServiceImpl
  /** 用户级权限规则仓（~/.spark/permissions.json；always 固化与规则管理 UI 的持久层） */
  private readonly ruleStore: UserRuleStore
  /** 密钥仓（阶段七工单 7.1 / H01）：~/.spark/secrets.json，取用优先级 store > env */
  private readonly secrets: SecretStore
  /** I/O 护栏（阶段七工单 7.2 / H02）：工具输出注入检测 + 敏感过滤 */
  private readonly ioGuard: IoGuard
  /** 审计日志（阶段七工单 7.12 / H11）：~/.spark/audit.jsonl 明细流 */
  private readonly audit: AuditLog
  /** 全文搜索索引器（阶段七工单 7.13 / H12）：句柄生命周期与降级纪律单点（R-D 第②刀拆出） */
  private readonly search: SearchIndexer
  /** browser 工具族（阶段七工单 7.10 / H09 / ADR D27）：引擎级单例单页，驱动懒启动 */
  private readonly browser: BrowserManager
  /** 截图落盘目录（~/.spark/browser-shots；GET /api/artifacts/:file 供图） */
  private readonly shotsDir: string
  /** 成本累计（阶段七工单 7.7 / H07）：~/.spark/usage.json 持久化，熔断判定数据源 */
  private readonly costTracker: CostTracker
  /**
   * 设置与路由（阶段七工单 7.7 / H07；R-D 第④刀拆出）：路由状态所有权在
   * SettingsStore（就地可变——已装接线闭包经 getter 持同一引用，热生效）。
   */
  private readonly settings: SettingsStore

  private get routing(): RoutingState {
    return this.settings.routing
  }
  /** 进程内指标计数器（§5.10 清单；GET /api/metrics 数据源，工单 4.8） */
  private readonly metrics = new Metrics()
  /** 会话索引维护器（node:sqlite；JSONL 恒为权威——损坏即降级磁盘扫描，工单 4.8；R-D 第②刀拆出） */
  private readonly index: SessionIndexMaintainer
  private readonly indexReady: Promise<void>
  private readonly registry: ToolRegistry
  /** MCP 外部工具管理（阶段五工单 5.3 / ADR D16）：与内置工具同一注册表同一管线 */
  private readonly mcp: McpManager
  /** MCP 连接任务（connect 内部逐 server 失败闭合；ready() 供 server 入口等待） */
  private readonly mcpReady: Promise<void>
  /** skills/插件加载任务（工单 5.5 / ADR D18：词表注册 + hooks 订阅；ready() 等待） */
  private readonly skillsReady: Promise<LoadedSkill[]>
  /** 已加载 skills 快照（skillsReady 完成后非空；用户侧 hooks 的 skill 触发现读） */
  private loadedSkills: readonly LoadedSkill[] = []
  /** 用户侧 hooks（阶段七工单 7.3 / H03）：spark.json hooks 段四挂点 fire-and-forget 触发；设置写盘后重建（工单 10.21） */
  private hooks: UserHookRunner
  /** 自定义命令（阶段七工单 7.4 / H04）：~/.spark/commands/*.md；commandsReady 完成后填充 */
  private customCommands: readonly LoadedCommand[] = []
  /** 自定义命令加载任务（坏文件 warn 跳过，不阻塞启动；ready() 等待） */
  private readonly commandsReady: Promise<void>
  /**
   * 长期记忆仓（阶段七工单 7.5 / H05 / ADR D25）：~/.spark/memory.db（FTS5 trigram）。
   * 打开失败 → null 降级（memory 工具族不注册、注入端口不接线，引擎照常启动）。
   */
  private readonly memory: MemoryStore | null
  /** 自动化触发器（阶段七工单 7.6 / H06 / ADR D26）：cron/watch/webhook → 自动建会话执行 prompt */
  private readonly automation: AutomationManager
  private readonly outputs: ToolOutputStore
  private readonly sessions = new Map<SessionId, SessionEntry>()
  private readonly inflight = new Map<SessionId, Promise<SessionEntry>>()
  /** 已答复过的 requestId（区分 409 与 404；进程生命周期内有效） */
  private readonly settledRequests = new Set<RequestId>()
  /** 子代理派生出的会话（深度限制：子会话不可再派生，工单 5.4；进程生命周期内有效） */
  private readonly subagentChildren = new Set<SessionId>()
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
    // 工单 7.7：网关包 fallback 装饰器（链每请求现读 this.routing——热生效）；
    // 空链零开销短路，deps.gateway 注入（ScriptedLlm）行为不变。
    // logger 闭包延迟解析（构造器内 gateway 先于 logger 赋值，调用时必已就绪）
    this.gateway = new FallbackGateway({
      inner: deps.gateway ?? new PiGateway(),
      chain: () => this.routing.fallbacks,
      logger: {
        warn: (msg, data) => {
          this.logger.warn(msg, data)
        },
      },
    })
    if (deps.logger !== undefined) {
      this.logger = deps.logger
      this.ownsLogger = false
    } else {
      this.logger = new Logger({ root: this.root })
      this.ownsLogger = true
    }
    this.logger.info('engine.start', { root: this.root, cwd: this.defaultCwd })

    // 会话索引：建库失败即降级（JSONL 权威不受影响）；启动重建对齐磁盘
    this.index = new SessionIndexMaintainer(this.root, this.logger)
    this.indexReady = this.index.rebuild(() => this.scanDiskSessions()).catch((err: unknown) => {
      this.index.disable(err, 'session.index.rebuild.error')
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

    // skills/插件（工单 5.5 / ADR D18）：声明式清单 → 事件词表扩展 + hooks 订阅；
    // 逐 skill 失败 warn 跳过（loader 内闭合），ready() 前完成注册
    this.skillsReady = loadSkills(join(this.root, 'skills'), this.logger).then(
      (skills) => {
        for (const s of skills) {
          this.logger.info('skills.loaded', { name: s.name, events: s.events })
          for (const h of s.hooks) {
            this.bus.subscribe((e) => {
              if (e.type !== h.on) return
              // data 固定形状（ADR D18：声明式钩子，无自定义构造器）；发射失败
              // warn 闭合——不干扰源事件的既定流程
              void this.bus
                .emitExtended(e.sessionId, h.emit, {
                  skill: s.name,
                  sourceEventId: e.id,
                  sourceType: e.type,
                })
                .catch((err: unknown) => {
                  this.logger.warn('skills.hook.error', {
                    skill: s.name,
                    emit: h.emit,
                    sid: e.sessionId,
                    err,
                  })
                })
            })
          }
        }
        return skills
      },
    )
    // skillsReady 完成后留快照（用户侧 hooks 的 skill 触发按名现读）
    void this.skillsReady.then((skills) => {
      this.loadedSkills = skills
    })

    // 工单 7.3 / H03：用户侧 hooks（缺省空配置零开销；失败一律 warn 闭合不阻断主流程）
    this.hooks = new UserHookRunner(this.config.spark.hooks ?? {}, {
      bus: this.bus,
      logger: this.logger,
      skills: () => this.loadedSkills,
      defaultTimeoutMs: DEFAULT_HOOK_TIMEOUT_MS,
    })

    // 工单 7.4 / H04：自定义命令（坏文件 warn 跳过——同 skills 纪律，不阻塞启动）
    this.commandsReady = loadCommands(join(this.root, 'commands'), this.logger).then(
      (cmds) => {
        this.customCommands = cmds
        for (const c of cmds) {
          this.logger.info('commands.loaded', { name: c.name })
        }
      },
    )

    // 工单 7.5 / H05 / ADR D25：长期记忆仓（打开失败 null 降级，引擎照常启动）
    let memoryStore: MemoryStore | null = null
    try {
      memoryStore = new MemoryStore(join(this.root, 'memory.db'))
      if (!memoryStore.fts) {
        this.logger.warn('memory.fts.unavailable', { path: join(this.root, 'memory.db') })
      }
    } catch (err) {
      this.logger.warn('memory.store.error', { err })
    }
    this.memory = memoryStore

    // 工单 7.13 / H12：会话全文搜索索引（打开失败 null 降级——检索不可用不阻塞引擎）
    this.search = new SearchIndexer(this.root, this.logger, (id) => this.sessionTitleOf(id))

    // 工单 7.10 / H09 / ADR D27：browser 工具族——引擎级单例单页；
    // 驱动（playwright-core）首次 browser.open 才启动，构造期零依赖
    this.shotsDir = join(this.root, 'browser-shots')
    this.browser = new BrowserManager(
      deps.browserDriver ?? createPlaywrightDriver(this.shotsDir, this.logger),
    )

    // 工单 7.6 / H06 / ADR D26：自动化触发器（触发=自动建会话执行 prompt，走正常 turn 通道）；
    // 坏 automation.json 构造即抛 E_CONFIG（配置错误不带病运行，同 loadConfig 纪律）
    this.automation = new AutomationManager(new AutomationRegistry(this.root), {
      createSession: async ({ title, cwd }) => {
        const handle = await this.createSession({ title, cwd })
        return { id: handle.id, send: (text: string) => handle.send(text) }
      },
      now: () => this.now(),
    })

    this.registry = new ToolRegistry()
    registerBuiltinTools(this.registry, {
      bashSandbox: this.config.spark.engine.bashSandbox,
    })
    // 记忆工具族（工单 7.5）：仓不可用不注册（模型无从调用，fail 路径不存在）
    if (this.memory !== null) {
      this.registry.register(memorySaveTool)
      this.registry.register(memorySearchTool)
    }
    // browser 工具族（工单 7.10 / ADR D27）：恒广告——浏览器二进制缺失时
    // 执行期 E_BROWSER_LAUNCH fail-closed（缺失不是静默降级的理由）
    for (const tool of makeBrowserTools(this.browser)) {
      this.registry.register(tool)
    }
    // Task 工具（工单 5.4 / ADR D17）：执行体注入——子会话管理是 Engine 职责
    this.registry.register(
      makeTaskTool((input, ctx) => this.runSubagent(input, ctx)),
    )
    // MCP 外部工具（工单 5.3）：配置缺失 = 零外部工具立即就绪；单 server 失败
    // 由 manager 内部 warn 闭合（工具不注册，引擎照常启动）
    this.mcp = new McpManager({
      config: loadMcpConfig(this.root),
      logger: this.logger,
      toolTimeoutMs: this.config.spark.engine.toolTimeoutMs,
    })
    this.mcpReady = this.mcp.connect(this.registry).catch((err: unknown) => {
      this.logger.warn('mcp.connect.error', { err })
    })
    this.outputs = new ToolOutputStore(
      this.config.spark.engine.toolOutputLimitKB * 1024,
      join(this.root, 'tool-outputs'),
    )
    this.ruleStore = new UserRuleStore(
      join(this.root, 'permissions.json'),
      this.config.permissions.rules,
    )
    this.secrets = new SecretStore(join(this.root, 'secrets.json'))
    // 工单 7.1 验收：store 值不落日志——启动即注册进脱敏层（deps.logger 未实现则跳过）
    this.logger.registerSecrets?.(this.secrets.values())
    // 工单 7.2：I/O 护栏——store 值动态取（setSecret 即时生效，与日志脱敏同纪律）
    this.ioGuard = new IoGuard({ secretValues: () => this.secrets.values() })
    // 工单 7.12：审计日志明细流——脱敏同纪律（密钥仓值动态注入）
    this.audit = new AuditLog(this.root, () => this.secrets.values())
    // 工单 7.7：成本熔断计量（usage.json 跨进程延续）+ 路由状态（ResolvedModel 化）
    this.costTracker = new CostTracker(join(this.root, 'usage.json'))
    this.settings = new SettingsStore(this.root, this.logger, this.costTracker, {
      resolveModelRef: (model) => this.resolveModelRef(model),
      resolveModel: (ref) => this.resolveModel(ref),
    }, this.config)
    this.permission = new PermissionServiceImpl({
      bus: this.bus,
      ruleStore: this.ruleStore,
      projectRules: loadProjectRules(this.defaultCwd),
      timeoutMs: this.config.spark.engine.permissionTimeoutMs,
      metrics: this.metrics,
      audit: this.audit, // 工单 7.12：决策与 always 固化规则变更入审计明细流
      // 工单 7.3：permission.resolved 挂点（fire-and-forget；cwd 取会话工作目录）
      onResolved: (p) => {
        this.hooks.fire('permission.resolved', {
          sessionId: p.sessionId,
          cwd: this.sessions.get(p.sessionId)?.meta.cwd ?? this.defaultCwd,
          sourceEventId: p.sourceEventId,
          data: { requestId: p.requestId, reply: p.reply },
        })
      },
    })

    // meta 增量维护：durable 事件更新 updatedAt/lastSeq；session.title 更新标题
    this.bus.subscribe((e) => {
      const entry = this.sessions.get(e.sessionId)
      if (entry === undefined) return
      if (e.seq !== undefined && e.seq > entry.meta.lastSeq) {
        entry.meta.lastSeq = e.seq
        entry.meta.updatedAt = e.time
        this.index.touch(e.sessionId, e.seq, e.time) // 索引增量（工单 4.8）
      }
      if (e.seq !== undefined) {
        this.metrics.inc('spark_events_durable_total')
        this.search.indexEvent(e) // 全文搜索增量（工单 7.13；旁路——失败只 warn）
      }
      if (e.type === 'session.title') {
        entry.meta.title = (e.data as { title: string }).title
        this.index.setTitle(e.sessionId, entry.meta.title)
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

  /** MCP 连接与 skills/自定义命令加载完成（server 入口 listen 前等待；缺省项立即返回） */
  ready(): Promise<void> {
    return Promise.all([this.mcpReady, this.skillsReady, this.commandsReady]).then(() => {
      // 工单 7.6：tick 循环在 server listen 前启动（幂等；unref 不阻止进程退出）
      this.automation.start()
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
    opts: {
      title?: string
      model?: string
      cwd?: string
      parentId?: SessionId
      /** 子代理锚点事件（工单 7.8：派生它的 tool.started；fork 走 forkSession 自记） */
      parentEventId?: EventId
    } = {},
  ): Promise<SessionHandle> {
    this.assertNotShutdown()
    const cwd = opts.cwd ?? this.defaultCwd
    // 工单 7.7：子代理派生（parentId 存在）缺省用 subagentModel 路由档（热更新现读）；
    // 显式 opts.model 优先（调用方指定即尊重）
    const subagentDefault =
      opts.parentId !== undefined
        ? `${this.routing.subagentModel.provider}/${this.routing.subagentModel.model}`
        : undefined
    const modelRef = this.resolveModelRef(opts.model ?? subagentDefault)
    const modelStr = `${modelRef.provider}/${modelRef.model}`
    const sessionId = this.newSessionId()
    const createdAt = this.now()
    // 工单 10.6：分支只读探测（非仓库/无 git → null，不携带——禁假状态）
    const branch = await gitBranchOf(cwd)
    // 工单 10.6：推理档位缺省取 models.json defaultEffort（未配置 = 不设置）
    const defaultEffort = this.config.models.defaultEffort

    const dir = join(this.root, 'sessions', mungeDir(cwd))
    const path = join(dir, sessionFileName(createdAt, sessionId))
    const store = await SessionStore.create(
      path,
      {
        sparkVersion: SPARK_VERSION,
        cwd,
        createdAt,
        model: modelStr,
        // 创建时分支快照（工单 10.6；重启/重载经 header 恢复）
        ...(branch !== null ? { branch } : {}),
        // 子代理来源（工单 5.4 / ADR D17；fork 另记 parentPath/parentEventId）
        ...(opts.parentId !== undefined ? { parentSession: opts.parentId } : {}),
        // 工单 7.8：子代理锚点事件——树视图按 parentEventId 归组显示运行态
        ...(opts.parentEventId !== undefined ? { parentEventId: opts.parentEventId } : {}),
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
      ...(branch !== null ? { branch } : {}),
      ...(defaultEffort !== undefined ? { effort: defaultEffort } : {}),
    }
    const entry = this.wireSession(store, meta, modelRef)
    this.sessions.set(sessionId, entry)
    await this.bus.emit(sessionId, 'session.created', {
      cwd,
      model: modelStr,
      ...(opts.title !== undefined ? { title: opts.title } : {}),
      ...(branch !== null ? { branch } : {}),
      ...(meta.effort !== undefined ? { effort: meta.effort } : {}),
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
      // 工单 10.6：分支随 header 恢复（创建时快照）；档位内存态回缺省（同换模型先例）
      ...(store.header.branch !== undefined ? { branch: store.header.branch } : {}),
      ...(this.config.models.defaultEffort !== undefined
        ? { effort: this.config.models.defaultEffort }
        : {}),
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
  private findSessionFile(id: SessionId): Promise<string | null> {
    return findSessionFileOnDisk(join(this.root, 'sessions'), id)
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
        ...(source.meta.branch !== undefined ? { branch: source.meta.branch } : {}),
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
      // 工单 10.6：分支/档位随源会话继承
      ...(source.meta.branch !== undefined ? { branch: source.meta.branch } : {}),
      ...(source.meta.effort !== undefined ? { effort: source.meta.effort } : {}),
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
    this.audit.record({
      time: Date.now(),
      kind: 'permission.rule',
      actor: 'user',
      result: 'applied',
      op: 'add',
      action: rule.action,
      resource: rule.resource,
      effect: rule.effect,
      source: 'settings-ui',
    })
  }

  removePermissionRule(action: string, resource: string): boolean {
    const removed = this.ruleStore.remove(action, resource)
    if (removed) {
      this.audit.record({
        time: Date.now(),
        kind: 'permission.rule',
        actor: 'user',
        result: 'applied',
        op: 'remove',
        action,
        resource,
        source: 'settings-ui',
      })
    }
    return removed
  }

  /** 审计日志明细读（工单 7.12 / H11）：GET /api/audit 的引擎数据源（新→旧） */
  listAudit(query: AuditQuery): AuditEntry[] {
    return this.audit.entries(query)
  }

  // ---- 会话全文搜索（工单 7.13 / H12）----

  /**
   * 会话全文搜索（工单 7.13 / H12）：GET /api/search 的引擎数据源（新→旧）。
   * 索引不可用（打开失败降级）→ 空数组——搜索失败不阻塞主流程（同 SessionIndex 纪律）。
   */
  searchSessions(q: string, limit: number): SearchHit[] {
    return this.search.search(q, limit)
  }

  // ---- 浏览器截图供图（工单 7.10 / H09 / ADR D27）----

  /**
   * 读截图文件（GET /api/artifacts/:file 的引擎数据源）：文件名白名单
   * （`shot-<ts>-<seq>.png`）+ 目录拼接——路径逃逸零面。不存在/非法名 → null。
   */
  readScreenshot(file: string): Buffer | null {
    if (!SHOT_FILE_RE.test(file)) return null
    try {
      return readFileSync(join(this.shotsDir, file))
    } catch {
      return null
    }
  }

  /** 命中行的会话标题：已装载 meta → 会话索引（boot 重建）→ 空串兜底 */
  private sessionTitleOf(id: SessionId): string {
    const loaded = this.sessions.get(id)
    if (loaded !== undefined) return loaded.meta.title
    return this.index.titleOf(id)
  }

  // ---- 权限档位（DESIGN §13.E 四档 / D7 补记预设层，阶段六工单 6.3） ----

  /** 设置会话档位（PUT /api/sessions/:id/permission-preset 的引擎侧入口） */
  setPermissionPreset(id: SessionId, preset: PermissionPreset): void {
    this.permission.setPreset(id, preset)
  }

  /** 当前档位（无记录 = confirm-each；内存态，重启回缺省） */
  permissionPresetOf(id: SessionId): PermissionPreset {
    return this.permission.presetOf(id)
  }

  // ---- 模型管理（DESIGN §13.D③ / 阶段六工单 6.5 轻后端例外） ----

  /** GET /api/models：供应商清单（内置/自定义）+ 可选模型 + defaultModel */
  listModels(): ModelsDto {
    // hasKey 走 secrets 仓口径（工单 10.12）：只写密钥仓的供应商不得误报「缺 Key」
    return listModels(this.config.models, (provider, apiKeyEnv) =>
      resolveApiKey(this.secrets, provider, apiKeyEnv),
    )
  }

  /** POST /api/models/:id/test：连通测试（时延/错误人话文案；ok=false 仍 200） */
  testModel(providerId: string): Promise<ModelTestResultDto> {
    return testProvider(providerId, this.config.models, {
      resolveKey: (provider, apiKeyEnv) => resolveApiKey(this.secrets, provider, apiKeyEnv),
    })
  }

  // ---- 设置读写（工单 10.20 B / 10.21 / ADR D28） ----

  /** GET /api/settings：脱敏全量（掩码红线——绝不回 apiKey 值；models.json 只读参考） */
  getSettings(): SettingsDto {
    const dto: SettingsDto = {
      server: { port: this.config.spark.server.port, host: this.config.spark.server.host },
      // 九项展开即得（工单 R-B.4：SparkConfig.engine 已复用 protocol EngineSettings 类型，
      // 与 SettingsDto['engine'] 同形——原九行逐字段抄写随之消除；展开而非直接引用，不外泄内部 config）
      engine: { ...this.config.spark.engine },
      restartRequired: [...SETTINGS_RESTART_REQUIRED],
      models: {
        defaultModel: `${this.config.models.defaultModel.provider}/${this.config.models.defaultModel.model}`,
        defaultEffort: this.config.models.defaultEffort ?? null,
      },
      ...(this.config.spark.hooks !== undefined ? { hooks: this.config.spark.hooks } : {}),
    }
    return dto
  }

  /**
   * PUT /api/settings：部分字段更新（D28 写纪律，fail-closed）。
   * 合并 spark.json raw → 启动同款 schema 再校验 → 原子写盘（tmp+rename）→
   * 成功后重载内存 config（热档字段 turn 边界注入，下一 turn 生效；重启档字段
   * 构造期注入不受影响）+ 重建 hooks runner。校验/写盘失败 → 内存与磁盘都不动。
   */
  updateSettings(patch: SettingsUpdate): SettingsDto {
    this.assertNotShutdown()
    // 校验/写盘失败 → 内存与磁盘都不动（fail-closed，D28）；成功后重载内存 config
    this.config = persistSparkPatch(this.root, patch)
    // 旧 runner 先收口（工单 10.24）：在途子进程 kill + disposed 置位，防迟到回调写日志
    this.hooks.dispose()
    this.hooks = new UserHookRunner(this.config.spark.hooks ?? {}, {
      bus: this.bus,
      logger: this.logger,
      skills: () => this.loadedSkills,
      defaultTimeoutMs: DEFAULT_HOOK_TIMEOUT_MS,
    })
    return this.getSettings()
  }

  /**
   * PUT /api/sessions/:id/model：会话级换模型（内存态——同权限预设层先例，D7 补记）。
   * 下一 turn 生效（进行中 turn 用旧模型跑完）；重启/重新装载回会话文件模型。
   * 返回生效的 "provider/model"；形状/provider 未配置 → E_CONFIG，未知会话 → E_NOT_FOUND。
   */
  async setSessionModel(id: SessionId, model: string): Promise<string> {
    this.assertNotShutdown()
    const modelRef = this.resolveModelRef(model)
    const entry = await this.requireEntry(id)
    entry.setModel(this.resolveModel(modelRef))
    // 内存 meta 跟随（header 不动——持久真相仍是会话文件；DTO/索引用内存值）
    entry.meta.model = `${modelRef.provider}/${modelRef.model}`
    this.index.upsert(entry.meta)
    return entry.meta.model
  }

  /**
   * PUT /api/sessions/:id/effort：会话级推理档位（工单 10.6，内存态同换模型先例）。
   * 下一 turn 生效（deps.effort getter 现读）；重启回 models.json 缺省。
   */
  async setSessionEffort(id: SessionId, effort: ReasoningEffort): Promise<ReasoningEffort> {
    this.assertNotShutdown()
    const entry = await this.requireEntry(id)
    entry.meta.effort = effort
    return effort
  }

  // ---- 命令注册表（阶段七工单 7.4 / H04：/命令 解析框架） ----

  /** GET /api/commands：内置基线（action/client）+ 自定义（prompt）统一清单 */
  listCommands(): CommandDto[] {
    return [
      ...BUILTIN_COMMANDS,
      ...this.customCommands.map((c) => ({
        name: c.name,
        description: c.description,
        kind: 'prompt' as const,
      })),
    ]
  }

  /**
   * POST /api/sessions/:id/commands/:name 执行体：action（compact）走压缩入口；
   * prompt（自定义 .md）展开为 prompt 走正常 turn 通道（user.message 事件落盘）。
   * client 命令与未知命令拒绝（E_COMMAND_CLIENT / E_NOT_FOUND——失败闭合）。
   */
  async executeCommand(id: SessionId, name: string, args?: string): Promise<void> {
    this.assertNotShutdown()
    const handle = this.handleOf(await this.requireEntry(id))
    if (name === 'compact') {
      await handle.compact() // turn 进行中 → E_TURN_ACTIVE（§5.8.5 既有拒绝码）
      return
    }
    const cmd = this.customCommands.find((c) => c.name === name)
    if (cmd !== undefined) {
      await handle.send(expandCommandPrompt(cmd.prompt, args))
      return
    }
    if (BUILTIN_COMMANDS.some((c) => c.name === name && c.kind === 'client')) {
      throw new Error(`E_COMMAND_CLIENT: /${name} 是界面命令，由前端执行——引擎不接受该请求`)
    }
    throw new Error(`E_NOT_FOUND: 未知命令 /${name}`)
  }

  /** GET /api/mcp：MCP 服务器只读状态（连接失败也列出 connected:false） */
  listMcpServers(): McpServerDto[] {
    return this.mcp.status().map((s) => ({ ...s }))
  }

  /** GET /api/skills：已加载技能只读清单（ready() 后为全量） */
  listSkills(): SkillDto[] {
    return this.loadedSkills.map((s) => ({
      name: s.name,
      events: [...s.events],
      hooks: s.hooks.map((h) => ({ ...h })),
    }))
  }

  // ---- 长期记忆（阶段七工单 7.5 / H05 / ADR D25：设置页管理的线上入口） ----

  /** 记忆仓守卫（list/remove 共用；未启用 → E_MEMORY_UNAVAILABLE） */
  private requireMemory(): MemoryStore {
    if (this.memory === null) {
      throw new Error('E_MEMORY_UNAVAILABLE: 长期记忆未启用（memory.db 打开失败）')
    }
    return this.memory
  }

  /** GET /api/memories：全量列表（新→旧）；仓不可用 → E_MEMORY_UNAVAILABLE */
  listMemories(): MemoryDto[] {
    return this.requireMemory().list()
  }

  /** DELETE /api/memories/:id：删除一条（无此条 false → 路由层 404） */
  removeMemory(id: number): boolean {
    return this.requireMemory().remove(id)
  }

  // ---- 自动化触发器（阶段七工单 7.6 / H06 / ADR D26：任务列表与运行历史的线上入口） ----

  /** GET /api/automation：触发器清单 */
  listAutomations(): AutomationTriggerDto[] {
    return this.automation.list()
  }

  /** POST /api/automation：创建（至少一种触发条件；坏 cron 表达式 → E_CRON） */
  createAutomation(input: AutomationCreate): AutomationTriggerDto {
    return this.automation.add(input)
  }

  /** DELETE /api/automation/:id：删除（无此条 false → 路由层 404） */
  removeAutomation(id: string): boolean {
    return this.automation.remove(id)
  }

  /** PUT /api/automation/:id/enabled：启停（无此条 false → 路由层 404） */
  setAutomationEnabled(id: string, enabled: boolean): boolean {
    return this.automation.setEnabled(id, enabled)
  }

  /** GET /api/automation/runs：运行历史（新→旧，每次触发必有一行终态记录） */
  listAutomationRuns(limit: number): AutomationRunDto[] {
    return this.automation.runs(limit)
  }

  /** POST /api/automation/webhook/:id：外部触发（未启用/停用/非 webhook → 语义错误） */
  fireAutomationWebhook(id: string): Promise<void> {
    return this.automation.fireWebhook(id)
  }

  /** POST /api/automation/:id/run：手动触发（测试/调试入口） */
  fireAutomationManual(id: string): Promise<void> {
    return this.automation.fireManual(id)
  }

  // ---- 模型路由（阶段七工单 7.7 / H07：fallback 链 + 任务路由 + 成本熔断） ----

  /** GET /api/routing：路由状态 + 成本累计（apiKey 永不进 DTO） */
  getRouting(): RoutingDto {
    return this.settings.getRouting()
  }

  /**
   * PUT /api/routing：热更新（就地改 routing 属性——已装接线闭包下一请求生效）。
   * 形状/provider 未配置 → E_CONFIG（400）；通过后写回 models.json（重启延续）。
   */
  updateRouting(patch: RoutingUpdate): RoutingDto {
    this.assertNotShutdown()
    return this.settings.updateRouting(patch)
  }

  /** DELETE /api/routing/usage：清零成本累计（解除熔断的唯一入口） */
  resetUsage(): RoutingDto {
    this.assertNotShutdown()
    return this.settings.resetUsage()
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
    this.audit.record({
      time: Date.now(),
      kind: 'session.rollback',
      actor: 'user',
      result: 'ok',
      sessionId: id,
      checkpointId,
      source: 'checkpoint',
    })
    return this.handleOf(await this.requireEntry(id)) // 重载：requireEntry → loadSession（树重建 + session.resumed）
  }

  /** 磁盘扫描 header.parentSession === id 的会话 → 边界事件 + 子会话信息（标题须读事件） */
  private scanForkChildren(
    id: SessionId,
  ): Promise<{ fromEventId: EventId; child: ForkChildInfo }[]> {
    return scanForkChildrenOnDisk(join(this.root, 'sessions'), id, (childId) =>
      this.statusOf(childId),
    )
  }

  /** §5.2.1 listSessions：索引驱动（工单 4.8）；已加载会话以内存 meta 为准；q = 标题子串过滤 */
  async listSessions(opts?: { q?: string }): Promise<SessionMeta[]> {
    await this.indexReady
    let out: SessionMeta[]
    const rows = this.index.list(opts?.q)
    if (rows !== null) {
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
  private scanDiskSessions(): Promise<SessionMeta[]> {
    return scanDiskSessionsOnDisk(join(this.root, 'sessions'))
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

  /**
   * Task 工具执行体（工单 5.4 / ADR D17）：独立子会话（header.parentSession）
   * 跑一轮任务，返回最终 assistant 文本。父 turn 中断级联 interrupt 子会话；
   * 单层限制——正在派生子代理的会话不可再派生（E_SUBAGENT_DEPTH）。
   */
  private async runSubagent(input: TaskInput, ctx: ToolContext): Promise<ToolOutput> {
    if (this.subagentChildren.has(ctx.sessionId)) {
      throw new Error('E_SUBAGENT_DEPTH: 子会话不可再派生子代理（单层）')
    }
    const parent = this.sessions.get(ctx.sessionId)
    if (parent === undefined) {
      throw new Error(`E_ENGINE_NO_SESSION: 父会话 ${ctx.sessionId} 未加载，拒绝派生子代理`)
    }
    const child = await this.createSession({
      title: input.title ?? '子代理',
      cwd: parent.meta.cwd,
      parentId: ctx.sessionId,
      // 工单 7.8：锚定派生它的 tool.started 事件 → 树视图可见子代理运行态
      ...(ctx.sourceEventId !== undefined ? { parentEventId: ctx.sourceEventId } : {}),
    })
    this.subagentChildren.add(child.id)
    try {
      // 父 turn 中断 → 级联 interrupt 子会话（子 turn 收尾后本工具返回 E_ABORTED）
      const onAbort = (): void => {
        void child.interrupt()
      }
      ctx.signal.addEventListener('abort', onAbort, { once: true })
      let lastText = ''
      // holder 对象：闭包内赋值不触发控制流窄化（TS let 闭包窄化限制的绕法）
      const done = { finish: 'stop' as TurnFinish }
      try {
        // 订阅先于提交：user.message/turn.* 事件不漏
        await new Promise<void>((resolve) => {
          const sub = this.bus.subscribe(
            (e) => {
              // 父先中断、子 turn 后开始：turn.started 时补一次 interrupt
              //（interrupt 在 turn 未开始时是 no-op——本行关闭该竞态）
              if (e.type === 'turn.started' && ctx.signal.aborted) {
                void child.interrupt()
              }
              if (e.type === 'assistant.message') {
                const texts = (e.data as { content: Array<{ type: string; text?: string }> })
                  .content.filter((c) => c.type === 'text' && typeof c.text === 'string')
                  .map((c) => c.text as string)
                if (texts.length > 0) lastText = texts.join('\n')
              }
              if (e.type === 'turn.completed') {
                done.finish = (e.data as { finish: TurnFinish }).finish
                sub.unsubscribe()
                resolve()
              }
            },
            { sessionId: child.id },
          )
          void child.send(input.prompt, 'now')
        })
      } finally {
        ctx.signal.removeEventListener('abort', onAbort)
      }
      if (ctx.signal.aborted || done.finish === 'aborted') {
        return { output: { code: 'E_ABORTED' }, isError: true }
      }
      return {
        output: lastText.length > 0 ? lastText : '(子代理无文本输出)',
        isError: done.finish === 'error',
      }
    } catch (err) {
      // 子会话创建成功后异常（send 拒绝等）：interrupt 收尾，不让子 turn 悬挂
      const childHandle = this.sessions.get(child.id)
      childHandle?.runtime.interrupt()
      throw err
    }
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
    // 0) 工单 7.6：停自动化触发器（防关停流程中 tick 再创新会话；等在途 tick 收尾）
    await this.automation.stop()
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
      // 4.5) MCP 子进程关闭（工具已随 run-loop 退出不再调用）
      await this.mcp.close()
      // 5) 全量 flush + close（fsync）
      for (const entry of this.sessions.values()) {
        await entry.store.close()
      }
      // 6) 会话索引收尾（工单 4.8）：先等 boot 重建完成再关库——防迟到的重建写库
      //    撞上已关闭句柄；closed 标记使后续增量写全部短路
      await this.indexReady
      this.index.close()
      // 6.5) 长期记忆仓收尾（工单 7.5）：关闭 memory.db 句柄
      if (this.memory !== null) {
        try {
          this.memory.close()
        } catch (err) {
          this.logger.warn('memory.close.error', { err })
        }
      }
      // 6.6) 全文搜索索引收尾（工单 7.13）：关闭 search.db 句柄；
      //      closed 先行置位——迟到的 bus 增量写全部短路（同索引关闭纪律）
      this.search.close()
      // 6.7) browser 工具族收尾（工单 7.10 / ADR D27）：关闭 chromium（未启动则为空操作）
      try {
        await this.browser.close()
      } catch (err) {
        this.logger.warn('browser.close.error', { err })
      }
      // 6.8) hooks runner 收口（工单 10.24）：kill 在途子进程 + 置 disposed——迟到的
      //      close 回调不再写已关闭的 logger 流（pino "write after end"，先于 finally 关日志）
      this.hooks.dispose()
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
    // 会话级换模型（工单 6.5）：deps.model getter 化持有可变引用（同 system 的档位先例）——
    // setSessionModel 替换引用，下一 turn 生效；Projector/Compactor 的接线参数仍取装载时值
    let currentModel = this.resolveModel(modelRef)
    const runtime = new SessionRuntime(meta.id)
    const projector = new ProjectorImpl({
      tree: store.tree,
      includeReasoning: reasoningIncluded(currentModel.provider),
      // 悬空锚点（数据损坏兜底被触发）：结构化 warning 可 grep，不静默退化
      onDanglingAnchor: (anchorId) => {
        this.logger.warn('projector.dangling_anchor', { sid: meta.id, anchorId })
      },
    })
    // 工单 7.7：路由档 getter 现读 routing（就地可变对象）——PUT /api/routing 热生效
    const routing = this.routing
    const compactor = new CompactorImpl({
      sessionId: meta.id,
      bus: this.bus,
      gateway: this.gateway,
      projector,
      tree: store.tree,
      get model(): ResolvedModel {
        return routing.compactionModel
      },
      keepTokens: Math.round(
        (this.config.spark.engine.compactionThreshold * currentModel.contextWindow) / 2,
      ),
    })
    const titler = new TitleGenerator({
      sessionId: meta.id,
      bus: this.bus,
      gateway: this.gateway,
      projector,
      get model(): ResolvedModel {
        return routing.titleModel
      },
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
      guard: this.ioGuard, // 工单 7.2：工具输出 → 模型上下文的注入检测与敏感过滤
      hooks: this.hooks, // 工单 7.3：tool.completed 挂点（载荷不含 output）
      ...(this.memory !== null ? { memory: this.memory, now: this.now } : {}),
    })
    // 计划模式 system 拼接的闭包依赖（见下方 deps.system getter）
    const permission = this.permission
    const sid = meta.id
    const baseSystem = buildSystemPrompt(meta.cwd)
    const deps: RunLoopDeps = {
      sessionId: meta.id,
      bus: this.bus,
      gateway: this.gateway,
      projector,
      compactor,
      tools,
      // 工单 6.5：model 同 system 走 getter——会话级换模型（内存态）下一 turn 生效
      get model(): ResolvedModel {
        return currentModel
      },
      // 工单 10.6：推理档位现读（会话级内存态 ?? models.json 缺省）——切档下一 turn 生效
      effort: () => meta.effort ?? this.config.models.defaultEffort,
      // §5.11 基座组装一次；计划模式（D7 补记：交互层约定）按当前档位逐 step 现读追加——
      // getter 不改 RunLoopDeps 形状，档位切换即时生效（AGENTS.md 读盘成本仍为会话装载一次）
      get system(): string {
        return permission.presetOf(sid) === 'plan'
          ? `${baseSystem}${PLAN_MODE_DIRECTIVE}`
          : baseSystem
      },
      maxStepsPerTurn: this.config.spark.engine.maxStepsPerTurn,
      compactionThreshold: this.config.spark.engine.compactionThreshold,
      metrics: this.metrics,
      // 工单 7.3：turn.before/turn.after 用户 hook（命令 cwd = 会话工作目录）
      cwd: meta.cwd,
      hooks: this.hooks,
      // 工单 7.5 / ADR D25：记忆注入端口（仓不可用不接线）；条件内判——
      // 仅会话首条 user.message（此时树上尚无 user.message）且从未注入过且命中非空
      ...(this.memory !== null
        ? {
            memory: {
              maybeInject: async (turnId: TurnId, query: string): Promise<void> => {
                const m = this.memory
                if (m === null) return
                const path = store.tree.pathToRoot()
                const hasUser = path.some((e) => e.type === 'user.message')
                const injected = path.some((e) => e.type === 'memory.injected')
                if (hasUser || injected) return // 非首条/已注入
                const hits = m.search(query, 3)
                if (hits.length === 0) return
                await this.bus.emit(meta.id, 'memory.injected', {
                  turnId,
                  query,
                  memories: hits,
                })
              },
            },
          }
        : {}),
      // 工单 7.7：成本熔断——limitUsd 现读 routing（热生效），累计跨进程持久
      budget: {
        limitUsd: () => this.routing.costLimitUsd,
        add: (u) => this.costTracker.add(u),
        exceeded: () => this.costTracker.exceeded(this.routing.costLimitUsd),
        spendUsd: () => this.costTracker.spend().costUsd,
      },
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
    this.index.upsert(meta)
    // 装载点同步搜索索引（工单 7.13）：历史事件入 FTS（增量钩子只覆盖本进程新事件）
    this.search.sync(meta.id, store.tree.pathToRoot())
    return {
      store,
      runtime,
      meta,
      setModel: (m: ResolvedModel) => {
        currentModel = m
      },
      compactor,
      checkpointer,
      titler,
      titleTask: null,
      loop,
    }
  }

  private handleOf(entry: SessionEntry): SessionHandle {
    return {
      id: entry.meta.id,
      get meta(): SessionMeta {
        return entry.meta
      },
      send: (text, delivery, expectedTurnId) => {
        if (this.shuttingDown) {
          return Promise.reject(shutdownError())
        }
        // submit 同步抛（E_INPUT_EMPTY/E_TURN_MISMATCH）也走 rejected promise——接口语义一致
        try {
          return Promise.resolve(entry.runtime.submit(text, delivery, undefined, expectedTurnId))
        } catch (err) {
          // reject 理由必须是 Error（prefer-promise-reject-errors）；submit 抛的均为 Error
          return Promise.reject(asError(err))
        }
      },
      interrupt: () => {
        entry.runtime.interrupt()
        return Promise.resolve()
      },
      compact: () => {
        if (this.shuttingDown) {
          return Promise.reject(shutdownError())
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
          return Promise.reject(shutdownError())
        }
        return this.forkSession(entry.meta.id, fromEventId)
      },
      status: () => this.statusOf(entry.meta.id),
      events: () => entry.store.tree.pathToRoot(),
    }
  }

  private assertNotShutdown(): void {
    if (this.shuttingDown) throw shutdownError()
  }

  /** "provider/model" → ModelRef（缺省 defaultModel；provider 未配置 → E_CONFIG；contextWindow 优先取 models[] 条目） */
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
    const name = model.slice(slash + 1)
    const listed = this.config.models.models.find((m) => m.provider === provider && m.model === name)
    return {
      provider,
      model: name,
      contextWindow: listed?.contextWindow ?? this.config.models.defaultModel.contextWindow,
    }
  }

  /** ModelRef + providers 表 + 密钥仓/环境变量 → ResolvedModel（apiKey 只在此注入，store > env） */
  private resolveModel(ref: ModelRef): ResolvedModel {
    const provider = this.config.models.providers[ref.provider]
    if (provider === undefined) {
      throw new Error(`E_CONFIG: models.json 未配置 provider "${ref.provider}"`)
    }
    const { apiKey } = resolveApiKey(this.secrets, ref.provider, provider.apiKeyEnv)
    return {
      provider: ref.provider,
      model: ref.model,
      contextWindow: ref.contextWindow,
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(provider.baseUrl !== undefined ? { baseUrl: provider.baseUrl } : {}),
    }
  }

  // ---- 密钥管理（阶段七工单 7.1 / H01：~/.spark/secrets.json 的线上入口） ----

  /** providers 全表状态（含未配置）；永不回传密钥值 */
  listSecrets(): { provider: string; source: SecretSource }[] {
    return Object.entries(this.config.models.providers).map(([name, cfg]) => ({
      provider: name,
      source: resolveApiKey(this.secrets, name, cfg.apiKeyEnv).source,
    }))
  }

  /** 新增/覆盖一条密钥（provider 未在 models.json 配置 → E_CONFIG） */
  setSecret(provider: string, value: string): void {
    this.assertNotShutdown()
    if (this.config.models.providers[provider] === undefined) {
      throw new Error(`E_CONFIG: models.json 未配置 provider "${provider}"`)
    }
    this.secrets.set(provider, value)
    this.logger.registerSecrets?.([value]) // 新值即刻纳入日志脱敏
    this.logger.info('secrets.set', { provider })
  }

  /** 删除一条密钥（store 中不存在 → false，路由层 404） */
  removeSecret(provider: string): boolean {
    this.assertNotShutdown()
    const removed = this.secrets.delete(provider)
    if (removed) this.logger.info('secrets.remove', { provider })
    return removed
  }
}

/** 文件名 `<ts>_<ses_id>.jsonl` → SessionId；不匹配返回 null */
/** E_SHUTTING_DOWN 恒定文案（handle 三动作与 assertNotShutdown 共用，避免四份复制漂移） */
function shutdownError(): Error {
  return new Error('E_SHUTTING_DOWN: 引擎正在关闭，拒绝新请求')
}


