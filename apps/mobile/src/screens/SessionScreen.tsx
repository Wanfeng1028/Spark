/**
 * 会话页（工单 9.3 填充——DESIGN §13.J.2.3/J.3 实测定死形态）。
 *
 * 数据通道：打开会话 = REST 最新一页（?limit=）升序回放 + RnSessionEventSource
 * 续播流（since=回放水位）；事件经 rAF 批处理进本地投影（applyEvent，D22 共享）。
 * 上拉到顶向上翻页（?limit=&before=最早seq），本地升序合并后全量重放重建投影
 * （applyEvent 假定升序——较旧页不得增量叠加），inverted FlatList 滚动位置不跳。
 * 时间戳分隔需事件时间而 UiItem 无 time 字段——屏幕层维护 eventId→time 侧表。
 * 错误文案一律 ERROR_COPY/errorMessageOf（ADR D22，禁自造文案）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  EventId,
  PermissionReply,
  ProjectionState,
  RequestId,
  SessionSlice,
  SparkEventEnvelope,
} from '@spark/protocol'
import { applyEvent, emptySessionSlice, errorMessageOf, ids } from '@spark/protocol'
import { useTheme } from '../theme/use-theme'
import { mobileMetrics } from '../theme/tokens'
import { EmptyState, RoundFloatButton, ScreenHeader } from '../components/ui'
import {
  ApprovalCard,
  AssistantBlock,
  ReasoningCard,
  ToolCard,
  UserBubble,
} from '../components/session-items'
import { Composer } from '../components/composer'
import { useConfigStore } from '../store/config-store'
import { createEventBatcher, useAppStore } from '../store/app-store'
import type { EventBatcher } from '../store/app-store'
import { getHttpTransport, openSessionStream } from '../transport/runtime'
import type { RnSessionEventSource } from '../transport/rn-event-source'
import {
  buildSessionRows,
  formatTimestamp,
  mergeEventPage,
} from '../session/session-rows'
import type { SessionRow } from '../session/session-rows'
import type { SessionsStackParamList } from '../navigation/params'

/** 上拉翻页页长（服务端上限 200；50 条兼顾首屏速度与翻页次数） */
const PAGE_SIZE = 50

/** 连接细条人话文案（同 web CONNECTION_TEXT 口径，D22 同律） */
const CONNECTION_TEXT: Record<'connecting' | 'reconnecting', string> = {
  connecting: '连接中…',
  reconnecting: '已断线，重连中…',
}

/** 居中时间戳分隔（13 meta，J.2.3） */
function TimestampDivider({ time }: { time: number }) {
  const t = useTheme()
  return (
    <View style={styles.divider}>
      <Text style={[styles.dividerText, { color: t.mutedForeground }]}>
        {formatTimestamp(time)}
      </Text>
    </View>
  )
}

