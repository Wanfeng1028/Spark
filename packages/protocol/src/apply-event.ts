/**
 * applyEvent reducer（doc/02 §6.4 处理表 / D22 四端共享资产之二，工单 8.2 自 apps/web 下沉）：
 * 事件信封 → 会话投影（UiItem 序列与切片状态）的唯一纯函数，27 种词表逐一处理；
 * web（zustand 包装）与 cli（Ink 渲染）共用同一实现——词表穷尽性由 web 侧单测逐条把关。
 * 去重规则（回放×直播重叠）：durable（有 seq）且 seq <= lastSeq → 跳过；live（无 seq）无条件应用。
 *
 * 工单 W13（items 查找索引化）：items 只在尾部追加或同下标原位替换（下标恒稳定），
 * 每 items 数组引用配套一份查找索引（callId/requestId/turn 流式项），高频
 * tool.progress / assistant.delta / reasoning.delta 等的 O(n) 扫描降为 O(1)；
 * 索引经模块级 WeakMap（以数组引用为键）旁路缓存——纯函数契约与公共类型零变化。
 */
import type { SparkEventEnvelope, SparkEventMap } from './events.js'
import type { Usage, ContentItem, TurnFinish, ReasoningEffort, SessionMode } from './primitives.js'
import type { CallId, EventId, RequestId, SessionId, TurnId } from './ids.js'

// ---------- UiItem（§6.4 类型表） ----------

interface UiItemBase {
  eventId: EventId
  parentId?: EventId
}

export type UiItem =
  | ({ kind: 'user'; text: string; attachments?: string[] } & UiItemBase)
  | ({
      kind: 'turn'
      turnId: TurnId
      /** turn.started 信封时间——回合头"已工作 N 秒"数据源（工单 10.4） */
      startedAt: number
      /** turn.completed 回填；缺省 = 进行中（渲染侧实时计时） */
      finishedAt?: number
      finish?: TurnFinish
    } & UiItemBase)
  | ({
      kind: 'assistant'
      content: ContentItem[]
      streaming?: { textBuf: string }
      /** 定稿（或首帧）信封时间——尾操作行时间戳数据源（工单 10.4①） */
      time?: number
      /** 所属 turn——定稿配对按 turnId 查找（工单 10.13） */
      turnId?: TurnId
    } & UiItemBase)
  | ({
      kind: 'reasoning'
      text: string
      streaming?: boolean
      /** 首帧 reasoning.delta 信封时间——流式实时计时数据源（工单 10.4③） */
      startedAt?: number
      /** reasoning.ended 回填（信封时间差）——"持续了 N 秒"定格 */
      durationMs?: number
      /** 所属 turn——定稿配对按 turnId 查找（工单 10.13） */
      turnId?: TurnId
    } & UiItemBase)
  | ({
      kind: 'tool'
      callId: CallId
      name: string
      input: unknown
      status: 'running' | 'completed' | 'error'
      progressBuf: string
      output?: unknown
      /** tool.completed 自带耗时——摘要行"完成 · 耗时"数据源（工单 10.4④） */
      durationMs?: number
      /** 起始信封时间——运行中时长实时显示数据源（工单 10.9 / §13.K K.2） */
      startedAt?: number
      /** io.warning（工单 7.2）：护栏告警挂对应工具项（保留最后一条；UI 角标数据源） */
      guard?: { kind: 'injection' | 'secret'; rules: string[]; redacted?: number }
    } & UiItemBase)
  | ({
      kind: 'approval'
      requestId: RequestId
      action: string
      resource: string
      reason: string
      detail?: unknown
      /** §5.7 补强 1/3：展示用多 pattern（可选，v1 审批卡不强制） */
      patterns?: string[]
      /** §5.7 补强：决定"总是允许"固化哪几条规则（可选；缺省=resource 单条） */
      alwaysPatterns?: string[]
      reply?: 'once' | 'always' | 'reject'
      status: 'pending' | 'resolved'
    } & UiItemBase)
  | ({
      /** LSP 诊断流（工单 16.9）：每次 publish 一行卡（多次 publish 逐条入流——回放即重建） */
      kind: 'diagnostics'
      language: string
      uri: string
      diagnostics: SparkEventMap['lsp.diagnostics']['diagnostics']
    } & UiItemBase)

export interface SessionMeta {
  id: SessionId
  title: string // 空字符串 = 前端显示"新会话"
  model: string
  cwd: string
  createdAt: number
  updatedAt: number
  /** 创建时 cwd 的 git 分支（缺省 = 取不到，前端不渲染——工单 10.6） */
  branch?: string
  /** 创建时生效的推理档位（缺省 = 未配置——工单 10.6） */
  effort?: ReasoningEffort
}

