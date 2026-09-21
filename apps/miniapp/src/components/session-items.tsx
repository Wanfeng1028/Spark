/**
 * 会话页消息流子组件（工单 9.4——语义对齐 apps/mobile session-items.tsx，
 * DESIGN §13.J.2.3 形态；RN 组件在小程序不可用，全部以 Taro 组件自绘）。
 * user 右对齐浅灰胶囊 / assistant 全宽纯文本+操作行（复制+"内容由 AI 生成"）/
 * 工具卡单行折叠 / 思考块折叠（流式自动展开，手动优先）/
 * 审批卡白卡+warn 左边条+三键纵向全宽（J.3）；
 * 回合头单行裸文本与 LSP 诊断折叠卡（工单 W18，语义对齐 mobile）。
 * 反 AI 味（§13.I）：系统字体、单档阴影、禁渐变/emoji。
 */
import { useEffect, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  COPY_TEXT,
  approvalResolvedText,
  severityOf,
  toolStatusText,
  turnDurationText,
  type UiItem,
} from '@spark/protocol'
import { useTheme } from '../store/theme-store'
import { attachmentUrlOf } from '../session/attachments'
import { AttachmentThumb, Card, Hairline } from './ui'
import './session-items.css'

/** user 消息：右对齐浅灰胶囊（无头像；最大宽 80%，radius 36rpx）。
 *  附件缩略（工单 19.29 补齐批；投影字段 `user.message.attachments` 自 12.2a 就在）：
 *  文本上方一排 64px 方块，取图走 GET /api/attachments/:file，非环回带 ?token=。
 *  历史事件的 attachments 存的是文件名（`<id>.<ext>`），原始名不随事件落盘——
 *  加载失败回落的就是这个文件名。 */
export function UserBubble({
  text,
  attachments = [],
  baseUrl = '',
  token = '',
}: {
  text: string
  attachments?: readonly string[]
  /** 取图基址：空串 = 未配置服务器（不出缩略，只出文件名行——不拿坏 URL 冒充能取图） */
  baseUrl?: string
  token?: string
}) {
  const t = useTheme()
  return (
    <View className="si-user-row">
      <View className="si-user-bubble" style={{ backgroundColor: t.muted }}>
        {attachments.length > 0 && baseUrl !== '' && (
          <View className="si-user-attachments">
            {attachments.map((file) => (
              <AttachmentThumb
                key={file}
                url={attachmentUrlOf(baseUrl, file, token)}
                name={file}
              />
            ))}
          </View>
        )}
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
    // 小程序剪贴板带系统 toast——静默不了则容忍（文案一致即可）
    Taro.setClipboardData({ data: fullText })
      .then(() => {
        setCopied(true)
        if (copyTimer.current !== null) clearTimeout(copyTimer.current)
        copyTimer.current = setTimeout(() => {
          copyTimer.current = null
          setCopied(false)
        }, 1500)
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
      {/* 操作行（J.2.3）：只做复制 + 合规标注。👍👎 本端未接——后端已有
          `Transport.submitFeedback`（工单 19.19），缺的是端上的两件事：assistant 行的
          eventId 定位与投票态回读（GET /api/feedback 按 session+event 过滤）。
          接法与 web 同形，登记在 apps/miniapp/README「未接面」段，不留"以后再说"式占位。 */}
      {!streaming && (
        <View className="si-action-row">
          <View className="si-copy-btn" aria-label="复制消息" onClick={onCopy}>
            <Text className="si-meta" style={{ color: t.mutedForeground }}>
              {/* 小程序无图标组件——✓ 是视觉补偿记号（非 emoji 装饰）；文案本体走 protocol COPY_TEXT 单源，见 ui-copy.ts 头注释边界说明 2 */}
              {copied ? `✓ ${COPY_TEXT.copied}` : COPY_TEXT.copy}
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

/** 回合头（工单 W18，§13.J.2.3）：单行紧凑裸文本行——非卡片（回合头是流结构标记不是
 *  内容块，web TurnHeader / CLI TurnLine 同语义）。进行中=`工作中 · N 秒 · 第 M 步 · K 工具`
 *  （步数/工具数仅活动回合可得——activeTurn 按 turnId 配对，历史回合不造数据）；完成=
 *  `已工作 N 秒`（信封时间差定格）。计时不加定时器——随 setData 批处理重渲染重算
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
    <View className="si-turn-row">
      <Text className="si-meta" style={{ color: running ? t.sparkAccent : t.mutedForeground }}>
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

/** LSP 诊断卡（工单 16.9 小程序形态/W18，§13.J.2.3）：折叠白卡单行入口（同工具卡交互）——
 *  点按展开逐条摘要（[E/W/I] 行:列 消息，位置 1-based，severity 取色 protocol severityOf
 *  单源）。空数组=诊断清零（publish 清除语义），如实显示且无展开；默认折叠（到达即定稿）。 */
export function DiagnosticsCard({ item }: { item: Extract<UiItem, { kind: 'diagnostics' }> }) {
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)
  const file = item.uri.startsWith('file:') ? item.uri.slice('file:'.length) : item.uri
  const errors = item.diagnostics.filter((d) => d.severity === 1).length
  const warnings = item.diagnostics.filter((d) => d.severity === 2).length
  const cleared = item.diagnostics.length === 0
  const meta = cleared ? '诊断已清零' : `E ${errors} / W ${warnings}`
  return (
    <Card className="si-tight-card">
      <View
        className="si-card-header"
        aria-label={`LSP 诊断 ${item.language}，${meta}${cleared ? '' : `，${expanded ? '收起' : '展开'}`}`}
        onClick={() => {
          if (!cleared) setExpanded(!expanded)
        }}
      >
        <Text className="si-card-title si-ellipsis" style={{ color: t.mutedForeground }}>
          {`LSP ${item.language} · ${file === '' ? '未知文件' : file}`}
        </Text>
        <Text className="si-meta" style={{ color: t.mutedForeground }}>
          {meta}
        </Text>
        {!cleared && (
          <Text className="si-chevron" style={{ color: t.mutedForeground }}>
            {expanded ? '∧' : '∨'}
          </Text>
        )}
      </View>
      {expanded &&
        !cleared &&
        item.diagnostics.map((d, i) => {
          const sev = severityOf(d.severity, t)
          return (
            <Text key={i} className="si-detail-text" style={{ color: t.foreground }}>
              {/* 空格内联进字面量尾——空白独立文本节点在部分小程序基础库会被裁剪 */}
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
