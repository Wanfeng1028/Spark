/**
 * HTTP API DTO（doc/02 §4.5.1）——SessionMeta 的线上形状。
 */
import { z } from 'zod'
import {
  CallIdSchema,
  CheckpointIdSchema,
  EventIdSchema,
  SessionIdSchema,
  TurnIdSchema,
} from './ids.js'
import { DeliverySchema, ReasoningEffortSchema, TurnFinishSchema } from './primitives.js'
import { ClientActionSchema, CommandArgsSchema, CommandSurfaceSchema } from './commands.js'
import { LanguageSchema } from './i18n.js'
import { KeymapSettingsSchema } from './keymap.js'
import type { SparkEventEnvelope } from './events.js'

export const SessionStatusSchema = z.enum(['idle', 'running', 'waiting-approval'])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const SessionMetaDtoSchema = z.strictObject({
  id: SessionIdSchema,
  title: z.string(), // 空字符串 = 前端显示"新会话"（自动标题阶段四）
  model: z.string(), // provider/model 形式
  cwd: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(), // = 最近 durable 事件 time（列表排序键）
  lastSeq: z.number().int().nonnegative(),
  status: SessionStatusSchema, // 引擎从 SessionRuntime 实时填充
  /** 会话创建时 cwd 的 git 分支（只读探测；缺省 = 取不到，前端不渲染——工单 10.6） */
  branch: z.string().optional(),
  /** 当前生效推理档位（缺省 = 未配置，工单 10.6） */
  effort: ReasoningEffortSchema.optional(),
  /** 归档时刻 ISO 串（工单 12.4：仅已归档会话携带——禁假状态） */
  archivedAt: z.string().optional(),
  /** 置顶（工单 19.41 / V2-23 置顶半边）：仅已置顶携带 true，未置顶不写 false（同 archivedAt 口径） */
  pinned: z.boolean().optional(),
})
export type SessionMetaDto = z.infer<typeof SessionMetaDtoSchema>

/** 仅 GET /api/sessions/:id 携带 events（全部 durable 按 seq 升序——冷启动回放） */
export interface SessionDto extends SessionMetaDto {
  events?: SparkEventEnvelope[]
}

/**
 * 引擎日志条目（阶段十九工单 19.38 / V2-14 诊断页）：pino 行的 `time/level/msg` +
 * 其余字段原样（`sid`/`turnId`/`code` 等）。**脱敏在写入侧已完成**（logger 三类模式），
 * 读取侧不二次加工；解析不出的行以 `fields.unparsed = true` 如实标出。
 */
export const LogEntryDtoSchema = z.strictObject({
  time: z.number().int().nonnegative(),
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  msg: z.string(),
  fields: z.record(z.string(), z.unknown()),
})
export type LogEntryDto = z.infer<typeof LogEntryDtoSchema>

/** GET /api/logs 响应（尾部窗口 + 级别/子串过滤；文件不存在 = 空 entries，不是错误） */
export const LogsDtoSchema = z.strictObject({
  /** 日志文件路径（诊断页要能告诉用户"看的是哪个文件"） */
  path: z.string(),
  entries: z.array(LogEntryDtoSchema),
  /** true = 还有更早的内容未返回（尾部字节窗口截断或超出条目上限） */
  truncated: z.boolean()
})
export type LogsDto = z.infer<typeof LogsDtoSchema>

/** GET /api/logs 查询（level = 该级别及以上，pino 语义；limit 上限 500） */
export const LogsQuerySchema = z.strictObject({
  level: LogEntryDtoSchema.shape.level.optional(),
  match: z.string().max(200).optional(),
  limit: z.number().int().positive().max(500).optional(),
})
export type LogsQuery = z.infer<typeof LogsQuerySchema>

/**
 * GET /api/sessions/:id 事件分页查询（阶段九工单 9.3——移动端上拉加载历史）。
 * 全可选——缺省参数 = 现状全量回放（向后兼容红线）：
 * limit = 返回条数上限（升序尾部切片，上限 200）；before = seq 游标（只返回 seq < before 的事件）。
 */
export interface SessionEventsQuery {
  limit?: number
  before?: number
}

// ---------- fork 与树视图（doc/02 §5.8.6 / §4.5，阶段四） ----------

/** 从某事件分叉出去的子会话（engine 扫描磁盘 header.parentSession 汇总） */
export const ForkChildDtoSchema = z.strictObject({
  sessionId: SessionIdSchema,
  title: z.string(), // 空字符串 = 新会话
  createdAt: z.number().int().nonnegative(),
  /** 子代理运行态快照（工单 7.8：引擎从已加载会话实时填充；未加载 = idle） */
  status: SessionStatusSchema,
})
export type ForkChildDto = z.infer<typeof ForkChildDtoSchema>

/** GET /api/sessions/:id/tree 节点：label 为渲染摘要（截断文本；无摘要事件为空串） */
export const TreeNodeDtoSchema = z.strictObject({
  id: EventIdSchema,
  parentId: EventIdSchema.nullable(),
  seq: z.number().int().positive(),
  type: z.string(), // SparkEventType（词表演进不改本 DTO 形状）
  time: z.number().int().nonnegative(),
  label: z.string(),
  /** 会话内子节点（v1 线性路径至多 1 个；分支树阶段二扩展） */
  childIds: z.array(EventIdSchema),
  /** 从此事件分叉出的子会话（树视图"已分叉"标记） */
  forks: z.array(ForkChildDtoSchema),
})
export type TreeNodeDto = z.infer<typeof TreeNodeDtoSchema>

// ---------- checkpoint（doc/02 §5.8.7 / 阶段四工单 4.6） ----------

/** GET /api/sessions/:id/checkpoints 行：turn 边界快照（files 含会话文件别名） */
export const CheckpointDtoSchema = z.strictObject({
  checkpointId: CheckpointIdSchema,
  turnId: TurnIdSchema,
  createdAt: z.number().int().nonnegative(),
  files: z.array(z.string()),
})
export type CheckpointDto = z.infer<typeof CheckpointDtoSchema>

// ---------- permission rules（doc/02 §5.7 规则表 / 阶段四工单 4.7） ----------

/** 权限规则（用户级 permissions.json 行；规则管理 UI 的线上形状） */
export const PermissionRuleDtoSchema = z.strictObject({
  action: z.string().min(1),
  resource: z.string().min(1),
  effect: z.enum(['allow', 'deny', 'ask']),
  /** 规则来源（LA-04）：列表响应由引擎合成——user=用户级文件 / project=项目级文件；
   * 写入请求不携带（POST /api/permissions/rules 恒落用户级） */
  source: z.enum(['user', 'project']).optional(),
})
export type PermissionRuleDto = z.infer<typeof PermissionRuleDtoSchema>

// ---------- secrets（doc/02 §8 阶段七工单 7.1 / H01，P0） ----------

/**
 * 密钥状态（GET /api/secrets 行）：只报 provider 与来源，永不回传密钥值。
 * source：store = ~/.spark/secrets.json（优先）/ env = apiKeyEnv 环境变量 / none = 未配置
 */
export const SecretStatusDtoSchema = z.strictObject({
  provider: z.string().min(1),
  source: z.enum(['store', 'env', 'none']),
})
export type SecretStatusDto = z.infer<typeof SecretStatusDtoSchema>

// ---------- permission preset（DESIGN §13.E 权限四档 / ADR D7 补记，阶段六工单 6.3） ----------

/**
 * 会话级权限预设四档（规则引擎之上的预设层，不引入第二权限机制）：
 * - confirm-each 逐项确认（缺省档）：规则表不动；
 * - auto-edit 自动编辑：会话临时层对 fs.write 预置 allow；
 * - plan 计划模式：交互层约定（system prompt 追加计划指令），不改审批语义；
 * - full-access 完全访问：会话临时层批量预置 allow。
 * 会话内存态（临时层），引擎重启回 confirm-each。
 */
export const PermissionPresetSchema = z.enum(['confirm-each', 'auto-edit', 'plan', 'full-access'])
export type PermissionPreset = z.infer<typeof PermissionPresetSchema>

// ---------- models（DESIGN §13.D③ / 阶段六工单 6.5 轻后端例外） ----------

/** 供应商线上形状（GET /api/models）：apiKeyEnv 只回传环境变量名——key 本身永不进 DTO（红线 §6.3） */
export const ModelProviderDtoSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  /** 内置目录（引擎 PROVIDER_CATALOG）中的已知供应商 = true；仅 models.json 出现的 = false（自定义） */
  builtin: z.boolean(),
  /** 已在 models.json providers 中配置 */
  configured: z.boolean(),
  /** 实际生效地址（models.json 覆盖 ?? 内置默认；自定义供应商必填） */
  baseUrl: z.string().optional(),
  /** API Key 环境变量名（null = models.json 未设 apiKeyEnv） */
  apiKeyEnv: z.string().nullable(),
  /** 环境变量已设置（状态点数据源） */
  hasKey: z.boolean(),
  api: z.enum(['openai-completions', 'anthropic-messages']),
})
export type ModelProviderDto = z.infer<typeof ModelProviderDtoSchema>

