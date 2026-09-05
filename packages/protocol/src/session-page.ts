/**
 * 会话页控制器（工单 R-H；Q-8 拍板：纯逻辑状态机入 protocol）——mobile/miniapp
 * 会话页约 200 行逻辑级重复（装载回放+开流 / 翻页合并重放 / 发送 / 审批 / notice
 * 自清）的平台无关单源。回调式状态机，零 React/平台依赖；端侧只留 5–10 行薄 hook
 * 接线（REST 工厂 + 平台事件流工厂 + 渲染）。
 *
 * 行为契约（与两端原实现逐条对应，评审 H2/H3/H4 修复在位）：
 * - 装载：最新一页回放（批处理投影）→ 以水位开续播流；取页失败退化 since=0 直接
 *   开流（H2——不留"取页失败即永不开流"的空白卡死路径）；
 * - 重放重复帧（durable 且 seq 在水位内）不入窗（H4，与 applyEvent 去重同口径）；
 * - 翻页：较旧页升序前置合并 + 全量重放重建投影（升序红线）；
 * - 审批复读闸门（H3：快速双击不二次发 replyPermission）；
 * - notice 5s 自清（不留陈旧错误冒充现状）。
 */
import type { SparkEventEnvelope } from './events.js'
import type { EventId, RequestId, SessionId } from './ids.js'
import type { PermissionReply } from './primitives.js'
import type { StreamConnectionStatus } from './session-stream-core.js'
import type { Transport } from './transport.js'
import type { SessionDto } from './api.js'
import {
  applyEvent,
  emptySessionSlice,
  type ProjectionState,
  type SessionSlice,
} from './apply-event.js'

/** 会话页一帧快照（端侧 onUpdate 全量收；浅拷贝字段，UI 不可变渲染） */
export interface SessionPageSnapshot {
  slice: SessionSlice
  status: StreamConnectionStatus
  notice: string | null
  hasMore: boolean
  loadingOlder: boolean
  sending: boolean
  approvalBusy: boolean
}

/** REST 子集（回放/发送/中断/审批）；未配对返回 null（页面呈现未配置态） */
export type SessionPageRest = () => Pick<
  Transport,
  'getSession' | 'sendMessage' | 'interrupt' | 'replyPermission'
> | null

/** 平台事件流句柄（dispose 收口——卸载/重开时由 controller 调用） */
export interface SessionPageStreamHandle {
  dispose(): void
}

/** 平台事件流工厂：since 由 controller 回放后给定；重放与直播重叠由 seq 去重 */
export type SessionPageStreamOpener = (
  since: number,
  handlers: {
    onEvent: (e: SparkEventEnvelope) => void
    onStatus: (s: StreamConnectionStatus) => void
    onError: (err: unknown) => void
  },
) => SessionPageStreamHandle

export interface SessionPageController {
  /** 装载最新一页并开续播流（幂等——重复调用前先自行收口上一轮） */
  start(): void
  /** 卸载收口：关流 + flush 挂起批（apply 在 dispose 后不再回调） */
  dispose(): void
  /** 向上翻页：较旧一页升序合并 + 全量重放 */
  loadOlder(): Promise<void>
  send(text: string): Promise<void>
  stop(): Promise<void>
  reply(requestId: RequestId, reply: PermissionReply): Promise<void>
  /** 行时间戳（会话行时间分隔渲染用） */
  timeOf(id: EventId): number | undefined
}

/** 事件批处理（RN/Taro 两 store 同构实现收敛）：缓冲 + 平台调度合并为一帧 */
export interface EventBatcher {
  enqueue: (e: SparkEventEnvelope) => void
  flushNow: () => void
}

export function createEventBatcher(
  apply: (e: SparkEventEnvelope) => void,
  schedule: (fn: () => void) => void = (fn) => {
    setTimeout(fn, 0)
  },
): EventBatcher {
  const buf: SparkEventEnvelope[] = []
  let pending = false
  const flush = (): void => {
    pending = false
    const batch = buf.splice(0)
    for (const e of batch) apply(e)
  }
  return {
    enqueue: (e) => {
      buf.push(e)
      if (!pending) {
        pending = true
        schedule(flush)
      }
    },
    flushNow: flush,
  }
}

/** 重放重复帧判定（H4）：durable 且 seq 已在水位内 → 重复帧 */
export function isReplayedDuplicate(e: { seq?: number }, watermark: number): boolean {
  return e.seq !== undefined && e.seq <= watermark
}

/**
 * 翻页合并：较旧页升序前置（before=最早seq 语义保证页整体早于既有窗口且页内
 * 升序——直接前置即得正确重放序）。幂等：同页重复合并不产生重复（弱网重试安全）。
 */
export function mergeEventPage(
  olderPage: readonly SparkEventEnvelope[],
  existing: readonly SparkEventEnvelope[],
): SparkEventEnvelope[] {
  const seen = new Set(existing.map((e) => e.id))
  return [...olderPage.filter((e) => !seen.has(e.id)), ...existing]
}

