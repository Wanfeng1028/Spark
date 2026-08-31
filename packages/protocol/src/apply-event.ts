/**
 * applyEvent reducer（doc/02 §6.4 处理表 / D22 四端共享资产之二，工单 8.2 自 apps/web 下沉）：
 * 事件信封 → 会话投影（UiItem 序列与切片状态）的唯一纯函数，21 种词表逐一处理；
 * web（zustand 包装）与 cli（Ink 渲染）共用同一实现——词表穷尽性由 web 侧单测逐条把关。
 * 去重规则（回放×直播重叠）：durable（有 seq）且 seq <= lastSeq → 跳过；live（无 seq）无条件应用。
 */
import type { SparkEventEnvelope } from './events.js'
import type { Usage, ContentItem, TurnFinish, ReasoningEffort } from './primitives.js'
import type { CallId, EventId, RequestId, SessionId, TurnId } from './ids.js'

// ---------- UiItem（§6.4 类型表） ----------

interface UiItemBase {
  eventId: EventId
  parentId?: EventId
}

export type UiItem =
  | ({ kind: 'user'; text: string } & UiItemBase)
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
  }
}

// ---------- reduce：§6.4 处理表（21 种全覆盖） ----------

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

/** 该 turn 是否已有同类项（无论闭合与否）——迟到 delta 判定用（工单 10.13） */
function hasKindOfTurn(items: UiItem[], turnId: TurnId, kind: 'reasoning' | 'assistant'): boolean {
  return items.some((it) => it.kind === kind && it.turnId === turnId)
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

export function applyEvent(s: ProjectionState, e: SparkEventEnvelope): ProjectionState {
  const existing = s.byId[e.sessionId]
  // 去重入口（§6.4）：durable 且 seq <= lastSeq → 跳过（回放×直播重叠吸附）
  if (existing !== undefined && e.seq !== undefined && e.seq <= existing.lastSeq) return s

  const slice = existing ?? emptySessionSlice(e.sessionId)
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
    // 就地闭合——未闭合 reasoning 计时器必停（实测假"578 秒"），已交付前缀不丢
    const swept = closeStreamingOfTurn(next.items, e.data.turnId, e.time)
    if (swept !== null) next.items = swept
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'user.message')) {
    items = [...items, { kind: 'user', eventId: e.id, text: e.data.text }]
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'assistant.delta')) {
    // 工单 10.13：追加到本 turn 未闭合的流式项（位置判断改 turnId 配对）
    const oi = findOpenAssistant(next.items, e.data.turnId)
    if (oi >= 0) {
      const cur = next.items[oi]
      if (cur !== undefined && cur.kind === 'assistant') {
        const streaming = cur.streaming ?? { textBuf: '' }
        const arr = [...next.items]
        arr[oi] = { ...cur, streaming: { textBuf: streaming.textBuf + e.data.text } }
        next.items = arr
      }
    } else if (hasKindOfTurn(next.items, e.data.turnId, 'assistant')) {
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
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'assistant.message')) {
    // 定稿：按 turnId 反查未闭合流式项并吸附（工单 10.13——真实发射序下定稿后置，
    // lastItem 位置判断失效）；未命中才新建（失败闭合兜底——纯回放无 delta 也成单项，不静默丢弃）
    items = [...items]
    const oi = findOpenAssistant(items, e.data.turnId)
    if (oi >= 0) {
      const cur = items[oi]
      if (cur !== undefined && cur.kind === 'assistant') {
        // 定稿即清除 streaming（解构剥离，勿留 undefined 键——exactOptionalPropertyTypes）
        const { streaming: finalized, ...rest } = cur
        void finalized
        items[oi] = { ...rest, content: e.data.content }
      }
    } else {
      items.push({
        kind: 'assistant',
        eventId: e.id,
        content: e.data.content,
        time: e.time,
        turnId: e.data.turnId,
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
    const oi = findOpenReasoning(next.items, e.data.turnId)
    if (oi >= 0) {
      const cur = next.items[oi]
      if (cur !== undefined && cur.kind === 'reasoning') {
        const arr = [...next.items]
        arr[oi] = { ...cur, text: cur.text + e.data.text, streaming: true }
        next.items = arr
      }
    } else if (hasKindOfTurn(next.items, e.data.turnId, 'reasoning')) {
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
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'reasoning.ended')) {
    // 按 turnId 反查未闭合流式项并定稿（工单 10.13——真实发射序下 reasoning.ended
    // 到达时末项往往是 assistant 流式项，位置判断失效）；未命中才新建定稿项
    // （失败闭合兜底——纯回放无 delta 也成单项，不静默丢弃）
    items = [...items]
    const oi = findOpenReasoning(items, e.data.turnId)
    if (oi >= 0) {
      const cur = items[oi]
      if (cur !== undefined && cur.kind === 'reasoning') {
        const base = { ...cur, text: e.data.text, streaming: false }
        items[oi] =
          cur.startedAt !== undefined ? { ...base, durationMs: e.time - cur.startedAt } : base
      }
    } else {
      items.push({
        kind: 'reasoning',
        eventId: e.id,
        text: e.data.text,
        streaming: false,
        turnId: e.data.turnId,
      })
    }
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'tool.started')) {
    // assistant.message 的 toolCall 展开可能已 push 同 callId 的 tool running——不重复建
    const i = items.findIndex((it) => it.kind === 'tool' && it.callId === e.data.callId)
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
    const i = items.findIndex((it) => it.kind === 'tool' && it.callId === e.data.callId)
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
    const i = items.findIndex((it) => it.kind === 'tool' && it.callId === e.data.callId)
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
    next.items = items
    if (next.activeTurn !== null) next.activeTurn = { ...next.activeTurn, waiting: true }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'permission.resolved')) {
    const i = items.findIndex((it) => it.kind === 'approval' && it.requestId === e.data.requestId)
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
    const i = items.findIndex((it) => it.kind === 'tool' && it.callId === e.data.callId)
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

  if (ofType(e, 'error')) {
    next.lastError = { scope: e.data.scope, message: e.data.message, fatal: e.data.fatal ?? false }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  // 词表穷尽由 apps/web tests/applyEvent.test.ts 逐条把关（AGENTS §2.8：新增事件类型必须同步本表与单测）
  return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
}