/** 可选模型条目（models.json models[] + defaultModel/compactionModel 合并去重） */
export const ModelEntryDtoSchema = z.strictObject({
  provider: z.string().min(1),
  model: z.string().min(1),
  contextWindow: z.number().int().positive(),
})
export type ModelEntryDto = z.infer<typeof ModelEntryDtoSchema>

export const ModelsDtoSchema = z.strictObject({
  providers: z.array(ModelProviderDtoSchema),
  models: z.array(ModelEntryDtoSchema),
  defaultModel: ModelEntryDtoSchema,
})
export type ModelsDto = z.infer<typeof ModelsDtoSchema>

/** POST /api/models/:id/test 结果（连通测试返回时延/错误人话文案，工单 6.5 验收） */
export const ModelTestResultDtoSchema = z.strictObject({
  provider: z.string().min(1),
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative().optional(),
  /** 人话文案（成功"连通正常"；失败为可读原因） */
  message: z.string(),
  /** 原始错误详情（前端折叠展示） */
  detail: z.string().optional(),
})
export type ModelTestResultDto = z.infer<typeof ModelTestResultDtoSchema>

// ---------- routing（doc/02 §8 阶段七工单 7.7 / H07，P0） ----------

/** 成本累计（GET /api/routing 的 usage 区；exceeded = 熔断已触发） */
export const RoutingUsageDtoSchema = z.strictObject({
  costUsd: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  exceeded: z.boolean(),
})

/** 模型路由状态：fallback 链 + 任务路由四档（主档=会话模型，不在此表）+ 成本上限 */
export const RoutingDtoSchema = z.strictObject({
  /** fallback 链（"provider/model" 列表；空 = 不切换） */
  fallbacks: z.array(z.string()),
  compactionModel: z.string(),
  titleModel: z.string(),
  subagentModel: z.string(),
  /** 成本上限美元值（null = 未配置，永不熔断） */
  costLimitUsd: z.number().positive().nullable(),
  /** 新建会话默认模型（阶段十九 19.14 / V2-37；models.json defaultModel，热生效） */
  defaultModel: z.string(),
  /** 新建会话默认推理档（null = 不设置，按 provider 默认） */
  defaultEffort: z.enum(['low', 'medium', 'high']).nullable(),
  usage: RoutingUsageDtoSchema,
})
export type RoutingDto = z.infer<typeof RoutingDtoSchema>

/** PUT /api/routing 请求体（全部可选字段；缺省字段保持现值；热生效下一请求） */
export const RoutingUpdateSchema = z.strictObject({
  fallbacks: z.array(z.string().min(1)).optional(),
  compactionModel: z.string().min(1).optional(),
  titleModel: z.string().min(1).optional(),
  subagentModel: z.string().min(1).optional(),
  /** null = 清除上限（不限） */
  costLimitUsd: z.number().positive().nullable().optional(),
  /** 新建会话默认模型（阶段十九 19.14 / V2-37，ADR D53）：models.json 单写者——
   *  经本端点写入，消"设置页另起写路径"的双写者；缺省 = 不改 */
  defaultModel: z.string().min(1).optional(),
  /** 新建会话默认推理档（阶段十九 19.14 / V2-37）：null = 清除（按 provider 默认） */
  defaultEffort: z.enum(['low', 'medium', 'high']).nullable().optional(),
})
export type RoutingUpdate = z.infer<typeof RoutingUpdateSchema>

// ---------- 成本看板（工单 13.6 / V2-07） ----------

/** 成本用量五分量（总账 / 明细桶 / 无明细差额共用同一形状） */
export const UsageAmountsSchema = z.strictObject({
  costUsd: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
})
export type UsageAmounts = z.infer<typeof UsageAmountsSchema>

/** 明细桶：一日 × 一 provider × 一 model（day = 本地日历日 YYYY-MM-DD） */
export const UsageBucketDtoSchema = UsageAmountsSchema.extend({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  provider: z.string().min(1),
  model: z.string().min(1),
})
export type UsageBucketDto = z.infer<typeof UsageBucketDtoSchema>

/**
 * GET /api/usage/summary 响应（工单 13.6）。
 * `total` 是权威总账（含旧平铺格式时期的累计，与熔断判据同源）；`buckets` 只覆盖有明细
 * 的部分；`unbucketed` = total − 明细合计，**如实呈现旧账而不摊进桶里伪造明细**。
 * 上下文命中率由消费方算：cacheRead / (cacheRead + nonCachedInput)，其中
 * nonCachedInput = inputTokens − cacheRead − cacheWrite（opencode 契约三分量恒等式）。
 */
export const UsageSummaryDtoSchema = z.strictObject({
  total: UsageAmountsSchema,
  buckets: z.array(UsageBucketDtoSchema),
  unbucketed: UsageAmountsSchema,
  /** 熔断上限（null = 未配置）与当前是否已熔断（工单 7.7 数据，看板同屏呈现） */
  costLimitUsd: z.number().positive().nullable(),
  exceeded: z.boolean(),
})
export type UsageSummaryDto = z.infer<typeof UsageSummaryDtoSchema>