export interface ActiveTurn {
  turnId: TurnId
  stepCount: number
  runningTools: Set<CallId>
  /** permission.asked 置位 / resolved 复位（§6.4「activeTurn 标 waiting」） */
  waiting: boolean
}

export interface SessionSlice {
  meta: SessionMeta
  items: UiItem[]
  activeTurn: ActiveTurn | null
  lastSeq: number
  usageTotal: Usage
  /** 最近一轮带 usage 的事件（assistant.message/turn.completed）——上下文水位数据源（工单 6.6） */
  contextUsage: Usage | null
  /** turn.completed finish==='error' 设；下一次 turn.started 清（§6.4 处理表） */
  topBanner: { kind: 'turn-error'; turnId: TurnId } | null
  /** compaction.started/completed 的顶部细条（§6.4 处理表） */
  compacting: boolean
  /** checkpoint.created 的短暂徽标数据源 */
  lastCheckpoint: { checkpointId: string; turnId: TurnId } | null
  /** 最近一条 error 事件（toast / fatal 全屏错误态的数据源） */
  lastError: { scope: 'engine' | 'llm' | 'tool' | 'io'; message: string; fatal: boolean } | null
  /** 最近一次记忆注入（工单 7.5：会话首条消息的 top-k 命中） */
  memoryInjected: { count: number; query: string } | null
  /**
   * 会话模式（工单 16.3）：plan = 只读规划态（四端指示与 composer 提示的数据源）。
   * 由 `session.mode.changed` 驱动——durable，所以冷启动回放就能重建，不依赖内存态。
   */
  mode: SessionMode
  /**
   * 持续目标（工单 16.7）：null = 无目标。由 goal.* 四枚 durable 事件驱动——
   * 冷启动回放即重建（与 mode 同纪律）；pausedReason 只在 goal.paused 时携带。
   */
  goal: SessionGoalState | null
}

/** 持续目标投影状态（16.7；status/reason 与 goal.updated/goal.paused 的 zod 字面量同源） */
export interface SessionGoalState {
  text: string
  iterations: number
  usedTokens: number
  status: 'active' | 'paused' | 'completed'
  pausedReason?: SparkEventMap['goal.paused']['reason']
}

/** 投影状态（各端 store 的公共形状；web zustand / cli 各自再挂自己的操作面） */
export interface ProjectionState {
  byId: Record<SessionId, SessionSlice>
  activeId: SessionId | null
}

const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
  costUsd: 0,
}

export function emptySessionSlice(sid: SessionId): SessionSlice {
  return {
    meta: { id: sid, title: '', model: '', cwd: '', createdAt: 0, updatedAt: 0 },
    items: [],
    activeTurn: null,
    lastSeq: 0,
    usageTotal: { ...ZERO_USAGE },
    contextUsage: null,
    topBanner: null,
    compacting: false,
    lastCheckpoint: null,
    lastError: null,
    memoryInjected: null,
    mode: 'default',
    goal: null,
  }
}

// ---------- reduce：§6.4 处理表（27 种全覆盖） ----------

/** 按词表窄化事件 data 的类型守卫（同 SessionPage 模式） */
function ofType<T extends SparkEventEnvelope['type']>(
  e: SparkEventEnvelope,
  t: T,
): e is SparkEventEnvelope<T> {
  return e.type === t
}

function addUsage(a: Usage, b: Usage | undefined): Usage {
  if (b === undefined) return a
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0),
    cacheRead: (a.cacheRead ?? 0) + (b.cacheRead ?? 0),
    cacheWrite: (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0),
    costUsd: (a.costUsd ?? 0) + (b.costUsd ?? 0),
  }
}

const PROGRESS_MAX_LINES = 2000

/** progressBuf 超 2000 行截头（保尾部——最新输出优先可见） */
function appendProgress(buf: string, chunk: string): string {
  const next = buf + chunk
  const lines = next.split('\n')
  if (lines.length <= PROGRESS_MAX_LINES) return next
  return `…（前 ${lines.length - PROGRESS_MAX_LINES} 行已截断）\n${lines.slice(-PROGRESS_MAX_LINES).join('\n')}`
}

/** 反向查找最近一条同 turnId 的 turn 项（工单 10.4 回合头回填）；未命中返 -1 */
function findLastTurn(items: UiItem[], turnId: TurnId): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it !== undefined && it.kind === 'turn' && it.turnId === turnId) return i
  }
  return -1
}

