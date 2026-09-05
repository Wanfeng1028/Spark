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
import type { ProjectionState, RequestId } from '@spark/protocol'
import {
  CONNECTION_TEXT,
  createSessionPageController,
  emptySessionSlice,
  errorMessageOf,
  formatTimestamp,
  ids,
  type PermissionReply,
  type SessionPageController,
  type SessionPageSnapshot,
} from '@spark/protocol'
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
import { getHttpTransport, openSessionStream } from '../transport/runtime'
import { buildSessionRows } from '../session/session-rows'
import type { SessionRow } from '../session/session-rows'
import type { SessionsStackParamList } from '../navigation/params'

/** 上拉翻页页长（服务端上限 200；50 条兼顾首屏速度与翻页次数） */
const PAGE_SIZE = 50

/**
 * closed 态文案留本地，与 miniapp session 页逐字同（工单 R-B.5c）——两个靠配对 token
 * 连 server 的远端，closed 唯一持久可见的触发源就是鉴权终态（配置变更 invalidate 是瞬态，
 * 随即被新实例的 connecting 覆盖）。三态已下沉 protocol CONNECTION_TEXT（工单 R-B）；
 * closed 不入共享表的理由见 ui-copy.ts 头注释边界说明 1。
 */
const CLOSED_TEXT = '连接已停止：鉴权失败，请到设置页重新配对'

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
  const [atBottom, setAtBottom] = useState(true)

  // R-H：装载/翻页/发送/审批/notice 逻辑收敛 protocol session-page controller——
  // 屏幕只持快照渲染与薄接线（rest/开流工厂注入）
  const controllerRef = useRef<SessionPageController | null>(null)
  const [snap, setSnap] = useState<SessionPageSnapshot>(() => ({
    slice: emptySessionSlice(sid),
    status: 'connecting',
    notice: null,
    hasMore: true,
    loadingOlder: false,
    sending: false,
    approvalBusy: false,
  }))
  const controller = controllerRef.current
  const slice = snap.slice
  const notice = snap.notice
  const status = snap.status
  const loadingOlder = snap.loadingOlder
  const listRef = useRef<FlatList<SessionRow>>(null)
  const atBottomRef = useRef(true)
  atBottomRef.current = atBottom

  // R-H：装载回放+开流/翻页/发送/审批/notice 全在 controller——本 effect 只做装配与收口
  useEffect(() => {
    const c = createSessionPageController({
      sessionId: sid,
      pageSize: PAGE_SIZE,
      rest: () => getHttpTransport(serverUrl, token),
      openStream: (since, handlers) => {
        const src = openSessionStream({ sessionId: sid, serverUrl, token, since, ...handlers })
        return src ?? { dispose: () => undefined }
      },
      // 批处理同帧合并（RN=RAF，原 batcher 同款调度）
      schedule: (fn) => requestAnimationFrame(fn),
      onUpdate: setSnap,
    })
    controllerRef.current = c
    c.start()
    return () => {
      c.dispose()
      controllerRef.current = null
    }
  }, [sid, serverUrl, token])

  // 发消息 / 中断 / 审批决策（防抖闸门 H3 在 controller 内）
  const handleSend = useCallback(
    (text: string): void => {
      void controllerRef.current?.send(text)
    },
    [],
  )
  const handleStop = useCallback((): void => {
    void controllerRef.current?.stop()
  }, [])
  const handleReply = useCallback((requestId: RequestId, reply: PermissionReply): void => {
    void controllerRef.current?.reply(requestId, reply)
  }, [])


  const timeOf = controller?.timeOf
  const rows = useMemo(
    () => buildSessionRows(slice.items, (id) => timeOf?.(id)),
    [slice, timeOf],
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
        return <ApprovalCard item={it} busy={snap.approvalBusy} onReply={(r) => void handleReply(it.requestId, r)} />
      case 'turn':
        // 回合头暂无移动端形态（§13.J 未定义），穷尽分支渲染空
        return null
    }
  }

  const connectionText =
    status === 'closed'
      ? CLOSED_TEXT
      : status === 'connecting' || status === 'reconnecting'
        ? CONNECTION_TEXT[status]
        : null

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
            onEndReached={() => void controllerRef.current?.loadOlder()}
            onEndReachedThreshold={0.4}
            keyboardDismissMode="on-drag"
            scrollEventThrottle={100}
            onScroll={(e) => setAtBottom(e.nativeEvent.contentOffset.y < 80)}
            ListHeaderComponent={
              loadingOlder ? (
                <ActivityIndicator style={styles.pager} color={t.mutedForeground} />
              ) : !snap.hasMore && snap.slice.items.length > 0 ? (
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
          <Composer running={running} busy={snap.sending} onSend={(text) => void handleSend(text)} onStop={() => void handleStop()} />
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