export function createSessionPageController(opts: {
  sessionId: SessionId
  pageSize?: number
  rest: SessionPageRest
  openStream: SessionPageStreamOpener
  onUpdate: (s: SessionPageSnapshot) => void
  /** 批处理调度注入（RN= RAF / Taro= setTimeout 16ms；缺省立即） */
  schedule?: (fn: () => void) => void
  /** notice 自清时长（缺省 5000ms；测试可注入 0） */
  noticeMs?: number
}): SessionPageController {
  const sid = opts.sessionId
  const pageSize = opts.pageSize ?? 50
  const noticeMs = opts.noticeMs ?? 5000

  // 窗口与投影（与两端原 ref 布局一一对应）
  let events: SparkEventEnvelope[] = []
  const times = new Map<EventId, number>()
  let watermark = 0
  let slice: SessionSlice = emptySessionSlice(sid)

  let status: StreamConnectionStatus = 'connecting'
  let notice: string | null = null
  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  let hasMore = true
  let loadingOlder = false
  let sending = false
  let approvalBusy = false
  let disposed = false
  let stream: SessionPageStreamHandle | null = null
  let batcher: EventBatcher | null = null

  const emit = (): void => {
    opts.onUpdate({
      slice,
      status,
      notice,
      hasMore,
      loadingOlder,
      sending,
      approvalBusy,
    })
  }

  const setNotice = (message: string): void => {
    notice = message
    emit()
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      notice = null
      noticeTimer = null
      emit()
    }, noticeMs)
  }

  // 单事件入投影（batcher 回调）：H4 重复帧闸门 + 水位/时间窗维护
  const applyLocal = (e: SparkEventEnvelope): void => {
    if (isReplayedDuplicate(e, watermark)) return
    events.push(e)
    times.set(e.id, e.time)
    if (e.seq !== undefined && e.seq > watermark) watermark = e.seq
    slice = applyEvent({ byId: { [sid]: slice }, activeId: sid }, e).byId[sid] ?? slice
    emit()
  }

  return {
    start() {
      if (batcher !== null) this.dispose()
      if (disposed) return
      batcher = createEventBatcher(applyLocal, opts.schedule)

      void (async () => {
        const transport = opts.rest()
        if (transport === null || disposed) return
        let replayOk = false
        try {
          const dto: SessionDto = await transport.getSession(sid, { limit: pageSize })
          if (disposed) return
          const page = dto.events ?? []
          if (page.length < pageSize) hasMore = false
          for (const e of page) batcher?.enqueue(e)
          batcher?.flushNow()
          replayOk = true
        } catch (err: unknown) {
          if (!disposed) setNotice(err instanceof Error ? err.message : String(err))
        }
        if (disposed) return
        // 续播流：since=回放水位（重放与直播重叠由 applyEvent seq 去重）；
        // H2：取页失败退化为 since=0 直接开流——不留空白卡死路径
        stream = opts.openStream(replayOk ? watermark : 0, {
          onEvent: (e) => batcher?.enqueue(e),
          onStatus: (s) => {
            status = s
            emit()
          },
          onError: (err) => setNotice(err instanceof Error ? err.message : String(err)),
        })
        emit()
      })()
      emit()
    },

    dispose() {
      disposed = true
      stream?.dispose()
      stream = null
      batcher?.flushNow()
      batcher = null
      if (noticeTimer !== null) {
        clearTimeout(noticeTimer)
        noticeTimer = null
      }
    },

    async loadOlder() {
      if (loadingOlder || !hasMore || disposed) return
      const transport = opts.rest()
      if (transport === null) return
      const oldest = events.find((e) => e.seq !== undefined)
      if (oldest === undefined || oldest.seq === undefined) return
      loadingOlder = true
      emit()
      try {
        const dto = await transport.getSession(sid, { limit: pageSize, before: oldest.seq })
        const page = dto.events ?? []
        if (page.length < pageSize) hasMore = false
        if (page.length === 0) return
        const merged = mergeEventPage(page, events)
        // 全量重放（升序红线）：较旧事件不得增量叠加在较新投影之后
        let state: ProjectionState = { byId: {}, activeId: sid }
        const nextTimes = new Map<EventId, number>()
        for (const e of merged) {
          nextTimes.set(e.id, e.time)
          state = applyEvent(state, e)
        }
        events = merged
        times.clear()
        for (const [k, v] of nextTimes) times.set(k, v)
        slice = state.byId[sid] ?? emptySessionSlice(sid)
        emit()
      } catch (err: unknown) {
        setNotice(err instanceof Error ? err.message : String(err))
      } finally {
        loadingOlder = false
        emit()
      }
    },

    async send(text: string) {
      const transport = opts.rest()
      if (transport === null) return
      sending = true
      emit()
      try {
        await transport.sendMessage(sid, text)
      } catch (err: unknown) {
        setNotice(err instanceof Error ? err.message : String(err))
      } finally {
        sending = false
        emit()
      }
    },

    async stop() {
      const transport = opts.rest()
      if (transport === null) return
      try {
        await transport.interrupt(sid)
      } catch (err: unknown) {
        setNotice(err instanceof Error ? err.message : String(err))
      }
    },

    async reply(requestId: RequestId, reply: PermissionReply) {
      // H3 防抖闸门：快速双击不二次发 replyPermission（服务端 409 安全，但误导性错误条）
      if (approvalBusy || disposed) return
      const transport = opts.rest()
      if (transport === null) return
      approvalBusy = true
      emit()
      try {
        await transport.replyPermission(requestId, reply)
      } catch (err: unknown) {
        setNotice(err instanceof Error ? err.message : String(err))
      } finally {
        approvalBusy = false
        emit()
      }
    },

    // 箭头属性：端侧可安全解绑引用（闭包取 times，不经 this）
    timeOf: (id: EventId): number | undefined => times.get(id),
  }
}
