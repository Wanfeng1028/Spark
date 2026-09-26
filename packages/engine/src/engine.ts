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
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type {
  BrowserSettings,
  AutomationCreate,
  AutomationRunDto,
  AutomationTriggerDto,
  CheckpointId,
  CommandDto,
  EventId,
  LspServerStatusDto,
  McpServerDto,
  MemoryDto,
  ModelTestResultDto,
  ModelsDto,
  PermissionPreset,
  PermissionReply,
  PermissionRuleDto,
  PermissionScope,
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
  TurnId,
} from '@spark/protocol'
import { PROMPT_PLACEHOLDERS, SANDBOX_NETWORK_DEFAULTS, SETTINGS_RESTART_REQUIRED } from '@spark/protocol'
import type {
  ExtensionDto,
  FeedbackEntryDto,
  FeedbackInput,
  FeedbackQuery,
  FeedbackVote,
  PromptsDto,
  PromptsUpdate,
  SandboxNetworkStatusDto,
  SemanticIndexStats,
AgentPresetDto, LogsDto, SessionMode, SessionStatus, UsageSummaryDto } from '@spark/protocol'
import type { ArenaHistoryEntryDto } from '@spark/protocol'
import { EventBus } from './bus.js'
import type { EventSink, SubscribeHandle } from './bus.js'
import { CompactorImpl, COMPACTION_PROMPT } from './compaction.js'
import { GitCheckpointer } from './checkpoint.js'
import type { CheckpointRecord } from './checkpoint.js'
import { gitBranchOf } from './git.js'
import { loadConfig, loadProjectRules } from './config.js'
import type { PermissionRule } from './config.js'
import type { EngineConfig, ModelRef } from './config.js'
import type { LlmGateway, ResolvedModel } from './llm-gateway.js'
import { listModels, testProvider, PROVIDER_CATALOG } from './model-catalog.js'
import { PiGateway } from './pi-gateway.js'
import { FallbackGateway } from './fallback-gateway.js'
import { CostTracker } from './cost-tracker.js'
import { BASE_PROMPT, buildSystemPrompt, INIT_PROMPT, PLAN_MODE_DIRECTIVE } from './prompts.js'
import {
  loadPromptTemplates,
  renderPromptTemplate,
  assertPlaceholders,
  type PromptTemplates,
} from './prompt-templates.js'
import { ProjectorImpl } from './projector.js'
import { reasoningIncluded } from './projector.js'
import { runSessionLoop } from './run-loop.js'
import { GoalRunner } from './goals.js'
import { loadTrustDoc, saveTrustDoc, trustKey, trustLevelOf, tightens } from './trust.js'
import { discoverExtensions } from './extensions/loader.js'
import { ArenaManager } from './arena/manager.js'
import type { ArenaRun } from './arena/manager.js'
import { ArenaStore } from './arena/store.js'
import type { FolderTrust, TrustDoc } from './trust.js'
import { transcribeAudio } from './voice/transcriber.js'
import type { RunLoopDeps } from './run-loop.js'
import type { BashShellPool } from './tools/bash-pool.js'
import { PermissionServiceImpl } from './permission/service.js'
import type { ProjectLayer } from './permission/service.js'
import { UserRuleStore } from './permission/store.js'
import { SessionIndexMaintainer } from './session/index-maintainer.js'
import { storageReport as storageReportOf, type StorageReport } from './storage/report.js'
import {
  cleanupBucket,
  exportSessionsBundle,
  importSessionsBundle,
  type StorageCleanupResult,
  type StorageExportResult,
  type StorageImportResult,
} from './storage/maintenance.js'
import { fetchLinkPreview as fetchLinkPreviewOf, type LinkPreviewResult } from './link-preview.js'
import { findSessionFile as findSessionFileOnDisk, scanArchivedMarkers, scanPinnedMarkers, scanDiskSessions as scanDiskSessionsOnDisk, scanForkChildren as scanForkChildrenOnDisk, titleOf } from './session/scan.js'
import { readLogs, type ReadLogsQuery } from './logs.js'
import { Metrics } from './observability/metrics.js'
import { SessionRuntime } from './session/runtime.js'
import { SessionStore, danglingTurnIds, mungeDir, sessionFileName } from './session/store.js'
import { TitleGenerator, TITLE_PROMPT } from './title.js'
import { ToolOutputStore } from './tools/output-store.js'
import { ToolPipelineImpl } from './tools/pipeline.js'
import { IoGuard } from './tools/guard.js'
import { ToolRegistry } from './tools/registry.js'
import type { ToolContext, ToolOutput, SemanticRecallPort } from './tools/definition.js'
import { registerBuiltinTools } from './tools/builtin/index.js'
import { makeTaskTool } from './tools/builtin/task.js'
import type { TaskInput } from './tools/builtin/task.js'
import { newIds } from './ulid.js'
import { Logger } from './logger.js'
import type { SparkLogger } from './logger.js'
import { loadMcpConfig } from './mcp/config.js'
import { McpManager } from './mcp/manager.js'
import { LspManager } from './lsp/manager.js'
import { LspInstaller } from './lsp/installer.js'
import type { LspInstallOutcome } from './lsp/installer.js'
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
import { asError, errText } from './errs.js'
import { persistSparkPatch, SettingsStore, type RoutingState } from './settings-store.js'
import { makeSubagentRunner } from './subagent.js'
import { loadAgentPresets, presetToolEffects } from './agents/presets.js'
import { BrowserManager } from './browser/driver.js'
import { createPlaywrightDriver, SHOT_FILE_RE } from './browser/playwright.js'
import { makeBrowserTools } from './tools/builtin/browser.js'
import { makeComputerTools } from './tools/builtin/computer.js'
import { createComputerExecutor, type ComputerExecutor } from './computer/executor.js'
import { SandboxNetworkProxy } from './sandbox/proxy.js'
import { resolveEmbeddingProvider, HttpEmbeddingClient, type EmbeddingProviderInfo } from './embedding/client.js'
import { DEFAULT_AFTER_DAYS, selectDueForAutoArchive } from './session/archive-policy.js'
import { proxyFetchFor } from './proxy-fetch.js'
import { sparkHome } from './home.js'
import { VectorStore } from './vector/store.js'
import { FeedbackStore } from './feedback/store.js'
import { SemanticIndexer, mergeMemories, mergeEvents } from './vector/semantic.js'

