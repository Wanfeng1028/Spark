/**
 * 会话页（工单 9.4——语义对齐 apps/mobile SessionScreen，DESIGN §13.J.2.3/J.3；
 * 工单 19.29 小程序补齐批：topBanner/attachments 渲染 + 附件入口接线）。
 *
 * 数据通道：打开会话 = REST 最新一页（?limit=）升序回放 + MiniSessionEventSource
 * 续播流（since=回放水位；SSE 分块主路径，低基础库/异常自动降级轮询）；
 * 事件经时间窗批处理（24ms，setData 频次敏感）进本地投影（applyEvent，D22 共享）。
 * 上拉到顶向上翻页（?limit=&before=最早seq），本地升序合并后全量重放重建投影。
 * 时间戳分隔需事件时间而 UiItem 无 time 字段——页面层维护 eventId→time 侧表。
 * 错误文案一律 ERROR_COPY/errorMessageOf（ADR D22，禁自造文案）。
 *
 * 顶部细条族（同一 sp-bar 载体，各条独立数据源）：断线重连 / 人话错误 /
 * 计划模式（slice.mode）/ **本轮以 error 结束（slice.topBanner，19.29 补）** +
 * 附件流程的人话提示（页面局部态，不进事件流——上传是 REST 动作不是投影）。
 *
 * 小程序差异：无 inverted FlatList——ScrollView 正向渲染，贴底判定用
 * scrollTop+clientHeight≥scrollHeight-阈值，贴底时新消息 scrollTop=大值跟随；
 * 上拉到顶 = onScrollToUpper（替代 onEndReached 反向语义）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type { BaseEventOrig, ScrollViewProps } from '@tarojs/components'
import type { AttachmentDto, RequestId, SessionDto } from '@spark/protocol'
import {
  connectionText,
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
import { miniErrorMessageOf, miniT } from '../../i18n'
import { getRestClient, openSessionStream } from '../../transport/runtime'
import type { MiniRestClient } from '../../transport/rest'
import { pickImages, readFileBytes } from '../../transport/media'
import {
  mergeUploaded,
  removePending,
  uploadPickedImages,
} from '../../session/attachments'
import { buildSessionRows, lastUserTextOf } from '../../session/session-rows'
import {
  ApprovalCard,
  AssistantBlock,
  DiagnosticsCard,
  ReasoningCard,
  ToolCard,
  TurnRow,
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
  const lang = useAppStore((s) => s.language)

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

  // 附件入口（工单 19.29）：选图即上传，成功进待发条；提示走页面局部条（5s 自清，
  // 与 controller notice 同律）——上传是 REST 动作，不进事件流也不借 store notice
  const [attachments, setAttachments] = useState<AttachmentDto[]>([])
  const [uploading, setUploading] = useState(false)
  const [attachNotice, setAttachNotice] = useState<string | null>(null)
  const uploadingRef = useRef(false)

  useEffect(() => {
    if (attachNotice === null) return () => undefined
    const timer = setTimeout(() => setAttachNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [attachNotice])

  // 发消息 / 中断 / 审批决策（防抖闸门 H3 在 controller 内）
  // 附件随消息进发送体（19.29 收口：wire 已由 19.27 修通）——send 受理成功才清
  // 待发条，失败时清单保留（不无声丢失已上传的附件）
  const handleSend = useCallback((text: string, files: string[]): void => {
    void controllerRef.current
      ?.send(text, files.length > 0 ? { attachments: files } : undefined)
      .then((ok) => {
        if (ok === true && files.length > 0) setAttachments([])
      })
  }, [])
  const handleStop = useCallback((): void => {
    void controllerRef.current?.stop()
  }, [])
  const handleReply = useCallback((requestId: RequestId, reply: PermissionReply): void => {
    void controllerRef.current?.reply(requestId, reply)
  }, [])

  const handlePickAttachment = useCallback((): void => {
    const rest = getRestClient(serverUrl, token)
    if (rest === null) {
      setAttachNotice('未配置服务器：请先在设置页完成配对')
      return
    }
    if (uploadingRef.current) return
    uploadingRef.current = true
    setUploading(true)
    void pickImages(1)
      .then((picked) =>
        picked.length === 0
          ? null
          : uploadPickedImages({ sessionId: sid, picked, read: readFileBytes, channel: rest }),
      )
      .then((outcome) => {
        if (outcome === null) return
        if (outcome.uploaded.length > 0) {
          setAttachments((cur) => outcome.uploaded.reduce(mergeUploaded, cur))
        }
        if (outcome.errors.length > 0) setAttachNotice(outcome.errors.join('；'))
      })
      .catch((err: unknown) => setAttachNotice(miniErrorMessageOf(err)))
      .finally(() => {
        uploadingRef.current = false
        setUploading(false)
      })
  }, [serverUrl, token, sid])

  const handleRemoveAttachment = useCallback((file: string): void => {
    setAttachments((cur) => removePending(cur, file))
  }, [])

  // ---- 会话菜单（19.29 收口，对齐 mobile SessionScreen 菜单四项）----
  // pinned/archived 态：SessionMeta 无这两位（列表索引字段不进事件流），进页一次
  // getSession 拉取、动作成功用返回 DTO 回写（服务端真值，不做乐观更新）
  const [flags, setFlags] = useState<{ pinned: boolean; archived: boolean } | null>(null)
  const [menuBusy, setMenuBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    const rest = getRestClient(serverUrl, token)
    if (rest === null) return () => undefined
    void rest
      .getSession(sid)
      .then((dto) => {
        if (!cancelled) {
          setFlags({ pinned: dto.pinned === true, archived: dto.archivedAt !== undefined })
        }
      })
      .catch(() => undefined) // 态拉取失败不挡会话使用：菜单动作时再如实报错
    return () => {
      cancelled = true
    }
  }, [sid, serverUrl, token])

  const runMenuAction = useCallback(
    async (fn: (rest: MiniRestClient) => Promise<SessionDto | void>): Promise<void> => {
      const rest = getRestClient(serverUrl, token)
      if (rest === null) {
        setAttachNotice('未配置服务器：请先在设置页完成配对')
        return
      }
      setMenuBusy(true)
      try {
        const dto = await fn(rest)
        if (dto !== undefined) {
          setFlags({ pinned: dto.pinned === true, archived: dto.archivedAt !== undefined })
        }
      } catch (err: unknown) {
        setAttachNotice(miniErrorMessageOf(err))
      } finally {
        setMenuBusy(false)
      }
    },
    [serverUrl, token],
  )

  const openSessionMenu = useCallback((): void => {
    if (menuBusy) return
    const pinnedNow = flags?.pinned === true
    const archivedNow = flags?.archived === true
    const items = [
      pinnedNow ? '取消置顶' : '置顶',
      '重命名',
      archivedNow ? '恢复' : '归档',
      '删除',
    ]
    void Taro.showActionSheet({ itemList: items })
      .then(({ tapIndex }) => {
        switch (tapIndex) {
          case 0:
            void runMenuAction((rest) => rest.pinSession(sid, !pinnedNow))
            break
          case 1:
            void Taro.showModal({
              title: '重命名会话',
              editable: true,
              placeholderText: '输入新标题',
            }).then(({ confirm, content }) => {
              const title = (content ?? '').trim()
              if (confirm !== true || title === '') return
              void runMenuAction(async (rest) => {
                const dto = await rest.renameSession(sid, title)
                void Taro.setNavigationBarTitle({ title: dto.title !== '' ? dto.title : '新会话' })
                return dto
              })
            })
            break
          case 2:
            void runMenuAction((rest) => rest.archiveSession(sid, !archivedNow))
            break
          case 3:
            void Taro.showModal({
              title: '删除会话',
              content: '会话文件将移入服务端回收站（两段式删除，可在存储页恢复）',
              confirmColor: '#dc2626',
            }).then(({ confirm }) => {
              if (confirm !== true) return
              void runMenuAction(async (rest) => {
                await rest.deleteSession(sid)
                Taro.navigateBack()
              })
            })
            break
        }
      })
      .catch(() => undefined) // 用户取消（errMsg 含 cancel）——非错误
  }, [flags, menuBusy, runMenuAction, sid])


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

  // topBanner 的重试目标（仅错误条出现时算一次——不在每帧重扫全列表）
  const retryText = slice.topBanner !== null ? lastUserTextOf(slice.items) : null

  const bannerText =
    status === 'closed'
      ? CLOSED_TEXT
      : status === 'connecting' || status === 'reconnecting'
        ? connectionText(status, lang)
        : null

  return (
    <View className="sp-screen" style={{ backgroundColor: t.pageBackground }}>
      {/* 断线重连细条（onStatus 订阅；恢复后自动消失） */}
      {bannerText !== null && (
        <View className="sp-bar" style={{ backgroundColor: t.card }}>
          <Text className="sp-meta" style={{ color: t.sparkWarn }}>
            {bannerText}
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
      {/* 计划模式细条（工单 16.3）：数据源 = durable 事件投影的 slice.mode（回放即可重建）。
          中性色不用 sparkWarn（plan 是常态模式不是告警），与 mobile 端逐字同口径 */}
      {slice.mode === 'plan' && (
        <View className="sp-bar" style={{ backgroundColor: t.card }}>
          <Text className="sp-meta" style={{ color: t.mutedForeground }}>
            计划模式：写类工具全拒，模型只读地出计划；退出需你批准
          </Text>
        </View>
      )}
      {/* CK-13 批 2：交付声明只读条（present 工具 durable 投影；无声明不渲染——禁假状态） */}
      {slice.deliverables !== null && (
        <View className="sp-bar" style={{ backgroundColor: t.card }}>
          <Text className="sp-meta" style={{ color: t.mutedForeground }}>
            交付文件 {slice.deliverables.files.length} 个
            {slice.deliverables.summary !== undefined ? `：${slice.deliverables.summary}` : ''}
          </Text>
        </View>
      )}
      {/* 本轮以 error 结束（工单 19.29 补 topBanner 渲染）：数据源 = turn.completed
          finish='error' 投影出的 slice.topBanner（durable，回放即可重建）。
          重试 = 重发最后一条 user 文本（与 web SessionSurface.retryLastMessage 同语义：
          追加一条新 user.message，不原地改写）；无 user 消息时不出钮——不拿空文本撞 zod min(1) */}
      {slice.topBanner !== null && (
        <View className="sp-bar" style={{ backgroundColor: t.card }}>
          <Text className="sp-meta" style={{ color: t.sparkErr }}>
            本轮以 error 结束
          </Text>
          {retryText !== null && (
            <Text
              className="sp-bar-action"
              style={{ color: t.sparkAccent }}
              onClick={() => void controllerRef.current?.send(retryText)}
            >
              {miniT('action.retry')}
            </Text>
          )}
        </View>
      )}
      {/* 附件流程人话条（选图/读文件/上传三段失败与格式拒绝；5s 自清同 controller notice） */}
      {attachNotice !== null && (
        <View className="sp-bar" style={{ backgroundColor: t.card }}>
          <Text className="sp-meta" style={{ color: t.sparkErr }}>
            {attachNotice}
          </Text>
        </View>
      )}
        <View className="sp-list-wrap">
          {/* 会话菜单入口（19.29 收口）：右上浮钮"⋯"——置顶/改名/归档/删除四项 */}
          <View
            className="sp-menu-fab"
            style={{ backgroundColor: t.card }}
            onClick={openSessionMenu}
            aria-label="会话菜单"
          >
            <Text className="sp-menu-fab-glyph" style={{ color: t.mutedForeground }}>
              ⋯
            </Text>
          </View>
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
              {miniT('shell.loading')}
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
                      <UserBubble
                        text={it.text}
                        attachments={it.attachments ?? []}
                        baseUrl={serverUrl.trim()}
                        token={token}
                      />
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
                case 'turn': {
                  // 回合头（W18）：活动回合才带步数/工具数（activeTurn 按 turnId 配对——
                  // 历史回合的 UiItem 无这些字段，不造数据）；时长随重渲染重算，不加定时器
                  const active = slice.activeTurn
                  const activeProps =
                    active !== null && active.turnId === it.turnId
                      ? { stepCount: active.stepCount, runningToolCount: active.runningTools.size }
                      : {}
                  return (
                    <View key={row.key} className="sp-row-gap">
                      <TurnRow item={it} {...activeProps} />
                    </View>
                  )
                }
                case 'diagnostics':
                  // LSP 诊断折叠卡（W18）：折叠单行入口，点按展开逐条摘要
                  return (
                    <View key={row.key} className="sp-row-gap">
                      <DiagnosticsCard item={it} />
                    </View>
                  )
                case 'question':
                  // CK-6 批 1：只读呈现（点选作答随批 2 小程序交互批）
                  return (
                    <View key={row.key} className="sp-row-gap sp-question">
                      {it.questions.map((q, qi) => {
                        const a = it.status === 'resolved' ? it.answers?.[qi] : undefined
                        const picked =
                          a !== undefined && a.selected.length > 0
                            ? ` → ${a.selected.join('、')}`
                            : ''
                        return (
                          <Text key={qi} className="sp-question-text">
                            {qi + 1}. {q.question}
                            {picked}
                          </Text>
                        )
                      })}
                      <Text className="sp-question-hint">
                        {it.status === 'pending'
                          ? '请在 Web 工作台作答（超时未答将 fail-closed）'
                          : it.aborted === true
                            ? '提问超时/中断——未获回答'
                            : '提问已回答'}
                      </Text>
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
          busy={snap.sending}
          attachments={attachments}
          uploading={uploading}
          baseUrl={serverUrl.trim()}
          token={token}
          onPickAttachment={handlePickAttachment}
          onRemoveAttachment={handleRemoveAttachment}
          onSend={(text, files) => void handleSend(text, files)}
          onStop={() => void handleStop()}
        />
      </View>
    </View>
  )
}
