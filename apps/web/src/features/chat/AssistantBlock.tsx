/**
 * AssistantBlock（doc/02 §6.3）：助手消息内容块序列。
 * text 块用 streamdown 流式渲染（工单 3）——流式期间 streaming.textBuf（定稿前 content 为空），
 * 末尾 ▮ 闪烁光标（DESIGN §6）；定稿后渲染 content 中的 text 块。
 * animated=false：关 streamdown 入场动画（DESIGN §6 只允许微动效）。
 * toolCall/toolResult 由 store 投影展开为独立 tool UiItem（applyEvent 处理表 §6.4），此处跳过以免双渲染。
 * reasoning 块同样跳过（工单 10.13）：pi-gateway 定稿把 thinking 写进 content，reducer 已生成
 * 独立 reasoning UiItem 呈现，此处再渲染即双份——渲染层去重（数据仍在 content 内，不丢），
 * 对齐 CLI items.tsx 只取 text 块的口径。
 * 代码主题对与行号来自外观设置（工单 6.4 §13.D②）：浅深两主题 + 显示行号即存即生效。
 */
import type { BundledTheme } from 'shiki'
import { COPY_TEXT, type ContentItem, type Usage } from '@spark/protocol'
import { Streamdown } from 'streamdown'
import { useSettingsStore } from '@/stores/settings'

export interface AssistantBlockProps {
  content: ContentItem[]
  streaming?: { textBuf: string } | undefined
  usage?: Usage | undefined
}

/** 代码块控件（工单 10.4⑤）：语言标签 + 复制钮（streamdown 内建能力）；表格/图表控件不开 */
const CODE_CONTROLS = { code: { copy: true, download: false } }

/** 控件文案中文化（库缺省英文）；copied 接 protocol COPY_TEXT 单源（工单 R-B），copyCode 是库特有键留本地 */
const CONTROLS_ZH = { copyCode: '复制代码', copied: COPY_TEXT.copied }

export function AssistantBlock({ content, streaming, usage }: AssistantBlockProps) {
  const codeThemeLight = useSettingsStore((s) => s.codeThemeLight)
  const codeThemeDark = useSettingsStore((s) => s.codeThemeDark)
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers)

  /** 双主题 shiki（DESIGN §10 浅深两主题；主题对由外观设置驱动） */
  const shikiTheme: [BundledTheme, BundledTheme] = [codeThemeLight, codeThemeDark]

  return (
    <div className="flex flex-col gap-2">
      {streaming !== undefined && (
        <div className="text-[13px] leading-relaxed">
          <Streamdown
            mode="streaming"
            animated={false}
            shikiTheme={shikiTheme}
            lineNumbers={showLineNumbers}
            controls={CODE_CONTROLS}
            translations={CONTROLS_ZH}
          >
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
              <Streamdown
                mode="static"
                animated={false}
                shikiTheme={shikiTheme}
                lineNumbers={showLineNumbers}
                controls={CODE_CONTROLS}
                translations={CONTROLS_ZH}
              >
                {c.text}
              </Streamdown>
            </div>
          )
        }
        // reasoning 块跳过（工单 10.13，见文件头注释——渲染层去重，数据仍保留在 content 内）
        if (c.type === 'reasoning') return null
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