/** GET /api/usage/summary 查询（since = YYYY-MM-DD 含当日；缺省全量） */
export const UsageSummaryQuerySchema = z.strictObject({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type UsageSummaryQuery = z.infer<typeof UsageSummaryQuerySchema>

// ---------- 会话链路 trace（工单 13.7 / V2-11 / doc/07 H27） ----------
//
// **纯从 durable 事件推导，不加埋点**：所有字段来自已有事件（turn.started/completed、
// assistant.message.usage、tool.started/completed.durationMs、permission.asked、io.warning、
// error、compaction/checkpoint/memory.injected/session.resumed）。
// **fallback 不在本 DTO 里**：模型降级切换只有 pino 日志（`llm.fallback`）、没有事件，
// 把它放进 trace 就得新增事件 = 加埋点，超出本单口径（已在 doc/08 §13.7 备案）。

/** 一次工具调用的链路条目（tool.started/completed 配对） */
export const TraceToolDtoSchema = z.strictObject({
  callId: CallIdSchema,
  name: z.string(),
  startedAt: z.number().int().nonnegative(),
  /** 直取 tool.completed.durationMs（不做时间差推算）；未配对到 completed = null（悬挂调用如实呈现） */
  durationMs: z.number().int().nonnegative().nullable(),
  isError: z.boolean(),
  /** 同回合内同名工具在上一次 isError 之后再次调用 = 记为重试（**启发式**，非引擎埋点） */
  retry: z.boolean(),
  /** 该调用挂起过审批（permission.asked 命中同 callId）——前端据此跳审计页过滤 */
  approvalAsked: z.boolean(),
  /** I/O 护栏告警种类（io.warning 命中同 callId；空 = 无告警） */
  warnings: z.array(z.enum(['injection', 'secret'])),
})
export type TraceToolDto = z.infer<typeof TraceToolDtoSchema>

/** 一步 = 一条 assistant.message（一次模型往返） */
export const TraceStepDtoSchema = z.strictObject({
  index: z.number().int().nonnegative(),
  at: z.number().int().nonnegative(),
  /** 到下一步（或 turn 闭合）的间隔 ms——**含该步触发的工具执行时长**（事件只在往返完成时落盘） */
  durationMs: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  /** null = 该步无 usage（provider 未回传）——不以 0 充数 */
  usage: UsageAmountsSchema.nullable(),
})
export type TraceStepDto = z.infer<typeof TraceStepDtoSchema>

/**
 * 时间线上的非工具标记（压缩/快照/记忆注入）。
 * 归属：带 turnId 的挂对应回合；压缩在回合内→当前回合，回合间（手动 /compact）→最近回合；
 * 记忆注入先于 turn.started 落盘（ADR D25）→挂到它所属的那个回合。
 * **session.resumed 不进 trace**：它是加载边界不是链路节点，无可归属的回合。
 */
export const TraceMarkDtoSchema = z.strictObject({
  at: z.number().int().nonnegative(),
  kind: z.enum(['compaction', 'checkpoint', 'memory']),
  /** 一行可读摘要（如压缩 tokensBefore、快照文件数、命中记忆条数） */
  label: z.string(),
})
export type TraceMarkDto = z.infer<typeof TraceMarkDtoSchema>

/** 一条 error 事件（error 事件无 turnId，按位置归属到包围它的回合） */
export const TraceErrorDtoSchema = z.strictObject({
  at: z.number().int().nonnegative(),
  scope: z.enum(['engine', 'llm', 'tool', 'io']),
  message: z.string(),
  fatal: z.boolean(),
})
export type TraceErrorDto = z.infer<typeof TraceErrorDtoSchema>

/** 一个回合的链路 */
export const TraceTurnDtoSchema = z.strictObject({
  turnId: TurnIdSchema,
  delivery: DeliverySchema,
  startedAt: z.number().int().nonnegative(),
  /** turn.started → turn.completed；**未闭合**时 = 到本回合最后一条事件为止，且 finish 为 null */
  durationMs: z.number().int().nonnegative(),
  finish: TurnFinishSchema.nullable(),
  steps: z.array(TraceStepDtoSchema),
  tools: z.array(TraceToolDtoSchema),
  marks: z.array(TraceMarkDtoSchema),
  errors: z.array(TraceErrorDtoSchema),
  /** turn.completed.usage 优先；缺则累加各步（均无 → null） */
  usage: UsageAmountsSchema.nullable(),
})
export type TraceTurnDto = z.infer<typeof TraceTurnDtoSchema>

/** 全会话合计（看板与头部摘要用） */
export const TraceTotalsDtoSchema = z.strictObject({
  turns: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  toolErrors: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  usage: UsageAmountsSchema,
})
export type TraceTotalsDto = z.infer<typeof TraceTotalsDtoSchema>

/** GET /api/sessions/:id/trace 响应 */
export const TraceDtoSchema = z.strictObject({
  sessionId: SessionIdSchema,
  totals: TraceTotalsDtoSchema,
  turns: z.array(TraceTurnDtoSchema),
  /** 不属于任何回合的 error（如会话级引擎错）——不归到最近回合里冒充归属 */
  looseErrors: z.array(TraceErrorDtoSchema),
})
export type TraceDto = z.infer<typeof TraceDtoSchema>

// ---------- settings（工单 10.20 B / 10.21 / ADR D28） ----------

/**
 * 引擎行为设置十一项的**宽松基形**（未知键剥离）：给 spark.json 的 `engine` 段用——
 * 用户手写配置逐字段合并默认值（engine config.ts），字段名拼错 = 该字段落默认值，
 * 与同文件 `server` 段口径一致。API 边界一律用下面的 strict 版。
 * 两档共用这一份字段定义（工单 R-B.4：原 engine config.ts 逐字重抄九项 + interface 再抄一遍，共三份）。
 */
export const EngineSettingsShape = z.object({
  maxStepsPerTurn: z.number().int().min(1),
  maxToolParallel: z.number().int().min(1),
  toolTimeoutMs: z.number().int().positive(),
  permissionTimeoutMs: z.number().int().positive(),
  progressThrottleMs: z.number().int().positive(),
  toolOutputLimitKB: z.number().int().positive(),
  compactionThreshold: z.number().gt(0).lt(1),
  /** turn 边界 checkpoint（阶段四工单 4.6）：git 快照开关（测试夹具关掉提速） */
  checkpoints: z.boolean(),
  /** bash 沙箱（阶段五工单 5.2，ADR D15）：on = 平台 wrapper 前缀 + 不可用即拒跑 */
  bashSandbox: z.enum(['off', 'approval', 'light', 'heavy']),
  /** 电脑控制主开关（阶段十九 19.1 / ADR D44）：false = computer.* 全操作 E_COMPUTER_DISABLED */
  computerUseEnabled: z.boolean(),
  /** bash 常驻会话（阶段十九 19.3 / ADR D45）：true = bash 工具走每会话长驻 shell（cwd/env 保持） */
  bashPersistent: z.boolean(),
})

/** 引擎行为设置十一项（strict：API 边界拒未知键；热/重启分档见 SETTINGS_RESTART_REQUIRED，D28） */
export const EngineSettingsSchema = EngineSettingsShape.strict()
export type EngineSettings = z.infer<typeof EngineSettingsSchema>

/**
 * 单条用户侧 hook（工单 7.3：外部命令或 skill 触发，二选一——strictObject 防混写）。
 * 工单 R-B.4 起为单一来源：engine config.ts 的 spark.json `hooks` 段复用本组 schema。
 */
export const SettingsHookDefSchema = z.union([
  z.strictObject({
    command: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.strictObject({ skill: z.string().min(1), emit: z.string().min(1) }),
])
export type SettingsHookDef = z.infer<typeof SettingsHookDefSchema>

/**
 * hooks 四挂点（工单 7.3 词表；10.21 拍板经 GET /api/settings 下发；只读数组对齐引擎 UserHooksConfig）。
 * 工单 R-B.4 起 spark.json 的 `hooks` 段也走本 schema（原 engine config.ts 另有一份逐字同的声明）。
 * 注意 `.readonly()` 会 Object.freeze 解析产物的数组（zod v4 语义）——引擎侧 UserHookRunner 只读遍历，
 * 冻结正好让运行时值兑现 `readonly UserHookDef[]` 的类型契约。
 */
export const SettingsHooksSchema = z.strictObject({
  'turn.before': z.array(SettingsHookDefSchema).readonly().optional(),
  'turn.after': z.array(SettingsHookDefSchema).readonly().optional(),
  'permission.resolved': z.array(SettingsHookDefSchema).readonly().optional(),
  'tool.completed': z.array(SettingsHookDefSchema).readonly().optional(),
})
export type SettingsHooks = z.infer<typeof SettingsHooksSchema>

/**
 * 提示词模板段（工单 13.3 / V2-16）：三处硬编码提示词（base/compaction/title）的可配覆盖。
 * 值 = 模板文件路径（相对 spark.json 所在目录）；缺省 = 用引擎内置模板，输出逐字节不变。
 * 占位符白名单是封闭集（PROMPT_PLACEHOLDERS）——非白名单的 `{{...}}` 一律 E_CONFIG 拒启动
 * （校验在引擎 prompt-templates.ts，宁拒启不静默降级）。**不经 GET|PUT /api/settings**：
 * 手工改 spark.json 后重启生效（构造期注入 = D28 重启档语义）。
 */
export const SettingsPromptsSchema = z.strictObject({
  base: z.string().min(1).optional(),
  compaction: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
})
export type SettingsPrompts = z.infer<typeof SettingsPromptsSchema>

/**
 * 模板占位符白名单（封闭集，**精确匹配**：带空格的 `{{ cwd }}` 也算非白名单 → E_CONFIG）。
 * cwd = 会话工作目录；model = `provider/model`；platform = node:os platform()。
 */
export const PROMPT_PLACEHOLDERS = ['{{cwd}}', '{{model}}', '{{platform}}'] as const
export type PromptPlaceholder = (typeof PROMPT_PLACEHOLDERS)[number]

/**
/**
/** 会话改名（阶段十九 19.20，消解 /title /rename 挂池）：PUT /api/sessions/:id/title */
export const RenameSessionSchema = z.strictObject({
  /** 新标题（1–200 字符；空串 = 清空回"新会话"） */
  title: z.string().min(1).max(200),
})
export type RenameSession = z.infer<typeof RenameSessionSchema>

/** 反馈评级（阶段十九 19.19 / V2-25）：👍 up / 👎 down（封闭集，不设中评——中评是噪声） */
export const FeedbackVoteSchema = z.enum(['up', 'down'])
export type FeedbackVote = z.infer<typeof FeedbackVoteSchema>

/** POST /api/feedback 请求体（会话/回合级；备注可空） */
export const FeedbackInputSchema = z.strictObject({
  sessionId: SessionIdSchema,
  /** 被反馈的 assistant 消息事件（锚定具体一条，不落"整轮好评"这种粗粒度） */
  eventId: EventIdSchema,
  vote: FeedbackVoteSchema,
  /** 可选备注（≤2000 字符；空串 = 无备注） */
  note: z.string().max(2000).optional(),
})
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>

/** GET /api/feedback 查询（全可选；limit 缺省 100 上限 500） */
export const FeedbackQuerySchema = z.strictObject({
  sessionId: SessionIdSchema.optional(),
  vote: FeedbackVoteSchema.optional(),
  limit: z.number().int().positive().max(500).optional(),
})
export type FeedbackQuery = z.infer<typeof FeedbackQuerySchema>

/** 反馈条目（GET /api/feedback 行；创建时间 + 备注原文） */
export const FeedbackEntryDtoSchema = z.strictObject({
  id: z.number().int().positive(),
  sessionId: SessionIdSchema,
  eventId: EventIdSchema,
  vote: FeedbackVoteSchema,
  note: z.string(),
  createdAt: z.number().int().nonnegative(),
})
export type FeedbackEntryDto = z.infer<typeof FeedbackEntryDtoSchema>

/**
 * 提示词模板槽位管理（阶段十九 19.18 / V2-16 前端半边收口）：GET /api/prompts 只读快照
 * （配置路径 + 当前内容 + 是否覆盖内置 + 占位符白名单）；PUT 写模板文件（原子写 + 占位符
 * 校验，**重启档**——模板在引擎构造期装载一次，同 D28 构造期注入语义）。
 */
export const PromptSlotSchema = z.enum(['base', 'compaction', 'title'])
export type PromptSlot = z.infer<typeof PromptSlotSchema>

export const PromptSlotInfoSchema = z.strictObject({
  slot: PromptSlotSchema,
  /** spark.json prompts.<slot> 配置的路径（未配置 = null，用内置模板） */
  path: z.string().nullable(),
  /** 当前生效的模板原文（内置 or 文件内容——管理面查看用） */
  content: z.string(),
  /** true = 已被文件覆盖；false = 内置模板 */
  overridden: z.boolean(),
})

export const PromptsDtoSchema = z.strictObject({
  slots: z.array(PromptSlotInfoSchema),
  /** 占位符白名单（封闭集，写模板时非白名单 {{...}} 会被拒） */
  placeholders: z.array(z.string()),
})
export type PromptsDto = z.infer<typeof PromptsDtoSchema>

/** PUT /api/prompts：写一个槽位的模板文件（路径缺省 = 写入 <home>/prompts/<slot>.md 并把
 *  spark.json prompts.<slot> 指向它）；content 空串 = 恢复缺省（删配置，回内置模板）。 */
export const PromptsUpdateSchema = z.strictObject({
  slot: PromptSlotSchema,
  content: z.string().max(100_000),
  /** 目标文件路径（相对 spark.json 目录或绝对路径）；缺省 = <home>/prompts/<slot>.md */
  path: z.string().min(1).max(500).optional(),
})
export type PromptsUpdate = z.infer<typeof PromptsUpdateSchema>

/**
 * 需重启生效的字段（D28 分类：构造期注入子系统 / listen 绑定级）。
 * 热档七项（maxStepsPerTurn/maxToolParallel/compactionThreshold/
 * progressThrottleMs/checkpoints/computerUseEnabled/bashPersistent——均 turn 边界或执行期注入）
 * 在下一 turn 或下一操作生效，不在本表。
 */
export const SETTINGS_RESTART_REQUIRED: readonly string[] = [
  'engine.toolTimeoutMs',
  'engine.toolOutputLimitKB',
  'engine.permissionTimeoutMs',
  'engine.bashSandbox',
  'agents.disabledAgents',
  'extensions.disabledExtensions',
  'server.port',
  'server.host',
  'browser.headless',
  'browser.defaultTimeoutMs',
  'browser.userAgent',
  'sandbox.network.port',
]

/** 浏览器工具族设置（阶段十九 19.12）：spark.json `browser` 段——重启档（BrowserManager
 * 构造期装配，ADR D49 判决），缺省 headless=true / defaultTimeoutMs=30000 / UA 空即不覆盖 */
export const BrowserSettingsSchema = z.strictObject({
  headless: z.boolean(),
  defaultTimeoutMs: z.number().int().positive().max(300_000),
  userAgent: z.string().max(300),
})
export type BrowserSettings = z.infer<typeof BrowserSettingsSchema>

/**
 * 沙箱网络隔离设置（阶段十九 19.7 / ADR D50，翻案 D15"网络隔离 v1 不做"登记）：
 * spark.json `sandbox.network` 段。mode='allowlist' 时 bash 出口经本地代理过滤——
 * SOCKS5 与 HTTP CONNECT 同端口按首字节分流，仅 allowlist 命中域名放行。
 * allowlist 条目 = 精确主机名，或 `*.example.com`（匹配任意层子域，不含本域自身）。
 * port 变更需重启（SETTINGS_RESTART_REQUIRED：代理构造期绑定监听）。
 * **诚实边界**：代理只引导尊重 HTTP_PROXY/ALL_PROXY 环境变量的客户端；忽略它们的
 * 命令（裸 socket）仍可直连——OS 级强制属 19.6（spike 判 Windows 不可行）。
 * 本单交付出口过滤而非内核隔离，页面与文档不得宣称"沙箱内断网"。
 */
export const SandboxNetworkSettingsSchema = z.strictObject({
  mode: z.enum(['off', 'allowlist']),
  allowlist: z.array(z.string().min(1).max(253)).max(200),
  port: z.number().int().min(1024).max(65535),
})
export type SandboxNetworkSettings = z.infer<typeof SandboxNetworkSettingsSchema>

/** 沙箱网络隔离缺省值（引擎归一化 / web mock 对等 / 代理装配共用的单一来源） */
export const SANDBOX_NETWORK_DEFAULTS: SandboxNetworkSettings = {
  mode: 'off',
  allowlist: [],
  port: 1080,
}

/**
 * 自动归档策略（阶段十九 19.13）：spark.json `archive` 段——热档（sweep 现读）。
 * autoArchive=true 时，空闲会话按 afterDays 超期自动归档（`<jsonl>.archived` 标记，
 * 与手动 PUT /api/sessions/:id/archive 同一事实源）；running/waiting-approval 永不自动归档。
 */
export const ArchiveSettingsSchema = z.strictObject({
  autoArchive: z.boolean(),
  afterDays: z.number().int().min(1).max(3650),
})
export type ArchiveSettings = z.infer<typeof ArchiveSettingsSchema>

/**
 * 全局出网代理（阶段十九 19.13，翻案 12.9"仅 LLM 面"登记）：spark.json `network` 段——
 * 热档（每次出网现读）。proxy 覆盖 models.json per-provider proxy 之后的**全部引擎出网**
 * （LLM / embedding / MCP 子进程 env / 模型连通测试）；空串 = 不设全局代理（回落
 * per-provider 与 HTTPS_PROXY 环境变量）。noProxy = 逗号分隔主机规则（透传子进程 env）。
 */
export const NetworkSettingsSchema = z.strictObject({
  proxy: z.string().max(500),
  noProxy: z.string().max(1000),
})
export type NetworkSettings = z.infer<typeof NetworkSettingsSchema>

/** 自定义证书信息（阶段十九 19.13 / V2-06 收口）：**只读**——NODE_EXTRA_CA_CERTS 由
 * Node 在进程启动时读取，运行期注入对已建立的 TLS 不生效；本字段只如实回显当前值，
 * 引导用户在启动前设置（禁假状态：不提供"保存后生效"的假控件）。 */
export const CertificatesInfoSchema = z.strictObject({
  nodeExtraCaCerts: z.string().nullable(),
})
export type CertificatesInfo = z.infer<typeof CertificatesInfoSchema>

/** GET /api/sandbox/network：代理运行时状态（设置页/CLI 面板展示"是否在过滤出口"） */
export const SandboxNetworkStatusDtoSchema = z.strictObject({
  /** 代理已监听（true = 出口正在过滤；false = 未启动或绑定失败） */
  ready: z.boolean(),
  /** 未就绪原因（绑定失败等）；ready 为 true 时 null */
  reason: z.string().nullable(),
  /** 活跃隧道数（进行中的连接） */
  activeConnections: z.number().int().nonnegative(),
  /** 当前配置端口（spark.json sandbox.network.port） */
  port: z.number().int().min(1024).max(65535),
})
export type SandboxNetworkStatusDto = z.infer<typeof SandboxNetworkStatusDtoSchema>

/** GET /api/settings 响应（掩码红线：绝不回 apiKey 值——D28） */
export const SettingsDtoSchema = z.strictObject({
  server: z.strictObject({
    port: z.number().int().min(1).max(65535),
    host: z.string().min(1),
  }),
  engine: EngineSettingsSchema,
  /** hooks 按 spark.json 原样（缺省 = 未配置） */
  hooks: SettingsHooksSchema.optional(),
  /** 子代理启停（工单 16.2 / ADR D36）：停用名单——预设档装载在构造期，改动重启生效 */
  agents: z
    .strictObject({
      disabledAgents: z.array(z.string().min(1)),
    })
    .optional(),
  /** 扩展启停（工单 16.5 / ADR D38）：停用名单——重启档（注册表装配在构造期） */
  extensions: z
    .strictObject({
      disabledExtensions: z.array(z.string().min(1)),
    })
    .optional(),
  /** 浏览器设置（阶段十九 19.12）：spark.json browser 段——重启档 */
  browser: BrowserSettingsSchema.optional(),
  /** 沙箱网络隔离（阶段十九 19.7 / ADR D50）：spark.json sandbox.network 段——mode/allowlist 热档，port 重启档 */
  sandbox: z
    .strictObject({
      network: SandboxNetworkSettingsSchema,
    })
    .optional(),
  /** 语义检索总开关（阶段十九 19.8 / ADR D51）：spark.json embedding.enabled——热档
   * （每次检索现读；关 = 不嵌不检索，关键词 FTS 照常）。提供方能力在 models.json。 */
  embedding: z
    .strictObject({
      enabled: z.boolean(),
    })
    .optional(),
  /** 自动归档策略（阶段十九 19.13）：spark.json archive 段——热档 */
  archive: ArchiveSettingsSchema.optional(),
  /** 全局出网代理（阶段十九 19.13，翻案 12.9）：spark.json network 段——热档 */
  network: NetworkSettingsSchema.optional(),
  /** 自定义证书只读信息（阶段十九 19.13 / V2-06 收口）：启动前注入，运行期只读 */
  certificates: CertificatesInfoSchema,
  /** 数据目录（阶段十九 19.16）：SPARK_HOME 或 ~/.spark 的解析值（只读——启动期定） */
  home: z.string().min(1),
  /** 界面语言（阶段十九 19.17 / V2-12）：spark.json ui.language——热档（切换即时生效） */
  ui: z
    .strictObject({
      language: LanguageSchema.optional(),
      /** 键位覆盖层（阶段十九 19.39 / V2-22）：只改物理键不新增语义；生效表由
       *  `mergeKeymap` 单源推导（各端不得自行拼）；键串是展示态，按下逻辑仍在各端物理层 */
      keymap: KeymapSettingsSchema.optional(),
    })
    .optional(),
  /** 需重启生效字段清单（前端标注"下次启动生效"；单一来源 SETTINGS_RESTART_REQUIRED） */
  restartRequired: z.array(z.string()),
  /** models.json 只读参考（写路径不经本端点——默认模型/档位迁移记录见工单） */
  models: z.strictObject({
    defaultModel: z.string(),
    defaultEffort: z.enum(['low', 'medium', 'high']).nullable(),
  }),
})
export type SettingsDto = z.infer<typeof SettingsDtoSchema>

/** PUT /api/settings 请求体（部分字段更新；缺省保持现值；校验失败 400 带字段名） */
export const SettingsUpdateSchema = z.strictObject({
  server: z
    .strictObject({
      port: z.number().int().min(1).max(65535).optional(),
      host: z.string().min(1).optional(),
    })
    .optional(),
  engine: EngineSettingsSchema.partial().optional(),
  /** 整体替换；null = 清空 hooks 段 */
  hooks: SettingsHooksSchema.nullable().optional(),
  /** 子代理启停（工单 16.2 / ADR D36）：agents 段整体替换；disabledAgents 即停用名单 */
  agents: z
    .strictObject({
      disabledAgents: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  /** 扩展启停（工单 16.5 / ADR D38）：extensions 段整体替换 */
  extensions: z
    .strictObject({
      disabledExtensions: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  /** 浏览器设置（阶段十九 19.12）：browser 段逐域合并（部分更新）；重启档 */
  browser: BrowserSettingsSchema.partial().optional(),
  /** 沙箱网络隔离（阶段十九 19.7）：sandbox.network 逐域合并（部分更新）；mode/allowlist 热档，port 重启档 */
  sandbox: z
    .strictObject({
      network: SandboxNetworkSettingsSchema.partial(),
    })
    .optional(),
  /** 语义检索总开关（阶段十九 19.8）：embedding.enabled——热档（关停即时生效） */
  embedding: z
    .strictObject({
      enabled: z.boolean().optional(),
    })
    .optional(),
  /** 自动归档策略（阶段十九 19.13）：archive 段逐字段合并（热档） */
  archive: ArchiveSettingsSchema.partial().optional(),
  /** 全局出网代理（阶段十九 19.13）：network 段逐字段合并（热档） */
  network: NetworkSettingsSchema.partial().optional(),
  /** 提示词模板路径（阶段十九 19.18）：逐槽位替换；null = 清空该槽位配置（回内置模板） */
  prompts: z
    .strictObject({
      base: z.string().min(1).nullable().optional(),
      compaction: z.string().min(1).nullable().optional(),
      title: z.string().min(1).nullable().optional(),
    })
    .optional(),
  /** 界面语言（阶段十九 19.17）：ui.language——热档（切换即时生效，写服务端单源） */
  ui: z
    .strictObject({
      language: LanguageSchema.optional(),
      /** 键位覆盖层（阶段十九 19.39）：整段替换（不是逐条合并）——半路合并会留下孤儿绑定 */
      keymap: KeymapSettingsSchema.optional(),
    })
    .optional(),
})
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>

/** 文件夹信任（工单 16.4 / ADR D37）：GET/PUT /api/trust 的 DTO——folders 全量 + 当前 cwd 有效档 */
export const TrustStatusDtoSchema = z.strictObject({
  folders: z.array(
    z.strictObject({
      path: z.string().min(1),
      trust: z.enum(['trusted', 'untrusted']),
    }),
  ),
  current: z.enum(['trusted', 'untrusted', 'none']),
})
export type TrustStatusDto = z.infer<typeof TrustStatusDtoSchema>

/**
 * 扩展清单（工单 16.5 / ADR D38）：声明式内容包——扩展 = 目录 + spark-extension.json，
 * **不执行任意代码**（D18 红线）；skills/agents/commands/mcpServers 是相对扩展目录的
 * 声明（归属路径由引擎 loader 校验后并入对应注册表）。
 */
export const SparkExtensionManifestSchema = z.strictObject({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  skills: z.array(z.string().min(1)).optional(),
  agents: z.array(z.string().min(1)).optional(),
  commands: z.array(z.string().min(1)).optional(),
  mcpServers: z.array(z.string().min(1)).optional(),
})
export type SparkExtensionManifest = z.infer<typeof SparkExtensionManifestSchema>

/** GET /api/extensions 清单条目（id = 目录名；enabled 从 settings.extensions 名单合成） */
export const ExtensionDtoSchema = SparkExtensionManifestSchema.extend({
  id: z.string().min(1),
  enabled: z.boolean(),
  path: z.string().min(1),
})
export type ExtensionDto = z.infer<typeof ExtensionDtoSchema>

/** 竞答 contender 摘要（工单 16.8 / ADR D42）：状态/用量/时长/文件增删行 */
export const ArenaContenderDtoSchema = z.strictObject({
  sessionId: z.string().min(1),
  model: z.string().min(1),
  status: z.enum(['running', 'done', 'error']),
  usage: z.strictObject({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }),
  durationMs: z.number().int().nonnegative().nullable(),
  diffStat: z
    .strictObject({ files: z.number().int().nonnegative(), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative() })
    .nullable(),
})
export type ArenaContenderDto = z.infer<typeof ArenaContenderDtoSchema>

/** GET /api/sessions/:id/arena 快照（无竞答回 null；记录仅内存——重启丢失，ADR D42 登记限制） */
export const ArenaStatusDtoSchema = z.strictObject({
  arenaId: z.string().min(1),
  prompt: z.string(),
  status: z.enum(['running', 'done', 'cancelled']),
  contenders: z.array(ArenaContenderDtoSchema),
  winner: z.string().nullable(),
  applied: z
    .strictObject({ files: z.array(z.string()), skippedDeletions: z.array(z.string()) })
    .nullable(),
})
export type ArenaStatusDto = z.infer<typeof ArenaStatusDtoSchema>

/**
 * 竞答历史条目（工单 19.10，翻案 D42"记录仅内存"登记限制）：GET /api/arena/history 摘要行。
 * 全量快照落盘在 `~/.spark/arena/<arenaId>.json`（engine ArenaStore），本 DTO 只是列表展示面。
 */
export const ArenaHistoryEntryDtoSchema = z.strictObject({
  arenaId: z.string().min(1),
  /** 竞答发起会话 */
  sessionId: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  /** 终态（胜者应用/取消）时间；done 但未应用胜者，或仍在进行为 null */
  completedAt: z.number().int().nonnegative().nullable(),
  /** 任务 prompt 截 100 字（列表展示面；全文在落盘记录与会话流） */
  prompt: z.string(),
  /** contender 模型名（发起序） */
  models: z.array(z.string().min(1)),
  status: z.enum(['running', 'done', 'cancelled']),
  /** 被应用胜者的模型名；未应用为 null */
  winnerModel: z.string().nullable(),
})
export type ArenaHistoryEntryDto = z.infer<typeof ArenaHistoryEntryDtoSchema>

/** GET /api/arena/history 响应：{ runs: [...] }（新→旧，limit 缺省 20） */
export const ArenaHistoryDtoSchema = z.strictObject({
  runs: z.array(ArenaHistoryEntryDtoSchema),
})
export type ArenaHistoryDto = z.infer<typeof ArenaHistoryDtoSchema>

// ---------- 子代理预设档（工单 13.5） ----------

/**
 * 子代理预设档：`~/.spark/agents/<name>.json` 的声明式形状（工单 13.5）。
 * 文件 schema 与列表 DTO 共用本定义（R-B.4 单一来源纪律）；**声明式不执行代码**（D18 同哲学）。
 * `tools.allow/deny` 是**工具名 pattern**（复用审批规则的 `*` 单段 / `**` 跨段通配语义），
 * **deny 胜出**；被排除的工具既不广告给模型，也会合成会话级 deny 规则（调用即 E_PERMISSION 拦截）。
 * 口径说明：doc/08 §13.5 提示词写 `model?: ModelRef`，实现取 **`provider/model` 字符串**——
 * 与 `PUT /api/sessions/:id/model`、`PUT /api/routing` 同口径，contextWindow 由 models.json
 * 解析补全（避免用户在预设里重复声明窗口大小造成双源漂移）。
 */
export const AgentPresetSchema = z.strictObject({
  model: z.string().min(1).optional(),
  tools: z
    .strictObject({
      allow: z.array(z.string().min(1)).optional(),
      deny: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  /** 拼入子会话 system prompt 的附加段（基座之后） */
  systemAppend: z.string().min(1).optional(),
  /** 缺省子会话标题（task 入参 title 优先） */
  title: z.string().min(1).optional(),
})
export type AgentPreset = z.infer<typeof AgentPresetSchema>

/**
 * GET /api/agents 清单条目（name = 文件名去 .json；只读面——写入靠用户改文件）。
 * source/disabled 为引擎合成值（工单 16.2 / ADR D36）：source 标两层归属
 * （项目层 `.spark/agents/` 覆盖用户层 `~/.spark/agents/` 同名档）；disabled =
 * settings.agents.disabledAgents 名单命中（启停写 spark.json，重启生效）。
 */
export const AgentPresetDtoSchema = AgentPresetSchema.extend({
  name: z.string().min(1),
  source: z.enum(['project', 'user']).optional(),
  disabled: z.boolean().optional(),
})
export type AgentPresetDto = z.infer<typeof AgentPresetDtoSchema>

// ---------- commands / mcp / skills（doc/02 §8 阶段七工单 7.4 / H04） ----------

/**
 * 命令注册表行（GET /api/commands）。命令面基线 = commands.ts BUILTIN_COMMANDS
 * 描述符（工单 10.18 描述符架构，10.18a 判决表为准），命令名可不同、覆盖面以此为下限。
 * kind：action = 引擎动作（compact，POST /api/sessions/:id/commands/:name 执行）；
 * prompt = ~/.spark/commands/*.md 自定义命令（正文展开为 prompt 走正常 turn 通道）；
 * client = 客户端动作（按 clientAction 各端分派；某端未实现即不渲染——禁假状态）。
 * 描述符字段（group/surface/sessionRequired/args/clientAction）为可选增量——
 * 旧载荷无这些字段照常解析（向后兼容）。
 */
export const CommandDtoSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string(),
  kind: z.enum(['action', 'prompt', 'client']),
  group: z.enum(['session', 'model', 'info', 'help']).optional(),
  surface: z.array(CommandSurfaceSchema).min(1).optional(),
  sessionRequired: z.boolean().optional(),
  args: CommandArgsSchema.optional(),
  clientAction: ClientActionSchema.optional(),
})
export type CommandDto = z.infer<typeof CommandDtoSchema>

/** POST /api/sessions/:id/commands/:name 请求体（args = 命令后的补充文本） */
export const ExecuteCommandBodySchema = z.strictObject({
  args: z.string().optional(),
})

/** MCP 服务器只读状态（GET /api/mcp 行；连接失败也列出 connected:false） */
export const McpServerDtoSchema = z.strictObject({
  name: z.string().min(1),
  connected: z.boolean(),
  tools: z.number().int().nonnegative(),
  command: z.string(),
})
export type McpServerDto = z.infer<typeof McpServerDtoSchema>

/** 已加载技能只读清单（GET /api/skills 行） */
export const SkillDtoSchema = z.strictObject({
  name: z.string().min(1),
  events: z.array(z.string()),
  hooks: z.array(z.strictObject({ on: z.string(), emit: z.string() })),
})
export type SkillDto = z.infer<typeof SkillDtoSchema>

// ---------- memories（doc/02 §8 阶段七工单 7.5 / H05，ADR D25） ----------

/** 长期记忆行（GET /api/memories 行；memory.injected 事件内嵌同形状） */
export const MemoryDtoSchema = z.strictObject({
  id: z.number().int().positive(),
  content: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
})
export type MemoryDto = z.infer<typeof MemoryDtoSchema>

// ---------- automation（doc/02 §8 阶段七工单 7.6 / H06，ADR D26） ----------

/** 触发器定义（GET /api/automation 行；三类触发条件至少一种，并存 = 任一命中） */
export const AutomationTriggerDtoSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  /** 自动建会话的工作目录 */
  cwd: z.string().min(1),
  /** 触发后发送的 prompt */
  prompt: z.string().min(1),
  /** cron 5 字段表达式（分 时 日 月 周；* / N - ,） */
  cron: z.string().min(1).optional(),
  /** watch 路径（stat mtime 变化触发；文件内容/目录结构变化） */
  watch: z.string().min(1).optional(),
  /** 启用 webhook 入口（POST /api/automation/webhook/:id） */
  webhook: z.boolean().optional(),
  createdAt: z.number().int().nonnegative(),
})
export type AutomationTriggerDto = z.infer<typeof AutomationTriggerDtoSchema>

/** POST /api/automation 创建体（id/createdAt/enabled 由引擎生成） */
export const AutomationCreateSchema = z.strictObject({
  name: z.string().min(1).max(64),
  cwd: z.string().min(1),
  prompt: z.string().min(1),
  cron: z.string().min(1).optional(),
  watch: z.string().min(1).optional(),
  webhook: z.boolean().optional(),
})
export type AutomationCreate = z.infer<typeof AutomationCreateSchema>

/** 运行历史行（GET /api/automation/runs；新→旧，finish=error 时带人话 error） */
export const AutomationRunDtoSchema = z.strictObject({
  id: z.string().min(1),
  triggerId: z.string().min(1),
  triggerName: z.string(),
  at: z.number().int().nonnegative(),
  kind: z.enum(['cron', 'watch', 'webhook', 'manual']),
  sessionId: z.string().optional(),
  finish: z.enum(['ok', 'error']),
  error: z.string().optional(),
})
export type AutomationRunDto = z.infer<typeof AutomationRunDtoSchema>

// ---------- 审计日志（doc/02 §8 工单 7.12 / H11） ----------

/** 审计明细行（~/.spark/audit.jsonl 追加写；GET /api/audit 新→旧） */
export const AuditEntryDtoSchema = z.strictObject({
  time: z.number().int().nonnegative(),
  kind: z.enum(['permission.decision', 'permission.rule', 'session.rollback']),
  /** 主体：user=用户答复/管理操作；system=规则/超时/中断/级联自动 */
  actor: z.enum(['user', 'system']),
  /** 结果：allow/deny=决策；applied=规则变更生效；ok=回滚完成 */
  result: z.enum(['allow', 'deny', 'applied', 'ok']),
  sessionId: SessionIdSchema.optional(),
  /** 工具名（权限决策的过滤维度） */
  tool: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  /** 规则变更时该规则的 effect（规则表允许 ask 档） */
  effect: z.enum(['allow', 'deny', 'ask']).optional(),
  /** 规则变更操作（kind=permission.rule）：add=新增/覆盖；remove=删除 */
  op: z.enum(['add', 'remove']).optional(),
  /** 决策/变更来源（命中规则层 / 答复类型 / 超时 / 管理页…） */
  source: z.string().optional(),
  checkpointId: z.string().optional(),
})
export type AuditEntryDto = z.infer<typeof AuditEntryDtoSchema>

/** GET /api/audit 查询（全可选；limit 上限 500，缺省 200） */
export const AuditQuerySchema = z.strictObject({
  limit: z.number().int().positive().max(500).optional(),
  kind: z.enum(['permission.decision', 'permission.rule', 'session.rollback']).optional(),
  result: z.enum(['allow', 'deny', 'applied', 'ok']).optional(),
  tool: z.string().optional(),
  since: z.number().int().nonnegative().optional(),
})
export type AuditQuery = z.infer<typeof AuditQuerySchema>

// ---------- 会话全文搜索（doc/02 §8 工单 7.13 / H12） ----------

/** 搜索命中行（GET /api/search；事件内容 FTS5 索引，命中带上下文摘要） */
export const SearchHitDtoSchema = z.strictObject({
  sessionId: SessionIdSchema,
  /** 命中事件所属会话标题（空串 = 新会话；索引降级时亦为空） */
  sessionTitle: z.string(),
  /** 命中事件（前端跳转锚点：/session/:id?event=<eventId>） */
  eventId: EventIdSchema,
  seq: z.number().int().nonnegative(),
  /** 命中事件类型（索引范围 = 用户消息 / 助手消息 / 标题） */
  type: z.enum(['user.message', 'assistant.message', 'session.title']),
  time: z.number().int().nonnegative(),
  /** 命中上下文摘要（引擎截窗；高亮由前端按查询词标出） */
  snippet: z.string(),
})
export type SearchHitDto = z.infer<typeof SearchHitDtoSchema>

// ---------- 配对鉴权（doc/02 §8 阶段九工单 9.1 / ADR D24） ----------

/** 已配对设备行（GET /api/pair 设备列表；token 永不上线，仅存哈希） */
export const PairedDeviceDtoSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative(),
})

/** 配对状态（GET /api/pair：监听地址 + 鉴权启用态 + 设备列表） */
export const PairStatusDtoSchema = z.strictObject({
  host: z.string().min(1),
  port: z.number().int().positive(),
  /** true = 仅环回监听（缺省红线形态，无需鉴权） */
  loopback: z.boolean(),
  /** true = 配对鉴权已启用（~/.spark/devices.json 存在） */
  authEnabled: z.boolean(),
  devices: z.array(PairedDeviceDtoSchema),
})
export type PairStatusDto = z.infer<typeof PairStatusDtoSchema>

/** 配对码（POST /api/pair/code：6 位短码 60s 有效 + QR 出示内容） */
export const PairCodeDtoSchema = z.strictObject({
  code: z.string().regex(/^\d{6}$/),
  expiresAt: z.number().int().positive(),
  /** QR 内容：spark://pair?host=<host>&port=<port>&code=<短码>（DESIGN §13.J.2.9） */
  qr: z.string().min(1),
})
export type PairCodeDto = z.infer<typeof PairCodeDtoSchema>

/** 移动端换长效 token（POST /api/pair：扫码/手输短码兑换；name 为设备名） */
export const PairRedeemBodySchema = z.strictObject({
  code: z.string().regex(/^\d{6}$/),
  name: z.string().min(1).max(64).optional(),
})
export type PairRedeemBody = z.infer<typeof PairRedeemBodySchema>

/** 配对兑换结果（长效 token 仅此次回传，此后只存哈希） */
export const PairTokenDtoSchema = z.strictObject({
  token: z.string().min(1),
})
export type PairTokenDto = z.infer<typeof PairTokenDtoSchema>

// ---------- 目录列举（doc/02 批次 6 工单 10.53：CLI @ 文件路径补全数据源） ----------

/**
 * 目录列举查询（GET /api/sessions/:id/fs?path=）：path = 相对会话 cwd 的部分路径，
 * 末段可为正在输入的前缀（如 `src/comp`）。服务端取 dirname 列举、basename 前缀过滤，
 * 并经 resolveInRoot 硬边界（§6.4：越出 cwd → E_PATH_OUTSIDE）。缺省空串 = 列举 cwd 根。
 */
export const FsQuerySchema = z.strictObject({
  path: z.string().default(''),
})

/** 工单 12.5：文件树查询（深度 ≤4 / 条目 ≤500 由服务端封顶） */
export const FsTreeQuerySchema = z.strictObject({
  path: z.string().default(''),
})
export type FsQuery = z.infer<typeof FsQuerySchema>

/** 单个目录项：name = 项名；path = 相对 cwd 的 posix 路径（补全回写用）；isDir 目录/文件区分 */
export const FsEntryDtoSchema = z.strictObject({
  name: z.string().min(1),
  path: z.string().min(1),
  isDir: z.boolean(),
})
export type FsEntryDto = z.infer<typeof FsEntryDtoSchema>

/** 图片附件（工单 12.2a）：id = 32 位 hex（取图 URL 用）；name 原始文件名仅供 chips 展示 */
export const AttachmentDtoSchema = z.strictObject({
  id: z.string().min(1),
  /** 取图文件名（<id>.<ext>）——GET /api/attachments/:file 直用；事件 attachments 数组存本值 */
  file: z.string().min(1),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  name: z.string(),
})
export type AttachmentDto = z.infer<typeof AttachmentDtoSchema>

/** 转写音频护栏（工单 16.6；19.22 第三批自 engine `voice/transcriber.ts` 下沉）：二者本就是
 * TranscribeRequestSchema 的成文约束。落 protocol 后引擎与 web mock 共用同一份判据——端不得
 * 依赖 engine，此前 mock 拿不到白名单与上限，只能恒返回成功、失败分支零对等（§1.1）。 */
export const TRANSCRIBE_MAX_AUDIO_BYTES = 10 * 1024 * 1024

/** 转写容器白名单（OpenAI 兼容端点公开支持的 mime） */
export const TRANSCRIBE_ALLOWED_MIME: ReadonlySet<string> = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mpga',
  'audio/m4a',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
])

/** base64 串 → 原始字节数（3/4 比例去 padding；够护栏判断用，不做完整解码） */
export function base64ByteLength(dataBase64: string): number {
  const cleaned = dataBase64.replace(/[^A-Za-z0-9+/=]/g, '')
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding)
}

/** 语音听写请求（工单 16.6）：音频 base64 直传，转写在引擎侧走 OpenAI 兼容 /audio/transcriptions；
 * 音频本体 live 不落盘（④）——只有用户把转写文本发出后才进 user.message */
export const TranscribeRequestSchema = z.strictObject({
  /** 供应商（缺省 = 引擎 defaultModel.provider）；须配置 baseUrl/transcription 端点 */
  provider: z.string().min(1).optional(),
  audio: z.strictObject({
    /** 采集容器 mime（白名单 = TRANSCRIBE_ALLOWED_MIME，校验在引擎侧） */
    mime: z.string().min(1),
    /** ≤ TRANSCRIBE_MAX_AUDIO_BYTES（base64 前的字节数；与附件同一量级护栏） */
    dataBase64: z.string().min(1),
  }),
})
export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>

export const TranscribeResultDtoSchema = z.strictObject({
  text: z.string(),
  /** 转写所用 provider/model（设置页/调试可见；文本本身已随返回值入输入框） */
  provider: z.string().min(1),
  model: z.string().min(1),
})
export type TranscribeResultDto = z.infer<typeof TranscribeResultDtoSchema>

/** RT3-07：mcp.json 读回通道的 env 值占位符——值永不明文出引擎（12.6 只进不回显纪律），
 * PUT 时引擎用盘上同 server 同 key 的真值替换占位（无真值 → 400 拒写，掩码不是值） */
/** 浏览器截图产物清理结果（POST /api/browser/cleanup） */
export interface BrowserCleanupResultDto {
  removed: number
}
export const BrowserCleanupResultDtoSchema = z.strictObject({ removed: z.number().int().nonnegative() })

export const MCP_ENV_MASK = '__SPARK_KEEP__'

/** LSP 安装结果（POST /api/lsp/install 响应，阶段十九 19.5）：写入 lsp.json 的最终条目 */
export interface LspInstallResultDto {
  language: string
  command: string
  args: string[]
  /** true = 全新写入配置；false = 该语言已有配置且与清单一致，跳过写入（幂等） */
  written: boolean
}

export const LspInstallResultDtoSchema = z.strictObject({
  language: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  written: z.boolean(),
})

/**
 * 语义（向量）索引状态（阶段十九 19.8 / ADR D51，翻案 D25"向量后置"登记）：
 * 索引库页与 GET /api/index/stats 的数据源。**未配置 embedding 提供方 / 向量库不可用 /
 * 总开关关 → available:false + 关键词检索照常**（禁假状态：不宣称"语义已启用"）。
 */
export const SemanticIndexStatsSchema = z.strictObject({
  available: z.boolean(),
  /** 生效提供方 id（models.json providers 键）；未配置为 null */
  provider: z.string().nullable(),
  /** embedding 模型名；未配置为 null */
  model: z.string().nullable(),
  /** 向量维度；未配置为 null */
  dimensions: z.number().int().positive().nullable(),
  /** spark.json embedding.enabled 总开关（关 = 不嵌不检索，FTS 照常） */
  enabled: z.boolean(),
  /** 已嵌条目数（memory + event 两类合计） */
  embedded: z.number().int().nonnegative(),
})
export type SemanticIndexStats = z.infer<typeof SemanticIndexStatsSchema>

/** 索引库统计（GET /api/index/stats，阶段十九 19.11）：~/.spark/search.db 管理面只读快照 */
export interface IndexStatsDto {
  /** 全文索引条目数（引擎侧 SQLite COUNT） */
  entries: number
  /** search.db 库文件体积（字节） */
  sizeBytes: number
  /** 库文件绝对路径 */
  path: string
  /** false = SQLite 打开失败降级（旁路纪律，JSONL 权威不受影响）；可用时省略 */
  available?: boolean
  /** 语义（向量）索引状态（阶段十九 19.8 / ADR D51）；未配置提供方时 available:false 如实降级 */
  semantic?: SemanticIndexStats
}

export const IndexStatsDtoSchema = z.strictObject({
  entries: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  path: z.string().min(1),
  available: z.boolean().optional(),
  semantic: SemanticIndexStatsSchema.optional(),
})

/** 数据目录占用统计（阶段十九 19.37 第二批 / V2-13）：GET /api/storage/report——
 * 引擎按目录发现分桶（不按声明清单：新子路径自动冒出，不静默漏项），本 DTO 是 wire 形状 */
export const StorageBucketDtoSchema = z.strictObject({
  /** 相对数据根的 POSIX 路径（稳定键；标签在渲染层） */
  name: z.string().min(1),
  bytes: z.number(),
  /** 计入的文件数（目录为其内递归之和） */
  files: z.number(),
  /** 桶内最近修改时间（毫秒）；空桶缺省（不塞 0 假装 1970） */
  newestAt: z.number().optional(),
  /** 是否可清理（19.37 第三批：引擎侧封闭白名单 CLEANABLE_BUCKETS 随报告下发） */
  cleanable: z.boolean(),
})
export type StorageBucketDto = z.infer<typeof StorageBucketDtoSchema>

export const StorageSkippedDtoSchema = z.strictObject({
  /** 相对数据根的 POSIX 路径（根级事故可为空串） */
  name: z.string(),
  reason: z.string(),
})
export type StorageSkippedDto = z.infer<typeof StorageSkippedDtoSchema>

export const StorageReportDtoSchema = z.strictObject({
  home: z.string(),
  /** false = 数据根不存在（全新安装/SPARK_HOME 指错）——此时 buckets 必空，不回零值表装作无占用 */
  exists: z.boolean(),
  totalBytes: z.number(),
  totalFiles: z.number(),
  buckets: z.array(StorageBucketDtoSchema),
  skipped: z.array(StorageSkippedDtoSchema),
  generatedAt: z.number(),
})
export type StorageReportDto = z.infer<typeof StorageReportDtoSchema>

/** 桶清理回执（19.37 第三批）：permanent=true 仅 trash 桶（永久删除）；其余移入 trash 可找回 */
export const StorageCleanupDtoSchema = z.strictObject({
  bucket: z.string().min(1),
  moved: z.number(),
  failed: z.number(),
  permanent: z.boolean(),
})
export type StorageCleanupDto = z.infer<typeof StorageCleanupDtoSchema>

/** 打包导出（19.37 第三批）：bundle = 原生 JSONL（marker 行 + 会话文件原始行逐字保留） */
export const StorageExportDtoSchema = z.strictObject({
  bundle: z.string(),
  files: z.number(),
})
export type StorageExportDto = z.infer<typeof StorageExportDtoSchema>

/** 回导回执（19.37 第三批）：imported/skipped/failed 三计数如实上报 */
export const StorageImportDtoSchema = z.strictObject({
  imported: z.number(),
  skipped: z.number(),
  failed: z.number(),
})
export type StorageImportDto = z.infer<typeof StorageImportDtoSchema>

/** 链接预览（阶段十九 19.21 / V2-24）：POST /api/link-preview——引擎侧带 SSRF 防护抓取
 * <title>/favicon；title/icon 为 null = 抓取失败的最小卡形态（域名始终有） */
export const LinkPreviewDtoSchema = z.strictObject({
  url: z.string().min(1),
  domain: z.string().min(1),
  title: z.string().nullable(),
  iconUrl: z.string().nullable(),
})
export type LinkPreviewDto = z.infer<typeof LinkPreviewDtoSchema>

/** 索引重建结果（POST /api/index/rebuild，工单 19.11）：清表重扫 sessions JSONL 后的条目数 */
export interface RebuildResultDto {
  entries: number
}

export const RebuildResultDtoSchema = z.strictObject({
  entries: z.number().int().nonnegative(),
})

/** 向量索引重建结果（POST /api/index/vectors/rebuild，阶段十九 19.8 / ADR D51）：
 * 增量补嵌——只嵌缺向量的条目（不清表，已嵌条目零重复计费）。 */
export interface RebuildVectorsResultDto {
  /** 本次嵌入条目数 */
  embedded: number
  /** 仍缺向量的条目数（达单次上限或失败剩余；0 = 全覆盖） */
  remaining: number
}

export const RebuildVectorsResultDtoSchema = z.strictObject({
  embedded: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
})

/** 空间回收结果（POST /api/index/vacuum，工单 19.11）：SQLite VACUUM 前后库文件体积（字节） */
export interface VacuumResultDto {
  sizeBytesBefore: number
  sizeBytesAfter: number
}

export const VacuumResultDtoSchema = z.strictObject({
  sizeBytesBefore: z.number().int().nonnegative(),
  sizeBytesAfter: z.number().int().nonnegative(),
})

/** MCP server transport 类型（工单 19.4 / ADR D46）：stdio 缺省（本地子进程，既有配置零变化）；
 * streamable-http = 远程 HTTP 连接（url 必填，headers 携带鉴权头） */
export type McpTransportKind = 'stdio' | 'streamable-http'

/** MCP 服务器配置条目（PUT /api/mcp body 形状；与 ~/.spark/mcp.json 同构。
 * RT3-07 读回通道 GET /api/mcp/config 复用同形状：env/headers 敏感值一律为 MCP_ENV_MASK 占位） */
export interface McpConfigInput {
  version: 1
  servers: Record<
    string,
    {
      /** stdio 启动命令（transport 缺省 = 'stdio' 时必填；streamable-http 下不得出现） */
      command?: string
      transport?: McpTransportKind
      /** streamable-http 远程地址（该 transport 下必填） */
      url?: string
      /** streamable-http 请求头（鉴权等敏感值；读回按 MCP_ENV_MASK 掩码，同 env 纪律） */
      headers?: Record<string, string>
      args?: string[]
      env?: Record<string, string>
      connectTimeoutMs?: number
    }
  >
}

/**
 * LSP 服务器只读状态行（GET /api/lsp，工单 16.9：/lsp 面板连接状态与诊断摘要）。
 * 同 /api/mcp 口径：未连接/失败也列出（connected:false + error 人话——禁假状态）；
 * 诊断摘要为引擎侧缓存快照（仅已打开文档），空缓存如实 0。
 */
export const LspServerStatusDtoSchema = z.strictObject({
  language: z.string().min(1),
  command: z.string(),
  connected: z.boolean(),
  /** connected=false 时的失败原因（spawn/initialize 失败等；连接正常不携带） */
  error: z.string().optional(),
  /** 诊断缓存涉及文件数 */
  files: z.number().int().nonnegative(),
  /** severity=1（Error）累计条数 */
  errors: z.number().int().nonnegative(),
  /** severity=2（Warning）累计条数 */
  warnings: z.number().int().nonnegative(),
})
export type LspServerStatusDto = z.infer<typeof LspServerStatusDtoSchema>

/** 递归文件树（工单 12.5）：path = 请求的根目录（相对 cwd，根为空串）；entries 平铺
 * （含目录项，客户端按 path 建层级）；truncated = 条目达上限截断。深度 ≤4、条目 ≤500。 */
export const FsTreeDtoSchema = z.strictObject({
  path: z.string(),
  entries: z.array(FsEntryDtoSchema),
  truncated: z.boolean(),
})
export type FsTreeDto = z.infer<typeof FsTreeDtoSchema>

/** 目录列举结果：path = 实际列举的目录（相对 cwd，根为空串）；entries 目录优先再字典序 */
export const FsListDtoSchema = z.strictObject({
  path: z.string(),
  entries: z.array(FsEntryDtoSchema),
})
export type FsListDto = z.infer<typeof FsListDtoSchema>
