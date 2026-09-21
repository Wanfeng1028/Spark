/**
 * 会话页消息流子组件（工单 9.3，DESIGN §13.J.2.3 实测定死形态；19.27 补齐两半）：
 * user 右对齐浅灰胶囊（无头像；attachments 缩略）/ assistant 全宽纯文本+操作行
 * （复制 + 反馈两票 + "内容由 AI 生成"）/ 工具卡单行折叠 / 思考块折叠（§13.H 迁移）/
 * 审批卡白卡+warn 左边条+三键纵向全宽（J.3）；
 * 回合头单行裸文本与 LSP 诊断折叠卡（工单 W18）。
 * 反 AI 味（§13.I/J.5）：系统字体、单档阴影、禁渐变/emoji，动效仅微动效。
 */
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import {
  COPY_TEXT,
  approvalResolvedText,
  severityOf,
  toolStatusText,
  turnDurationText,
  type FeedbackVote,
  type UiItem,
} from '@spark/protocol'
import { useTheme } from '../theme/use-theme'
import { Card, Hairline } from './ui'
import { mobileMetrics } from '../theme/tokens'

/**
 * user 消息：右对齐浅灰胶囊（zinc-100 底、radius 18、内边距 10/14、最大宽 80%、16px、无头像）。
 * 附件缩略（工单 19.27）：投影里的 `attachments` 是服务端文件名，渲染侧经
 * `attachmentUrlOf` 拼成 /api/attachments/<file>；取不到地址（未配置服务器）就退成
 * mono 文件名行——不画破图。
 */
export function UserBubble({
  text,
  attachments = [],
  urlOf,
}: {
  text: string
  attachments?: readonly string[]
  urlOf: (file: string) => string | null
}) {
  const t = useTheme()
  return (
    <View style={styles.userRow}>
      <View style={[styles.userBubble, { backgroundColor: t.muted }]}>
        {attachments.length > 0 && (
          <View style={styles.userAttachments}>
            {attachments.map((file) => {
              const uri = urlOf(file)
              return uri === null ? (
                <Text key={file} style={[styles.mono, { color: t.mutedForeground }]}>
                  {file}
                </Text>
              ) : (
                <Image
                  key={file}
                  source={{ uri }}
                  accessibilityLabel={`附件 ${file}`}
                  resizeMode="cover"
                  style={styles.userAttachmentThumb}
                />
              )
            })}
          </View>
        )}
        {text !== '' && (
          <Text style={[styles.userText, { color: t.foreground }]}>{text}</Text>
        )}
      </View>
    </View>
  )
}

/** 流式增量文字渐显（opacity 微动效 120ms——J.2.3；仅挂载时一次，不逐字重放） */
function StreamingText({ text, color }: { text: string; color: string }) {
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start()
  }, [opacity])
  return <Animated.Text style={[styles.assistantText, { color, opacity }]}>{text}</Animated.Text>
}

/** assistant 消息：全宽纯文本 17、段落间空行、无底色无边框；
 *  尾部操作行=复制 + 反馈两票 + "内容由 AI 生成"（J.2.3；👍👎 用线性图标不用 emoji——§12.7）。
 *  反馈真接线（工单 19.19 消解 V2-25）：同票再点撤回、异票改票，备注走 submitFeedback 幂等更新。 */
