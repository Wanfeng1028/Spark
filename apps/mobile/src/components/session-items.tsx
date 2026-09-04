/**
 * 会话页消息流子组件（工单 9.3，DESIGN §13.J.2.3 实测定死形态）：
 * user 右对齐浅灰胶囊（无头像）/ assistant 全宽纯文本+操作行（复制+"内容由 AI 生成"）/
 * 工具卡单行折叠 / 思考块折叠（§13.H 迁移）/ 审批卡白卡+warn 左边条+三键纵向全宽（J.3）。
 * 反 AI 味（§13.I/J.5）：系统字体、单档阴影、禁渐变/emoji，动效仅微动效。
 */
import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { COPY_TEXT, approvalResolvedText, toolStatusText, type UiItem } from '@spark/protocol'
import { useTheme } from '../theme/use-theme'
import { Card, Hairline } from './ui'
import { mobileMetrics } from '../theme/tokens'

/** user 消息：右对齐浅灰胶囊（zinc-100 底、radius 18、内边距 10/14、最大宽 80%、16px、无头像） */
export function UserBubble({ text }: { text: string }) {
  const t = useTheme()
  return (
    <View style={styles.userRow}>
      <View style={[styles.userBubble, { backgroundColor: t.muted }]}>
        <Text style={[styles.userText, { color: t.foreground }]}>{text}</Text>
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

/** assistant 消息：全宽纯文本 17、段落间空行、无底色无边框；尾部操作行=复制+"内容由 AI 生成" */
export function AssistantBlock({
  item,
  streaming,
}: {
  item: Extract<UiItem, { kind: 'assistant' }>
  streaming: boolean
}) {
  const t = useTheme()
  const [copied, setCopied] = useState(false)
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
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <View style={styles.assistantBlock}>
      {finalized !== '' && <Text style={[styles.assistantText, { color: t.foreground }]}>{finalized}</Text>}
      {buf !== '' && <StreamingText text={buf} color={t.foreground} />}
      {/* 操作行（J.2.3：v1 只做复制+合规标注；👍👎 记 v2 需反馈存储） */}
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
          <Text style={[styles.meta, { color: t.mutedForeground }]}>内容由 AI 生成</Text>
        </View>
      )}
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
})
