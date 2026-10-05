/**
 * 会话页（工单 9.3 形态 + 19.27 补齐批）。
 *
 * 数据通道：打开会话 = REST 最新一页（?limit=）升序回放 + RnSessionEventSource
 * 续播流（since=回放水位）；事件经 rAF 批处理进本地投影（applyEvent，D22 共享）。
 * 上拉到顶向上翻页（?limit=&before=最早seq），本地升序合并后全量重放重建投影
 * （applyEvent 假定升序——较旧页不得增量叠加），inverted FlatList 滚动位置不跳。
 * 时间戳分隔需事件时间而 UiItem 无 time 字段——屏幕层维护 eventId→time 侧表。
 * 错误文案一律 ERROR_COPY/errorMessageOf（ADR D22，禁自造文案）。
 *
 * 19.27 在本页接真的东西（全部走 Transport，无组件内 fetch、无乐观更新）：
 * 页头副标题=项目名（slice.meta.cwd 目录名，J.2.3）+ 右"…"会话菜单（改名/归档/
 * 删除；置顶待 19.41 的协议面，不放置灰项）、topBanner=回合级错误横幅 + 重试、
 * user.attachments 缩略、SubmitOutcome 三态提示与运行中提交档、计划模式档位菜单
 * （getPermissionPreset/setPermissionPreset + /plan exit）、assistant 行反馈两票
 * （submitFeedback/withdrawFeedback/listFeedback，19.19）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Delivery, FeedbackVote, PermissionPreset, RequestId, SessionSlice } from '@spark/protocol'
import {
  connectionText,
  createSessionPageController,
  emptySessionSlice,
  formatTimestamp,
  ids,
  lastUserTextOf,
  PERMISSION_TIER_DEFS,
  type AttachmentDto,
  type PermissionReply,
  type SessionPageController,
  type SessionPageSnapshot,
} from '@spark/protocol'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '../theme/use-theme'
import { mobileMetrics } from '../theme/tokens'
import {
  Card,
  EmptyState,
  MenuCard,
  RoundFloatButton,
  ScreenHeader,
  SheetScreen,
  type FeatherIconName,
  type MenuRowSpec,
} from '../components/ui'
import {
  ApprovalCard,
  AssistantBlock,
  DiagnosticsCard,
  QuestionCard,
  ReasoningCard,
  ToolCard,
  TurnRow,
  UserBubble,
} from '../components/session-items'
import { Composer } from '../components/composer'
import { ArenaSheet, CheckpointsSheet, SessionTreeSheet } from '../components/manage-sheets'
import { useConfigStore } from '../store/config-store'
import { useAppStore } from '../store/app-store'
import { getHttpTransport, openSessionStream } from '../transport/runtime'
import { buildSessionRows } from '../session/session-rows'
import type { SessionRow } from '../session/session-rows'
import { projectNameOf } from '../session/session-list'
import { mobileErrorMessageOf, mobileT } from '../i18n'
import {
  createSessionActionsController,
  type SessionActions,
  type SessionActionsSnapshot,
} from '../session/session-actions'
import {
  OUTCOME_TEXT,
  composerPlaceholder,
  createSubmitRest,
  type SessionPageRestSlice,
} from '../session/submit-channel'
import { attachmentUrlOf, ATTACHMENT_MAX_BYTES, base64ToBytes } from '../session/attachments'
import type { SessionsStackParamList } from '../navigation/params'

/** 上拉翻页页长（服务端上限 200；50 条兼顾首屏速度与翻页次数） */
const PAGE_SIZE = 50

/**
 * closed 态文案留本地，与 miniapp session 页逐字同（工单 R-B.5c）——两个靠配对 token
 * 连 server 的远端，closed 唯一持久可见的触发源就是鉴权终态（配置变更 invalidate 是瞬态，
 * 随即被新实例的 connecting 覆盖）。三态已下沉 protocol `connectionText(status, lang)`（工单 R-B 建、
 * 19.17 起随界面语言取词）；closed 不入共享表的理由见 ui-copy.ts 头注释边界说明 1。
 */
const CLOSED_TEXT = '连接已停止：鉴权失败，请到设置页重新配对'