export function AssistantBlock({
  item,
  streaming,
  votes,
  feedbackBusy,
  onVote,
  onSaveNote,
}: {
  item: Extract<UiItem, { kind: 'assistant' }>
  streaming: boolean
  /** 本条已提交的票型（数据源 GET /api/feedback；空数组 = 未反馈） */
  votes: readonly FeedbackVote[]
  /** 反馈请求在途（单飞闸门的渲染面） */
  feedbackBusy: boolean
  onVote: (vote: FeedbackVote) => void
  onSaveNote: (vote: FeedbackVote, note: string) => void
}) {
  const t = useTheme()
  const [copied, setCopied] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  // AUD-13：定时器存 ref——连点先清旧再设新（防前次提前复位"已复制"态），卸载清理
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current)
    }
  }, [])
  const texts: string[] = []
  for (const c of item.content) {
    if (c.type === 'text') texts.push(c.text)
  }
  const finalized = texts.join('\n\n')
  const buf = item.streaming?.textBuf ?? ''
  const fullText = finalized !== '' && buf !== '' ? `${finalized}\n\n${buf}` : finalized + buf

  const onCopy = (): void => {
    void Clipboard.setStringAsync(fullText).then(() => {
      setCopied(true)
      if (copyTimer.current !== null) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => {
        copyTimer.current = null
        setCopied(false)
      }, 1500)
    })
  }

  /** 存备注：票型是提交过的那张（无票时本行不渲染，走不到这里） */
  const saveNote = (): void => {
    const voted = votes[0]
    if (voted === undefined) return
    onSaveNote(voted, noteDraft)
    setNoteOpen(false)
    setNoteDraft('')
  }

  return (
    <View style={styles.assistantBlock}>
      {finalized !== '' && <Text style={[styles.assistantText, { color: t.foreground }]}>{finalized}</Text>}
      {buf !== '' && <StreamingText text={buf} color={t.foreground} />}
      {!streaming && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="复制消息"
            onPress={onCopy}
            style={styles.copyButton}
            activeOpacity={0.7}
          >
            <Feather name={copied ? 'check' : 'copy'} size={14} color={t.mutedForeground} />
            <Text style={[styles.meta, { color: t.mutedForeground }]}>
              {copied ? COPY_TEXT.copied : COPY_TEXT.copy}
            </Text>
          </TouchableOpacity>
          {(['up', 'down'] as const).map((v) => {
            const on = votes.includes(v)
            return (
              <TouchableOpacity
                key={v}
                accessibilityRole="button"
                accessibilityState={{ selected: on, busy: feedbackBusy }}
                accessibilityLabel={
                  on
                    ? v === 'up'
                      ? '已标记有帮助（再点撤回）'
                      : '已标记无帮助（再点撤回）'
                    : v === 'up'
                      ? '有帮助'
                      : '无帮助'
                }
                disabled={feedbackBusy}
                onPress={() => {
                  onVote(v)
                  // 有票才留备注入口；撤到无票时收起编辑态（不留悬空输入框）
                  if (on) setNoteOpen(false)
                }}
                style={[styles.copyButton, feedbackBusy ? styles.dimmed : null]}
                activeOpacity={0.7}
              >
                <Feather
                  name={v === 'up' ? 'thumbs-up' : 'thumbs-down'}
                  size={14}
                  color={on ? t.foreground : t.mutedForeground}
                />
              </TouchableOpacity>
            )
          })}
          {votes.length > 0 && !noteOpen && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="补充反馈备注"
              onPress={() => setNoteOpen(true)}
              style={styles.copyButton}
              activeOpacity={0.7}
            >
              <Text style={[styles.meta, { color: t.mutedForeground }]}>备注</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.meta, { color: t.mutedForeground }]}>内容由 AI 生成</Text>
        </View>
      )}
      {noteOpen && (
        <View style={styles.noteRow}>
          <TextInput
            accessibilityLabel="反馈备注"
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder="补充备注（可空）"
            placeholderTextColor={t.mutedForeground}
            maxLength={2000}
            style={[styles.noteInput, { color: t.foreground, borderColor: t.border }]}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="保存备注"
            disabled={feedbackBusy}
            onPress={saveNote}
            style={styles.copyButton}
            activeOpacity={0.7}
          >
            <Text style={[styles.meta, { color: t.mutedForeground }]}>保存</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="取消备注"
            onPress={() => setNoteOpen(false)}
            style={styles.copyButton}
            activeOpacity={0.7}
          >
            <Text style={[styles.meta, { color: t.mutedForeground }]}>取消</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

/** 回合头（工单 W18，§13.J.2.3）：单行紧凑裸文本行——回合头是流结构标记不是内容块
 *  （非卡片，web TurnHeader / CLI TurnLine 同语义）。进行中=`工作中 · N 秒 · 第 M 步 · K 工具`
 *  （步数/工具数仅活动回合可得——slice.activeTurn 按 turnId 配对，历史回合不造数据）；
 *  完成=`已工作 N 秒`（信封时间差定格）。计时不加 setInterval——随快照批处理重渲染重算
 *  （流式 delta 即驱动），静态期显示值可滞后。 */
export function TurnRow({
  item,
  stepCount,
  runningToolCount,
}: {
  item: Extract<UiItem, { kind: 'turn' }>
  /** 活动回合步数（slice.activeTurn.stepCount——仅运行中 turn 的行传入） */
  stepCount?: number
  /** 活动回合运行中工具数（slice.activeTurn.runningTools.size） */
  runningToolCount?: number
}) {
  const t = useTheme()
  const running = item.finishedAt === undefined
  const ms = Math.max(0, (item.finishedAt ?? Date.now()) - item.startedAt)
  const parts: string[] = [
    running ? `工作中 · ${turnDurationText(ms)}` : `已工作 ${turnDurationText(ms)}`,
  ]
  if (running && stepCount !== undefined) parts.push(`第 ${stepCount} 步`)
  if (running && runningToolCount !== undefined && runningToolCount > 0) {
    parts.push(`${runningToolCount} 工具`)
  }
  return (
    <View style={styles.turnRow}>
      <Text style={[styles.meta, { color: running ? t.sparkAccent : t.mutedForeground }]}>
        {parts.join(' · ')}
      </Text>
    </View>
  )
}

/** 思考块折叠（§13.H 迁移：流式中自动展开，结束后收起；手动操作优先） */
export function ReasoningCard({ item }: { item: Extract<UiItem, { kind: 'reasoning' }> }) {
  const t = useTheme()
  const streaming = item.streaming ?? false
  const [override, setOverride] = useState<boolean | null>(null)
  const expanded = override ?? streaming
  return (
    <Card style={styles.tightCard}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={expanded ? '收起思考过程' : '展开思考过程'}
        onPress={() => setOverride(!expanded)}
        style={styles.cardHeaderRow}
        activeOpacity={0.7}
      >
        <Text style={[styles.cardTitle, { color: t.mutedForeground }]}>
          {streaming ? '思考中…' : '思考过程'}
        </Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={t.mutedForeground} />
      </TouchableOpacity>
      {expanded && (
        <Text style={[styles.reasoningText, { color: t.mutedForeground }]}>{item.text}</Text>
      )}
    </Card>
  )
}

/** 工具卡单行折叠（§13.H 迁移：白卡紧凑行；错误态默认展开） */
export function ToolCard({ item }: { item: Extract<UiItem, { kind: 'tool' }> }) {
  const t = useTheme()
  const [override, setOverride] = useState<boolean | null>(null)
  const expanded = override ?? item.status === 'error'
  const statusColor =
    item.status === 'error' ? t.sparkErr : item.status === 'running' ? t.sparkAccent : t.mutedForeground
  const detail =
    item.status === 'error'
      ? typeof item.output === 'string'
        ? item.output
        : JSON.stringify(item.output)
      : item.progressBuf !== ''
        ? item.progressBuf
        : typeof item.output === 'string'
          ? item.output
          : JSON.stringify(item.output ?? '')
  return (
    <Card style={styles.tightCard}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`工具 ${item.name}，${toolStatusText(item.status)}，${expanded ? '收起' : '展开'}详情`}
        onPress={() => setOverride(!expanded)}
        style={styles.cardHeaderRow}
        activeOpacity={0.7}
      >
        <Text numberOfLines={1} style={[styles.cardTitle, { color: t.foreground }]}>
          {item.name}
        </Text>
        <Text style={[styles.meta, { color: statusColor }]}>{toolStatusText(item.status)}</Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={t.mutedForeground} />
      </TouchableOpacity>
      {expanded && detail !== '' && detail !== '""' && (
        <Text numberOfLines={12} style={[styles.reasoningText, { color: t.mutedForeground }]}>
          {detail}
        </Text>
      )}
    </Card>
  )
}

/** LSP 诊断卡（工单 16.9 移动端形态/W18，§13.J.2.3）：折叠白卡单行入口（同工具卡交互）——
 *  移动端不展开大卡，点按展开逐条摘要（[E/W/I] 行:列 消息，位置 1-based，severity 取色
 *  protocol severityOf 单源）。空数组=诊断清零（publish 清除语义），如实显示且无展开动作；
 *  默认折叠（诊断到达即定稿，非流式关注点）。 */
export function DiagnosticsCard({ item }: { item: Extract<UiItem, { kind: 'diagnostics' }> }) {
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)
  const file = item.uri.startsWith('file:') ? item.uri.slice('file:'.length) : item.uri
  const errors = item.diagnostics.filter((d) => d.severity === 1).length
  const warnings = item.diagnostics.filter((d) => d.severity === 2).length
  const cleared = item.diagnostics.length === 0
  const meta = cleared ? '诊断已清零' : `E ${errors} / W ${warnings}`
  return (
    <Card style={styles.tightCard}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`LSP 诊断 ${item.language}，${meta}${
          cleared ? '' : `，${expanded ? '收起' : '展开'}`
        }`}
        disabled={cleared}
        onPress={() => setExpanded(!expanded)}
        style={styles.cardHeaderRow}
        activeOpacity={0.7}
      >
        <Text numberOfLines={1} style={[styles.cardTitle, { color: t.mutedForeground }]}>
          {`LSP ${item.language} · ${file === '' ? '未知文件' : file}`}
        </Text>
        <Text style={[styles.meta, { color: t.mutedForeground }]}>{meta}</Text>
        {!cleared && (
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={t.mutedForeground} />
        )}
      </TouchableOpacity>
      {expanded &&
        !cleared &&
        item.diagnostics.map((d, i) => {
          const sev = severityOf(d.severity, t)
          return (
            <Text key={i} style={[styles.diagLine, { color: t.foreground }]}>
              <Text style={{ color: sev.color }}>{`[${sev.label}] `}</Text>
              <Text style={{ color: t.mutedForeground }}>
                {`${d.range.start.line + 1}:${d.range.start.character + 1} `}
              </Text>
              {d.message}
            </Text>
          )
        })}
    </Card>
  )
}

