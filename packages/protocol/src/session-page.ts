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
 * - notice 5s 自清（不留陈旧错误冒充现状）；
 * - dispose 闸门（AUD-09）：dispose 后一切回调静默——emit/setNotice 早退、在途请求
 *   resolve 后整体丢弃（端侧换 controller 时旧快照不得写进新页面的 setSnap）。
 */
import type { SparkEventEnvelope } from './events.js'
import type { EventId, RequestId, SessionId } from './ids.js'
import type { PermissionReply } from './primitives.js'
import type { StreamConnectionStatus } from './session-stream-core.js'
import type { Transport } from './transport.js'
import type { SessionDto } from './api.js'
import {
  addUsage,
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

// ---------- 19.42 A：守卫式 prefix-merge（W12-FOLLOW） ----------

/** 事件载荷中的关联 id（turnId/callId/requestId）——守卫①「两段不相交」的判定数据源 */
export function payloadIdsOf(e: SparkEventEnvelope, out: Set<string>): Set<string> {
  const d: unknown = e.data
  if (typeof d === 'object' && d !== null) {
    const rec = d as { turnId?: unknown; callId?: unknown; requestId?: unknown }
    if (typeof rec.turnId === 'string') out.add(rec.turnId)
    if (typeof rec.callId === 'string') out.add(rec.callId)
    if (typeof rec.requestId === 'string') out.add(rec.requestId)
  }
  return out
}

/**
 * 守卫②③：P（前缀自空折叠）可合并的充分条件——activeTurn 为 null（前缀落在回合边界）
 * 且全部歧义字段都在缺省值。歧义字段缺省 ⇒ 「该字段取 P 还是取 E」问题消失：
 * P 侧是缺省值，写过取 E、没写 E 也是缺省值，两边同值，故 M.f = E.f 恒成立。
 * （不选「哪类事件写哪个字段」的表：那张表必然与 reducer 漂移，且写不写依赖数据。）
 */
export function prefixMergeable(P: SessionSlice): boolean {
  return (
    P.activeTurn === null && // 守卫②
    P.mode === 'default' && // 守卫③：以下九项歧义字段全缺省
    P.topBanner === null &&
    P.compacting === false &&
    P.goal === null &&
    P.lastError === null &&
    P.lastCheckpoint === null &&
    P.memoryInjected === null &&
    P.contextUsage === null
  )
}

/**
 * 守卫式 prefix-merge：fold(P_events ++ E_events) ≈ merge(P, E)。
 * 前提：prefixMergeable(P)（守卫②③）且两段载荷 id 集**不相交**（守卫①，调用方判定）——
 * 相交意味着新段的 tool.result 命中旧段的 tool.call，items 拼接不再等价。
 * 合并规则：items 前后拼接、usageTotal 相加（reducer 仅 addUsage 累加无整体赋值，
 * 可加性已核）、lastSeq 取 max、meta 逐字段非缺省者胜 + createdAt 取 min + updatedAt 取 max。
 * 守卫不成立时调用方**必须**回落全量重放——最坏等于不优化，不改变结果。
 */
export function mergePrefixSlice(P: SessionSlice, E: SessionSlice): SessionSlice {
  const nonEmpty = (v: string, fallback: string): string => (v !== '' ? v : fallback)
  const branch = E.meta.branch ?? P.meta.branch
  const effort = E.meta.effort ?? P.meta.effort
  return {
    meta: {
      id: E.meta.id,
      title: nonEmpty(E.meta.title, P.meta.title),
      model: nonEmpty(E.meta.model, P.meta.model),
      cwd: nonEmpty(E.meta.cwd, P.meta.cwd),
      createdAt:
        E.meta.createdAt > 0 && P.meta.createdAt > 0
          ? Math.min(E.meta.createdAt, P.meta.createdAt)
          : Math.max(E.meta.createdAt, P.meta.createdAt),
      updatedAt: Math.max(E.meta.updatedAt, P.meta.updatedAt),
      ...(branch !== undefined ? { branch } : {}),
      ...(effort !== undefined ? { effort } : {}),
    },
    items: [...P.items, ...E.items],
    activeTurn: E.activeTurn, // 守卫②保证 P.activeTurn === null
    lastSeq: Math.max(P.lastSeq, E.lastSeq),
    usageTotal: addUsage(P.usageTotal, E.usageTotal),
    // 守卫③保证 P 的歧义字段全缺省 → 全部取 E
    contextUsage: E.contextUsage,
    topBanner: E.topBanner,
    compacting: E.compacting,
    lastCheckpoint: E.lastCheckpoint,
    lastError: E.lastError,
    memoryInjected: E.memoryInjected,
    mode: E.mode,
    goal: E.goal,
  }
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
  const events: SparkEventEnvelope[] = []
  /** W12：增量维护已见事件 ID，避免 loadOlder 每次 O(n) 重建 Set（mergeEventPage 内部行为） */
  const seenIds = new Set<EventId>()
  const times = new Map<EventId, number>()
  /** 19.42 A 守卫①的 E 侧数据源：窗口事件的载荷 id 集（applyLocal 增量维护，O(1)/事件） */
  const windowIds = new Set<string>()
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
    // AUD-09：dispose 后静默——旧 controller 不得再回调端侧 onUpdate
    if (disposed) return
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
    // AUD-09：dispose 后不重建错误条、不新建 notice 定时器
    if (disposed) return
    notice = message
    emit()
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      // dispose 已清定时器，此处兜防 await 之后新建的定时器在 dispose 后触发
      if (disposed) return
      notice = null
      noticeTimer = null
      emit()
    }, noticeMs)
  }

  // 单事件入投影（batcher 回调）：H4 重复帧闸门 + 水位/时间窗维护
  const applyLocal = (e: SparkEventEnvelope): void => {
    if (isReplayedDuplicate(e, watermark)) return
    events.push(e)
    seenIds.add(e.id) // W12：同步维护，loadOlder 过滤 O(1) 查询
    times.set(e.id, e.time)
    payloadIdsOf(e, windowIds) // 19.42 A：守卫① E 侧增量维护
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
        // AUD-09：await 期间被销毁——丢弃旧页，不重建切片（emit 闸门在 finally 兜底）
        if (disposed) return
        const page = dto.events ?? []
        if (page.length < pageSize) hasMore = false
        // W12：用增量维护的 seenIds 做 O(m) 过滤，避免 mergeEventPage 每次 O(n) 重建 Set
        const newOlder = page.filter((e) => !seenIds.has(e.id))
        if (newOlder.length === 0) return
        // W12：原地前置，避免 O(n+m) 新数组分配（mergeEventPage 语义等价，公共 API 不变）
        events.unshift(...newOlder)
        for (const e of newOlder) {
          seenIds.add(e.id)
          times.set(e.id, e.time) // W12：O(m) 增量写入，避免 O(n) 全量重建 nextTimes
        }
        // 19.42 A（守卫式 prefix-merge）：P = 新前缀页自空折叠（O(m²)，m=pageSize 常数）；
        // 守卫①两段载荷 id 不相交 + 守卫②③（prefixMergeable）成立时 O(n) 拼接合并，
        // 否则回落原全量重放（O(n²)/页）——最坏等于不优化，结果两种路径恒等。
        let state: ProjectionState = { byId: {}, activeId: sid }
        for (const e of newOlder) {
          state = applyEvent(state, e)
        }
        const prefix = state.byId[sid] ?? emptySessionSlice(sid)
        const prefixIds = new Set<string>()
        for (const e of newOlder) payloadIdsOf(e, prefixIds)
        let disjoint = true
        for (const id of prefixIds) {
          if (windowIds.has(id)) {
            disjoint = false
            break
          }
        }
        if (prefixMergeable(prefix) && disjoint) {
          slice = mergePrefixSlice(prefix, slice)
          for (const id of prefixIds) windowIds.add(id)
        } else {
          // 回落：全量重放（升序红线——较旧事件不得增量叠加在较新投影之后）
          let full: ProjectionState = { byId: {}, activeId: sid }
          for (const e of events) {
            full = applyEvent(full, e)
          }
          slice = full.byId[sid] ?? emptySessionSlice(sid)
          for (const e of newOlder) payloadIdsOf(e, windowIds)
        }
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