/** 待办条文案（CK-4 ④）：未完成计数 + 进行中项优先展示；全完成返回空串（不渲染） */
function todoBarText(todos: NonNullable<SessionSlice['todos']>): string {
  const open = todos.filter((t) => t.status !== 'completed')
  if (open.length === 0) return ''
  const current = todos.find((t) => t.status === 'in_progress') ?? open[0]
  return `待办 ${open.length}/${todos.length}${
    current !== undefined ? `——进行中：${current.content}` : ''
  }`
}

/** 权限四档（§13.E；数据表 = protocol ui-copy PERMISSION_TIER_DEFS 单源派生——审计 B-4
 *  下沉，mobile 因此补齐 description/warn 位；Feather 图标映射随端） */
const TIER_ICONS: Record<PermissionPreset, FeatherIconName> = {
  'confirm-each': 'shield',
  'auto-edit': 'edit',
  plan: 'list',
  'full-access': 'alert-triangle',
}

const PERMISSION_TIERS: ReadonlyArray<{
  id: PermissionPreset
  label: string
  icon: FeatherIconName
}> = PERMISSION_TIER_DEFS.map((d) => ({ id: d.id, label: d.label, icon: TIER_ICONS[d.id] }))

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

/** 页头下方细条载体（断线/错误/提示共用——J.2.3 同一载体，取色由调用方给） */
function BannerRow({
  text,
  color,
  onPress,
  pressLabel,
}: {
  text: string
  color: string
  onPress?: (() => void) | undefined
  pressLabel?: string | undefined
}) {
  const t = useTheme()
  const body = (
    <View style={[styles.connectionBar, { backgroundColor: t.card }]}>
      <Text style={[styles.meta, { color }]}>{text}</Text>
      {onPress !== undefined && (
        <Text style={[styles.bannerAction, { color: t.mutedForeground }]}>{pressLabel ?? '处理'}</Text>
      )}
    </View>
  )
  if (onPress === undefined) return body
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={pressLabel ?? text}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {body}
    </TouchableOpacity>
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
  const sessions = useAppStore((s) => s.sessions)
  // 订阅而非直读 store：语言改档后横幅文案要跟着重渲染（工单 19.17）
  const lang = useAppStore((s) => s.language)
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

  // ---- 19.27 会话动作面（改名/归档/删除/反馈/档位）----
  // 归档态：archivedAt 是列表索引字段（不进事件流），数据源 = 列表快照里这条 DTO；
  // 菜单动作成功后由 archiveSession 的返回值改写（服务端新值，不是乐观更新）
  const archivedFromList = sessions.find((s) => s.id === sid)?.archivedAt !== undefined
  const [archived, setArchived] = useState(archivedFromList)
  useEffect(() => {
    setArchived(archivedFromList)
  }, [archivedFromList])
  // 置顶态同口径：SessionDto.pinned 仅已置顶携带（19.41 DTO；禁假状态）
  const pinnedFromList = sessions.find((s) => s.id === sid)?.pinned === true
  const [pinned, setPinned] = useState(pinnedFromList)
  useEffect(() => {
    setPinned(pinnedFromList)
  }, [pinnedFromList])

  const [actionSnap, setActionSnap] = useState<SessionActionsSnapshot>({
    running: null,
    notice: null,
    preset: null,
    presetUnavailable: false,
    votes: {},
  })
  const actionsRef = useRef<SessionActions | null>(null)
  useEffect(() => {
    const c = createSessionActionsController({
      sessionId: sid,
      rest: () => getHttpTransport(serverUrl, token),
      onUpdate: setActionSnap,
      // 置顶：pinSession 返回的 DTO 是服务端新值（不是乐观改写）
      onChanged: (kind, dto) => {
        if (kind === 'archive' && dto !== null) setArchived(dto.archivedAt !== undefined)
        if (kind === 'pin' && dto !== null) setPinned(dto.pinned === true)
      },
    })
    actionsRef.current = c
    void c.loadVotes()
    void c.loadPreset()
    return () => {
      c.dispose()
      actionsRef.current = null
    }
  }, [sid, serverUrl, token])

  // ---- 提交档与 SubmitOutcome（排队语义，19.27）----
  const [delivery, setDelivery] = useState<Delivery>('steer')
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showHint = useCallback((text: string): void => {
    setHint(text)
    if (hintTimer.current !== null) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => {
      hintTimer.current = null
      setHint(null)
    }, 2500)
  }, [])
  useEffect(() => {
    return () => {
      if (hintTimer.current !== null) clearTimeout(hintTimer.current)
    }
  }, [])

  // 提交策略读的是"最新一帧"的值——用 ref 桥接，避免 controller 闭包捕获旧快照
  const runningRef = useRef(false)
  const turnRef = useRef(slice.activeTurn?.turnId)
  runningRef.current = slice.activeTurn !== null
  turnRef.current = slice.activeTurn?.turnId
  const deliveryRef = useRef<Delivery>(delivery)
  deliveryRef.current = delivery

  // 管理面板开关（19.28 批 1）+ 回滚后重建会话控制器（seq 回退，只能全量重放）
  const [treeOpen, setTreeOpen] = useState(false)
  const [checkpointsOpen, setCheckpointsOpen] = useState(false)
  const [arenaOpen, setArenaOpen] = useState(false)
  const [reloadEpoch, setReloadEpoch] = useState(0)

  // R-H：装载回放+开流/翻页/发送/审批/notice 全在 controller——本 effect 只做装配与收口
  useEffect(() => {
    const restSlice = (): SessionPageRestSlice | null =>
      createSubmitRest(getHttpTransport(serverUrl, token), {
        // 空闲恒 now（§13.E 禁用矩阵：无活动轮可插话/排队），运行中取端侧选定的档
        delivery: () => ({
          mode: runningRef.current ? deliveryRef.current : 'now',
          ...(turnRef.current !== undefined ? { expectedTurnId: turnRef.current } : {}),
        }),
        report: (outcome) => showHint(OUTCOME_TEXT[outcome.result]),
      })
    const c = createSessionPageController({
      sessionId: sid,
      pageSize: PAGE_SIZE,
      rest: restSlice,
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
    // reloadEpoch（19.28）：检查点回滚后 seq 回退，dispose 重建 + 全量重放是唯一正解
  }, [sid, serverUrl, token, showHint, reloadEpoch])

  // ---- 附件状态（19.27 接真）：待发清单 + 上传中标记 ----
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentDto[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)

  // 发消息 / 中断 / 审批决策（防抖闸门 H3 在 controller 内）
  // 附件（19.27 接真）：send 受理成功才清待发清单——失败时清单保留，用户改后重发
  const handleSend = useCallback(
    (text: string): void => {
      const attachments = pendingAttachments.map((a) => a.id)
      void controllerRef.current
        ?.send(text, attachments.length > 0 ? { attachments } : undefined)
        .then((ok) => {
          if (ok === true) setPendingAttachments([])
        })
    },
    [pendingAttachments],
  )
  const handleStop = useCallback((): void => {
    void controllerRef.current?.stop()
  }, [])
  const handleReply = useCallback((requestId: RequestId, reply: PermissionReply): void => {
    void controllerRef.current?.reply(requestId, reply)
  }, [])

  // 结构化提问作答（CK-6 批 2）：QuestionCard 提交经 REST 回引擎挂起表——
  // 未配置服务器如实拒绝（卡内联呈现）；错误透传给卡片收口
  const handleQuestionReply = useCallback(
    (requestId: RequestId, answers: Array<{ selected: string[] }>): Promise<void> => {
      const transport = getHttpTransport(serverUrl, token)
      if (transport === null) {
        return Promise.reject(new Error('未配置服务器：请先在设置页完成配对'))
      }
      return transport.replyQuestion(requestId, answers)
    },
    [serverUrl, token],
  )

  // ---- 附件上传（19.27 接真）：picker 选图 → base64 取字节 → uploadAttachment → 待发清单 ----
  const pickAttachment = useCallback(async (): Promise<void> => {
    if (uploadingAttachment) return
    const transport = getHttpTransport(serverUrl, token)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.granted !== true) {
      showHint('未获得相册权限，无法附加图片')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: true,
      allowsMultipleSelection: false,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    if (asset === undefined) return
    const mime = asset.mimeType ?? 'image/jpeg'
    if (!mime.startsWith('image/')) {
      showHint('仅支持图片附件')
      return
    }
    if (asset.fileSize !== undefined && asset.fileSize !== null && asset.fileSize > ATTACHMENT_MAX_BYTES) {
      showHint('图片超过 10MB 上限')
      return
    }
    const b64 = asset.base64
    if (b64 === undefined || b64 === null || b64 === '') {
      showHint('读取图片失败，请重试')
      return
    }
    const bytes = base64ToBytes(b64)
    if (bytes === null || bytes.length === 0) {
      showHint('读取图片失败，请重试')
      return
    }
    const name = asset.fileName ?? `image.${mime.split('/')[1] ?? 'png'}`
    setUploadingAttachment(true)
    try {
      if (transport === null) return
      const dto = await transport.uploadAttachment(sid, { name, mime, bytes })
      setPendingAttachments((prev) => [...prev, dto])
    } catch (err: unknown) {
      showHint(mobileErrorMessageOf(err))
    } finally {
      setUploadingAttachment(false)
    }
  }, [serverUrl, token, sid, uploadingAttachment, showHint])
  const removeAttachment = useCallback((id: string): void => {
    // 只从待发清单摘除（服务端文件由引擎 attachments 清理面统一回收，无需逐个删）
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const rows = useMemo(
    () => buildSessionRows(slice.items, (id) => controller?.timeOf(id)),
    [slice, controller],
  )
  const data = useMemo(() => [...rows].reverse(), [rows])

  // 贴底时新内容自动跟随（inverted：底部 = offset 0）
  useEffect(() => {
    if (atBottomRef.current) listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [rows.length])

  const running = slice.activeTurn !== null

  /** 标题取投影（session.title 是 durable 事件，改名后回放即重建——导航参数只是首帧兜底） */
  const headerTitle = slice.meta.title !== '' ? slice.meta.title : route.params.title

  /** topBanner 的重试：重发投影里最后一条 user 消息（不猜内容——无用户消息即不给入口）。
   *  取词 = protocol lastUserTextOf 单源（审计 B-2 下沉——原内联 useMemo 与三端同型） */
  const lastUserText = useMemo(() => lastUserTextOf(slice.items), [slice])

  // ---- 会话菜单与弹层 ----
  const [menuOpen, setMenuOpen] = useState(false)
  const [tierOpen, setTierOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const actionBusy = actionSnap.running !== null

  const menuRows = useMemo<readonly MenuRowSpec[]>(() => {
    const out: MenuRowSpec[] = [
      {
        // 置顶首项（19.41 协议面已落地；web 同款首项同序）
        icon: 'star',
        label: pinned ? '取消置顶' : '置顶',
        onPress: () => {
          setMenuOpen(false)
          void actionsRef.current?.setPinned(!pinned)
        },
      },
      {
        icon: 'edit-2',
        label: '重命名',
        onPress: () => {
          setRenameDraft(headerTitle)
          setRenameOpen(true)
          setMenuOpen(false)
        },
      },
      {
        icon: 'shield',
        label: '权限档位',
        onPress: () => {
          setMenuOpen(false)
          setTierOpen(true)
        },
      },
      {
        // 归档/恢复（12.4 的 archiveSession；恢复后列表"已归档"档才看得见——19.27 接通）
        icon: 'archive',
        label: archived ? '恢复' : '归档',
        onPress: () => {
          setMenuOpen(false)
          void actionsRef.current?.setArchived(!archived)
        },
      },
      {
        icon: 'trash-2',
        label: '删除',
        danger: true,
        onPress: () => {
          setConfirmDelete(true)
          setMenuOpen(false)
        },
      },
      // 管理面板三入口（19.28 批 1）：会话树 / 检查点 / 多模型竞答——各开 Sheet
      {
        icon: 'git-branch',
        label: mobileT('manage.sessionTree'),
        onPress: () => {
          setMenuOpen(false)
          setTreeOpen(true)
        },
      },
      {
        icon: 'archive',
        label: mobileT('manage.checkpoints'),
        onPress: () => {
          setMenuOpen(false)
          setCheckpointsOpen(true)
        },
      },
      {
        icon: 'zap',
        label: mobileT('manage.arena'),
        onPress: () => {
          setMenuOpen(false)
          setArenaOpen(true)
        },
      },
    ]
    return out
  }, [archived, headerTitle, pinned])


  const tierRows = useMemo<readonly MenuRowSpec[]>(
    () =>
      PERMISSION_TIERS.map((tier) => ({
        icon: tier.icon,
        label: tier.label,
        selected: actionSnap.preset === tier.id,
        onPress: () => {
          setTierOpen(false)
          void actionsRef.current?.setPreset(tier.id)
        },
      })),
    [actionSnap.preset],
  )

  /**
   * 档位菜单 = 计划模式的真控件出口（19.27"解释横幅升真控件"）：
   * 选 plan 档即由引擎 emit session.mode.changed（engine applyPreset 单一 enforcement 路径），
   * 所以进 plan 不必走 /plan 命令；退出另给一行——/plan exit 会恢复进 plan 前的档位，
   * 前端不自己猜上一档是什么。
   */
  const tierMenuRows = useMemo<readonly MenuRowSpec[]>(
    () =>
      slice.mode === 'plan'
        ? [
            ...tierRows,
            {
              icon: 'log-out',
              label: '退出计划模式',
              onPress: () => {
                setTierOpen(false)
                void actionsRef.current?.exitPlan()
              },
            },
          ]
        : tierRows,
    [tierRows, slice.mode],
  )

  const onVote = useCallback(
    (eventId: string, vote: FeedbackVote): void => {
      void actionsRef.current?.toggleVote(ids.event(eventId), vote)
    },
    [],
  )

  const renderRow = ({ item: row }: { item: SessionRow }) => {
    if (row.kind === 'timestamp') return <TimestampDivider time={row.time} />
    const it = row.item
    switch (it.kind) {
      case 'user':
        return (
          <UserBubble
            text={it.text}
            attachments={it.attachments ?? []}
            urlOf={(file) => attachmentUrlOf(serverUrl, file, token)}
          />
        )
      case 'assistant': {
        const votes = actionSnap.votes[it.eventId] ?? []
        return (
          <AssistantBlock
            item={it}
            streaming={it.streaming !== undefined}
            votes={votes}
            feedbackBusy={actionSnap.running === 'feedback'}
            onVote={(vote) => onVote(it.eventId, vote)}
            onSaveNote={(vote, note) => {
              void actionsRef.current?.saveNote(it.eventId, vote, note)
            }}
          />
        )
      }
      case 'reasoning':
        return <ReasoningCard item={it} />
      case 'tool':
        return <ToolCard item={it} />
      case 'approval':
        return <ApprovalCard item={it} busy={snap.approvalBusy} onReply={(r) => void handleReply(it.requestId, r)} />
      case 'turn': {
        // 回合头（W18）：活动回合才带步数/工具数（activeTurn 按 turnId 配对——
        // 历史回合的 UiItem 无这些字段，不造数据）；时长随重渲染重算，不加 setInterval
        const active = slice.activeTurn
        const activeProps =
          active !== null && active.turnId === it.turnId
            ? { stepCount: active.stepCount, runningToolCount: active.runningTools.size }
            : {}
        return <TurnRow item={it} {...activeProps} />
      }
      case 'diagnostics':
        // LSP 诊断折叠卡（W18）：折叠单行入口，点按展开逐条摘要
        return <DiagnosticsCard item={it} />
      case 'question':
        // CK-6 批 2：挂起可点选作答（replyQuestion 回挂起表）；resolved/aborted 卡内翻牌摘要
        return <QuestionCard item={it} onReply={handleQuestionReply} />
    }
  }

  const bannerText =
    status === 'closed'
      ? CLOSED_TEXT
      : status === 'connecting' || status === 'reconnecting'
        ? connectionText(status, lang)
        : null

  const subtitle = slice.meta.cwd === '' ? '' : projectNameOf(slice.meta.cwd)

  return (
    <View style={[styles.screen, { backgroundColor: t.pageBackground }]}>
      <ScreenHeader
        title={headerTitle !== '' ? headerTitle : '新会话'}
        subtitle={subtitle}
        leftIcon="chevron-left"
        leftLabel="返回会话列表"
        onLeftPress={() => navigation.goBack()}
        rightIcon="more-horizontal"
        rightLabel="会话菜单"
        onRightPress={() => setMenuOpen((v) => !v)}
      />
      {/* 断线重连细条（onStatus 订阅；恢复后自动消失） */}
      {bannerText !== null && <BannerRow text={bannerText} color={t.sparkWarn} />}
      {/* 人话错误细条（ERROR_COPY/errorMessageOf 单一来源） */}
      {notice !== null && <BannerRow text={notice} color={t.sparkErr} />}
      {actionSnap.notice !== null && <BannerRow text={actionSnap.notice} color={t.sparkErr} />}
      {/* SubmitOutcome 排队语义瞬态行（19.27）：已开始/已插话/已排队——中性 accent，2.5s 自清 */}
      {hint !== null && <BannerRow text={hint} color={t.sparkAccent} />}
      {/* topBanner（19.27）：turn.completed finish=error 的回合级横幅（durable 投影，
          回放即重建）；重试=重发最后一条用户消息，无用户消息时不挂重试入口 */}
      {slice.topBanner !== null && (
        <BannerRow
          text="本轮以 error 结束"
          color={t.sparkWarn}
          pressLabel={lastUserText !== null ? '重试' : undefined}
          onPress={lastUserText !== null ? () => handleSend(lastUserText) : undefined}
        />
      )}
      {/* CK-13 批 2：交付声明只读卡（present 工具 durable 投影；无声明不渲染——禁假状态） */}
      {slice.deliverables !== null && (
        <BannerRow text={`交付文件 ${slice.deliverables.files.length} 个${slice.deliverables.summary !== undefined ? `：${slice.deliverables.summary}` : ''}`} color={t.sparkWarn} />
      )}
      {/* CK-1 批 2 尾片：后台任务只读条（slice.tasks 投影；无任务不渲染——禁假状态） */}
      {slice.tasks.length > 0 && (
        <BannerRow
          text={`后台任务 ${slice.tasks.filter((task) => !task.done).length}/${slice.tasks.length} 运行中——输出走 task_output 查询`}
          color={t.sparkAccent}
        />
      )}
      {/* CK-4 ④ 四端待办面板收尾：slice.todos 只读条（null/全完成不渲染——禁假状态）；
          进行中的排最前，模型经 todo_write 维护，端侧只读 */}
      {slice.todos !== null && todoBarText(slice.todos) !== '' && (
        <BannerRow text={todoBarText(slice.todos)} color={t.sparkAccent} />
      )}
      {/* 计划模式细条（工单 16.3 → 19.27 升真控件）：数据源 = durable 事件投影的 slice.mode；
          点按开权限档位菜单（§13.E 四档 + /plan exit），不再是只有解释没有出口的横幅。
          中性色不用 sparkWarn——plan 是常态模式不是告警，与 web 徽标/CLI footer 同口径 */}
      {slice.mode === 'plan' && (
        <BannerRow
          text="计划模式：写类工具全拒，模型只读地出计划；退出需你批准"
          color={t.mutedForeground}
          pressLabel="切换档位"
          onPress={() => setTierOpen((v) => !v)}
        />
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
          <Composer
            running={running}
            busy={snap.sending}
            placeholder={composerPlaceholder(running, delivery)}
            delivery={running ? delivery : 'now'}
            onDeliveryChange={setDelivery}
            pending={pendingAttachments.map((a) => ({ id: a.id, name: a.name }))}
            uploading={uploadingAttachment}
            onPickAttachment={() => void pickAttachment()}
            onRemoveAttachment={removeAttachment}
            onSend={(text) => void handleSend(text)}
            onStop={() => void handleStop()}
          />
        </View>
      </KeyboardAvoidingView>

      {menuOpen && (
        <MenuCard
          accessibleName="会话菜单"
          rows={menuRows}
          top={insets.top + 60}
          width={240}
          rowHeight={mobileMetrics.actionRowHeight}
          radius={mobileMetrics.actionMenuRadius}
          onDismiss={() => setMenuOpen(false)}
        />
      )}
      {tierOpen && (
        <MenuCard
          accessibleName="权限档位"
          rows={tierMenuRows}
          top={insets.top + 60}
          width={240}
          rowHeight={mobileMetrics.actionRowHeight}
          radius={mobileMetrics.actionMenuRadius}
          onDismiss={() => setTierOpen(false)}
        />
      )}

      {renameOpen && (
        <SheetScreen title="重命名会话" onClose={() => setRenameOpen(false)}>
          <View style={styles.sheetPadding}>
            <TextInput
              accessibilityLabel="会话标题"
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="会话标题"
              placeholderTextColor={t.mutedForeground}
              maxLength={120}
              style={[styles.input, { color: t.foreground, borderColor: t.border, backgroundColor: t.card }]}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="保存标题"
              disabled={actionBusy}
              onPress={() => {
                void actionsRef.current?.rename(renameDraft).then((dto) => {
                  if (dto !== null) setRenameOpen(false)
                })
              }}
              activeOpacity={0.7}
              style={[styles.cta, { backgroundColor: t.primary }]}
            >
              <Text style={[styles.ctaText, { color: t.primaryForeground }]}>
                {actionSnap.running === 'rename' ? '保存中…' : '保存'}
              </Text>
            </TouchableOpacity>
          </View>
        </SheetScreen>
      )}

      {confirmDelete && (
        <SheetScreen title="删除会话" onClose={() => setConfirmDelete(false)}>
          <View style={styles.sheetPadding}>
            <Card>
              <Text style={[styles.meta, { color: t.foreground }]}>
                会话记录会移入服务端回收目录（~/.spark/trash/），不在本机——运行中的会话不可删除。
              </Text>
            </Card>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="确认删除"
              disabled={actionBusy}
              onPress={() => {
                void actionsRef.current?.remove().then((ok) => {
                  if (ok) {
                    setConfirmDelete(false)
                    navigation.goBack()
                  }
                })
              }}
              activeOpacity={0.7}
              style={[styles.cta, { backgroundColor: t.card }]}
            >
              <Text style={[styles.ctaText, { color: t.sparkErr }]}>
                {actionSnap.running === 'delete' ? '删除中…' : '删除'}
              </Text>
            </TouchableOpacity>
          </View>
        </SheetScreen>
      )}

      {/* 管理面板三 Sheet（19.28 批 1）：树+分叉 / 检查点+回滚 / arena 只读+应用+取消 */}
      {treeOpen && (
        <SessionTreeSheet
          sid={sid}
          rest={() => getHttpTransport(serverUrl, token)}
          onClose={() => setTreeOpen(false)}
          onOpenSession={(nsid, ntitle) =>
            navigation.replace('Session', { sessionId: nsid, title: ntitle })
          }
        />
      )}
      {checkpointsOpen && (
        <CheckpointsSheet
          sid={sid}
          rest={() => getHttpTransport(serverUrl, token)}
          onClose={() => setCheckpointsOpen(false)}
          onRolledBack={() => {
            setCheckpointsOpen(false)
            setReloadEpoch((v) => v + 1)
          }}
        />
      )}
      {arenaOpen && (
        <ArenaSheet
          sid={sid}
          rest={() => getHttpTransport(serverUrl, token)}
          onClose={() => setArenaOpen(false)}
        />
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  bannerAction: {
    fontSize: mobileMetrics.caption,
    textDecorationLine: 'underline',
  },
  meta: {
    fontSize: mobileMetrics.caption,
    flexShrink: 1,
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
  sheetPadding: {
    padding: 16,
    gap: mobileMetrics.cardGap,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: mobileMetrics.value,
  },
  cta: {
    height: mobileMetrics.ctaHeight,
    borderRadius: mobileMetrics.ctaHeight / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: mobileMetrics.rowTitle,
    fontWeight: '600',
  },
})
