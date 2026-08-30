/**
 * 会话页（工单 9.4——语义对齐 apps/mobile SessionScreen，DESIGN §13.J.2.3/J.3）。
 *
 * 数据通道：打开会话 = REST 最新一页（?limit=）升序回放 + MiniSessionEventSource
 * 续播流（since=回放水位；SSE 分块主路径，低基础库/异常自动降级轮询）；
 * 事件经时间窗批处理（24ms，setData 频次敏感）进本地投影（applyEvent，D22 共享）。
 * 上拉到顶向上翻页（?limit=&before=最早seq），本地升序合并后全量重放重建投影。
 * 时间戳分隔需事件时间而 UiItem 无 time 字段——页面层维护 eventId→time 侧表。
 * 错误文案一律 ERROR_COPY/errorMessageOf（ADR D22，禁自造文案）。
 *
 * 小程序差异：无 inverted FlatList——ScrollView 正向渲染，贴底判定用
 * scrollTop+clientHeight≥scrollHeight-阈值，贴底时新消息 scrollTop=大值跟随；
 * 上拉到顶 = onScrollToUpper（替代 onEndReached 反向语义）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type { BaseEventOrig, ScrollViewProps } from '@tarojs/components'
import type {
  EventId,
  PermissionReply,
  ProjectionState,
  RequestId,
  SessionSlice,
  SparkEventEnvelope,
} from '@spark/protocol'
import { applyEvent, emptySessionSlice, errorMessageOf, ids } from '@spark/protocol'
import { useConfigStore } from '../../store/config-store'
import { useTheme } from '../../store/theme-store'
import { createEventBatcher, useAppStore } from '../../store/app-store'
import type { EventBatcher } from '../../store/app-store'
import { getRestClient, openSessionStream } from '../../transport/runtime'
import type { MiniSessionEventSource } from '../../transport/mini-event-source'
import {
  buildSessionRows,
  formatTimestamp,
  isReplayedDuplicate,
  mergeEventPage,
} from '../../session/session-rows'
import {
  ApprovalCard,
  AssistantBlock,
  ReasoningCard,
  ToolCard,
  UserBubble,
} from '../../components/session-items'
import { Composer } from '../../components/composer'
import { EmptyState, FloatButton } from '../../components/ui'
import './index.css'

/** 上拉翻页页长（服务端上限 200；50 条兼顾首屏速度与翻页次数） */
const PAGE_SIZE = 50

/** 连接细条人话文案（同 web CONNECTION_TEXT 口径，D22 同律；
 * closed 态文案同 ERROR_COPY 风格——鉴权终态不静默，评审 I2） */
const CONNECTION_TEXT: Record<'connecting' | 'reconnecting' | 'closed', string> = {
  connecting: '连接中…',
  reconnecting: '已断线，重连中…',
  closed: '连接已停止：鉴权失败，请到设置页重新配对',
}

/** 贴底判定阈值（px）：距底 40 以内视作贴底 */
const BOTTOM_THRESHOLD = 40