import type {
  EngineDeps,
  ForkChildInfo,
  ReplyOutcome,
  SearchHit,
  SearchIndexStats,
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
import {
  attachmentsDir,
  projectPermissionsFile,
  checkpointsRootOf,
  sparkDir,
  sparkFile,
} from './storage/paths.js'

export class Engine {
  private readonly root: string
  private readonly defaultCwd: string
  /** 可在设置写盘成功后整体重载（工单 10.20 B / D28；启动期注入的子系统不受影响=重启档语义） */
  private config: EngineConfig
  /** 提示词模板（工单 13.3）：构造期装载一次（重启档语义）；渲染在使用点不提前冻结 */
  private readonly promptTemplates: PromptTemplates
  private readonly now: () => number
  private readonly newSessionId: () => SessionId
  private readonly bus: EventBus
  private readonly gateway: LlmGateway
  private bashPool: BashShellPool | null = null
  private readonly permission: PermissionServiceImpl
  /** 用户级权限规则仓（~/.spark/permissions.json；always 固化与规则管理 UI 的持久层） */
  private readonly ruleStore: UserRuleStore
  /** 项目级规则层缓存（LA-01/LA-03）：trustKey(cwd) → 层；信任门与家目录守卫在 projectLayerFor */
  private readonly projectLayers = new Map<string, ProjectLayer>()
  /** 未信任目录"有规则被停用"的告警去重（每个 cwd 只记一次） */
  private readonly projectLayerWarned = new Set<string>()
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
  /** 浏览器设置（阶段十九 19.12 / ADR D49）：spark.json browser 段归一化值（装配与 getSettings 共用） */
  private readonly browserSettings: BrowserSettings
  /** 电脑控制执行体（阶段十九 19.1 / ADR D43）：构造零副作用，spawn 只在操作执行期 */
  private readonly computerExecutor: ComputerExecutor
  /**
   * 沙箱网络隔离代理（阶段十九 19.7 / ADR D50）：allowlist 档才建实例并监听 127.0.0.1；
   * 启动失败也保留实例（status.ready=false + reason）——bash 侧据此 fail-closed 拒跑。
   * allowlist 内容经 getter 热读（PUT 即时生效，不重启代理）。
   */
  private sandboxProxy: SandboxNetworkProxy | null = null
  /**
   * 语义检索（阶段十九 19.8 / ADR D51）：向量库 + 语义编排器——models.json 有 provider
   * 声明 embeddings 且 spark.json embedding.enabled 才建；否则两者为 null（关键词照常）。
   * 换提供方/维度需重建（维度不一致如实 E_EMBEDDING_DIMENSION，不混嵌）。
   */
  private readonly vectors: VectorStore | null
  private readonly semantic: SemanticIndexer | null
  private readonly embeddingProvider: EmbeddingProviderInfo | null
  /** 反馈仓（阶段十九 19.19 / V2-25）：打不开 = null（端点拒执，禁假状态） */
  private readonly feedbackStore: FeedbackStore | null
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
  /** 归档标记扫描任务（工单 12.4：boot 填充 archivedIds/archivedAtById——ready 前完成） */
  private readonly archivedReady: Promise<void>
  private readonly registry: ToolRegistry
  /** MCP 外部工具管理（阶段五工单 5.3 / ADR D16）：与内置工具同一注册表同一管线 */
  private readonly mcp: McpManager
  /** MCP 连接任务（connect 内部逐 server 失败闭合；ready() 供 server 入口等待） */
  private readonly mcpReady: Promise<void>
  /** LSP 连接管理（工单 16.9）：惰性连接（首次查询才 spawn），经 ToolContext 注入 lsp 工具 */
  private readonly lsp: LspManager
  /** LSP 下载器（阶段十九 19.5 / ADR D47）：内置清单安装面（deps 可注入测试假体） */
  private readonly lspInstaller: LspInstaller
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
  /** 子代理预设档（工单 13.5）：~/.spark/agents/*.json；presetsReady 完成后填充 */
  private agentPresets: readonly AgentPresetDto[] = []
  /** 文件夹信任（工单 16.4 / ADR D37）：trusted.json 内存持有，写经 saveTrustDoc 原子落盘 */
  private trustDoc: TrustDoc = { version: 1, folders: {} }
  /** 多模型竞答（工单 16.8 / ADR D42）：内存态（重启丢失登记限制）——快照与胜者应用面 */
  private readonly arenaManager: ArenaManager
  /** 预设档加载任务（坏文件/坏形状 warn 跳过，不阻塞启动；ready() 等待） */
  private readonly presetsReady: Promise<void>
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
  /** 归档会话登记（工单 12.4：标记文件为事实源，本 Set 为内存加速；boot 扫描填充） */
  private readonly archivedIds = new Set<SessionId>()
  private readonly archivedAtById = new Map<SessionId, string>()
  /** 置顶会话登记（工单 19.41 / V2-23 置顶半边）：`<jsonl>.pinned` 标记为事实源，本 Set 加速 */
  private readonly pinnedIds = new Set<SessionId>()
  /** 子代理执行体（subagent.ts 工厂；依赖引擎 Map/Set 引用——构造器内装配） */
  private readonly runSubagentFn: (input: TaskInput, ctx: ToolContext) => Promise<ToolOutput>
  private shuttingDown = false
  private shutdownPromise: Promise<void> | null = null
  private readonly logger: SparkLogger
  private readonly ownsLogger: boolean

  constructor(deps: EngineDeps = {}) {
    this.root = deps.root ?? sparkHome()
    this.defaultCwd = deps.cwd ?? process.cwd()
    this.config = deps.config ?? loadConfig(this.root)
    // 工单 13.3：spark.json `prompts` 段 → 三处模板装载（缺文件/非白名单占位符 → E_CONFIG 拒启动）
    this.promptTemplates = loadPromptTemplates(this.root, this.config.spark.prompts, {
      base: BASE_PROMPT,
      compaction: COMPACTION_PROMPT,
      title: TITLE_PROMPT,
    })
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
    this.arenaManager = new ArenaManager({ engine: this, sparkRoot: this.root, store: new ArenaStore(this.root) })
    // 工单 16.4 / ADR D37：文件夹信任（坏文件 → 空表 + warn，不阻塞启动——同 commands/skills 纪律；
    // 装载在 logger 就绪后——onError 需要告警出口）
    this.trustDoc = loadTrustDoc(this.root, (err) => this.logger.warn('trust.load.error', { err }))

    // 会话索引：建库失败即降级（JSONL 权威不受影响）；启动重建对齐磁盘
    this.index = new SessionIndexMaintainer(this.root, this.logger)
    this.indexReady = this.index.rebuild(() => this.scanDiskSessions()).catch((err: unknown) => {
      this.index.disable(err, 'session.index.rebuild.error')
    })
    // 工单 12.4：归档标记扫描填充内存登记（标记文件 = 事实源）；
    // 工单 19.41 置顶标记同一路径共用一个 ready 闸门（列表排序两态都要等）
    this.archivedReady = Promise.all([
      scanArchivedMarkers(sparkDir(this.root, 'sessions')),
      scanPinnedMarkers(sparkDir(this.root, 'sessions')),
    ]).then(([archived, pinned]) => {
      for (const id of archived.ids) {
        this.archivedIds.add(id)
        const ts = archived.at.get(id)
        if (ts !== undefined) this.archivedAtById.set(id, ts)
      }
      for (const id of pinned) this.pinnedIds.add(id)
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

    // 子代理执行体（subagent.ts 工厂；依赖引擎 Map/Set 引用——bus 就绪后装配）
    this.runSubagentFn = makeSubagentRunner({
      createSession: (opts) => this.createSession(opts),
      sessions: this.sessions,
      bus: this.bus,
      children: this.subagentChildren,
    })

    // skills/插件（工单 5.5 / ADR D18）：声明式清单 → 事件词表扩展 + hooks 订阅；
    // 逐 skill 失败 warn 跳过（loader 内闭合），ready() 前完成注册
    this.skillsReady = loadSkills(sparkDir(this.root, 'skills'), this.logger).then(
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
    this.commandsReady = loadCommands(sparkDir(this.root, 'commands'), this.logger).then(
      (cmds) => {
        this.customCommands = cmds
        for (const c of cmds) {
          this.logger.info('commands.loaded', { name: c.name })
        }
      },
    )

    // 工单 13.5：子代理预设档（坏文件/坏形状 warn 跳过——同 commands/skills 纪律，不阻塞启动）
    // 工单 16.2 / ADR D36：两层加载——项目层 <defaultCwd>/.spark/agents 覆盖用户层同名档
    this.presetsReady = loadAgentPresets(this.root, this.logger, this.defaultCwd).then((presets) => {
      this.agentPresets = presets
      for (const p of presets) {
        this.logger.info('agents.preset.loaded', { name: p.name, source: p.source })
      }
    })

    // 工单 7.5 / H05 / ADR D25：长期记忆仓（打开失败 null 降级，引擎照常启动）
    let memoryStore: MemoryStore | null = null
    try {
      memoryStore = new MemoryStore(sparkFile(this.root, 'memoryDb'))
      if (!memoryStore.fts) {
        this.logger.warn('memory.fts.unavailable', { path: sparkFile(this.root, 'memoryDb') })
      }
    } catch (err) {
      this.logger.warn('memory.store.error', { err })
    }
    this.memory = memoryStore

    // 工单 7.13 / H12：会话全文搜索索引（打开失败 null 降级——检索不可用不阻塞引擎）
    this.search = new SearchIndexer(this.root, this.logger, (id) => this.sessionTitleOf(id))

    // 工单 7.10 / H09 / ADR D27：browser 工具族——引擎级单例单页；
    // 驱动（playwright-core）首次 browser.open 才启动，构造期零依赖
    this.shotsDir = sparkDir(this.root, 'browserShots')
    // 浏览器设置（阶段十九 19.12 / ADR D49）：spark.json browser 段——重启档
    //（BrowserManager 构造期装配）；缺省 headless/30s/不覆盖 UA
    const b = this.config.spark.browser
    this.browserSettings = {
      headless: b?.headless ?? true,
      defaultTimeoutMs: b?.defaultTimeoutMs ?? 30_000,
      userAgent: b?.userAgent ?? '',
    }
    this.browser = new BrowserManager(
      deps.browserDriver ??
        createPlaywrightDriver(this.shotsDir, this.logger, {
          headless: this.browserSettings.headless,
          ...(this.browserSettings.userAgent !== '' ? { userAgent: this.browserSettings.userAgent } : {}),
        }),
    )

    // 阶段十九 19.1 / ADR D43：电脑控制执行体——截图与 browser 共享 shotsDir
    // （GET /api/artifacts 单通道供图）；构造零副作用（spawn 只在操作执行期）
    this.computerExecutor =
      deps.computerExecutor ?? createComputerExecutor(this.shotsDir)

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
    // 沙箱网络隔离（阶段十九 19.7 / ADR D50）：allowlist 档先建代理再注册 bash 工具
    //（工具经 getter 执行期读状态——mode/allowlist 热档，port 重启档）。构造期绑定失败
    // 不抛（引擎照常启动），代理留 fail-closed 态由 bash 拒跑，如实可查。
    void this.reconcileSandboxNetwork()
    // 自动归档巡检（阶段十九 19.13）：6 小时一轮 + unref（不拖进程退出）；
    // 开关现读（this.config 热替换），关时每轮空转返回
    const archiveTimer = setInterval(() => {
      void this.runArchiveSweep().catch((err: unknown) => {
        this.logger.warn('archive.sweep.error', { err })
      })
    }, 6 * 60 * 60 * 1000)
    archiveTimer.unref()
    registerBuiltinTools(this.registry, {
      bashSandbox: this.config.spark.engine.bashSandbox,
      // bash 常驻会话（阶段十九 19.3 / ADR D45）：getter 执行期读，主开关热档
      bashPersistent: () => this.config.spark.engine.bashPersistent,
      // LA-16：池引用回调——shutdown 排水用
      onPool: (pool) => {
        this.bashPool = pool
      },
      // 沙箱网络隔离（阶段十九 19.7 / ADR D50）：getter 执行期读（热档）
      networkIsolation: () => ({
        enabled: this.config.spark.sandbox?.network?.mode === 'allowlist',
        port: this.config.spark.sandbox?.network?.port ?? SANDBOX_NETWORK_DEFAULTS.port,
        ready: this.sandboxProxy?.status.ready === true,
      }),
    })
    // 记忆工具族（工单 7.5）：仓不可用不注册（模型无从调用，fail 路径不存在）
    if (this.memory !== null) {
      this.registry.register(memorySaveTool)
      this.registry.register(memorySearchTool)
    }
    // browser 工具族（工单 7.10 / ADR D27）：恒广告——浏览器二进制缺失时
    // 执行期 E_BROWSER_LAUNCH fail-closed（缺失不是静默降级的理由）
    for (const tool of makeBrowserTools(this.browser, { defaultTimeoutMs: this.browserSettings.defaultTimeoutMs })) {
      this.registry.register(tool)
    }
    // computer.* 工具族（阶段十九 19.1 / ADR D43）：恒广告——主开关缺省关时
    // 执行期 E_COMPUTER_DISABLED fail-closed（关闭不是静默缺席的理由，browser 同判例）
    for (const tool of makeComputerTools({
      executor: this.computerExecutor,
      isEnabled: () => this.config.spark.engine.computerUseEnabled,
    })) {
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
      // 全局出网代理 env（阶段十九 19.13，翻案 12.9"仅 LLM 面"）：getter 现读，
      // MCP server 自身发起的请求经环境变量走代理（尊重代理设置的客户端才生效）
      proxyEnv: () => this.globalProxyEnv(),
    })
    this.mcpReady = this.mcp.connect(this.registry).catch((err: unknown) => {
      this.logger.warn('mcp.connect.error', { err })
    })
    // LSP 连接管理（工单 16.9）：构造期零开销——lsp.json 缺失时工具执行期
    // E_LSP_UNCONFIGURED fail-closed（browser 工具族同判例）；连接在首次查询才 spawn
    this.lsp = new LspManager({
      root: this.root,
      bus: this.bus,
      logger: this.logger,
    })
    // LSP 下载器（阶段十九 19.5 / ADR D47）：内置清单安装面（测试可经 deps 注入）
    this.lspInstaller =
      deps.lspInstaller ??
      new LspInstaller({
        root: this.root,
      })
    this.outputs = new ToolOutputStore(
      this.config.spark.engine.toolOutputLimitKB * 1024,
      sparkDir(this.root, 'toolOutputs'),
    )
    this.ruleStore = new UserRuleStore(
      sparkFile(this.root, 'permissions'),
      this.config.permissions.rules,
    )
    // 项目级规则层（19.9 / ADR D48；LA-01/LA-03 收口）：按会话 cwd 惰性建层，
    // 信任门 + 家目录撞路径守卫 + 坏形状降级都收在 projectLayerFor 单点；
    // 不再预建 UserRuleStore 常驻字段（旧实现把 defaultCwd 的规则无条件下进所有会话）。
    this.secrets = new SecretStore(sparkFile(this.root, 'secrets'))

    // 阶段十九 19.8 / ADR D51：语义检索——models.json 有 provider 声明 embeddings 才建。
    // 总开关 spark.json embedding.enabled 缺省 true（关 = 不嵌不检索，FTS 照常）。
    // 无 baseUrl / 向量库打不开 → semantic 为 null，关键词通道零变化（禁假状态）。
    const embProvider = resolveEmbeddingProvider(
      this.config.models.providers,
      this.config.models.embedding?.provider,
    )
    this.embeddingProvider = embProvider
    // 指了名却没解析出来（名字写错 / 那家没声明 embeddings）要留痕：静默关掉语义检索
    // 与"没配语义检索"在日志里长一样，用户只会觉得检索变差而查不到原因
    if (embProvider === null && this.config.models.embedding?.provider !== undefined) {
      this.logger.warn('embedding.provider.unresolved', {
        preferred: this.config.models.embedding.provider,
      })
    }
    let vectors: VectorStore | null = null
    let semantic: SemanticIndexer | null = null
    if (embProvider !== null) {
      const providerCfg = this.config.models.providers[embProvider.providerId]
      const baseUrl = providerCfg?.baseUrl ?? PROVIDER_CATALOG[embProvider.providerId.toLowerCase()]?.defaultBaseUrl
      if (baseUrl === undefined) {
        this.logger.warn('embedding.provider.no_base_url', { provider: embProvider.providerId })
      } else {
        try {
          vectors = new VectorStore(sparkFile(this.root, 'vectorsDb'))
          semantic = new SemanticIndexer({
            client: new HttpEmbeddingClient({
              baseUrl,
              fetchImpl: this.engineFetchFor(providerCfg?.proxy),
              apiKey:
                providerCfg?.apiKeyEnv != null
                  ? resolveApiKey(this.secrets, embProvider.providerId, providerCfg.apiKeyEnv).apiKey
                  : undefined,
              provider: embProvider,
            }),
            store: vectors,
            sources: {
              memories: () => this.memory?.all() ?? [],
              events: () => this.search.allEntries(),
            },
            titleOf: (id: SessionId) => this.sessionTitleOf(id),
          })
          this.logger.info('embedding.provider.ready', {
            provider: embProvider.providerId,
            model: embProvider.model,
          })
        } catch (err) {
          // 向量库打不开 = 语义不可用（派生缓存，不阻塞引擎）；关键词照常
          this.logger.warn('vector.store.error', { err })
          vectors = null
          semantic = null
        }
      }
    }
    this.vectors = vectors
    this.semantic = semantic

    // 反馈仓（阶段十九 19.19 / V2-25）：派生缓存——打不开不阻塞引擎，端点拒执
    try {
      this.feedbackStore = new FeedbackStore(sparkFile(this.root, 'feedbackDb'))
    } catch (err) {
      this.logger.warn('feedback.store.error', { err })
      this.feedbackStore = null
    }

    // 工单 7.1 验收：store 值不落日志——启动即注册进脱敏层（deps.logger 未实现则跳过）
    this.logger.registerSecrets?.(this.secrets.values())
    // 工单 7.2：I/O 护栏——store 值动态取（setSecret 即时生效，与日志脱敏同纪律）
    this.ioGuard = new IoGuard({ secretValues: () => this.secrets.values() })
    // 工单 7.12：审计日志明细流——脱敏同纪律（密钥仓值动态注入）
    this.audit = new AuditLog(this.root, () => this.secrets.values())
    // 工单 7.7：成本熔断计量（usage.json 跨进程延续）+ 路由状态（ResolvedModel 化）
    this.costTracker = new CostTracker(sparkFile(this.root, 'usage'), this.now)
    this.settings = new SettingsStore(this.root, this.logger, this.costTracker, {
      resolveModelRef: (model) => this.resolveModelRef(model),
      resolveModel: (ref) => this.resolveModel(ref),
    }, this.config)
    const defaultProjectLayer = this.projectLayerFor(this.defaultCwd)
    this.permission = new PermissionServiceImpl({
      bus: this.bus,
      ruleStore: this.ruleStore,
      // 项目层（LA-01/LA-03）：defaultCwd 层作 isDenied 广告面与未提供 sessionProject
      // 时的回落；会话评估走 sessionProject——按会话自己的 cwd 取层，未信任 = 整层不进评估
      // （条件展开：exactOptionalPropertyTypes 下可选字段不收显式 undefined）
      ...(defaultProjectLayer !== undefined ? { defaultProject: defaultProjectLayer } : {}),
      sessionProject: (sid) =>
        this.projectLayerFor(this.sessions.get(sid)?.meta.cwd ?? this.defaultCwd),
      timeoutMs: this.config.spark.engine.permissionTimeoutMs,
      metrics: this.metrics,
      audit: this.audit, // 工单 7.12：决策与 always 固化规则变更入审计明细流
      // 工单 16.4 / ADR D37：未信任 cwd 下 shell.exec/mcp.call 的自动放行收紧为 ask
      trust: {
        tightens: (action) => tightens(action, trustLevelOf(this.defaultCwd, this.trustDoc.folders)),
      },
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
    return Promise.all([this.mcpReady, this.skillsReady, this.commandsReady, this.presetsReady, this.archivedReady]).then(
      () => {
        // 工单 7.6：tick 循环在 server listen 前启动（幂等；unref 不阻止进程退出）
        this.automation.start()
      },
    )
  }

  /** 数据根（工单 12.2a：server 附件存储目录定位用；同 this.root 的只读面） */
  get dataRoot(): string {
    return this.root
  }

  /** §5.3 订阅透传（server SSE 的数据源；resume 供 SSE 背压 drain 恢复）。
   * onDurableOverflow（AUD-11）：该订阅者缓冲溢出且无法保全 durable 时回调——
   * SSE 层借此断流让客户端按水位重连补播（事件不静默丢失）。 */
  subscribe(
    handler: (e: SparkEventEnvelope) => void | false | Promise<void | false>,
    filter?: {
      sessionId?: SessionId
      onDurableOverflow?: (e: SparkEventEnvelope) => void
    },
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
      /** 子代理预设档名（工单 13.5）：不存在 → E_CONFIG 人话（并列出可用档名） */
      preset?: string
    } = {},
  ): Promise<SessionHandle> {
    this.assertNotShutdown()
    const cwd = opts.cwd ?? this.defaultCwd
    // 工单 13.5：预设档解析（未指定 = undefined，行为与引入前逐字节一致）
    const preset = opts.preset !== undefined ? this.requireAgentPreset(opts.preset) : undefined
    const presetWiring =
      preset !== undefined
        ? {
            ...(preset.systemAppend !== undefined ? { systemAppend: preset.systemAppend } : {}),
            hiddenTools: presetToolEffects(this.registry, preset.tools).hiddenTools,
          }
        : undefined
    // 工单 7.7：子代理派生（parentId 存在）缺省用 subagentModel 路由档（热更新现读）；
    // 优先级（工单 13.5）：显式 opts.model > 预设档 model > subagentModel 路由档
    const subagentDefault =
      opts.parentId !== undefined
        ? `${this.routing.subagentModel.provider}/${this.routing.subagentModel.model}`
        : undefined
    // 新建会话默认模型（阶段十九 19.14 / V2-37，ADR D53）：显式 opts.model > 预设档 >
    // 子代理路由档 > routing.defaultModel（= models.json defaultModel，PUT /api/routing 热改）
    const modelRef = this.resolveModelRef(
      opts.model ??
        preset?.model ??
        subagentDefault ??
        `${this.routing.defaultModel.provider}/${this.routing.defaultModel.model}`,
    )
    const modelStr = `${modelRef.provider}/${modelRef.model}`
    const sessionId = this.newSessionId()
    const createdAt = this.now()
    // 工单 10.6：分支只读探测（非仓库/无 git → null，不携带——禁假状态）
    const branch = await gitBranchOf(cwd)
    // 工单 10.6：推理档位缺省取默认档（V2-37 后经 routing 状态热改，回退 models.json 装载值）
    const defaultEffort = this.routing.defaultEffort ?? this.config.models.defaultEffort

    const dir = join(sparkDir(this.root, 'sessions'), mungeDir(cwd))
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
    // 标题（工单 13.5）：显式入参 > 预设档 title > 子代理缺省 '子代理'（该缺省原在 subagent.ts）
    const title = opts.title ?? preset?.title ?? (opts.parentId !== undefined ? '子代理' : '')
    const meta: SessionMeta = {
      id: sessionId,
      title,
      model: modelStr,
      cwd,
      createdAt,
      updatedAt: createdAt,
      lastSeq: 0,
      ...(branch !== null ? { branch } : {}),
      ...(defaultEffort !== undefined ? { effort: defaultEffort } : {}),
    }
    const entry = this.wireSession(store, meta, modelRef, presetWiring)
    this.sessions.set(sessionId, entry)
    // 工单 13.5：预设档工具收窄 → 会话级 deny 规则（走既有权限门：调用即 E_PERMISSION + 审计归因）
    if (preset !== undefined) {
      this.permission.addSessionRules(sessionId, presetToolEffects(this.registry, preset.tools).rules)
    }
    await this.bus.emit(sessionId, 'session.created', {
      cwd,
      model: modelStr,
      ...(title !== '' ? { title } : {}),
      ...(branch !== null ? { branch } : {}),
      ...(meta.effort !== undefined ? { effort: meta.effort } : {}),
    })
    return this.handleOf(entry)
  }

  // ---- 子代理预设档（工单 13.5） ----

  /**
   * GET /api/agents 数据源：已加载预设档清单（只读面——写入靠用户改文件后重启）。
   * 工单 16.2 / ADR D36：disabled 从 settings.agents.disabledAgents 名单合成
   * （启停走 PUT /api/settings，重启档——预设档构造期装载，热改名单不实时反映在运行态）。
   */
  listAgentPresets(): readonly AgentPresetDto[] {
    const disabled = new Set(this.config.spark.agents?.disabledAgents ?? [])
    if (disabled.size === 0) return this.agentPresets
    return this.agentPresets.map((p) =>
      disabled.has(p.name) ? { ...p, disabled: true } : p,
    )
  }

  /** 预设档解析：不存在 → E_CONFIG 人话（列出可用档名，不静默回退到无预设）；停用档同拒 */
  private requireAgentPreset(name: string): AgentPresetDto {
    const found = this.agentPresets.find((p) => p.name === name)
    if (found === undefined) {
      const known = this.agentPresets.map((p) => p.name).join(', ')
      throw new Error(
        `E_CONFIG: 子代理预设档 ${name} 不存在（放 ~/.spark/agents/<name>.json；可用：${known === '' ? '无' : known}）`,
      )
    }
    // 工单 16.2：settings 名单停用的档如实拒绝（禁静默回退到无预设——假状态红线）
    const disabled = this.config.spark.agents?.disabledAgents ?? []
    if (disabled.includes(name)) {
      throw new Error(
        `E_CONFIG: 子代理预设档 ${name} 已停用（设置中心子智能体页或 spark.json agents.disabledAgents 可恢复）`,
      )
    }
    return found
  }

  /** POST /api/transcribe 数据源：语音转写（工单 16.6；SSRF 防护与失败闭合在 voice/ 模块内） */
  async transcribe(input: { provider?: string | undefined; mime: string; dataBase64: string }): Promise<{
    text: string
    provider: string
    model: string
  }> {
    this.assertNotShutdown()
    return transcribeAudio(
      { models: this.config.models, secrets: this.secrets },
      input,
    )
  }

  // ---- 成本看板（工单 13.6 / V2-07） ----

  /** GET /api/usage/summary 数据源：总账 + 明细桶 + 无明细差额（旧账）+ 熔断阈值状态 */
  usageSummary(since?: string): UsageSummaryDto {
    const summary = this.costTracker.summary(since)
    return {
      total: summary.total,
      buckets: summary.buckets,
      unbucketed: summary.unbucketed,
      costLimitUsd: this.routing.costLimitUsd ?? null,
      exceeded: this.costTracker.exceeded(this.routing.costLimitUsd),
    }
  }

  // ---- 会话归档与两段式删除（阶段十二工单 12.4 / V2-23） ----

  /**
   * 归档/恢复：写删 `<jsonl>.archived` 标记（事实源）+ 内存登记同步；
   * 会话文件原地不动（resume 不受影响）。幂等：重复归档/恢复无副作用。
   */
  async archiveSession(id: SessionId, archived: boolean): Promise<SessionMeta> {
    this.assertNotShutdown()
    const path = await this.locateSessionFile(id)
    const marker = `${path}.archived`
    if (archived) {
      const at = new Date().toISOString()
      writeFileSync(marker, at, 'utf8')
      this.archivedIds.add(id)
      this.archivedAtById.set(id, at)
    } else {
      rmSync(marker, { force: true })
      this.archivedIds.delete(id)
      this.archivedAtById.delete(id)
    }
    this.logger.info(archived ? 'session.archived' : 'session.unarchived', { sid: id })
    const base: SessionMeta = this.sessions.get(id)?.meta ?? {
      id,
      title: '',
      model: '',
      cwd: '',
      createdAt: 0,
      updatedAt: 0,
      lastSeq: 0,
    }
    const at = this.archivedAtById.get(id)
    return archived && at !== undefined ? { ...base, archivedAt: at } : base
  }

  /**
   * 置顶/取消置顶（工单 19.41 / V2-23 置顶半边）：写删 `<jsonl>.pinned` 标记（事实源，
   * 与归档同口径——管理面 REST、不入事件流：置顶对模型不可见，不触 surface 纪律）
   * + 内存登记 + 索引列同步（列表排序第一键）。幂等：重复置顶无副作用。
   */
  async pinSession(id: SessionId, pinned: boolean): Promise<SessionMeta> {
    this.assertNotShutdown()
    const path = await this.locateSessionFile(id)
    const marker = `${path}.pinned`
    if (pinned) {
      writeFileSync(marker, new Date().toISOString(), 'utf8')
      this.pinnedIds.add(id)
    } else {
      rmSync(marker, { force: true })
      this.pinnedIds.delete(id)
    }
    this.index.setPinned(id, pinned)
    this.logger.info(pinned ? 'session.pinned' : 'session.unpinned', { sid: id })
    const loaded = this.sessions.get(id)?.meta
    const base: SessionMeta = loaded ?? {
      id,
      title: '',
      model: '',
      cwd: '',
      createdAt: 0,
      updatedAt: 0,
      lastSeq: 0,
    }
    return pinned ? { ...base, pinned: true } : base
  }

  /**
   * 两段式安全删除（与 AGENTS §2.10 不删除哲学同构）：① 关闭在途（loaded 先停
   * run-loop + flush close——Windows 文件锁）；② JSONL rename 进 ~/.spark/trash/
   * （同盘原子，可人工找回）→ 成功才清标记与索引行；移动失败原样保留（失败闭合）。
   * 运行中会话拒绝（E_SESSION_ACTIVE）。
   */
  async deleteSession(id: SessionId): Promise<void> {
    this.assertNotShutdown()
    const entry = this.sessions.get(id)
    if (entry !== undefined && entry.runtime.state === 'running') {
      throw new Error('E_SESSION_ACTIVE: 会话运行中，不可删除——先等待回合结束或中断')
    }
    const path = await this.locateSessionFile(id)
    if (entry !== undefined) {
      // 已装载：先收口再移动（单写者纪律 + Windows 打开句柄阻止 rename）
      entry.runtime.interrupt()
      entry.runtime.shutdown()
      await entry.loop
      await entry.store.close()
      this.sessions.delete(id)
      this.bus.forgetSession(id)
    }
    const trashDir = sparkDir(this.root, 'trash')
    mkdirSync(trashDir, { recursive: true })
    const dest = join(trashDir, `${basename(path)}.${Date.now()}.jsonl`)
    try {
      renameSync(path, dest)
    } catch (err) {
      // 失败闭合：移动失败不动索引与标记——原会话照常可用
      throw new Error(`E_DELETE_FAILED: 会话文件移入 trash 失败：${errText(err)}`)
    }
    rmSync(`${path}.archived`, { force: true })
    // 置顶标记随会话一并清理（工单 19.41；标记是目录内文件，不清会成孤儿并被 boot 误认）
    rmSync(`${path}.pinned`, { force: true })
    this.pinnedIds.delete(id)
    this.index.remove(id)
    this.archivedIds.delete(id)
    this.archivedAtById.delete(id)
    this.logger.info('session.deleted', { sid: id, trash: dest })
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
    return findSessionFileOnDisk(sparkDir(this.root, 'sessions'), id)
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
    const dir = join(sparkDir(this.root, 'sessions'), mungeDir(source.meta.cwd))
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

  /**
   * 规则列表（LA-04）：用户级 + 项目级（defaultCwd 层；未信任或家目录撞路径时项目层
   * 缺席，如实少一段——那是"未生效"的如实呈现，不是漏报）合成，source 标注来源。
   * 多 cwd 的项目层不在全局列表枚举（管理页是全局语境；逐 cwd 管理登记为限制）。
   */
  listPermissionRules(): PermissionRuleDto[] {
    const out: PermissionRuleDto[] = this.ruleStore.list().map((r) => ({ ...r, source: 'user' as const }))
    const layer = this.projectLayerFor(this.defaultCwd)
    if (layer !== undefined) {
      for (const r of layer.rules) out.push({ ...r, source: 'project' as const })
    }
    return out
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

  removePermissionRule(action: string, resource: string, scope: PermissionScope = 'user'): boolean {
    if (scope === 'project') {
      // LA-04：项目级规则可撤销——defaultCwd 层内存数组与项目文件同步删（即存即生效）
      const layer = this.projectLayerFor(this.defaultCwd)
      const idx = layer?.rules.findIndex((r) => r.action === action && r.resource === resource) ?? -1
      if (layer === undefined || idx < 0 || layer.store === undefined) return false
      ;(layer.rules as PermissionRule[]).splice(idx, 1)
      const removed = layer.store.remove(action, resource)
      if (removed) {
        this.audit.record({
          time: Date.now(),
          kind: 'permission.rule',
          actor: 'user',
          result: 'applied',
          op: 'remove',
          action,
          resource,
          source: 'settings-ui:project',
        })
      }
      return removed
    }
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

  /**
   * 会话 cwd 的项目层（LA-01/LA-03 收口）：信任门 + 家目录撞路径守卫 + 惰性建层
   * （按 trustKey(cwd) 缓存；层内的 rules 数组与评估列表同源，project 固化就地追加）。
   * - **未信任 = 整层不进评估**（LA-01）：项目 permissions.json 可随仓库传播，
   *   用户首次打开未信任仓库即被第三方写好审批规则，不能成立；文件里确有规则时
   *   warn + 审计各一条（每个 cwd 只记一次）。
   * - **家目录撞路径不设层**（LA-03②）：defaultCwd = 家目录时 <cwd>/.spark/
   *   permissions.json 与用户级文件同路径——两个内存数组重写同一文件互相丢规则，
   *   且"本项目"此刻就是全局；project 作用域固化将如实报 E_PERMISSION_SCOPE。
   * - 坏形状文件降级为空层跳过（warn），不阻塞审批主链路（用户级与会话层照常生效）。
   */
  private projectLayerFor(cwd: string): ProjectLayer | undefined {
    const key = trustKey(cwd)
    if (trustLevelOf(cwd, this.trustDoc.folders) !== 'trusted') {
      if (!this.projectLayerWarned.has(key)) {
        this.projectLayerWarned.add(key)
        const count = this.readProjectRulesLenient(cwd).length
        if (count > 0) {
          this.logger.warn('permission.projectRules.untrusted', { cwd, count })
          this.audit.record({
            time: Date.now(),
            kind: 'permission.rule',
            actor: 'system',
            result: 'ok',
            source: 'project-untrusted-skipped',
            resource: cwd,
            note: `未信任目录：${count} 条项目规则整层停用`,
          })
        }
      }
      return undefined
    }
    const cached = this.projectLayers.get(key)
    if (cached !== undefined) return cached
    const projectFile = projectPermissionsFile(cwd)
    if (resolve(projectFile) === resolve(sparkFile(this.root, 'permissions'))) {
      this.logger.warn('permission.projectRules.homeCollision', { cwd })
      return undefined
    }
    const rules = this.readProjectRulesLenient(cwd)
    const layer: ProjectLayer = { rules, store: new UserRuleStore(projectFile, rules), key }
    this.projectLayers.set(key, layer)
    if (rules.length > 0) {
      this.audit.record({
        time: Date.now(),
        kind: 'permission.rule',
        actor: 'system',
        result: 'ok',
        source: 'project-loaded',
        resource: cwd,
        note: `读到 ${rules.length} 条项目规则`,
      })
    }
    return layer
  }

  /** loadProjectRules 的降级读：坏形状如实 warn 后按空表处理（不阻塞会话审批链路） */
  private readProjectRulesLenient(cwd: string): PermissionRule[] {
    try {
      return loadProjectRules(cwd)
    } catch (err) {
      this.logger.warn('permission.projectRules.invalid', { cwd, err: errText(err) })
      return []
    }
  }

  // ---- 文件夹信任（工单 16.4 / ADR D37：trusted.json 的线上入口） ----

  /**
   * GET /api/trust 数据源：两层合成——trusted.json 全量条目 + defaultCwd 的有效档
   * （未列出 = none）。收紧语义（TIGHTENED_ACTIONS 五类 allow→ask）见 PermissionServiceImpl.deps.trust。
   */
  getTrust(): { folders: { path: string; trust: FolderTrust }[]; current: FolderTrust | 'none' } {
    return {
      folders: Object.entries(this.trustDoc.folders).map(([path, trust]) => ({ path, trust })),
      current: trustLevelOf(this.defaultCwd, this.trustDoc.folders),
    }
  }

  /** PUT /api/trust：设置/更新一条目录信任档（原子写；键归一化——同路径大小写变体不重复） */
  setTrust(path: string, trust: FolderTrust): void {
    this.trustDoc.folders[trustKey(path)] = trust
    saveTrustDoc(this.root, this.trustDoc)
  }

  // ---- 扩展管理（工单 16.5 / ADR D38） ----

  /** GET /api/extensions 数据源：现扫发现 + settings.extensions 名单合成 enabled（清单热可见） */
  async listExtensions(): Promise<ExtensionDto[]> {
    this.assertNotShutdown()
    const discovered = await discoverExtensions(this.root, this.logger)
    const disabled = new Set(this.config.spark.extensions?.disabledExtensions ?? [])
    if (disabled.size === 0) return discovered
    return discovered.map((e) => (disabled.has(e.id) ? { ...e, enabled: false } : e))
  }

  /** 启停扩展（写 settings.extensions 名单并原子落盘；注册表装配重启生效——D38 登记限制） */
  setExtensionEnabled(id: string, enabled: boolean): Promise<void> {
    // 异步边界保持 Transport 契约一致（同步抛错在 HTTP 通道表现为 rejected——D31 纪律）
    return Promise.resolve().then(() => {
      this.assertNotShutdown()
      const current = new Set(this.config.spark.extensions?.disabledExtensions ?? [])
      if (enabled) current.delete(id)
      else current.add(id)
      const patch: SettingsUpdate = {
        extensions: { disabledExtensions: [...current] },
      }
      this.config = persistSparkPatch(this.root, patch)
    })
  }

  // ---- 多模型竞答（工单 16.8 / ADR D42） ----

  /** GET /api/sessions/:id/arena 数据源：竞答快照（无竞答回 null） */
  arenaSnapshot(sessionId: SessionId): ArenaRun | null {
    this.assertNotShutdown()
    return this.arenaManager.snapshot(sessionId)
  }

  /** 发起竞答（/arena 命令引擎面；模型 2~5 个） */
  arenaStart(sessionId: SessionId, prompt: string, models: string[]): Promise<string> {
    return this.arenaManager.start(sessionId, prompt, models)
  }

  /** 应用胜者改动（整体一次 fs.write 审批；删除类跳过登记——§2.10） */
  arenaApplyWinner(sessionId: SessionId, contenderSessionId: SessionId): Promise<void> {
    return this.arenaManager.applyWinner(sessionId, contenderSessionId)
  }

  /** 取消竞答（中断运行中 contenders + 清 worktree） */
  arenaCancel(sessionId: SessionId): Promise<void> {
    return this.arenaManager.cancel(sessionId)
  }

  /** GET /api/arena/history 数据源（工单 19.10，翻案 D42 内存态）：竞答历史摘要（新→旧） */
  arenaHistory(limit?: number): ArenaHistoryEntryDto[] {
    this.assertNotShutdown()
    return this.arenaManager.history(limit)
  }

  /**
   * 竞答胜者应用的审批口：整体一次 permission.asked（fs.write，patterns=文件清单）。
   * 挂起等用户回复（同工具审批链）；拒绝返回 false。
   */
  async requestApproval(sessionId: SessionId, action: string, reason: string, patterns: string[]): Promise<boolean> {
    void reason
    return this.permission.assert({
      sessionId,
      callId: newIds.call(),
      turnId: newIds.turn(),
      name: 'arena-apply',
      action,
      resource: patterns.join(', '),
      patterns,
      input: null,
      signal: new AbortController().signal,
    })
  }

  /** 竞答应用的单文件写入（relPath 相对会话 cwd；resolve 后越界即拒——路径硬边界） */
  async writeFileInCwd(sessionId: SessionId, relPath: string, bytes: Buffer): Promise<void> {
    const handle = this.getSession(sessionId)
    if (handle === undefined) throw new Error('E_NOT_FOUND: 会话未装载')
    const abs = resolve(handle.meta.cwd, relPath)
    if (!abs.startsWith(resolve(handle.meta.cwd))) {
      throw new Error(`E_PATH_OUTSIDE: 应用路径越出会话工作目录：${relPath}`)
    }
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, bytes)
  }

  /** 竞答 contender 中断（级联 abort 当前 turn；未在跑幂等） */
  async interruptSession(id: SessionId): Promise<void> {
    const handle = this.getSession(id)
    if (handle !== undefined) await handle.interrupt()
  }

  /** 审计日志明细读（工单 7.12 / H11）：GET /api/audit 的引擎数据源（新→旧） */
  listAudit(query: AuditQuery): AuditEntry[] {
    return this.audit.entries(query)
  }

  // ---- 会话全文搜索（工单 7.13 / H12）----

  /**
   * 会话全文搜索（工单 7.13 / H12；阶段十九 19.8 / ADR D51 语义合流）：
   * GET /api/search 的引擎数据源。语义可用 = 语义优先 + 关键词兜底去重合流（两路都跑）；
   * 不可用（无提供方/关开关/嵌入失败）→ 纯关键词旧行为（零变化）。
   * 嵌入失败不阻塞——catch 后走关键词（fail-soft，禁假状态）。
   */
  async searchSessions(q: string, limit: number): Promise<SearchHit[]> {
    const keyword = this.search.search(q, limit)
    const sem = this.semantic
    if (sem === null || !this.embeddingEnabled()) return keyword
    try {
      const semantic = await sem.searchEvents(q, limit)
      return mergeEvents(semantic, keyword, limit)
    } catch (err) {
      this.logger.warn('semantic.search_events.error', { err })
      return keyword
    }
  }

  /** 索引库统计（工单 19.11；阶段十九 19.8 语义状态并展）：GET /api/index/stats 的引擎数据源 */
  indexStats(): SearchIndexStats {
    const base = this.search.stats()
    return { ...base, semantic: this.semanticStats() }
  }

  /**
   * 数据目录占用统计（阶段十九 19.37 第二批）：GET /api/storage/report 的引擎数据源。
   * 按**目录发现**分桶（Qwen 初稿头注口径：自备清单会在引擎新增子路径时安静漏项）；
   * 只读——不建目录、不清理、不写文件。符号链接与读不动的条目进 skipped 带原因。
   */
  async storageReport(): Promise<StorageReport> {
    return storageReportOf(this.root)
  }

  /**
   * 桶清理（19.37 第三批）：白名单桶移入 trash（§2.10 只移不删）；trash 桶 = 永久清空；
   * 白名单外如实拒（E_STORAGE_UNCLEANABLE）。确认在 UI 层（内联两段式）。
   */
  async storageCleanup(bucket: string): Promise<StorageCleanupResult> {
    this.assertNotShutdown()
    return cleanupBucket(this.root, bucket)
  }

  /** 打包导出（19.37 第三批）：全部会话 JSONL 逐字打包（marker 行 + 原始行） */
  async storageExport(): Promise<StorageExportResult> {
    this.assertNotShutdown()
    return exportSessionsBundle(this.root)
  }

  /** 回导（19.37 第三批）：未知会话按原文件落盘、同名跳过、坏段计数；落盘后重建会话索引 */
  async storageImport(bundle: string): Promise<StorageImportResult> {
    this.assertNotShutdown()
    const r = await importSessionsBundle(this.root, bundle)
    if (r.imported > 0) await this.index.rebuild(() => this.scanDiskSessions())
    return r
  }

  /** 链接预览（19.21 / V2-24）：SSRF 防护抓取（scheme 白名单 + DNS 逐地址校验 + 重定向逐跳复检） */
  async fetchLinkPreview(url: string): Promise<LinkPreviewResult> {
    this.assertNotShutdown()
    return fetchLinkPreviewOf(url)
  }

  /** 语义索引状态（设置页/索引库页数据源）：available = 提供方 + 向量库 + 总开关三条件齐备 */
  semanticStats(): SemanticIndexStats {
    const enabled = this.embeddingEnabled()
    const available = this.semantic !== null && enabled
    return {
      available,
      provider: this.embeddingProvider?.providerId ?? null,
      model: this.embeddingProvider?.model ?? null,
      dimensions: this.semantic?.dimensions ?? this.embeddingProvider?.dimensions ?? null,
      enabled,
      embedded: this.vectors?.count() ?? 0,
    }
  }

  /** 总开关现读（spark.json embedding.enabled；缺省 true） */
  private embeddingEnabled(): boolean {
    return this.config.spark.embedding?.enabled ?? true
  }

  /**
   * 语义检索端口（阶段十九 19.8 / ADR D51）：memory 工具与记忆注入共用一份装配。
   * searchMemories = 语义优先 + 关键词兜底去重合流（嵌入失败 fail-soft 回关键词）；
   * indexMemory = 新存记忆即时补嵌（fire-and-forget，失败只 warn 不抛——
   * 保存已成功，向量是派生缓存）。
   */
  private semanticPort(): SemanticRecallPort {
    const sem = this.semantic
    if (sem === null) throw new Error('E_EMBEDDING_UNAVAILABLE: 语义检索未启用')
    const m = this.memory
    return {
      searchMemories: async (query, k) => {
        const keyword = m?.search(query, k) ?? []
        try {
          const semantic = await sem.searchMemories(query, k)
          return mergeMemories(semantic, keyword, k)
        } catch (err) {
          this.logger.warn('semantic.search_memories.error', { err })
          return keyword
        }
      },
      indexMemory: (id, content) => {
        void (async () => {
          try {
            const vec = await sem.embedOne(content)
            if (vec === undefined) return
            this.vectors?.upsert('memory', String(id), content, vec, { id }, this.now())
          } catch (err) {
            this.logger.warn('semantic.index_memory.error', { id, err })
          }
        })()
      },
    }
  }

  /**
   * 向量索引增量补嵌（阶段十九 19.8 / ADR D51）：POST /api/index/vectors/rebuild——
   * 只嵌缺向量条目（不清表，已嵌零重复计费）。语义不可用 → 抛 E_EMBEDDING_UNAVAILABLE
   * （fail-closed，不返回假装成功的 0）；维度不一致 → E_EMBEDDING_DIMENSION（需重建）。
   */
  async rebuildVectors(): Promise<{ embedded: number; remaining: number }> {
    const sem = this.semantic
    if (sem === null || !this.embeddingEnabled()) {
      throw new Error('E_EMBEDDING_UNAVAILABLE: 未配置 embedding 提供方或语义检索已关闭')
    }
    return sem.backfill()
  }

  /** 索引库重建（工单 19.11）：POST /api/index/rebuild——清表重扫 sessions JSONL（等待完成回条目数） */
  rebuildIndex(): Promise<{ entries: number }> {
    return this.search.rebuild()
  }

  /** 索引库空间回收（工单 19.11）：POST /api/index/vacuum——SQLite VACUUM（前后体积如实回显） */
  vacuumIndex(): { sizeBytesBefore: number; sizeBytesAfter: number } {
    return this.search.vacuum()
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

  /** 浏览器截图产物清理（阶段十九 19.12）：删除 shotsDir 全部 shot-*.png，返回删除数 */
  cleanupBrowserArtifacts(): { removed: number } {
    let removed = 0
    try {
      for (const f of readdirSync(this.shotsDir)) {
        if (!SHOT_FILE_RE.test(f)) continue
        try {
          rmSync(join(this.shotsDir, f))
          removed += 1
        } catch {
          // 单文件删除失败跳过（fail-soft——只读挂载等），继续清其余
        }
      }
    } catch {
      // 目录不存在 = 无产物可清
    }
    return { removed }
  }

  /** 命中行的会话标题：已装载 meta → 会话索引（boot 重建）→ 空串兜底 */
  private sessionTitleOf(id: SessionId): string {
    const loaded = this.sessions.get(id)
    if (loaded !== undefined) return loaded.meta.title
    return this.index.titleOf(id)
  }

  // ---- 权限档位（DESIGN §13.E 四档 / D7 补记预设层，阶段六工单 6.3） ----

  /** 进入 plan 前的档位（工单 16.3 产出③ prePlanMode）：退出计划模式时恢复用 */
  private readonly prePlanPreset = new Map<SessionId, PermissionPreset>()

  /**
   * 设置会话档位（PUT /api/sessions/:id/permission-preset 的引擎侧入口）。
   * 工单 16.3：改为 **async**——"是否 plan" 发生变化时要 emit durable 事件
   * `session.mode.changed`（模式必须可回放、四端可见），而 emit 是异步的；
   * 调用方（server 路由 / sdk 进程内通道）需 await。
   */
  async setPermissionPreset(id: SessionId, preset: PermissionPreset): Promise<void> {
    await this.applyPreset(id, preset)
  }

  /** 当前档位（无记录 = confirm-each；内存态，重启回缺省） */
  permissionPresetOf(id: SessionId): PermissionPreset {
    return this.permission.presetOf(id)
  }

  /**
   * 会话模式（工单 16.3 /plan 计划模式）：mode 与 plan 档是**同一件事的两个面**——
   * mode 是可见/可回放的 durable 状态（事件驱动），plan 档是审批规则引擎的 enforcement 层
   * （PRESET_RULES.plan）+ 系统提示的 PLAN_MODE_DIRECTIVE（6.3 已接）。
   * 所以**切 mode 就是切档**：单一 enforcement 路径，不另造规则也不建独立状态机
   * （qwen-code 也只是 ApprovalMode 的一个值）；退出时恢复进 plan 前的档位。
   * 幂等：目标模式与当前一致则不发事件（重复点击/回放不产生噪声行）。
   */
  async setSessionMode(id: SessionId, mode: SessionMode): Promise<void> {
    this.assertNotShutdown()
    const current = this.permission.presetOf(id)
    if (mode === 'plan') {
      if (current === 'plan') return
      this.prePlanPreset.set(id, current)
      await this.applyPreset(id, 'plan')
      return
    }
    if (current !== 'plan') return
    const restore = this.prePlanPreset.get(id) ?? 'confirm-each'
    this.prePlanPreset.delete(id)
    await this.applyPreset(id, restore)
  }

  /** 当前会话模式（**由档位派生**——不存第二份状态，避免两份真相漂移） */
  sessionModeOf(id: SessionId): SessionMode {
    return this.permission.presetOf(id) === 'plan' ? 'plan' : 'default'
  }

  /** 档位变更的唯一出口：设档 + 若"是否 plan"变了就 emit durable 事件（§4.3 词表，工单 16.3） */
  private async applyPreset(id: SessionId, preset: PermissionPreset): Promise<void> {
    const previous = this.sessionModeOf(id)
    this.permission.setPreset(id, preset)
    const mode = this.sessionModeOf(id)
    if (mode === previous) return
    await this.bus.emit(id, 'session.mode.changed', { mode, previous })
    // 模式变了 = 旧模式下做出的审批语义不再成立：同会话挂起项一律作废
    // （fail-closed；理由与绕过面见 PermissionServiceImpl.invalidatePending）
    await this.permission.invalidatePending(id)
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
    // 全局出网代理（阶段十九 19.13，翻案 12.9"仅 LLM 面"）：显式传入即覆盖
    // model-catalog 内的 per-provider 兜底（provider.proxy 仍作次选）。
    // 值守卫后再进键——exactOptionalPropertyTypes 下 `{fetchImpl: X|undefined}` 不可赋值
    const fetchImpl = this.engineFetchFor(this.config.models.providers[providerId]?.proxy)
    return testProvider(providerId, this.config.models, {
      resolveKey: (provider, apiKeyEnv) => resolveApiKey(this.secrets, provider, apiKeyEnv),
      ...(fetchImpl !== undefined ? { fetchImpl } : {}),
    })
  }

  // ---- 提示词模板管理（阶段十九 19.18 / V2-16 前端半边收口）----

  /**
   * GET /api/prompts：三槽位只读快照（路径/当前内容/是否覆盖内置 + 占位符白名单）。
   * 内置模板也如实给出 content（管理面要能看"现在用的是什么"——只给路径不够）。
   */
  promptsInfo(): PromptsDto {
    const cfg = this.config.spark.prompts
    const slots = (['base', 'compaction', 'title'] as const).map((slot) => {
      const p = cfg?.[slot]
      return {
        slot,
        path: p ?? null,
        content: this.promptTemplates[slot],
        overridden: p !== undefined,
      }
    })
    return { slots, placeholders: [...PROMPT_PLACEHOLDERS] }
  }

  /**
   * PUT /api/prompts：写槽位模板文件（原子写 + 占位符白名单校验）。
   * content 空串 = 恢复缺省（删 spark.json prompts.<slot> 配置，回内置模板）。
   * 路径缺省 = <home>/prompts/<slot>.md（自动把配置指向它）。
   * **重启档**：模板构造期装载一次——写盘成功后需重启生效（如实标注，不假装热切换）。
   */
  updatePrompt(update: PromptsUpdate): PromptsDto {
    this.assertNotShutdown()
    const slot = update.slot
    const rel = update.path ?? join('prompts', `${slot}.md`)
    const abs = isAbsolute(rel) ? rel : join(this.root, rel)
    // 占位符校验（非白名单 {{...}} → E_CONFIG；与装载期同一函数，防注入面扩大）
    assertPlaceholders(update.content, `prompts.${slot}`)
    if (update.content === '') {
      // 恢复缺省：删配置键（文件保留——用户可能想留档；删文件属 §2.10 人类决策）
      this.config = persistSparkPatch(this.root, { prompts: { [slot]: null } })
      return this.promptsInfo()
    }
    // 目标目录不存在先建（~/.spark/prompts/ 首次写入）；文件已存在则覆盖
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, update.content, 'utf8')
    this.config = persistSparkPatch(this.root, { prompts: { [slot]: rel } })
    return this.promptsInfo()
  }

  // ---- 设置读写（工单 10.20 B / 10.21 / ADR D28） ----

  /** GET /api/settings：脱敏全量（掩码红线——绝不回 apiKey 值；models.json 只读参考） */
  getSettings(): SettingsDto {
    const dto: SettingsDto = {
      server: { port: this.config.spark.server.port, host: this.config.spark.server.host },
      // 十项展开即得（工单 R-B.4：SparkConfig.engine 已复用 protocol EngineSettings 类型，
      // 与 SettingsDto['engine'] 同形——原逐字段抄写随之消除；展开而非直接引用，不外泄内部 config）
      engine: { ...this.config.spark.engine },
      restartRequired: [...SETTINGS_RESTART_REQUIRED],
      models: {
        defaultModel: `${this.config.models.defaultModel.provider}/${this.config.models.defaultModel.model}`,
        defaultEffort: this.config.models.defaultEffort ?? null,
      },
      ...(this.config.spark.hooks !== undefined ? { hooks: this.config.spark.hooks } : {}),
      // 子代理启停（工单 16.2 / ADR D36）：未配置时缺省空名单（前端 Switch 全开态）
      ...(this.config.spark.agents !== undefined
        ? { agents: { disabledAgents: this.config.spark.agents.disabledAgents ?? [] } }
        : {}),
      // 扩展启停（工单 16.5 / ADR D38）：未配置时缺省空名单
      ...(this.config.spark.extensions !== undefined
        ? { extensions: { disabledExtensions: this.config.spark.extensions.disabledExtensions ?? [] } }
        : {}),
      // 浏览器设置（阶段十九 19.12 / ADR D49）：未配置时缺省值（headless/30s/UA 不覆盖）
      browser: {
        headless: this.browserSettings.headless,
        defaultTimeoutMs: this.browserSettings.defaultTimeoutMs,
        userAgent: this.browserSettings.userAgent,
      },
      // 沙箱网络隔离（阶段十九 19.7 / ADR D50）：未配置时缺省 off/空清单/1080
      sandbox: {
        network: {
          mode: this.config.spark.sandbox?.network?.mode ?? SANDBOX_NETWORK_DEFAULTS.mode,
          allowlist: this.config.spark.sandbox?.network?.allowlist ?? SANDBOX_NETWORK_DEFAULTS.allowlist,
          port: this.config.spark.sandbox?.network?.port ?? SANDBOX_NETWORK_DEFAULTS.port,
        },
      },
      // 语义检索总开关（阶段十九 19.8 / ADR D51）：未配置时缺省开（有提供方即用）
      embedding: { enabled: this.config.spark.embedding?.enabled ?? true },
      // 自动归档策略（阶段十九 19.13）：未配置时缺省关 + 30 天
      archive: {
        autoArchive: this.config.spark.archive?.autoArchive ?? false,
        afterDays: this.config.spark.archive?.afterDays ?? DEFAULT_AFTER_DAYS,
      },
      // 全局出网代理（阶段十九 19.13）：未配置时缺省空串（回落 per-provider 与 env）
      network: {
        proxy: this.config.spark.network?.proxy ?? '',
        noProxy: this.config.spark.network?.noProxy ?? '',
      },
      // 自定义证书（阶段十九 19.13 / V2-06 收口）：只读回显——运行期注入不生效
      certificates: { nodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS ?? null },
      // 数据目录（阶段十九 19.16）：只读（启动期定；搬迁走 spark migrate CLI）
      home: this.root,
      // 界面语言与键位覆盖层（阶段十九 19.17 / 19.39）：两者都未配置时整段不设
      // （端侧自行探测语言 / 用内置键位表——不留 ui:{} 这种半截假值）
      ...(this.config.spark.ui?.language !== undefined || this.config.spark.ui?.keymap !== undefined
        ? {
            ui: {
              ...(this.config.spark.ui?.language !== undefined
                ? { language: this.config.spark.ui.language }
                : {}),
              ...(this.config.spark.ui?.keymap !== undefined
                ? { keymap: this.config.spark.ui.keymap }
                : {}),
            },
          }
        : {}),
    }
    return dto
  }

  /**
   * 引擎日志尾部（阶段十九 19.38 / V2-14 诊断页）：只读 `~/.spark/logs/engine.log`，
   * 判据全在 logs.ts（尾部字节窗口 + 半行丢弃 + 写入侧脱敏不二次加工）。
   */
  logs(query?: ReadLogsQuery): LogsDto {
    return readLogs(this.root, query ?? {})
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
    // 沙箱网络隔离（阶段十九 19.7 / ADR D50）：mode 热切换——allowlist 开即建代理，
    // 关即停代理（在途隧道随之断开；allowlist 内容本就热读，无需 reconcile）
    void this.reconcileSandboxNetwork()
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
   * 沙箱网络隔离代理生命周期（阶段十九 19.7 / ADR D50）：mode='allowlist' 且无实例 →
   * 建代理并监听（端口占用等失败 → 实例保留在 fail-closed 态，bash 拒跑不降级直连）；
   * mode='off' 且有实例 → 停代理清实例。allowlist 清单经代理内 getter 热读，不在本方法。
   */
  private async reconcileSandboxNetwork(): Promise<void> {
    const net = this.config.spark.sandbox?.network
    if (net?.mode !== 'allowlist') {
      const proxy = this.sandboxProxy
      if (proxy === null) return
      this.sandboxProxy = null
      await proxy.stop()
      this.logger.info('sandbox.proxy.stopped', {})
      return
    }
    if (this.sandboxProxy !== null) return
    const port = net.port ?? SANDBOX_NETWORK_DEFAULTS.port
    const proxy = new SandboxNetworkProxy({
      port,
      allowlist: () => this.config.spark.sandbox?.network?.allowlist ?? [],
      onConnectionError: (err) => this.logger.warn('sandbox.proxy.conn.error', { err }),
    })
    this.sandboxProxy = proxy
    try {
      await proxy.start()
      this.logger.info('sandbox.proxy.started', { port })
    } catch (err) {
      proxy.markFailed(`代理启动失败：${errText(err)}`)
      this.logger.warn('sandbox.proxy.start_failed', { port, err })
    }
  }

  // ---- 自动归档（阶段十九 19.13）----

  /**
   * 自动归档巡检：空闲且超期 N 天的会话按手动归档同款路径归档（`<jsonl>.archived` 标记）。
   * 开关关 / 无到期会话 → 空结果（不写盘）。单条失败不中断整轮（fail-soft——下轮自然重试；
   * 归档是清理动作，不是正确性依赖）。
   */
  async runArchiveSweep(now = this.now()): Promise<{ archived: number; scanned: number }> {
    const cfg = this.config.spark.archive
    if (cfg?.autoArchive !== true) return { archived: 0, scanned: 0 }
    const afterDays = cfg.afterDays ?? DEFAULT_AFTER_DAYS
    const sessions = await this.listSessions({ archived: false })
    const due = selectDueForAutoArchive(sessions, (id) => this.statusOf(id), afterDays, now)
    let archived = 0
    for (const m of due) {
      try {
        await this.archiveSession(m.id, true)
        archived += 1
        this.logger.info('archive.auto', { id: m.id, afterDays })
      } catch (err) {
        this.logger.warn('archive.auto.error', { id: m.id, err })
      }
    }
    return { archived, scanned: sessions.length }
  }

  /** 全局出网代理 URL（spark.json network.proxy；空 = 不设——回落 per-provider/env） */
  private globalProxy(): string | undefined {
    const p = this.config.spark.network?.proxy?.trim()
    return p === undefined || p === '' ? undefined : p
  }

  /** 全局代理 env（阶段十九 19.13）：spark.json network.proxy/noProxy → 子进程环境变量。
   *  未设全局代理 → undefined（子进程继承进程环境，零变化）。 */
  private globalProxyEnv(): Record<string, string> | undefined {
    const proxy = this.globalProxy()
    if (proxy === undefined) return undefined
    const noProxy = this.config.spark.network?.noProxy?.trim() ?? ''
    return {
      HTTP_PROXY: proxy,
      http_proxy: proxy,
      HTTPS_PROXY: proxy,
      https_proxy: proxy,
      ...(noProxy !== '' ? { NO_PROXY: noProxy, no_proxy: noProxy } : {}),
    }
  }

  /** 引擎出网 fetch（阶段十九 19.13，翻案 12.9"仅 LLM 面"）：全局代理 > per-provider >
   *  环境变量 > 全局 fetch。用于 embedding / 模型连通测试等非 LLM 出口（LLM 链路的
   *  per-provider 装配不变）。 */
  engineFetchFor(providerProxy?: string): typeof fetch | undefined {
    const fn = proxyFetchFor(this.globalProxy() ?? providerProxy)
    return fn
  }

  // ---- 会话改名（阶段十九 19.20，消解 /title /rename 挂池）----

  /**
   * 手动改名：emit session.title（durable——改名是用户可见的持久状态，与自动标题同一事件），
   * 索引与列表经既有 meta 增量维护同步（engine.ts bus 钩子已处理 session.title）。
   * 空串标题由 zod 挡在门外（min(1)）——"新会话"是空标题的展示态，不是可写入的值。
   */
  async renameSession(id: SessionId, title: string): Promise<SessionMeta> {
    this.assertNotShutdown()
    const entry = await this.requireEntry(id)
    await this.bus.emit(id, 'session.title', { title })
    // emit 是同步落盘 + 同步维护 meta 的；此处再读一次内存 meta 保证返回值是新值
    entry.meta.title = title
    this.index.setTitle(id, title)
    return entry.meta
  }

  // ---- 反馈（阶段十九 19.19 / V2-25）----

  /** POST /api/feedback：提交/更新反馈（同 session+event+vote 幂等） */
  submitFeedback(input: FeedbackInput): FeedbackEntryDto {
    this.assertNotShutdown()
    if (this.feedbackStore === null) {
      throw new Error('E_FEEDBACK_UNAVAILABLE: 反馈仓不可用（feedback.db 打开失败）')
    }
    return this.feedbackStore.submit(input, this.now())
  }

  /** GET /api/feedback：反馈列表（新→旧；sessionId/vote 可选过滤） */
  listFeedback(query: FeedbackQuery): FeedbackEntryDto[] {
    if (this.feedbackStore === null) {
      throw new Error('E_FEEDBACK_UNAVAILABLE: 反馈仓不可用（feedback.db 打开失败）')
    }
    return this.feedbackStore.list({ sessionId: query.sessionId, vote: query.vote }, query.limit ?? 100)
  }

  /** DELETE /api/feedback：撤回一条（同 session+event+vote；不存在 = 幂等） */
  withdrawFeedback(sessionId: SessionId, eventId: EventId, vote: FeedbackVote): boolean {
    if (this.feedbackStore === null) {
      throw new Error('E_FEEDBACK_UNAVAILABLE: 反馈仓不可用（feedback.db 打开失败）')
    }
    return this.feedbackStore.withdraw(sessionId, eventId, vote)
  }

  /** 某条消息的反馈态（web 操作行回显） */
  feedbackStateOf(sessionId: SessionId, eventId: EventId): FeedbackVote | null {
    return this.feedbackStore?.stateOf(sessionId, eventId) ?? null
  }

  /** GET /api/sandbox/network：代理运行时状态（未建实例 = 未启动） */
  sandboxNetworkStatus(): SandboxNetworkStatusDto {
    const port = this.config.spark.sandbox?.network?.port ?? SANDBOX_NETWORK_DEFAULTS.port
    const status = this.sandboxProxy?.status
    return {
      ready: status?.ready === true,
      reason: status?.reason ?? null,
      activeConnections: status?.activeConnections ?? 0,
      port,
    }
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
   * POST /api/sessions/:id/commands/:name 执行体：action（compact / plan）走引擎入口；
   * prompt（自定义 .md 与 /init）展开为 prompt 走正常 turn 通道（user.message 事件落盘）。
   * client 命令与未知命令一律报错（E_COMMAND_CLIENT / E_NOT_FOUND——失败闭合）。
   */
  async executeCommand(id: SessionId, name: string, args?: string): Promise<void> {
    this.assertNotShutdown()
    const entry = await this.requireEntry(id)
    const handle = this.handleOf(entry)
    if (name === 'compact') {
      await handle.compact() // turn 进行中 → E_TURN_ACTIVE（§5.8.5 既有错误码）
      return
    }
    if (name === 'plan') {
      // 工单 16.3：`/plan` 进入计划模式，`/plan exit` 退出并恢复进入前的档位（prePlanPreset）。
      // 放在引擎而不是 client 命令：四端一处实现，前端不必各自接模式状态机（只需读投影的 slice.mode）。
      const arg = args?.trim().toLowerCase()
      if (arg === 'exit' || arg === 'off') {
        await this.setSessionMode(id, 'default')
        return
      }
      await this.setSessionMode(id, 'plan')
      return
    }
    if (name === 'goal') {
      // 工单 16.7：/goal set <条件> | clear | status——循环与护栏在 GoalRunner（goals.ts），
      // 目标循环只经合成输入推进（如实标注 synthetic），工具照常走审批链（红线：不绕审批）
      const arg = args?.trim() ?? ''
      const sub = arg.split(/\s+/)[0]?.toLowerCase() ?? ''
      if (sub === 'set') {
        const goalText = arg.slice(sub.length).trim()
        if (goalText.length === 0) {
          throw new Error('E_GOAL_EMPTY: /goal set 需要目标条件（如 /goal set 修好所有失败的测试）')
        }
        await entry.goal.set(goalText)
        return
      }
      if (sub === 'clear') {
        await entry.goal.clear()
        return
      }
      if (sub === 'status') {
        await entry.goal.status()
        return
      }
      throw new Error('E_GOAL_ARGS: 用法 /goal set <条件> | /goal clear | /goal status')
    }
    if (name === 'init') {
      // 工单 16.1：/init 项目上下文生成——prompt 命令通道（零新引擎机制），
      // 模型经 write 工具落盘天然过审批链；已有文件覆盖确认在模板内约束
      await handle.send(INIT_PROMPT)
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

  /** GET /api/lsp（工单 16.9）：语言服务器只读状态（连接状态 + 诊断摘要；未配置空数组） */
  listLspServers(): Promise<LspServerStatusDto[]> {
    return Promise.resolve(this.lsp.status())
  }

  /** POST /api/lsp/install（阶段十九 19.5 / ADR D47）：安装内置清单语言服务器并写入 lsp.json */
  installLspServer(
    id: string,
    onProgress: (t: string) => void = () => {},
  ): Promise<LspInstallOutcome> {
    return this.lspInstaller.install(id, onProgress)
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
    return scanForkChildrenOnDisk(sparkDir(this.root, 'sessions'), id, (childId) =>
      this.statusOf(childId),
    )
  }

  /**
   * §5.2.1 listSessions：索引驱动（工单 4.8）；已加载会话以内存 meta 为准；q = 标题子串过滤。
   * 工单 12.4：opts.archived 缺省 false 排除已归档；true 时只列已归档（抽屉数据源）。
   */
  async listSessions(opts?: { q?: string; archived?: boolean }): Promise<SessionMeta[]> {
    const wantArchived = opts?.archived === true
    await this.archivedReady
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
    // 归档过滤（标记文件为事实源，内存 Set 加速）+ archivedAt 注入（未归档不携带——禁假状态）
    out = out.filter((m) => this.archivedIds.has(m.id) === wantArchived)
    if (wantArchived) {
      out = out.map((m) => {
        const at = this.archivedAtById.get(m.id)
        return at !== undefined ? { ...m, archivedAt: at } : m
      })
    }
    // 置顶注入（工单 19.41：同样"仅已置顶携带"）+ 排序第一键（置顶恒在前，其次更新时间）
    out = out.map((m) => (this.pinnedIds.has(m.id) ? { ...m, pinned: true } : m))
    out.sort((a, b) => {
      const rank = (m: SessionMeta): number => (m.pinned === true ? 1 : 0)
      return rank(b) - rank(a) || b.updatedAt - a.updatedAt
    })
    return out
  }

  /**
   * 磁盘全量扫描（§5.2.1 v1 路径）：boot 索引重建与索引不可用降级共用。
   * 单用户本地量级全量读即可；文件名即 id（列表排序免读 header，pi 做法）。
   */
  private scanDiskSessions(): Promise<SessionMeta[]> {
    return scanDiskSessionsOnDisk(sparkDir(this.root, 'sessions'))
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
    scope?: PermissionScope,
  ): Promise<ReplyOutcome> {
    const ok = await this.permission.reply(requestId, reply, feedback, scope)
    if (ok) {
      this.settledRequests.add(requestId)
      return 'ok'
    }
    return this.settledRequests.has(requestId) ? 'already-resolved' : 'unknown'
  }

  private runSubagent(input: TaskInput, ctx: ToolContext): Promise<ToolOutput> {
    return this.runSubagentFn(input, ctx)
  }

  /** §5.2 shutdown 序列（幂等） */
  shutdown(): Promise<void> {
    if (this.shutdownPromise !== null) return this.shutdownPromise
    this.shuttingDown = true
    // 竞答收口（工单 16.8）：运行中 contenders 中断 + worktree 清理（尽力而为）
    void this.arenaManager.shutdownAll()
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
      // 4.6) bash 常驻池排水（LA-16：shutdown 不留孤儿 shell）
      this.bashPool?.drain()
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
      // 6.6.1) 向量库收尾（阶段十九 19.8 / ADR D51）：关闭 vectors.db 句柄
      //      （未建实例 = 无提供方，空操作；派生缓存关闭不丢权威数据）
      if (this.feedbackStore !== null) {
        try {
          this.feedbackStore.close()
        } catch (err) {
          this.logger.warn('feedback.store.close.error', { err })
        }
      }
      if (this.vectors !== null) {
        try {
          this.vectors.close()
        } catch (err) {
          this.logger.warn('vector.store.close.error', { err })
        }
      }
      // 6.6.5) LSP 语言服务器收尾（工单 16.9）：shutdown 请求 + 杀子进程（未启动为空操作）
      try {
        await this.lsp.shutdown()
      } catch (err) {
        this.logger.warn('lsp.shutdown.error', { err })
      }
      // 6.7) browser 工具族收尾（工单 7.10 / ADR D27）：关闭 chromium（未启动则为空操作）
      try {
        await this.browser.close()
      } catch (err) {
        this.logger.warn('browser.close.error', { err })
      }
      // 6.8) hooks runner 收口（工单 10.24）：kill 在途子进程 + 置 disposed——迟到的
      //      close 回调不再写已关闭的 logger 流（pino "write after end"，先于 finally 关日志）
      this.hooks.dispose()
      // 6.9) 沙箱网络隔离代理收尾（阶段十九 19.7 / ADR D50）：关监听 + 断在途隧道
      //      （allowlist 档未启时为空操作）
      if (this.sandboxProxy !== null) {
        const proxy = this.sandboxProxy
        this.sandboxProxy = null
        try {
          await proxy.stop()
        } catch (err) {
          this.logger.warn('sandbox.proxy.stop.error', { err })
        }
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
  private wireSession(
    store: SessionStore,
    meta: SessionMeta,
    modelRef: ModelRef,
    /** 子代理预设档接线（工单 13.5）：system 附加段 + 广告面隐藏工具集；缺省 = 无预设 */
    presetWiring?: { systemAppend?: string; hiddenTools: ReadonlySet<string> },
  ): SessionEntry {
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
      // 工单 12.2b：附件读盘 → image 内容块（读不到/非图片如实跳过）
      attachmentReader: (file) => {
        const ext = file.split('.').pop() ?? ''
        const mime = ({ png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })[ext]
        if (mime === undefined) return undefined
        try {
          return { mime, bytes: readFileSync(join(attachmentsDir(this.root), file)) }
        } catch {
          return undefined
        }
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
      // 工单 13.3：可配压缩提示词——thunk 现渲染，{{model}} 跟随路由档热变不落假状态
      prompt: () =>
        renderPromptTemplate(this.promptTemplates.compaction, {
          cwd: meta.cwd,
          model: `${routing.compactionModel.provider}/${routing.compactionModel.model}`,
        }),
      // 工单 13.4：蒸馏失败 / kept-files 标记坏的结构化告警出口
      logger: this.logger,
    })
    const titler = new TitleGenerator({
      sessionId: meta.id,
      bus: this.bus,
      gateway: this.gateway,
      projector,
      get model(): ResolvedModel {
        return routing.titleModel
      },
      // 工单 13.3：可配标题提示词（理由同压缩）
      prompt: () =>
        renderPromptTemplate(this.promptTemplates.title, {
          cwd: meta.cwd,
          model: `${routing.titleModel.provider}/${routing.titleModel.model}`,
        }),
    })
    const checkpointer = this.config.spark.engine.checkpoints
      ? new GitCheckpointer({
          sessionId: meta.id,
          cwd: meta.cwd,
          sessionPath: store.path,
          checkpointRoot: checkpointsRootOf(store.path),
          bus: this.bus,
          logger: this.logger,
          now: this.now,
        })
      : null
    // 计划模式相关闭包依赖（下方 system getter 与 hiddenTools getter 共用；工单 6.3/16.3）
    const permission = this.permission
    const sid = meta.id
    const tools = new ToolPipelineImpl({
      sessionId: meta.id,
      bus: this.bus,
      registry: this.registry,
      permission: this.permission,
      outputs: this.outputs,
      cwd: meta.cwd,
      maxToolParallel: this.config.spark.engine.maxToolParallel,
      progressThrottleMs: this.config.spark.engine.progressThrottleMs,
      // AUD-02：执行期收集上限（bound() 4 倍缓冲语义）注入流式工具
      outputLimitBytes: this.config.spark.engine.toolOutputLimitKB * 1024,
      metrics: this.metrics,
      guard: this.ioGuard, // 工单 7.2：工具输出 → 模型上下文的注入检测与敏感过滤
      hooks: this.hooks, // 工单 7.3：tool.completed 挂点（载荷不含 output）
      lsp: this.lsp, // 工单 16.9：lsp 工具的连接管理注入（ToolContext.lsp）
      /**
       * 广告面收窄（**getter → 逐 step 现读**，与下方 system getter 同手法）：
       * ① 预设档收窄的工具（工单 13.5）；② 非计划模式时收起 `exit_plan_mode`（工单 16.3）——
       * 模式切换即时反映到模型可见面，不必重建管线。隐藏只影响广告面，
       * 模型若仍调用则由权限门与钩子的 E_NOT_IN_PLAN 兜底（失败闭合，不假装成功）。
       */
      get hiddenTools(): ReadonlySet<string> {
        const base = presetWiring?.hiddenTools
        if (permission.presetOf(sid) === 'plan') return base ?? new Set<string>()
        return new Set([...(base ?? []), 'exit_plan_mode'])
      },
      // 工单 16.3：exit_plan_mode 的模式切换钩子（工具不持有 Engine，依赖面最小）
      exitPlanMode: async () => {
        if (permission.presetOf(sid) !== 'plan') {
          throw new Error('E_NOT_IN_PLAN: 当前不在计划模式，无需退出')
        }
        await this.setSessionMode(sid, 'default')
      },
      ...(this.memory !== null ? { memory: this.memory, now: this.now } : {}),
      // 语义检索端口（阶段十九 19.8 / ADR D51）：memory 工具族语义通道 + 即时补嵌。
      // 与 memory 同条件（仓可用）——但还要求 semantic 本身已建（提供方 + 向量库 + 开关）
      ...(this.memory !== null && this.semantic !== null && this.embeddingEnabled()
        ? { semantic: this.semanticPort() }
        : {}),
    })
    // 工单 13.3：base 模板在此渲染（会话级 system 组装一次，与既有 baseSystem 冻结口径一致）
    // 工单 13.5：预设档 systemAppend 拼在基座之后（只作用于本子会话）
    const renderedBase = renderPromptTemplate(this.promptTemplates.base, {
      cwd: meta.cwd,
      model: `${currentModel.provider}/${currentModel.model}`,
    })
    const baseSystem = buildSystemPrompt(
      meta.cwd,
      undefined,
      presetWiring?.systemAppend === undefined
        ? renderedBase
        : `${renderedBase}\n\n${presetWiring.systemAppend}`,
    )
    // 工单 16.7：持续目标循环——状态从 durable 事件重建（装载/重载/回滚单点在此），
    // judge 判据 = 会话 JSONL 尾部证据（旁路读，不占主上下文）
    const goal = new GoalRunner({
      sessionId: meta.id,
      bus: this.bus,
      gateway: this.gateway,
      model: () => currentModel,
      evidence: () => {
        const events = store.tree.pathToRoot()
        return events
          .slice(-40)
          .map((e) => {
            const d = JSON.stringify(e.data)
            return `#${e.seq ?? '?'} ${e.type} ${d.length > 200 ? d.slice(0, 200) + '…' : d}`
          })
          .join('\n')
      },
    })
    goal.rebuild(store.tree.pathToRoot())

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
                // 语义合流（19.8 / ADR D51）：semantic 端口内部语义优先 + 关键词兜底去重；
                // 嵌入失败 fail-soft 回关键词（端口内 catch）——注入永不因此悬空
                const hits =
                  this.semantic !== null && this.embeddingEnabled()
                    ? await this.semanticPort().searchMemories(query, 3)
                    : m.search(query, 3)
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
      // 工单 13.6：明细桶归因到会话当前档（fallback 切换步仍记在本档名下，局限已登记）
      budget: {
        limitUsd: () => this.routing.costLimitUsd,
        add: (u) =>
          this.costTracker.add(u, {
            provider: currentModel.provider,
            model: currentModel.model,
          }),
        exceeded: () => this.costTracker.exceeded(this.routing.costLimitUsd),
        spendUsd: () => this.costTracker.spend().costUsd,
      },
      // 工单 16.7：goal 循环端口——turn 收尾后判定续跑（护栏/暂停/完成在 GoalRunner 内闭环）
      goal: {
        afterTurn: (i) => goal.afterTurn(i),
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
      goal,
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
      ...(provider.proxy !== undefined ? { proxy: provider.proxy } : {}),
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