export function SessionScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<SessionsStackParamList>>()
  const route = useRoute<RouteProp<SessionsStackParamList, 'Session'>>()
  const sid = ids.session(route.params.sessionId)

  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const status = useAppStore((s) => s.status)
  const notice = useAppStore((s) => s.notice)
  const setNotice = useAppStore((s) => s.setNotice)
  const setStatus = useAppStore((s) => s.setStatus)

  const [slice, setSlice] = useState<SessionSlice>(() => emptySessionSlice(sid))
  const [sending, setSending] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [atBottom, setAtBottom] = useState(true)

  // 本地事件窗 + 时间侧表（分页合并/重放/时间戳分隔的数据源；ref 不触发渲染）
  const eventsRef = useRef<SparkEventEnvelope[]>([])
  const timesRef = useRef<Map<EventId, number>>(new Map())
  const watermarkRef = useRef(0)
  const hasMoreRef = useRef(true)
  const loadingOlderRef = useRef(false)
  const batcherRef = useRef<EventBatcher | null>(null)
  const streamRef = useRef<RnSessionEventSource | null>(null)
  const listRef = useRef<FlatList<SessionRow>>(null)
  const atBottomRef = useRef(true)
  atBottomRef.current = atBottom

  // 打开会话：最新一页回放（批处理投影）→ 以水位开续播流
  useEffect(() => {
    let cancelled = false
    const transport = getHttpTransport(serverUrl, token)
    if (transport === null) return () => undefined

    const applyLocal = (e: SparkEventEnvelope): void => {
      eventsRef.current.push(e)
      timesRef.current.set(e.id, e.time)
      if (e.seq !== undefined && e.seq > watermarkRef.current) watermarkRef.current = e.seq
      setSlice((s) => applyEvent({ byId: { [sid]: s }, activeId: sid }, e).byId[sid] ?? s)
    }
    const batcher = createEventBatcher(applyLocal)
    batcherRef.current = batcher

    void (async () => {
      try {
        const dto = await transport.getSession(sid, { limit: PAGE_SIZE })
        if (cancelled) return
        const events = dto.events ?? []
        if (events.length < PAGE_SIZE) hasMoreRef.current = false
        for (const e of events) batcher.enqueue(e)
        batcher.flushNow()
      } catch (err: unknown) {
        if (!cancelled) setNotice(errorMessageOf(err))
        return
      }
      if (cancelled) return
      // 续播流：since=回放水位（重放与直播重叠由 applyEvent seq 去重）
      streamRef.current = openSessionStream({
        sessionId: sid,
        serverUrl,
        token,
        since: watermarkRef.current,
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

  // 上拉到顶 → 向上翻页：较旧一页升序合并 + 全量重放重建投影（滚动位置不跳）
  const loadOlder = useCallback(async (): Promise<void> => {
    if (loadingOlderRef.current || !hasMoreRef.current) return
    const oldest = eventsRef.current.find((e) => e.seq !== undefined)
    if (oldest === undefined || oldest.seq === undefined) return
    const transport = getHttpTransport(serverUrl, token)
    if (transport === null) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const dto = await transport.getSession(sid, { limit: PAGE_SIZE, before: oldest.seq })
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
      const transport = getHttpTransport(serverUrl, token)
      if (transport === null) return
      setSending(true)
      try {
        await transport.sendMessage(sid, text)
      } catch (err: unknown) {
        setNotice(errorMessageOf(err))
      } finally {
        setSending(false)
      }
    },
    [sid, serverUrl, token, setNotice],
  )

  const handleStop = useCallback(async (): Promise<void> => {
    const transport = getHttpTransport(serverUrl, token)
    if (transport === null) return
    try {
      await transport.interrupt(sid)
    } catch (err: unknown) {
      setNotice(errorMessageOf(err))
    }
  }, [sid, serverUrl, token, setNotice])

  const handleReply = useCallback(
    async (requestId: RequestId, reply: PermissionReply): Promise<void> => {
      const transport = getHttpTransport(serverUrl, token)
      if (transport === null) return
      setApprovalBusy(true)
      try {
        await transport.replyPermission(requestId, reply)
      } catch (err: unknown) {
        setNotice(errorMessageOf(err))
      } finally {
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
  const data = useMemo(() => [...rows].reverse(), [rows])

  // 贴底时新内容自动跟随（inverted：底部 = offset 0）
  useEffect(() => {
    if (atBottomRef.current) listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [rows.length])

  const running = slice.activeTurn !== null

  const renderRow = ({ item: row }: { item: SessionRow }) => {
    if (row.kind === 'timestamp') return <TimestampDivider time={row.time} />
    const it = row.item
    switch (it.kind) {
      case 'user':
        return <UserBubble text={it.text} />
      case 'assistant':
        return <AssistantBlock item={it} streaming={it.streaming !== undefined} />
      case 'reasoning':
        return <ReasoningCard item={it} />
      case 'tool':
        return <ToolCard item={it} />
      case 'approval':
        return <ApprovalCard item={it} busy={approvalBusy} onReply={(r) => void handleReply(it.requestId, r)} />
    }
  }

  const connectionText =
    status === 'connecting' || status === 'reconnecting' ? CONNECTION_TEXT[status] : null

  return (
    <View style={[styles.screen, { backgroundColor: t.pageBackground }]}>
      <ScreenHeader
        title={route.params.title !== '' ? route.params.title : '新会话'}
        leftIcon="chevron-left"
        leftLabel="返回会话列表"
        onLeftPress={() => navigation.goBack()}
      />
      {/* 断线重连细条（onStatus 订阅；恢复后自动消失） */}
      {connectionText !== null && (
        <View style={[styles.connectionBar, { backgroundColor: t.card }]}>
          <Text style={[styles.meta, { color: t.sparkWarn }]}>{connectionText}</Text>
        </View>
      )}
      {/* 人话错误细条（ERROR_COPY/errorMessageOf 单一来源） */}
      {notice !== null && (
        <View style={[styles.connectionBar, { backgroundColor: t.card }]}>
          <Text style={[styles.meta, { color: t.sparkErr }]}>{notice}</Text>
        </View>
      )}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
      >
        <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            inverted
            data={data}
            keyExtractor={(r) => r.key}
            renderItem={renderRow}
            contentContainerStyle={styles.listContent}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.4}
            keyboardDismissMode="on-drag"
            scrollEventThrottle={100}
            onScroll={(e) => setAtBottom(e.nativeEvent.contentOffset.y < 80)}
            ListHeaderComponent={
              loadingOlder ? (
                <ActivityIndicator style={styles.pager} color={t.mutedForeground} />
              ) : !hasMoreRef.current && eventsRef.current.length > 0 ? (
                <Text style={[styles.meta, styles.pager, { color: t.mutedForeground }]}>
                  已加载全部历史
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <EmptyState title="开始对话" detail="描述你的任务，Spark 即刻开工" />
            }
          />
          {/* 回到底部浮动圆钮（上滚/流式中；44 白底 ↓，J.2.3） */}
          {!atBottom && (
            <View style={styles.backBottom}>
              <RoundFloatButton
                icon="arrow-down"
                label="回到底部"
                onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              />
            </View>
          )}
        </View>
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Composer running={running} busy={sending} onSend={(text) => void handleSend(text)} onStop={() => void handleStop()} />
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  connectionBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'center',
  },
  meta: {
    fontSize: mobileMetrics.caption,
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: mobileMetrics.cardGap,
    flexGrow: 1,
  },
  divider: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  dividerText: {
    fontSize: mobileMetrics.caption,
  },
  pager: {
    paddingVertical: 12,
    textAlign: 'center',
  },
  backBottom: {
    position: 'absolute',
    right: 16,
    bottom: 12,
  },
  composerWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
})
