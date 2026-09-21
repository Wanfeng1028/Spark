/**
 * 引擎公共类型与注入依赖（工单 R-D 第①刀：自 engine.ts 类型区拆出，零逻辑纯类型）。
 * 对外面（index.ts）经 engine.ts 再导出保持兼容；子模块不得反向 import engine.ts 门面。
 */
import type { Delivery, EventId, SemanticIndexStats, SessionId, SessionStatus, SparkEventEnvelope, TurnId } from '@spark/protocol'
import type { ReasoningEffort } from '@spark/protocol'
import type { GoalRunner } from './goals.js'
import type { SubmitResult } from './session/input-queue.js'
import type { EngineConfig } from './config.js'
import type { LlmGateway, ResolvedModel } from './llm-gateway.js'
import type { SparkLogger } from './logger.js'
import type { BrowserDriver } from './browser/driver.js'
import type { ComputerExecutor } from './computer/executor.js'
import type { LspInstaller } from './lsp/installer.js'
import type { SessionStore } from './session/store.js'
import type { SessionRuntime } from './session/runtime.js'
import type { Compactor } from './run-loop.js'
import type { GitCheckpointer } from './checkpoint.js'
import type { TitleGenerator } from './title.js'
import type { SearchEntryType } from './search/store.js'

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
  /** 创建时 cwd 的 git 分支（只读探测；取不到 = undefined，禁假状态——工单 10.6） */
  branch?: string
  /** 会话级推理档位（内存态，下一 turn 生效；缺省 = models.json defaultEffort——工单 10.6） */
  effort?: ReasoningEffort
  /** 归档时刻（工单 12.4：归档标记文件的 ISO 串；未归档不携带——禁假状态） */
  archivedAt?: string
  /** 置顶（阶段十九 19.41 / V2-23 置顶半边）：仅已置顶携带（禁假状态，同 archivedAt 口径） */
  pinned?: boolean
}

export interface SessionHandle {
  readonly id: SessionId
  readonly meta: SessionMeta
  /** 三态直通受理结果（HTTP 只表达"已受理"） */
  send(text: string, delivery?: Delivery, expectedTurnId?: TurnId): Promise<SubmitResult>
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
  /** 子代理运行态快照（工单 7.8：已加载会话实时状态；未加载 = idle） */
  status: SessionStatus
}

/** GET /api/sessions/:id/tree 的引擎数据源 */
export interface SessionTreeInfo {
  nodes: SessionTreeNode[]
  /** 各节点分叉出的子会话（磁盘 header 扫描；v1 本地量级全量读） */
  forks: { fromEventId: EventId; child: ForkChildInfo }[]
}

/** 全文搜索命中行（工单 7.13 / H12；server 原样转 SearchHitDto） */
export interface SearchHit {
  sessionId: SessionId
  sessionTitle: string
  eventId: EventId
  seq: number
  type: SearchEntryType
  time: number
  snippet: string
}

/** 索引库统计（工单 19.11；GET /api/index/stats 的引擎数据源，server 原样转 IndexStatsDto） */
export interface SearchIndexStats {
  /** 全文索引条目数（SQLite COUNT，非内存数） */
  entries: number
  /** search.db 库文件体积（字节） */
  sizeBytes: number
  /** 库文件绝对路径 */
  path: string
  /** false = SQLite 打开失败降级（旁路纪律，JSONL 权威不受影响）；可用时省略 */
  available?: boolean
  /** 语义（向量）索引状态（阶段十九 19.8 / ADR D51）；与 protocol SemanticIndexStats 同形 */
  semantic?: SemanticIndexStats
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
  /** browser 驱动工厂（缺省 playwright-core 懒启动；测试注入假驱动免真实浏览器） */
  browserDriver?: () => Promise<BrowserDriver>
  /** 电脑控制执行体（阶段十九 19.1；缺省按平台工厂——win32 PowerShell 桥，其余 Unsupported；测试注入假体） */
  computerExecutor?: ComputerExecutor
  /** LSP 下载器（阶段十九 19.5 / ADR D47；缺省真实 npm 安装器；测试注入假体免真实网络） */
  lspInstaller?: LspInstaller
}

/** 已装载会话的进程内登记项（Engine 私有仓储；Type-only 外泄给引擎内部模块） */
export interface SessionEntry {
  store: SessionStore
  runtime: SessionRuntime
  meta: SessionMeta
  /** 会话级换模型入口（工单 6.5）：替换 deps.model 闭包持有——下一 turn 生效 */
  setModel: (m: ResolvedModel) => void
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
  /** 持续目标循环（工单 16.7）：/goal 命令入口 + run-loop goal 端口实现 */
  goal: GoalRunner
}