/**
 * 工单 10.13：按 turnId 反向查找最近一条**未闭合**的同类流式项（定稿配对）。
 * 真实发射序为 reasoning.delta* → assistant.delta* → reasoning.ended → assistant.message
 * （run-loop：thinking 先流、定稿对后置）——定稿时列表末项往往不是自己的流式项，
 * 位置判断（lastItem）必然失效；按 turnId 反查未闭合项才是正确配对。
 */
function findOpenReasoning(items: UiItem[], turnId: TurnId): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it !== undefined && it.kind === 'reasoning' && it.streaming === true && it.turnId === turnId) {
      return i
    }
  }
  return -1
}

function findOpenAssistant(items: UiItem[], turnId: TurnId): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (
      it !== undefined &&
      it.kind === 'assistant' &&
      it.streaming !== undefined &&
      it.turnId === turnId
    ) {
      return i
    }
  }
  return -1
}

/**
 * 工单 10.13 失败闭合清扫：turn 结束时仍有未闭合流式项（aborted/error 路径无对应定稿
 * 事件）→ 就地定稿——剥离 streaming 态（计时器停止）、已交付内容保留为真值。
 * 返回 null = 无变更（调用方保持原引用）。
 */
function closeStreamingOfTurn(items: UiItem[], turnId: TurnId, at: number): UiItem[] | null {
  let changed = false
  const out = items.map((it) => {
    if (it.kind === 'reasoning' && it.streaming === true && it.turnId === turnId) {
      changed = true
      const base = { ...it, streaming: false }
      return it.startedAt !== undefined ? { ...base, durationMs: at - it.startedAt } : base
    }
    if (it.kind === 'assistant' && it.streaming !== undefined && it.turnId === turnId) {
      changed = true
      const { streaming, ...rest } = it
      const text = streaming.textBuf
      // 已交付前缀转 text 块保留（dsh 截断定稿同思路——不丢内容）；空前缀维持空 content
      return text !== '' ? { ...rest, content: [{ type: 'text' as const, text }] } : rest
    }
    return it
  })
  return changed ? out : null
}

// ---------- 工单 W13：items 查找索引（线性扫描 O(n) → O(1)） ----------

/** 每 turn 的流式项位置与同类项存在性（findOpen* / 迟到 delta 拦截的索引化数据源） */
interface TurnStreaming {
  /** 未闭合 reasoning 项下标（streaming === true；reducer 新建条件保证每 turn 至多一个） */
  reasoningOpen?: number | undefined
  /** 未闭合 assistant 项下标（streaming !== undefined；每 turn 至多一个） */
  assistantOpen?: number | undefined
  /** 该 turn 曾有过 reasoning 项（无论闭合与否）——迟到 delta 判定用（工单 10.13） */
  reasoningSeen: boolean
  /** 该 turn 曾有过 assistant 项 */
  assistantSeen: boolean
}

/** items 查找索引：与一个 items 数组引用一一配套（不可变纪律下引用不变 ⟹ 内容不变） */
interface ItemIndex {
  /** callId → 首个该 callId 的 tool 项下标（findIndex「取第一个」语义） */
  readonly callId: ReadonlyMap<CallId, number>
  /** requestId → 首个该 requestId 的 approval 项下标 */
  readonly requestId: ReadonlyMap<RequestId, number>
  /** turnId → 流式项/同类项存在性 */
  readonly turns: ReadonlyMap<TurnId, TurnStreaming>
}

/** turn 条目读取兜底（无条目 = 该 turn 尚无流式/同类项——新建时以空底座起步） */
function turnEntryOf(idx: ItemIndex, turnId: TurnId): TurnStreaming {
  return (
    idx.turns.get(turnId) ?? {
      reasoningOpen: undefined,
      assistantOpen: undefined,
      reasoningSeen: false,
      assistantSeen: false,
    }
  )
}

/** copy-on-write 维护：只在产生/清除键时拷贝对应 Map——旧索引对象永不被动改
 *  （同一 state 分叉两次演进互不污染；共享仅发生在不产生键的事件，追加项不进索引，天然安全） */
function withToolCall(idx: ItemIndex, callId: CallId, i: number): ItemIndex {
  if (idx.callId.has(callId)) return idx // 首见语义——重复 callId 保持指向第一个（findIndex 语义）
  const callId2 = new Map(idx.callId)
  callId2.set(callId, i)
  return { ...idx, callId: callId2 }
}

