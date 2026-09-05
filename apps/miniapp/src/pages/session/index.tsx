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
import type { RequestId } from '@spark/protocol'
import {
  CONNECTION_TEXT,
  createSessionPageController,
  emptySessionSlice,
  formatTimestamp,
  ids,
  type PermissionReply,
  type SessionPageController,
  type SessionPageSnapshot,
} from '@spark/protocol'
import { useConfigStore } from '../../store/config-store'
import { useTheme } from '../../store/theme-store'
import { BATCH_WINDOW_MS, useAppStore } from '../../store/app-store'
import { getRestClient, openSessionStream } from '../../transport/runtime'
import { buildSessionRows } from '../../session/session-rows'
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

/** closed 态文案留本地（评审 I2：鉴权终态不静默）——三态已下沉 protocol CONNECTION_TEXT（工单 R-B）；
 * closed 的两个触发源（鉴权终态 / 配置变更 invalidate）语义分叉，单份共享文案无法如实覆盖，见 ui-copy.ts 头注释边界说明 1 */
const CLOSED_TEXT = '连接已停止：鉴权失败，请到设置页重新配对'

/** 贴底判定阈值（px）：距底 40 以内视作贴底 */
const BOTTOM_THRESHOLD = 40

export default function SessionPage() {
  const t = useTheme()
  const router = useRouter()
  const sid = ids.session(router.params.sessionId ?? '')
  const title = decodeURIComponent(router.params.title ?? '')

  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const setNotice = useAppStore((s) => s.setNotice)

  const [atBottom, setAtBottom] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)

  // R-H：装载回放+开流/翻页/发送/审批/notice 逻辑收敛 protocol session-page controller——
  // 页面只持快照渲染与装配收口（rest/开流工厂注入；BATCH_WINDOW_MS 调度同原批处理）
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

  // R-H：逻辑全在 controller——本 effect 只做装配与收口
  useEffect(() => {
    const rest = getRestClient(serverUrl, token)
    if (rest === null) {
      setNotice('未配置服务器：请先在设置页完成配对')
      return () => undefined
    }
    const c = createSessionPageController({
      sessionId: sid,
      pageSize: PAGE_SIZE,
      rest: () => getRestClient(serverUrl, token),
      openStream: (since, handlers) => {
        const src = openSessionStream({ sessionId: sid, serverUrl, token, since, ...handlers })
        return src ?? { dispose: () => undefined }
      },
      // setData 频次敏感：BATCH_WINDOW_MS 时间窗合并（任务口径 16–32ms，同原批处理）
      schedule: (fn) => setTimeout(fn, BATCH_WINDOW_MS),
      onUpdate: setSnap,
    })
    controllerRef.current = c
    c.start()
    return () => {
      c.dispose()
      controllerRef.current = null
    }
  }, [sid, serverUrl, token, setNotice])

  // 发消息 / 中断 / 审批决策（防抖闸门 H3 在 controller 内）
  const handleSend = useCallback((text: string): void => {
    void controllerRef.current?.send(text)
  }, [])
  const handleStop = useCallback((): void => {
    void controllerRef.current?.stop()
  }, [])
  const handleReply = useCallback((requestId: RequestId, reply: PermissionReply): void => {
    void controllerRef.current?.reply(requestId, reply)
  }, [])


  const rows = useMemo(
    () => buildSessionRows(slice.items, (id) => controller?.timeOf(id)),
    [slice, controller],
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
    status === 'closed'
      ? CLOSED_TEXT
      : status === 'connecting' || status === 'reconnecting'
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
            void controllerRef.current?.loadOlder()
          }}
          upperThreshold={60}
          scrollWithAnimation={false}
        >
          {loadingOlder ? (
            <Text className="sp-pager" style={{ color: t.mutedForeground }}>
              加载中…
            </Text>
          ) : !snap.hasMore && snap.slice.items.length > 0 ? (
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
                        busy={snap.approvalBusy}
                        onReply={(r) => void handleReply(it.requestId, r)}
                      />
                    </View>
                  )
                case 'turn':
                  // 回合头暂无小程序形态，穷尽分支渲染空（工单 10.4）
                  return null
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
          busy={snap.sending}
          onSend={(text) => void handleSend(text)}
          onStop={() => void handleStop()}
        />
      </View>
    </View>
  )
}
