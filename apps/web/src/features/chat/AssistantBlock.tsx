/**
 * AssistantBlock（doc/02 §6.3）：助手消息内容块序列。
 * text 块用 streamdown 流式渲染（工单 3）——流式期间 streaming.textBuf（定稿前 content 为空），
 * 末尾 ▮ 闪烁光标（DESIGN §6）；定稿后渲染 content 中的 text/reasoning 块。
 * animated=false：关 streamdown 入场动画（DESIGN §6 只允许微动效）。
 * toolCall/toolResult 由 store 投影展开为独立 tool UiItem（applyEvent 处理表 §6.4），此处跳过以免双渲染。
 */
import type { BundledTheme } from 'shiki'
import type { ContentItem, Usage } from '@spark/protocol'
import { Streamdown } from 'streamdown'
import { ReasoningCollapsible } from './ReasoningCollapsible'

export interface AssistantBlockProps {
  content: ContentItem[]
  streaming?: { textBuf: string } | undefined
  usage?: Usage | undefined
}

/** 双主题 shiki（DESIGN §10：深浅两主题人工检查） */
const SHIKI_THEMES: [BundledTheme, BundledTheme] = ['github-light', 'github-dark']

export function AssistantBlock({ content, streaming, usage }: AssistantBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      {streaming !== undefined && (
        <div className="text-[13px] leading-relaxed">
          <Streamdown mode="streaming" animated={false} shikiTheme={SHIKI_THEMES}>
            {streaming.textBuf}
          </Streamdown>
          <span className="spark-cursor-blink" aria-hidden="true">
            ▮
          </span>
        </div>
      )}
      {content.map((c, i) => {
        if (c.type === 'text') {
          return (
            <div key={i} className="text-[13px] leading-relaxed">
              <Streamdown mode="static" animated={false} shikiTheme={SHIKI_THEMES}>
                {c.text}
              </Streamdown>
            </div>
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