export default function SessionPage() {
  const t = useTheme()
  const router = useRouter()
  const sid = ids.session(router.params.sessionId ?? '')
  const title = decodeURIComponent(router.params.title ?? '')

  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const status = useAppStore((s) => s.status)
  const notice = useAppStore((s) => s.notice)
  const setNotice = useAppStore((s) => s.setNotice)
  const setStatus = useAppStore((s) => s.setStatus)

  const [slice, setSlice] = useState<SessionSlice>(() => emptySessionSlice(sid))
  const [sending, setSending] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState(false)
  // 防抖闸门用 ref（回调闭包内即时可读；state 仅供三键 disabled 渲染，同 RN 评审 H3）
  const approvalBusyRef = useRef(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)

  // 本地事件窗 + 时间侧表（分页合并/重放/时间戳分隔的数据源；ref 不触发渲染）
  const eventsRef = useRef<SparkEventEnvelope[]>([])
  const timesRef = useRef<Map<EventId, number>>(new Map())
  const watermarkRef = useRef(0)
  const hasMoreRef = useRef(true)
  const loadingOlderRef = useRef(false)
  const batcherRef = useRef<EventBatcher | null>(null)
  const streamRef = useRef<MiniSessionEventSource | null>(null)
  const atBottomRef = useRef(true)
  atBottomRef.current = atBottom
  // ScrollView 视口高度（贴底判定用；onScrollDetail 无 clientHeight，挂载时测量）
  const viewportHeightRef = useRef(0)

  useEffect(() => {
    void Taro.createSelectorQuery()
      .select('.sp-list')
      .boundingClientRect()
      .exec((res: unknown[]) => {
        const rect: unknown = res[0]
        if (
          typeof rect === 'object' &&
          rect !== null &&
          'height' in rect &&
          typeof rect.height === 'number'
        ) {
          viewportHeightRef.current = rect.height
        }
      })
  }, [])

  // 导航栏标题 = 会话标题（原生导航替代 RN ScreenHeader）
  useEffect(() => {
    void Taro.setNavigationBarTitle({ title: title !== '' ? title : '新会话' })
  }, [title])

  // 打开会话：最新一页回放（批处理投影）→ 以水位开续播流
  useEffect(() => {
    let cancelled = false
    const rest = getRestClient(serverUrl, token)
    if (rest === null) {
      setNotice('未配置服务器：请先在设置页完成配对')
      return () => undefined
    }

    const applyLocal = (e: SparkEventEnvelope): void => {
      // 重连后服务端按旧水位重放——带 seq 且已在水位内即重复帧，不入窗
      // （与 applyEvent 去重同口径），防重复信封致列表重复 key（同 RN 评审 H4）
      if (isReplayedDuplicate(e, watermarkRef.current)) return
      eventsRef.current.push(e)
      timesRef.current.set(e.id, e.time)
      if (e.seq !== undefined && e.seq > watermarkRef.current) watermarkRef.current = e.seq
      setSlice((s) => applyEvent({ byId: { [sid]: s }, activeId: sid }, e).byId[sid] ?? s)
    }
    const batcher = createEventBatcher(applyLocal)
    batcherRef.current = batcher

    void (async () => {
      let replayOk = false
      try {
        const dto = await rest.getSession(sid, { limit: PAGE_SIZE })
        if (cancelled) return
        const events = dto.events ?? []
        if (events.length < PAGE_SIZE) hasMoreRef.current = false
        for (const e of events) batcher.enqueue(e)
        batcher.flushNow()
        replayOk = true
      } catch (err: unknown) {
        if (!cancelled) setNotice(errorMessageOf(err))
      }
      if (cancelled) return
      // 续播流：since=回放水位（重放与直播重叠由 applyEvent seq 去重）；
      // 取页失败退化为 since=0 直接开流（服务端补全量）——不留空白卡死路径（评审 H2）
      streamRef.current = openSessionStream({
        sessionId: sid,
        serverUrl,
        token,
        since: replayOk ? watermarkRef.current : 0,
        onEvent: (e) => batcherRef.current?.enqueue(e),
        onStatus: (s) => setStatus(s),
        onError: (err) => setNotice(errorMessageOf(err)),
      })
    })()

    return () => {
      cancelled = true
      streamRef.current?.dispose()
      streamRef.current = null
      batcher.flushNow()
      batcherRef.current = null
    }
  }, [sid, serverUrl, token, setNotice, setStatus])

  // 上拉到顶 → 向上翻页：较旧一页升序合并 + 全量重放重建投影（升序红线）
  const loadOlder = useCallback(async (): Promise<void> => {
    if (loadingOlderRef.current || !hasMoreRef.current) return
    const oldest = eventsRef.current.find((e) => e.seq !== undefined)
    if (oldest === undefined || oldest.seq === undefined) return
    const rest = getRestClient(serverUrl, token)
    if (rest === null) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const dto = await rest.getSession(sid, { limit: PAGE_SIZE, before: oldest.seq })
      const page = dto.events ?? []
      if (page.length < PAGE_SIZE) hasMoreRef.current = false
      if (page.length === 0) return
      const merged = mergeEventPage(page, eventsRef.current)
      // 全量重放（升序红线）：较旧事件不得增量叠加在较新投影之后
      let state: ProjectionState = { byId: {}, activeId: sid }
      const times = new Map<EventId, number>()
      for (const e of merged) {
        times.set(e.id, e.time)
        state = applyEvent(state, e)
      }
      eventsRef.current = merged
      timesRef.current = times
      setSlice(state.byId[sid] ?? emptySessionSlice(sid))
    } catch (err: unknown) {
      setNotice(errorMessageOf(err))
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [sid, serverUrl, token, setNotice])

  // 发消息 / 中断 / 审批决策（失败文案走 errorMessageOf，不自造）
  const handleSend = useCallback(
    async (text: string): Promise<void> => {
      const rest = getRestClient(serverUrl, token)
      if (rest === null) return
      setSending(true)
      try {
        await rest.sendMessage(sid, text)
      } catch (err: unknown) {
        setNotice(errorMessageOf(err))
      } finally {
        setSending(false)
      }
    },
    [sid, serverUrl, token, setNotice],
  )

  const handleStop = useCallback(async (): Promise<void> => {
    const rest = getRestClient(serverUrl, token)
    if (rest === null) return
    try {
      await rest.interrupt(sid)
    } catch (err: unknown) {
      setNotice(errorMessageOf(err))
    }
  }, [sid, serverUrl, token, setNotice])

  const handleReply = useCallback(
    async (requestId: RequestId, reply: PermissionReply): Promise<void> => {
      // 防抖闸门：快速双击不二次发 replyPermission（服务端 409 安全，
      // 但用户会看到误导性错误条——同 RN 评审 H3）
      if (approvalBusyRef.current) return
      const rest = getRestClient(serverUrl, token)
      if (rest === null) return
      approvalBusyRef.current = true
      setApprovalBusy(true)
      try {
        await rest.replyPermission(requestId, reply)
      } catch (err: unknown) {
        setNotice(errorMessageOf(err))
      } finally {
        approvalBusyRef.current = false
        setApprovalBusy(false)
      }
    },
    [serverUrl, token, setNotice],
  )

  // 人话提示条 5s 自清（不留陈旧错误冒充现状）
  useEffect(() => {
    if (notice === null) return () => undefined
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  const rows = useMemo(
    () => buildSessionRows(slice.items, (id) => timesRef.current.get(id)),
    [slice],
  )

  // 贴底时新内容自动跟随（正向列表：滚到底 = scrollTop 足够大；
  // 值单调递增避免同值不生效——小程序对相同 scrollTop 不重复滚动）。
  // 依赖 slice 而非 rows.length：流式 delta 只改既有项内容不改行数，
  // 而 applyEvent 后 slice 引用必变（与批处理同频——评审 I5）
  useEffect(() => {
    if (atBottomRef.current) setScrollTop((v) => v + 4096)
  }, [slice])

  const onScroll = (e: BaseEventOrig<ScrollViewProps.onScrollDetail>): void => {
    const d = e.detail
    const viewport = viewportHeightRef.current
    if (viewport <= 0) return // 视口未测得：保持既有判定（不拿零高冒充）
    setAtBottom(d.scrollTop + viewport >= d.scrollHeight - BOTTOM_THRESHOLD)
  }

  const running = slice.activeTurn !== null

  const connectionText =
    status === 'connecting' || status === 'reconnecting' || status === 'closed'
      ? CONNECTION_TEXT[status]
      : null

  return (
    <View className="sp-screen" style={{ backgroundColor: t.pageBackground }}>
      {/* 断线重连细条（onStatus 订阅；恢复后自动消失） */}
      {connectionText !== null && (
        <View className="sp-bar" style={{ backgroundColor: t.card }}>
          <Text className="sp-meta" style={{ color: t.sparkWarn }}>
            {connectionText}
          </Text>
        </View>
      )}
      {/* 人话错误细条（ERROR_COPY/errorMessageOf 单一来源） */}
      {notice !== null && (
        <View className="sp-bar" style={{ backgroundColor: t.card }}>
          <Text className="sp-meta" style={{ color: t.sparkErr }}>
            {notice}
          </Text>
        </View>
      )}
      <View className="sp-list-wrap">
        <ScrollView
          className="sp-list"
          scrollY
          scrollTop={scrollTop}
          onScroll={onScroll}
          onScrollToUpper={() => {
            void loadOlder()
          }}
          upperThreshold={60}
          scrollWithAnimation={false}
        >
          {loadingOlder ? (
            <Text className="sp-pager" style={{ color: t.mutedForeground }}>
              加载中…
            </Text>
          ) : !hasMoreRef.current && eventsRef.current.length > 0 ? (
            <Text className="sp-pager" style={{ color: t.mutedForeground }}>
              已加载全部历史
            </Text>
          ) : null}
          {rows.length === 0 ? (
            <EmptyState title="开始对话" detail="描述你的任务，Spark 即刻开工" />
          ) : (
            rows.map((row) => {
              if (row.kind === 'timestamp') {
                return (
                  <View key={row.key} className="sp-divider">
                    <Text className="sp-meta" style={{ color: t.mutedForeground }}>
                      {formatTimestamp(row.time)}
                    </Text>
                  </View>
                )
              }
              const it = row.item
              switch (it.kind) {
                case 'user':
                  return (
                    <View key={row.key} className="sp-row-gap">
                      <UserBubble text={it.text} />
                    </View>
                  )
                case 'assistant':
                  return (
                    <View key={row.key} className="sp-row-gap">
                      <AssistantBlock item={it} streaming={it.streaming !== undefined} />
                    </View>
                  )
                case 'reasoning':
                  return (
                    <View key={row.key} className="sp-row-gap">
                      <ReasoningCard item={it} />
                    </View>
                  )
                case 'tool':
                  return (
                    <View key={row.key} className="sp-row-gap">
                      <ToolCard item={it} />
                    </View>
                  )
                case 'approval':
                  return (
                    <View key={row.key} className="sp-row-gap">
                      <ApprovalCard
                        item={it}
                        busy={approvalBusy}
                        onReply={(r) => void handleReply(it.requestId, r)}
                      />
                    </View>
                  )
              }
            })
          )}
        </ScrollView>
        {/* 回到底部浮动圆钮（上滚/流式中；白底 ↓，J.2.3） */}
        {!atBottom && (
          <View className="sp-back-bottom">
            <FloatButton
              glyph="↓"
              label="回到底部"
              onPress={() => setScrollTop((v) => v + 4096)}
              background={t.card}
              glyphColor={t.foreground}
            />
          </View>
        )}
      </View>
      <View className="sp-composer-wrap" style={{ paddingBottom: `env(safe-area-inset-bottom)` }}>
        <Composer
          running={running}
          busy={sending}
          onSend={(text) => void handleSend(text)}
          onStop={() => void handleStop()}
        />
      </View>
    </View>
  )
}