/** 审批决策键（纵向全宽三键——J.3；允许=主黑胶囊/始终允许=浅底/拒绝=红字） */
function ApprovalButton({
  label,
  variant,
  onPress,
  disabled,
}: {
  label: string
  variant: 'primary' | 'secondary' | 'danger'
  onPress: () => void
  /** 决策在途：三键齐禁（评审 H3 防抖的渲染面） */
  disabled: boolean
}) {
  const t = useTheme()
  const bg = variant === 'primary' ? t.primary : variant === 'secondary' ? t.secondary : t.card
  const fg =
    variant === 'primary'
      ? t.primaryForeground
      : variant === 'danger'
        ? t.destructive
        : t.foreground
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.approvalButton, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[styles.approvalButtonText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  )
}

/** 审批卡：白卡 + warn 左边条 + 三键纵向全宽（J.3）；决策走 Transport.replyPermission */
export function ApprovalCard({
  item,
  busy,
  onReply,
}: {
  item: Extract<UiItem, { kind: 'approval' }>
  /** 决策请求在途（防双击重复提交） */
  busy: boolean
  onReply: (reply: 'once' | 'always' | 'reject') => void
}) {
  const t = useTheme()
  return (
    <View style={[styles.approvalCard, { backgroundColor: t.card }]}>
      <View style={[styles.approvalBar, { backgroundColor: t.sparkWarn }]} />
      <View style={styles.approvalBody}>
        <Text style={[styles.cardTitle, { color: t.foreground }]}>请求授权</Text>
        <Text style={[styles.approvalResource, { color: t.foreground }]}>{item.resource}</Text>
        {item.reason !== '' && (
          <Text style={[styles.meta, { color: t.mutedForeground }]}>{item.reason}</Text>
        )}
        {item.status === 'pending' ? (
          <View style={styles.approvalButtons}>
            <ApprovalButton
              label="允许"
              variant="primary"
              disabled={busy}
              onPress={() => onReply('once')}
            />
            <ApprovalButton
              label="始终允许"
              variant="secondary"
              disabled={busy}
              onPress={() => onReply('always')}
            />
            <ApprovalButton
              label="拒绝"
              variant="danger"
              disabled={busy}
              onPress={() => onReply('reject')}
            />
          </View>
        ) : (
          <>
            <Hairline inset={0} />
            <Text style={[styles.meta, { color: t.mutedForeground, paddingTop: 8 }]}>
              {approvalResolvedText(item.reply)}
              {busy ? '，提交中…' : ''}
            </Text>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  userBubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  userAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  userAttachmentThumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#00000008',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: mobileMetrics.caption,
  },
  userText: {
    fontSize: mobileMetrics.rowTitle,
  },
  assistantBlock: {
    gap: 6,
  },
  assistantText: {
    fontSize: mobileMetrics.headerTitle,
    lineHeight: 24,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  dimmed: {
    opacity: 0.5,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    fontSize: mobileMetrics.caption,
  },
  meta: {
    fontSize: mobileMetrics.caption,
  },
  tightCard: {
    paddingVertical: 10,
    gap: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: mobileMetrics.value,
    fontWeight: '600',
  },
  reasoningText: {
    fontSize: mobileMetrics.caption,
    lineHeight: 18,
  },
  approvalCard: {
    flexDirection: 'row',
    borderRadius: mobileMetrics.cardRadius,
    padding: mobileMetrics.cardPadding,
    overflow: 'hidden',
  },
  approvalBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  approvalBody: {
    flex: 1,
    backgroundColor: 'transparent',
    gap: 8,
    paddingLeft: 12,
  },
  approvalResource: {
    fontSize: mobileMetrics.rowTitle,
  },
  approvalButtons: {
    gap: 8,
    paddingTop: 4,
  },
  approvalButton: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalButtonText: {
    fontSize: mobileMetrics.rowTitle,
    fontWeight: '600',
  },
  turnRow: {
    paddingVertical: 4,
  },
  diagLine: {
    fontSize: mobileMetrics.caption,
    lineHeight: 18,
  },
})
