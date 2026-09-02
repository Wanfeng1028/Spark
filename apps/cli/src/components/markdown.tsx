/**
 * Markdown-lite 渲染（工单 10.48，qwen MarkdownDisplay 的常用子集、纯 Ink 实现——
 * 不引 marked/highlight.js 依赖）：assistant 回复的 **bold**、`行内 code`（code 色）、
 * # 标题（bold 行）、``` 围栏代码块（缩进 mono，未闭合围栏流式降级为普通文本）、
 * -/1. 列表保留缩进。user 消息不走此渲染（qwen UserMessage 纯文本同款）。
 */
import { Box, Text } from 'ink'
import type { ReactElement } from 'react'

/** 行内分段：`code`（蓝）/ **bold**（粗）/ 普通文本 */
type InlineSeg = { text: string; code?: boolean; bold?: boolean }

function splitInline(text: string): InlineSeg[] {
  const segs: InlineSeg[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index) })
    if (m[1] !== undefined) segs.push({ text: m[1].slice(1, -1), code: true })
    else if (m[2] !== undefined) segs.push({ text: m[2].slice(2, -2), bold: true })
    last = re.lastIndex
  }
  if (last < text.length) segs.push({ text: text.slice(last) })
  return segs
}

/** 行内渲染：分段着色（code=蓝 / bold=粗） */
function InlineText({ text }: { text: string }) {
  const segs = splitInline(text)
  return (
    <Text>
      {segs.map((s, i) =>
        s.code ? (
          <Text key={i} color="#89B4FA">
            {s.text}
          </Text>
        ) : s.bold ? (
          <Text key={i} bold>
            {s.text}
          </Text>
        ) : (
          <Text key={i}>{s.text}</Text>
        ),
      )}
    </Text>
  )
}

export function Markdown({ text }: { text: string }) {
  return (
    <Box flexDirection="column">
      {renderLines(text)}
    </Box>
  )
}

function renderLines(text: string): ReactElement[] {
  const out: ReactElement[] = []
  const lines = text.split('\n')
  let inFence = false
  let fenceKey = ''
  let fenceBuf: string[] = []

  const flushFence = (key: string): ReactElement => (
    <Box key={`f-${key}`} marginLeft={2}>
      <Text color="gray">{fenceBuf.join('\n')}</Text>
    </Box>
  )

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const key = `l-${i}`
    const fenceMatch = /^\s*```/.exec(line)
    if (fenceMatch !== null) {
      if (inFence) {
        out.push(flushFence(fenceKey))
        inFence = false
        fenceBuf = []
      } else {
        inFence = true
        fenceKey = key
        // 围栏声明行（```python）不显示语言标注——内容行自证
      }
      continue
    }
    if (inFence) {
      fenceBuf.push(line)
      continue
    }
    // 未闭合围栏（流式 textBuf 尾部）——普通文本降级，定稿后自然成块
    out.push(<InlineText key={key} text={line} />)
  }
  if (inFence && fenceBuf.length > 0) {
    out.push(flushFence(`open-${fenceKey}`))
  }
  return out
}
