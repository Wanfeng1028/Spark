/**
 * 会话页消息流子组件（工单 9.4——语义对齐 apps/mobile session-items.tsx，
 * DESIGN §13.J.2.3 形态；RN 组件在小程序不可用，全部以 Taro 组件自绘）。
 * user 右对齐浅灰胶囊 / assistant 全宽纯文本+操作行（复制+"内容由 AI 生成"）/
 * 工具卡单行折叠 / 思考块折叠（流式自动展开，手动优先）/
 * 审批卡白卡+warn 左边条+三键纵向全宽（J.3）。
 * 反 AI 味（§13.I）：系统字体、单档阴影、禁渐变/emoji。
 */
import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { UiItem } from '@spark/protocol'
import { useTheme } from '../store/theme-store'
import { Card, Hairline } from './ui'
import './session-items.css'

/** user 消息：右对齐浅灰胶囊（无头像；最大宽 80%，radius 36rpx） */
export function UserBubble({ text }: { text: string }) {
  const t = useTheme()
  return (
    <View className="si-user-row">
      <View className="si-user-bubble" style={{ backgroundColor: t.muted }}>
        <Text className="si-user-text" style={{ color: t.foreground }}>
          {text}
        </Text>
      </View>
    </View>
  )
}

/** assistant 消息：全宽纯文本、段落空行、无底色无边框；尾部操作行=复制+合规标注 */
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
    // 小程序剪贴板带系统 toast——静默不了则容忍（文案一致即可）
    Taro.setClipboardData({ data: fullText })
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        // 复制失败不阻断阅读（下次可再点）——如实不提示假成功
      })
  }

  return (
    <View className="si-assistant">
      {fullText !== '' && (
        <Text className="si-assistant-text" style={{ color: t.foreground }}>
          {fullText}
        </Text>
      )}
      {/* 操作行（J.2.3：v1 只做复制+合规标注；👍👎 记 v2 需反馈存储） */}
      {!streaming && (
        <View className="si-action-row">
          <View className="si-copy-btn" aria-label="复制消息" onClick={onCopy}>
            <Text className="si-meta" style={{ color: t.mutedForeground }}>
              {copied ? '✓ 已复制' : '复制'}
            </Text>
          </View>
          <Text className="si-meta" style={{ color: t.mutedForeground }}>
            内容由 AI 生成
          </Text>
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
    <Card className="si-tight-card">
      <View
        className="si-card-header"
        aria-label={expanded ? '收起思考过程' : '展开思考过程'}
        onClick={() => setOverride(!expanded)}
      >
        <Text className="si-card-title" style={{ color: t.mutedForeground }}>
          {streaming ? '思考中…' : '思考过程'}
        </Text>
        <Text className="si-chevron" style={{ color: t.mutedForeground }}>
          {expanded ? '∧' : '∨'}
        </Text>
      </View>
      {expanded && (
        <Text className="si-detail-text" style={{ color: t.mutedForeground }}>
          {item.text}
        </Text>
      )}
    </Card>
  )
}

function toolStatusText(status: 'running' | 'completed' | 'error'): string {
  if (status === 'running') return '运行中'
  if (status === 'error') return '失败'
  return '完成'
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
    <Card className="si-tight-card">
      <View
        className="si-card-header"
        aria-label={`工具 ${item.name}，${toolStatusText(item.status)}，${expanded ? '收起' : '展开'}详情`}
        onClick={() => setOverride(!expanded)}
      >
        <Text className="si-card-title si-ellipsis" style={{ color: t.foreground }}>
          {item.name}
        </Text>
        <Text className="si-meta" style={{ color: statusColor }}>
          {toolStatusText(item.status)}
        </Text>
        <Text className="si-chevron" style={{ color: t.mutedForeground }}>
          {expanded ? '∧' : '∨'}
        </Text>
      </View>
      {expanded && detail !== '' && detail !== '""' && (
        <Text className="si-detail-text si-clamp" style={{ color: t.mutedForeground }}>
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
  /** 决策在途：三键齐禁（防抖闸门的渲染面，同 RN 评审 H3） */
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
    <View
      className="si-approval-btn"
      aria-label={label}
      onClick={() => {
        if (!disabled) onPress()
      }}
      style={{ backgroundColor: bg, opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="si-approval-btn-text" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  )
}

function approvalResolvedText(reply: 'once' | 'always' | 'reject' | undefined): string {
  if (reply === 'once') return '已允许本次'
  if (reply === 'always') return '已始终允许'
  if (reply === 'reject') return '已拒绝'
  return '已处理'
}

/** 审批卡：白卡 + warn 左边条 + 三键纵向全宽（J.3）；决策走 REST.replyPermission */
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
    <View className="si-approval-card" style={{ backgroundColor: t.card }}>
      <View className="si-approval-bar" style={{ backgroundColor: t.sparkWarn }} />
      <View className="si-approval-body">
        <Text className="si-card-title" style={{ color: t.foreground }}>
          请求授权
        </Text>
        <Text className="si-approval-resource" style={{ color: t.foreground }}>
          {item.resource}
        </Text>
        {item.reason !== '' && (
          <Text className="si-meta" style={{ color: t.mutedForeground }}>
            {item.reason}
          </Text>
        )}
        {item.status === 'pending' ? (
          <View className="si-approval-buttons">
            <ApprovalButton label="允许" variant="primary" disabled={busy} onPress={() => onReply('once')} />
            <ApprovalButton label="始终允许" variant="secondary" disabled={busy} onPress={() => onReply('always')} />
            <ApprovalButton label="拒绝" variant="danger" disabled={busy} onPress={() => onReply('reject')} />
          </View>
        ) : (
          <View>
            <Hairline />
            <View className="si-approval-resolved">
              <Text className="si-meta" style={{ color: t.mutedForeground }}>
                {approvalResolvedText(item.reply)}
                {busy ? '，提交中…' : ''}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
