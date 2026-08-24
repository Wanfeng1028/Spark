/**
 * MessageItem（doc/02 §6.3）：UiItem 按 kind 分发的全宽行（转录式，DESIGN §3）。
 * user/assistant 带角色标签行（12px 灰标签 YOU/模型名）；user 浅背景块 4px 圆角全宽；
 * assistant 无背景由 AssistantBlock 排内容块。
 * tool/approval 此处为最小占位渲染（ToolCard/ApprovalCard 是工单 4）——
 * 占位必须保持 mock reject 场景可走查（审批三按钮可用），不引入假状态。
 */
import { memo, useState } from 'react'
import type { PermissionReply } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import type { UiItem } from '@/stores/session'
import { AssistantBlock } from './AssistantBlock'
import { ReasoningCollapsible } from './ReasoningCollapsible'

export interface MessageItemProps {
  item: UiItem
  model: string
}

export const MessageItem = memo(function MessageItem({ item, model }: MessageItemProps) {
  switch (item.kind) {
    case 'user':
      return (
        <article className="w-full">
          <RoleLabel>YOU</RoleLabel>
          <div className="mt-1 w-full rounded-[4px] bg-accent px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
            {item.text}
          </div>
        </article>
      )
    case 'assistant':
      return (
        <article className="w-full">
          <RoleLabel>{model}</RoleLabel>
          <div className="mt-1">
            <AssistantBlock content={item.content} streaming={item.streaming} />
          </div>
        </article>
      )
    case 'reasoning':
      return <ReasoningCollapsible text={item.text} streaming={item.streaming} />
    case 'tool':
      return <ToolRow item={item} />
    case 'approval':
      return <ApprovalRow item={item} />
  }
})

function RoleLabel({ children }: { children: string }) {
  return <p className="font-mono text-xs text-muted-foreground">{children}</p>
}

/** tool 最小占位（工单 4 换 ToolCard 三态 + Terminal/DiffViewer/CodeBlock 分发） */
function ToolRow({ item }: { item: Extract<UiItem, { kind: 'tool' }> }) {
  const tail = lastLines(item.progressBuf || outputTail(item.output), 4)
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <span className="truncate font-mono text-xs">
          {item.name}
          <span className="text-muted-foreground"> {resourceOf(item.input)}</span>
        </span>
        <span
          className={
            'shrink-0 font-mono text-xs ' +
            (item.status === 'running'
              ? 'text-muted-foreground'
              : item.status === 'error'
                ? 'text-[var(--spark-err)]'
                : 'text-muted-foreground/70')
          }
        >
          {item.status === 'running' ? '运行中…' : item.status === 'error' ? '失败' : '完成'}
        </span>
      </div>
      {tail && (
        <pre className="max-h-32 overflow-hidden border-t border-border px-3 py-1.5 font-mono text-xs leading-relaxed text-muted-foreground">
          {tail}
        </pre>
      )}
    </div>
  )
}

/** approval 最小占位（工单 4 换 ApprovalCard：once/always/reject 三按钮 + resolved 2s 收起） */
function ApprovalRow({ item }: { item: Extract<UiItem, { kind: 'approval' }> }) {
  const { transport } = useTransport()
  const [feedback, setFeedback] = useState('')

  if (item.status === 'resolved') {
    return (
      <p className="font-mono text-xs text-muted-foreground/70">
        审批已{item.reply === 'reject' ? '拒绝' : '通过'}（{item.reply ?? ''}）
      </p>
    )
  }
  async function reply(answer: PermissionReply) {
    await transport.replyPermission(
      ids.request(item.requestId),
      answer,
      answer === 'reject' ? feedback || undefined : undefined,
    )
    setFeedback('')
  }
  return (
    <div className="rounded-r-md border border-border border-l-[3px] border-l-[var(--spark-warn)]">
      <div className="px-3 py-2">
        <p className="font-mono text-xs">
          审批：{item.action}
          <span className="text-muted-foreground"> {item.resource}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="拒绝时的补充说明（可选）"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
        <button
          type="button"
          onClick={() => void reply('once')}
          className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground"
        >
          允许一次
        </button>
        <button
          type="button"
          onClick={() => void reply('always')}
          className="h-7 rounded-md border border-border px-2.5 text-xs hover:bg-accent"
        >
          总是允许
        </button>
        <button
          type="button"
          onClick={() => void reply('reject')}
          className="h-7 rounded-md border border-border px-2.5 text-xs text-[var(--spark-err)] hover:bg-accent"
        >
          拒绝
        </button>
      </div>
    </div>
  )
}

/** input 的资源摘要：path > command > 空串 */
function resourceOf(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const r = input as Record<string, unknown>
  if (typeof r.path === 'string') return r.path
  if (typeof r.command === 'string') return r.command
  return ''
}

function outputTail(output: unknown): string {
  if (typeof output !== 'object' || output === null) return ''
  const r = output as Record<string, unknown>
  if (typeof r.tail === 'string') return r.tail
  if (typeof r.message === 'string') return r.message
  if (typeof r.code === 'number') return `exit ${r.code}`
  if (typeof r.diff === 'string') return r.diff
  return ''
}

/** 取末尾 n 行（progress 摘要片段） */
function lastLines(text: string, n: number): string {
  if (!text) return ''
  return text.split('\n').slice(-n).join('\n')
}
