/**
 * MessageItem（doc/02 §6.3）：UiItem 按 kind 分发的行（转录式，DESIGN §3）。
 * §13.L L.3（v2.19 / ADR D43）：user 右对齐限宽气泡——22px 全圆角（无右下收角）、
 * 最大宽 82%、`--user-bubble` 底、无 YOU 标签（WO-058）；assistant 左锚全宽无
 * YOU 侧模型名标签（WO-059）由 AssistantBlock 排内容块；tool→ToolCard、approval→ApprovalCard。
 */
import { memo } from 'react'
import type { ContentItem, PermissionReply, SessionId } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import type { UiItem } from '@/stores/session'
import { cn } from '@/lib/utils'
import { AssistantBlock } from './AssistantBlock'
import { AssistantActions } from './AssistantActions'
import { ReasoningCollapsible } from './ReasoningCollapsible'
import { ToolCard } from './ToolCard'
import { FileText } from 'lucide-react'
import { ApprovalCard } from './ApprovalCard'
import { TurnHeader } from './TurnHeader'

/** 图片扩展名判定（WO-077）：非图片附件渲染文件卡 */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)$/i

export interface MessageItemProps {
  item: UiItem
  model: string
  /** 所属会话（工单 10.4① 尾操作行 fork/导航需要） */
  sid: SessionId
  /** 搜索跳转定位闪烁（工单 7.13）：命中行短暂底色，由 ChatView 定时清除 */
  highlight?: boolean
}

export const MessageItem = memo(function MessageItem({
  item,
  sid,
  highlight,
}: MessageItemProps) {
  // model prop 保留在接口（ChatView 调用点不破坏；§13.L WO-059 去模型名标签后本组件不再消费）
  const hl = highlight === true ? 'rounded-lg bg-secondary ring-1 ring-border' : undefined
  switch (item.kind) {
    case 'user':
      return (
        <article className={cn('flex w-full flex-col items-end', hl)}>
          {/* 附件缩略（工单 12.2a）：id 对应 server attachments/ 平铺文件；加载失败隐藏 img 保文字 */}
          {item.attachments !== undefined && item.attachments.length > 0 && (
            <div className="flex max-w-[82%] flex-wrap justify-end gap-1.5">
              {item.attachments.map((a) => {
                // §13.L L.5（WO-077）：图片=64px 缩略；文件=240px 卡（图标+文件名，DSH 形态）
                if (IMAGE_EXT_RE.test(a)) {
                  return (
                    <img
                      key={a}
                      src={`/api/attachments/${a}`}
                      alt={`附件 ${a.slice(0, 8)}`}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                      className="size-16 rounded-2xl object-cover"
                    />
                  )
                }
                return (
                  <div
                    key={a}
                    className="flex w-60 items-center gap-2 rounded-2xl border border-border px-3 py-2.5"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate text-[13px]">{a}</span>
                  </div>
                )
              })}
            </div>
          )}
          {/* §13.L L.3（WO-058）：22px 全圆角、82% 限宽、--user-bubble 底、14px/22px、无 YOU 标签 */}
          <div className="max-w-[82%] rounded-[22px] bg-user-bubble px-4 py-2.5 text-sm leading-[22px] whitespace-pre-wrap text-foreground">
            {item.text}
          </div>
        </article>
      )
    case 'turn':
      return (
        <div className={hl}>
          <TurnHeader startedAt={item.startedAt} finishedAt={item.finishedAt} />
        </div>
      )
    case 'assistant':
      return (
        <article className={cn('group/msg w-full', hl)}>
          {/* §13.L L.3（WO-059）：去模型名 RoleLabel——模型名由 TurnHeader/状态栏承载 */}
          <div>
            <AssistantBlock content={item.content} streaming={item.streaming} />
          </div>
          {/* §13.L L.6：空正文 assistant（纯工具调用/中断空稿）不挂操作行——
              隐形行占位是会话流"假空白"的另一半根因，常显后更是孤儿行（禁假状态） */}
          {item.streaming === undefined &&
            item.time !== undefined &&
            assistantTextOf(item.content).trim() !== '' && (
              <AssistantActions
                sid={sid}
                eventId={item.eventId}
                time={item.time}
                copyText={assistantTextOf(item.content)}
              />
            )}
        </article>
      )
    case 'reasoning':
      return (
        <div className={hl}>
          <ReasoningCollapsible
            text={item.text}
            streaming={item.streaming}
            {...(item.startedAt !== undefined ? { startedAt: item.startedAt } : {})}
            {...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {})}
          />
        </div>
      )
    case 'tool':
      return (
        <div className={hl}>
          <ToolCard
            name={item.name}
            input={item.input}
            status={item.status}
            progressBuf={item.progressBuf}
            output={item.output}
            isError={item.status === 'error'}
            {...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {})}
          />
        </div>
      )
    case 'approval':
      return (
        <div className={hl}>
          <ApprovalRow item={item} />
        </div>
      )
    case 'diagnostics':
      return (
        <div className={hl}>
          <DiagnosticsRow item={item} />
        </div>
      )
  }
})

/** 尾操作行复制源（工单 10.4①）：正文 text 块拼接；reasoning/toolCall 不属正文 */
function assistantTextOf(content: ContentItem[]): string {
  return content
    .filter((c): c is Extract<ContentItem, { type: 'text' }> => c.type === 'text')
    .map((c) => c.text)
    .join('\n\n')
}

/** 审批行：ApprovalCard + transport 回复派发 */
function ApprovalRow({ item }: { item: Extract<UiItem, { kind: 'approval' }> }) {
  const { transport } = useTransport()
  function onReply(reply: PermissionReply, feedback?: string) {
    void transport.replyPermission(ids.request(item.requestId), reply, feedback)
  }
  return (
    <ApprovalCard
      action={item.action}
      resource={item.resource}
      patterns={item.patterns}
      alwaysPatterns={item.alwaysPatterns}
      reason={item.reason}
      detail={item.detail}
      status={item.status}
      reply={item.reply}
      onReply={onReply}
    />
  )
}

/** 严重度角标配色：error 琥珀警示、warning 前景、info/hint 弱化（中性基调，warn 仅点睛） */
function severityText(severity: number): { label: string; cls: string } {
  if (severity === 1) return { label: 'E', cls: 'text-[var(--spark-warn)]' }
  if (severity === 2) return { label: 'W', cls: 'text-foreground' }
  return { label: 'I', cls: 'text-muted-foreground' }
}

/** LSP 诊断行（工单 16.9）：语言 + 文件 + 逐条（严重度/位置/消息），诊断清零如实显示 */
function DiagnosticsRow({ item }: { item: Extract<UiItem, { kind: 'diagnostics' }> }) {
  const file = item.uri.startsWith('file:') ? item.uri.slice('file:'.length) : item.uri
  return (
    <article className="w-full rounded-xl border border-border px-3 py-2">
      <p className="font-mono text-xs text-muted-foreground">
        LSP {item.language} · {file || '(未知文件)'}
      </p>
      {item.diagnostics.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted-foreground">诊断已清零（无错误）</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {item.diagnostics.map((d, i) => {
            const sev = severityText(d.severity)
            return (
              <li key={i} className="text-[13px] leading-relaxed">
                <span className={cn('font-mono', sev.cls)}>[{sev.label}]</span>{' '}
                <span className="font-mono text-xs text-muted-foreground">
                  {d.range.start.line + 1}:{d.range.start.character + 1}
                </span>{' '}
                {d.message}
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
