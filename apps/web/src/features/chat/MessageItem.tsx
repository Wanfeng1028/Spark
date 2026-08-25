/**
 * MessageItem（doc/02 §6.3）：UiItem 按 kind 分发的全宽行（转录式，DESIGN §3）。
 * user/assistant 带角色标签行（12px 灰标签 YOU/模型名）；user 浅背景块 4px 圆角全宽；
 * assistant 无背景由 AssistantBlock 排内容块；tool→ToolCard、approval→ApprovalCard。
 */
import { memo } from 'react'
import type { PermissionReply } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import type { UiItem } from '@/stores/session'
import { AssistantBlock } from './AssistantBlock'
import { ReasoningCollapsible } from './ReasoningCollapsible'
import { ToolCard } from './ToolCard'
import { ApprovalCard } from './ApprovalCard'

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
      return (
        <ToolCard
          name={item.name}
          input={item.input}
          status={item.status}
          progressBuf={item.progressBuf}
          output={item.output}
          isError={item.status === 'error'}
        />
      )
    case 'approval':
      return <ApprovalRow item={item} />
  }
})

function RoleLabel({ children }: { children: string }) {
  return <p className="font-mono text-xs text-muted-foreground">{children}</p>
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
