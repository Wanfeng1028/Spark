/**
 * session-store（doc/02 §6.4）：applyEvent reducer 是唯一写入口，reduce 为纯函数（单测对象）。
 * 去重规则（回放×直播重叠）：durable（有 seq）且 seq <= lastSeq → 跳过；live（无 seq）无条件应用。
 * UI 状态只来自事件流（AGENTS §2「UI 状态只来自事件流」）——本文件不含任何 fetch 与假状态。
 */
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type {
  CallId,
  ContentItem,
  EventId,
  RequestId,
  SessionId,
  TurnId,
  Usage,
} from '@spark/protocol'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'

// ---------- UiItem（§6.4 类型表） ----------

interface UiItemBase {
  eventId: EventId
  parentId?: EventId
}

export type UiItem =
  | ({ kind: 'user'; text: string } & UiItemBase)
  | ({ kind: 'assistant'; content: ContentItem[]; streaming?: { textBuf: string } } & UiItemBase)
  | ({ kind: 'reasoning'; text: string; streaming?: boolean } & UiItemBase)
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
  /** turn.completed finish==='error' 设；下一次 turn.started 清（§6.4 处理表） */
  topBanner: { kind: 'turn-error'; turnId: TurnId } | null
  /** compaction.started/completed 的顶部细条（§6.4 处理表） */
  compacting: boolean
  /** checkpoint.created 的 StatusBar 短暂徽标数据源 */
  lastCheckpoint: { checkpointId: string; turnId: TurnId } | null
  /** 最近一条 error 事件（toast / fatal 全屏错误态的数据源） */
  lastError: { scope: 'engine' | 'llm' | 'tool' | 'io'; message: string; fatal: boolean } | null
}

// ---------- state ----------

export interface SessionStoreState {
  byId: Record<SessionId, SessionSlice>
  activeId: SessionId | null
  applyEvent: (e: SparkEventEnvelope) => void
  resetSlice: (sid: SessionId) => void
  /** 路由激活（SessionPage 挂载即设；StatusBar/Sidebar 的「当前会话」数据源） */
  setActiveId: (sid: SessionId) => void
}

const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
  costUsd: 0,
}

function emptySlice(sid: SessionId): SessionSlice {
  return {
    meta: { id: sid, title: '', model: '', cwd: '', createdAt: 0, updatedAt: 0 },
    items: [],
    activeTurn: null,
    lastSeq: 0,
    usageTotal: { ...ZERO_USAGE },
    topBanner: null,
    compacting: false,
    lastCheckpoint: null,
    lastError: null,
  }
}

const EMPTY_ARRAY: UiItem[] = []
const EMPTY_META: SessionMeta = {
  id: ids.session(''),
  title: '',
  model: '',
  cwd: '',
  createdAt: 0,
  updatedAt: 0,
}

// ---------- reduce：§6.4 处理表（20 种全覆盖） ----------

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

export function reduce(s: SessionStoreState, e: SparkEventEnvelope): SessionStoreState {
  const existing = s.byId[e.sessionId]
  // 去重入口（§6.4）：durable 且 seq <= lastSeq → 跳过（回放×直播重叠吸附）
  if (existing !== undefined && e.seq !== undefined && e.seq <= existing.lastSeq) return s

  const slice = existing ?? emptySlice(e.sessionId)
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
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'turn.completed')) {
    next.activeTurn = null
    next.usageTotal = addUsage(next.usageTotal, e.data.usage)
    if (e.data.finish === 'error') next.topBanner = { kind: 'turn-error', turnId: e.data.turnId }
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
      items = [...items, { kind: 'reasoning', eventId: e.id, text: e.data.text, streaming: true }]
    }
    next.items = items
    return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
  }

  if (ofType(e, 'reasoning.ended')) {
    const cur = lastItem()
    if (cur !== undefined && cur.kind === 'reasoning') {
      items = [...items]
      items[items.length - 1] = { ...cur, text: e.data.text, streaming: false }
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

  // 词表穷尽由 tests/applyEvent.test.ts 逐条把关（AGENTS §2.8：新增事件类型必须同步本表与单测）
  return { ...s, byId: { ...s.byId, [e.sessionId]: next } }
}

// ---------- store（create 只做绑定；§6.4 骨架） ----------

export const useSessionStore = create<SessionStoreState>()((set) => ({
  byId: {},
  activeId: null,
  applyEvent: (e) => set((s) => reduce(s, e)),
  resetSlice: (sid) => set((s) => ({ byId: { ...s.byId, [sid]: emptySlice(sid) } })),
  setActiveId: (sid) => set({ activeId: sid }),
}))

// ---------- 选择器（shallow 比较——只有引用变化的 slice 重渲染） ----------

export const useSessionItems = (sid: SessionId): UiItem[] =>
  useSessionStore(useShallow((s) => s.byId[sid]?.items ?? EMPTY_ARRAY))

export const useActiveTurn = (sid: SessionId): ActiveTurn | null =>
  useSessionStore((s) => s.byId[sid]?.activeTurn ?? null)

export const useSessionMeta = (sid: SessionId): SessionMeta =>
  useSessionStore((s) => s.byId[sid]?.meta ?? EMPTY_META)

export const useLastSeq = (sid: SessionId): number =>
  useSessionStore((s) => s.byId[sid]?.lastSeq ?? 0)

/** StatusBar：当前激活会话 slice（无会话时 null——如实显示，不造假） */
export const useActiveSlice = (): SessionSlice | null =>
  useSessionStore((s) => (s.activeId === null ? null : (s.byId[s.activeId] ?? null)))
