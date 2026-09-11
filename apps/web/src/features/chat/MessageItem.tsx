/**
 * MessageItem（doc/02 §6.3）：UiItem 按 kind 分发的行（转录式，DESIGN §3）。
 * user/assistant 带角色标签行（12px 灰标签 YOU/模型名）；user 右对齐限宽气泡
 * （radius 18、右下角 4px 收角、最大宽 80%——工单 10.22 / DESIGN §13.H v2.10）；
 * assistant 左锚全宽无背景由 AssistantBlock 排内容块；tool→ToolCard、approval→ApprovalCard。
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
import { ApprovalCard } from './ApprovalCard'
import { TurnHeader } from './TurnHeader'

export interface MessageItemProps {
  item: UiItem
  model: string
  /** 所属会话（工单 10.4① 尾操作行 fork/导航需要） */
  sid: SessionId
  /** 搜索跳转定位闪烁（工单 7.13）：命中行短暂底色，由 ChatView 定时清除 */
  highlight?: boolean
}

export const MessageItem = memo(function MessageItem({ item, model, sid, highlight }: MessageItemProps) {
  const hl = highlight === true ? 'rounded-md bg-secondary ring-1 ring-border' : undefined
  switch (item.kind) {
    case 'user':
      return (
        <article className={cn('flex w-full flex-col items-end', hl)}>
          <RoleLabel>YOU</RoleLabel>
          {/* 附件缩略（工单 12.2a）：id 对应 server attachments/ 平铺文件；加载失败隐藏 img 保文字 */}
          {item.attachments !== undefined && item.attachments.length > 0 && (
            <div className="mt-1 flex max-w-[80%] flex-wrap justify-end gap-1.5">
              {item.attachments.map((a) => (
                <img
                  key={a}
                  src={`/api/attachments/${a}`}
                  alt={`附件 ${a.slice(0, 8)}`}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                  className="h-20 rounded-lg border border-border object-cover"
                />
              ))}
            </div>
          )}
          <div className="mt-1 max-w-[80%] rounded-[18px] rounded-br-[4px] bg-accent px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
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
        <article className={cn('w-full', hl)}>
          <RoleLabel>{model}</RoleLabel>
          <div className="mt-1">
            <AssistantBlock content={item.content} streaming={item.streaming} />
          </div>
          {item.streaming === undefined && item.time !== undefined && (
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

function RoleLabel({ children }: { children: string }) {
  return <p className="font-mono text-xs text-muted-foreground">{children}</p>
}

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
    <article className="w-full rounded-md border border-border px-3 py-2">
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