function withApproval(idx: ItemIndex, requestId: RequestId, i: number): ItemIndex {
  if (idx.requestId.has(requestId)) return idx
  const requestId2 = new Map(idx.requestId)
  requestId2.set(requestId, i)
  return { ...idx, requestId: requestId2 }
}

function withTurn(idx: ItemIndex, turnId: TurnId, t: TurnStreaming): ItemIndex {
  const turns2 = new Map(idx.turns)
  turns2.set(turnId, t)
  return { ...idx, turns: turns2 }
}

/**
 * 缓存 miss 兜底：从 items 全量重建（外部手工构造 state / resetSlice 后的新数组引用）。
 * 语义与线性查找逐条对齐——callId/requestId 取首见；open 取最后一个（findOpen*
 * 反向「最近」语义）。
 */
function buildItemIndex(items: readonly UiItem[]): ItemIndex {
  const callId = new Map<CallId, number>()
  const requestId = new Map<RequestId, number>()
  const turns = new Map<TurnId, TurnStreaming>()
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it === undefined) continue
    if (it.kind === 'tool') {
      if (!callId.has(it.callId)) callId.set(it.callId, i)
    } else if (it.kind === 'approval') {
      if (!requestId.has(it.requestId)) requestId.set(it.requestId, i)
    } else if (it.kind === 'reasoning' || it.kind === 'assistant') {
      if (it.turnId === undefined) continue
      const t = turns.get(it.turnId) ?? {
        reasoningOpen: undefined,
        assistantOpen: undefined,
        reasoningSeen: false,
        assistantSeen: false,
      }
      if (it.kind === 'reasoning') {
        t.reasoningSeen = true
        if (it.streaming === true) t.reasoningOpen = i // 正向覆盖 → 最终留最后一个（= 反向首见）
      } else {
        t.assistantSeen = true
        if (it.streaming !== undefined) t.assistantOpen = i
      }
      turns.set(it.turnId, t)
    }
  }
  return { callId, requestId, turns }
}

/** 索引查询（带谓词校验 + 线性回退）：索引失配/漏记时退回原 findIndex 行为——
 *  任何索引缺陷最坏退化为性能问题，不改变投影结果 */
function toolIndexOf(items: UiItem[], idx: ItemIndex, callId: CallId): number {
  const i = idx.callId.get(callId)
  if (i !== undefined) {
    const it = items[i]
    if (it !== undefined && it.kind === 'tool' && it.callId === callId) return i
  }
  return items.findIndex((it) => it.kind === 'tool' && it.callId === callId)
}

function approvalIndexOf(items: UiItem[], idx: ItemIndex, requestId: RequestId): number {
  const i = idx.requestId.get(requestId)
  if (i !== undefined) {
    const it = items[i]
    if (it !== undefined && it.kind === 'approval' && it.requestId === requestId) return i
  }
  return items.findIndex((it) => it.kind === 'approval' && it.requestId === requestId)
}

function openAssistantIndexOf(items: UiItem[], idx: ItemIndex, turnId: TurnId): number {
  const i = idx.turns.get(turnId)?.assistantOpen
  if (i !== undefined) {
    const it = items[i]
    if (
      it !== undefined &&
      it.kind === 'assistant' &&
      it.streaming !== undefined &&
      it.turnId === turnId
    ) {
      return i
    }
  }
  return findOpenAssistant(items, turnId)
}

function openReasoningIndexOf(items: UiItem[], idx: ItemIndex, turnId: TurnId): number {
  const i = idx.turns.get(turnId)?.reasoningOpen
  if (i !== undefined) {
    const it = items[i]
    if (it !== undefined && it.kind === 'reasoning' && it.streaming === true && it.turnId === turnId) {
      return i
    }
  }
  return findOpenReasoning(items, turnId)
}

/** 索引盒：reduceEvent 内各分支可替换 idx（copy-on-write），外壳出口读最终值挂载 */
interface IndexBox {
  idx: ItemIndex
}

/**
 * 索引缓存（WeakMap 旁路）：key = items 数组引用。applyEvent 为纯函数、slice 每次由
 * 外部传入——索引不放 slice（公共类型扩大 + 声明发射需导出内部类型）也不放可变单例
 * （破坏分叉安全），以数组引用为键的 memoization 两全：不可变纪律下引用不变 ⟹
 * 内容不变，缓存命中不改变输出；条目随数组引用被 GC 自动回收。
 */
const itemIndexCache = new WeakMap<UiItem[], ItemIndex>()

