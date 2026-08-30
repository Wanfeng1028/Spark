/**
 * applyEvent reducer（doc/02 §6.4 处理表 / D22 四端共享资产之二，工单 8.2 自 apps/web 下沉）：
 * 事件信封 → 会话投影（UiItem 序列与切片状态）的唯一纯函数，21 种词表逐一处理；
 * web（zustand 包装）与 cli（Ink 渲染）共用同一实现——词表穷尽性由 web 侧单测逐条把关。
 * 去重规则（回放×直播重叠）：durable（有 seq）且 seq <= lastSeq → 跳过；live（无 seq）无条件应用。
 */
import type { SparkEventEnvelope } from './events.js'
import type { Usage, ContentItem, TurnFinish } from './primitives.js'
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
  | ({ kind: 'assistant'; content: ContentItem[]; streaming?: { textBuf: string } } & UiItemBase)
  | ({
      kind: 'reasoning'
      text: string
      streaming?: boolean
      /** 首帧 reasoning.delta 信封时间——流式实时计时数据源（工单 10.4③） */
      startedAt?: number
      /** reasoning.ended 回填（信封时间差）——"持续了 N 秒"定格 */
      durationMs?: number
    } & UiItemBase)
  | ({
      kind: 'tool'
      callId: CallId
      name: string
      input: unknown
      status: 'running' | 'completed' | 'error'
      progressBuf: string
      output?: unknown
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

export function applyEvent(s: ProjectionState, e: SparkEventEnvelope): ProjectionState {
  const existing = s.byId[e.sessionId]
  // 去重入口（§6.4）：durable 且 seq <= lastSeq → 跳过（回放×直播重叠吸附）
  if (existing !== undefined && e.seq !== undefined && e.seq <= existing.lastSeq) return s

  const slice = existing ?? emptySessionSlice(e.sessionId)
  const next: SessionSlice = { ...slice, meta: { ...slice.meta } }
  if (e.seq !== undefined) next.lastSeq = Math.max(slice.lastSeq, e.seq)
  if (e.time > next.meta.updatedAt) next.meta.updatedAt = e.time

  let items = next.items
  const lastItem = (): UiItem | undefined => items[items.length - 1]

  if (ofType(e, 'session.created')) {
    next.meta = {
      id: e.sessionId,
      title: e.data.title ?? '',
      model: e.data.model,
      cwd: e.data.cwd,
      createdAt: e.time,
      updatedAt: e.time,
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
        const items = [...next.items]
        items[ti] = { ...cur, finishedAt: e.time, finish: e.data.finish }
        next.items = items
      }
    }
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'user.message')) {
    items = [...items, { kind: 'user', eventId: e.id, text: e.data.text }]
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'assistant.delta')) {
    const cur = lastItem()
    if (cur !== undefined && cur.kind === 'assistant') {
      const streaming = cur.streaming ?? { textBuf: '' }
      items = [...items]
      items[items.length - 1] = { ...cur, streaming: { textBuf: streaming.textBuf + e.data.text } }
    } else {
      items = [
        ...items,
        { kind: 'assistant', eventId: e.id, content: [], streaming: { textBuf: e.data.text } },
      ]
    }
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'assistant.message')) {
    // 定稿：清 streaming；按 content 展开——text 定稿，toolCall → push tool running（§6.4 处理表）
    items = [...items]
    const last = items[items.length - 1]
    if (last !== undefined && last.kind === 'assistant') {
      // 定稿即清除 streaming（解构剥离，勿留 undefined 键——exactOptionalPropertyTypes）
      const { streaming: finalized, ...rest } = last
      void finalized
      items[items.length - 1] = { ...rest, content: e.data.content }
    } else {
      items.push({ kind: 'assistant', eventId: e.id, content: e.data.content })
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
    const cur = lastItem()
    if (cur !== undefined && cur.kind === 'reasoning') {
      items = [...items]
      items[items.length - 1] = { ...cur, text: cur.text + e.data.text, streaming: true }
    } else {
      items = [
        ...items,
        { kind: 'reasoning', eventId: e.id, text: e.data.text, streaming: true, startedAt: e.time },
      ]
    }
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'reasoning.ended')) {
    const cur = lastItem()
    if (cur !== undefined && cur.kind === 'reasoning') {
      items = [...items]
      const base = { ...cur, text: e.data.text, streaming: false }
      items[items.length - 1] =
        cur.startedAt !== undefined ? { ...base, durationMs: e.time - cur.startedAt } : base
    } else {
      items = [...items, { kind: 'reasoning', eventId: e.id, text: e.data.text, streaming: false }]
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
