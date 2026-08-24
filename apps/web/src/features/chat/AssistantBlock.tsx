/**
 * AssistantBlock（doc/02 §6.3）：助手消息内容块序列。
 * text 块流式期间由 streaming.textBuf 呈现（定稿前 content 为空），末尾 ▮ 闪烁光标（DESIGN §6）；
 * 定稿后渲染 content 中的 text/reasoning 块。toolCall/toolResult 由 store 投影展开为独立 tool UiItem
 * （applyEvent 处理表 §6.4），此处跳过以免双渲染。
 * text 渲染暂为 pre-wrap 纯文本——streamdown 是工单 3。
 */
import type { ContentItem, Usage } from '@spark/protocol'
import { ReasoningCollapsible } from './ReasoningCollapsible'

export interface AssistantBlockProps {
  content: ContentItem[]
  streaming?: { textBuf: string } | undefined
  usage?: Usage | undefined
}

export function AssistantBlock({ content, streaming, usage }: AssistantBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      {streaming !== undefined && (
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
          {streaming.textBuf}
          <span className="spark-cursor-blink" aria-hidden="true">
            ▮
          </span>
        </p>
      )}
      {content.map((c, i) => {
        if (c.type === 'text') {
          return (
            <p key={i} className="text-[13px] leading-relaxed whitespace-pre-wrap">
              {c.text}
            </p>
          )
        }
        if (c.type === 'reasoning') {
          return <ReasoningCollapsible key={i} text={c.text} />
        }
        return null // toolCall / toolResult：独立 tool UiItem 呈现（见文件头注释）
      })}
      {usage !== undefined && (
        <p className="self-end font-mono text-xs text-muted-foreground/70">
          in {usage.inputTokens} · out {usage.outputTokens}
        </p>
      )}
    </div>
  )
}