export function applyEvent(s: ProjectionState, e: SparkEventEnvelope): ProjectionState {
  const existing = s.byId[e.sessionId]
  // 去重入口（§6.4）：durable 且 seq <= lastSeq → 跳过（回放×直播重叠吸附）。
  // 前置到外壳：短路发生在索引获取之前，去重命中路径零索引开销。
  if (existing !== undefined && e.seq !== undefined && e.seq <= existing.lastSeq) return s
  const curItems = existing?.items ?? []
  const idxBox: IndexBox = { idx: itemIndexCache.get(curItems) ?? buildItemIndex(curItems) }
  const result = reduceEvent(s, e, idxBox)
  // 挂载：本事件改写了 items（新引用）则登记维护后的索引；引用未变时为幂等刷新。
  // 挂载点收敛在外壳出口一处——分支内只更新 idxBox.idx，不直接碰缓存。
  const out = result.byId[e.sessionId]
  if (out !== undefined) itemIndexCache.set(out.items, idxBox.idx)
  return result
}

/** 原实现主体（外壳拆出：签名仅增索引盒参数，内部各分支查询/维护索引） */
function reduceEvent(s: ProjectionState, e: SparkEventEnvelope, idxBox: IndexBox): ProjectionState {
  const slice = s.byId[e.sessionId] ?? emptySessionSlice(e.sessionId)
  const next: SessionSlice = { ...slice, meta: { ...slice.meta } }
  if (e.seq !== undefined) next.lastSeq = Math.max(slice.lastSeq, e.seq)
  if (e.time > next.meta.updatedAt) next.meta.updatedAt = e.time

  let items = next.items

  if (ofType(e, 'session.created')) {
    next.meta = {
      id: e.sessionId,
      title: e.data.title ?? '',
      model: e.data.model,
      cwd: e.data.cwd,
      createdAt: e.time,
      updatedAt: e.time,
      ...(e.data.branch !== undefined ? { branch: e.data.branch } : {}),
      ...(e.data.effort !== undefined ? { effort: e.data.effort } : {}),
    }
    return {
      ...s,
      byId: { ...s.byId, [e.sessionId]: next },
      ...(s.activeId === null ? { activeId: e.sessionId } : {}),
    }
  }

  if (ofType(e, 'session.resumed')) {
    // 回放模式：REST 全量 durable 随后按 seq 升序到达，逐条走同一条 reduce（§6.4「回放模式批量 apply」）
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'session.title')) {
    next.meta.title = e.data.title
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'session.mode.changed')) {
    // 工单 16.3：只记当前模式（previous 供审计/调试，投影不需要历史栈）
    next.mode = e.data.mode
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'goal.set')) {
    // 工单 16.7：新目标从零计数（已有 active 目标时引擎侧直接替换，重设即换目标）
    next.goal = {
      text: e.data.goal,
      iterations: 0,
      usedTokens: 0,
      status: 'active',
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'goal.updated')) {
    // 续跑进度与 /goal status 回显共用（文本随行，回放端自含）；
    // paused 态回显时保真护栏原因（事件本身不带 reason——从既有投影顺延，resume 回 active 即清）
    next.goal = {
      text: e.data.goal,
      iterations: e.data.iterations,
      usedTokens: e.data.usedTokens,
      status: e.data.status,
      ...(next.goal !== null && e.data.status === 'paused'
        ? { pausedReason: next.goal.pausedReason }
        : {}),
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'goal.completed')) {
    if (next.goal === null) return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
    next.goal = { ...next.goal, status: 'completed', iterations: e.data.iterations, usedTokens: e.data.usedTokens }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'goal.paused')) {
    if (next.goal === null) return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
    next.goal = {
      ...next.goal,
      status: 'paused',
      iterations: e.data.iterations,
      usedTokens: e.data.usedTokens,
      pausedReason: e.data.reason,
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'turn.started')) {
    next.activeTurn = {
      turnId: e.data.turnId,
      stepCount: 0,
      runningTools: new Set(),
      waiting: false,
    }
    next.topBanner = null // 新 turn 清上一轮的错误横幅
    next.items = [
      ...next.items,
      { kind: 'turn', eventId: e.id, turnId: e.data.turnId, startedAt: e.time },
    ]
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'turn.completed')) {
    next.activeTurn = null
    next.usageTotal = addUsage(next.usageTotal, e.data.usage)
    if (e.data.usage !== undefined) next.contextUsage = e.data.usage
    if (e.data.finish === 'error') next.topBanner = { kind: 'turn-error', turnId: e.data.turnId }
    // 回合头回填：最近一条同 turnId 的 turn 项补 finishedAt/finish（工单 10.4）
    const ti = findLastTurn(next.items, e.data.turnId)
    if (ti >= 0) {
      const cur = next.items[ti]
      if (cur !== undefined && cur.kind === 'turn') {
        const items2 = [...next.items]
        items2[ti] = { ...cur, finishedAt: e.time, finish: e.data.finish }
        next.items = items2
      }
    }
    // 工单 10.13 失败闭合：turn 结束仍敞口的流式项（aborted/error 无对应定稿事件）
    // 就地闭合——未闭合 reasoning 计时器必停（实测假"578 秒"），已交付前缀不丢。
    // 工单 W13：索引判定有无敞口，无敞口跳过全量 map（closeStreamingOfTurn 无匹配时
    // 本就返回 null 不改引用——语义等价，长会话高频 turn 边界省 O(n)）
    const rOpen = openReasoningIndexOf(next.items, idxBox.idx, e.data.turnId)
    const aOpen = openAssistantIndexOf(next.items, idxBox.idx, e.data.turnId)
    if (rOpen >= 0 || aOpen >= 0) {
      const swept = closeStreamingOfTurn(next.items, e.data.turnId, e.time)
      if (swept !== null) next.items = swept
      // 敞口已闭合（seen 保留——该 turn 的迟到 delta 拦截判定仍需要）
      idxBox.idx = withTurn(idxBox.idx, e.data.turnId, {
        ...turnEntryOf(idxBox.idx, e.data.turnId),
        reasoningOpen: undefined,
        assistantOpen: undefined,
      })
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'user.message')) {
    const userItem: { kind: 'user'; eventId: EventId; text: string; attachments?: string[] } = {
      kind: 'user',
      eventId: e.id,
      text: e.data.text,
    }
    if (e.data.attachments !== undefined) userItem.attachments = e.data.attachments
    items = [...items, userItem]
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'assistant.delta')) {
    // 工单 10.13：追加到本 turn 未闭合的流式项（位置判断改 turnId 配对）
    // 工单 W13：open 查询走索引（高频路径 O(1)；失配回退线性扫）
    const oi = openAssistantIndexOf(next.items, idxBox.idx, e.data.turnId)
    if (oi >= 0) {
      const cur = next.items[oi]
      if (cur !== undefined && cur.kind === 'assistant') {
        const streaming = cur.streaming ?? { textBuf: '' }
        const arr = [...next.items]
        arr[oi] = { ...cur, streaming: { textBuf: streaming.textBuf + e.data.text } }
        next.items = arr
        // 流式态不变（仍敞口）——索引零维护
      }
    } else if (idxBox.idx.turns.get(e.data.turnId)?.assistantSeen === true) {
      // 迟到 delta（定稿后到达）：本 turn 已有 assistant 项——定稿携带全文，
      // delta 仅流式预览，不新建项防双份（工单 10.13）；多步 turn 后续 step 的
      // 首帧同被拦截，由其定稿事件照常成项（宁不流式也不双份，不丢持久内容）
      return s
    } else {
      next.items = [
        ...next.items,
        {
          kind: 'assistant',
          eventId: e.id,
          content: [],
          streaming: { textBuf: e.data.text },
          time: e.time,
          turnId: e.data.turnId,
        },
      ]
      // 新建敞口项：登记 open + seen（W13）
      idxBox.idx = withTurn(idxBox.idx, e.data.turnId, {
        ...turnEntryOf(idxBox.idx, e.data.turnId),
        assistantOpen: next.items.length - 1,
        assistantSeen: true,
      })
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'assistant.message')) {
    // 定稿：按 turnId 反查未闭合流式项并吸附（工单 10.13——真实发射序下定稿后置，
    // lastItem 位置判断失效）；未命中才新建（失败闭合兜底——纯回放无 delta 也成单项，不静默丢弃）
    items = [...items]
    const oi = openAssistantIndexOf(items, idxBox.idx, e.data.turnId)
    if (oi >= 0) {
      const cur = items[oi]
      if (cur !== undefined && cur.kind === 'assistant') {
        // 定稿即清除 streaming（解构剥离，勿留 undefined 键——exactOptionalPropertyTypes）
        const { streaming: finalized, ...rest } = cur
        void finalized
        items[oi] = { ...rest, content: e.data.content }
      }
      // 定稿闭合（W13）：清 open；seen 保留（迟到 delta 拦截仍需判定"曾有过"）
      idxBox.idx = withTurn(idxBox.idx, e.data.turnId, {
        ...turnEntryOf(idxBox.idx, e.data.turnId),
        assistantOpen: undefined,
      })
    } else {
      items.push({
        kind: 'assistant',
        eventId: e.id,
        content: e.data.content,
        time: e.time,
        turnId: e.data.turnId,
      })
      idxBox.idx = withTurn(idxBox.idx, e.data.turnId, {
        ...turnEntryOf(idxBox.idx, e.data.turnId),
        assistantSeen: true,
      })
    }
    for (const c of e.data.content) {
      if (c.type === 'toolCall') {
        items.push({
          kind: 'tool',
          eventId: e.id,
          callId: c.callId,
          name: c.name,
          input: c.input,
          status: 'running',
          progressBuf: '',
          startedAt: e.time,
        })
        idxBox.idx = withToolCall(idxBox.idx, c.callId, items.length - 1)
      }
    }
    next.items = items
    if (e.data.usage !== undefined) next.contextUsage = e.data.usage
    if (next.activeTurn !== null) {
      next.activeTurn = { ...next.activeTurn, stepCount: next.activeTurn.stepCount + 1 }
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'reasoning.delta')) {
    // 工单 10.13：追加到本 turn 未闭合的流式项（位置判断改 turnId 配对）
    // 工单 W13：open 查询走索引（高频路径 O(1)；失配回退线性扫）
    const oi = openReasoningIndexOf(next.items, idxBox.idx, e.data.turnId)
    if (oi >= 0) {
      const cur = next.items[oi]
      if (cur !== undefined && cur.kind === 'reasoning') {
        const arr = [...next.items]
        arr[oi] = { ...cur, text: cur.text + e.data.text, streaming: true }
        next.items = arr
        // 流式态不变（仍敞口）——索引零维护
      }
    } else if (idxBox.idx.turns.get(e.data.turnId)?.reasoningSeen === true) {
      // 迟到 delta（reasoning.ended 已定稿后到达）：ended 携带全文，
      // delta 仅流式预览——不新建项防双份与"假计时"（工单 10.13）
      return s
    } else {
      next.items = [
        ...next.items,
        {
          kind: 'reasoning',
          eventId: e.id,
          text: e.data.text,
          streaming: true,
          startedAt: e.time,
          turnId: e.data.turnId,
        },
      ]
      // 新建敞口项：登记 open + seen（W13）
      idxBox.idx = withTurn(idxBox.idx, e.data.turnId, {
        ...turnEntryOf(idxBox.idx, e.data.turnId),
        reasoningOpen: next.items.length - 1,
        reasoningSeen: true,
      })
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'reasoning.ended')) {
    // 按 turnId 反查未闭合流式项并定稿（工单 10.13——真实发射序下 reasoning.ended
    // 到达时末项往往是 assistant 流式项，位置判断失效）；未命中才新建定稿项
    // （失败闭合兜底——纯回放无 delta 也成单项，不静默丢弃）
    items = [...items]
    const oi = openReasoningIndexOf(items, idxBox.idx, e.data.turnId)
    if (oi >= 0) {
      const cur = items[oi]
      if (cur !== undefined && cur.kind === 'reasoning') {
        const base = { ...cur, text: e.data.text, streaming: false }
        items[oi] =
          cur.startedAt !== undefined ? { ...base, durationMs: e.time - cur.startedAt } : base
      }
      // 定稿闭合（W13）：清 open；seen 保留
      idxBox.idx = withTurn(idxBox.idx, e.data.turnId, {
        ...turnEntryOf(idxBox.idx, e.data.turnId),
        reasoningOpen: undefined,
      })
    } else {
      items.push({
        kind: 'reasoning',
        eventId: e.id,
        text: e.data.text,
        streaming: false,
        turnId: e.data.turnId,
      })
      idxBox.idx = withTurn(idxBox.idx, e.data.turnId, {
        ...turnEntryOf(idxBox.idx, e.data.turnId),
        reasoningSeen: true,
      })
    }
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'tool.started')) {
    // assistant.message 的 toolCall 展开可能已 push 同 callId 的 tool running——不重复建
    // （W13：callId 查询走索引；失配回退线性扫）
    const i = toolIndexOf(items, idxBox.idx, e.data.callId)
    items = [...items]
    if (i === -1) {
      items.push({
        kind: 'tool',
        eventId: e.id,
        callId: e.data.callId,
        name: e.data.name,
        input: e.data.input,
        status: 'running',
        progressBuf: '',
        startedAt: e.time,
      })
      idxBox.idx = withToolCall(idxBox.idx, e.data.callId, items.length - 1)
    }
    if (next.activeTurn !== null) {
      const running = new Set(next.activeTurn.runningTools)
      running.add(e.data.callId)
      next.activeTurn = { ...next.activeTurn, runningTools: running }
    }
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'tool.progress')) {
    // W13：高频路径——索引 O(1) 命中后原位替换，索引零维护（callId 不变）
    const i = toolIndexOf(items, idxBox.idx, e.data.callId)
    if (i >= 0) {
      const cur = items[i]
      if (cur !== undefined && cur.kind === 'tool') {
        items = [...items]
        items[i] = { ...cur, progressBuf: appendProgress(cur.progressBuf, e.data.chunk) }
        next.items = items
      }
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'tool.completed')) {
    const i = toolIndexOf(items, idxBox.idx, e.data.callId)
    if (i >= 0) {
      const cur = items[i]
      if (cur !== undefined && cur.kind === 'tool') {
        items = [...items]
        items[i] = {
          ...cur,
          status: e.data.isError ? 'error' : 'completed',
          output: e.data.output,
          durationMs: e.data.durationMs,
        }
        next.items = items
      }
    }
    if (next.activeTurn !== null) {
      const running = new Set(next.activeTurn.runningTools)
      running.delete(e.data.callId)
      next.activeTurn = { ...next.activeTurn, runningTools: running }
    }
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'permission.asked')) {
    items = [
      ...items,
      {
        kind: 'approval',
        eventId: e.id,
        requestId: e.data.requestId,
        action: e.data.action,
        resource: e.data.resource,
        reason: e.data.reason,
        ...(e.data.detail !== undefined ? { detail: e.data.detail } : {}),
        ...(e.data.patterns !== undefined ? { patterns: e.data.patterns } : {}),
        ...(e.data.alwaysPatterns !== undefined
          ? { alwaysPatterns: e.data.alwaysPatterns }
          : {}),
        status: 'pending',
      },
    ]
    idxBox.idx = withApproval(idxBox.idx, e.data.requestId, items.length - 1)
    next.items = items
    if (next.activeTurn !== null) next.activeTurn = { ...next.activeTurn, waiting: true }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'permission.resolved')) {
    // W13：requestId 查询走索引；失配回退线性扫
    const i = approvalIndexOf(items, idxBox.idx, e.data.requestId)
    if (i >= 0) {
      const cur = items[i]
      if (cur !== undefined && cur.kind === 'approval') {
        items = [...items]
        items[i] = { ...cur, status: 'resolved', reply: e.data.reply }
        next.items = items
      }
    }
    if (next.activeTurn !== null) next.activeTurn = { ...next.activeTurn, waiting: false }
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'io.warning')) {
    // 工单 7.2：护栏告警挂对应 tool 项（不阻断 turn——reducer 只记录，不改状态机）
    // W13：callId 查询走索引；失配回退线性扫
    const i = toolIndexOf(items, idxBox.idx, e.data.callId)
    if (i >= 0) {
      const cur = items[i]
      if (cur !== undefined && cur.kind === 'tool') {
        items = [...items]
        items[i] = {
          ...cur,
          guard: {
            kind: e.data.kind,
            rules: e.data.rules,
            ...(e.data.redacted !== undefined ? { redacted: e.data.redacted } : {}),
          },
        }
        next.items = items
      }
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'compaction.started')) {
    next.compacting = true
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'memory.injected')) {
    // 工单 7.5 / ADR D25：记忆注入落 slice（不进转录 items——模型可见面已在
    // 引擎事件流记录，UI 以状态徽标呈现注入发生）
    next.memoryInjected = { count: e.data.memories.length, query: e.data.query }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'compaction.completed')) {
    next.compacting = false
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'checkpoint.created')) {
    next.lastCheckpoint = { checkpointId: e.data.checkpointId, turnId: e.data.turnId }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'lsp.diagnostics')) {
    // 工单 16.9：诊断进会话流——每次 publish 一行卡（诊断清零也是一次真实发布，照常入流）
    items = [
      ...items,
      {
        kind: 'diagnostics',
        eventId: e.id,
        language: e.data.language,
        uri: e.data.uri,
        diagnostics: e.data.diagnostics,
      },
    ]
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'error')) {
    next.lastError = { scope: e.data.scope, message: e.data.message, fatal: e.data.fatal ?? false }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  // 词表穷尽由 apps/web tests/applyEvent.test.ts 逐条把关（AGENTS §2.8：新增事件类型必须同步本表与单测）
  return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
}
