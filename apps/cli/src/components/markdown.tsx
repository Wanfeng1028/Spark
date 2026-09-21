/**
 * Markdown-lite 渲染（工单 10.48 常用子集；工单 19.25 第二批扩表格与引用块——
 * 清偿"表格退化成竖线串"的登记限制）。纯 Ink 实现，不引 marked/highlight.js 依赖：
 * assistant 回复的 **bold**、`行内 code`（code 色）、# 标题（bold 行）、``` 围栏代码块
 * （缩进 mono，未闭合围栏流式降级为普通文本）、-/1. 列表保留缩进、
 * `>` 引用块（左竖线 + 灰）、`|` 表格（按**显示宽度**对齐，CJK 不跑偏）。
 * user 消息不走此渲染（qwen UserMessage 纯文本同款）。
 */
import { Box, Text } from 'ink'
import type { ReactElement } from 'react'
import { displayWidth, padEndByWidth } from '../text-width.js'

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

/** 引用块（工单 19.25）：连续 `>` 行归一，左竖线 + 灰；块内行内标记照常解析 */
function QuoteBlock({ keyName, lines }: { keyName: string; lines: string[] }): ReactElement {
  return (
    <Box key={keyName} flexDirection="column" marginLeft={2}>
      {lines.map((l, i) => (
        <Text key={i} wrap="truncate-end">
          <Text color="gray">│ </Text>
          <Text color="gray">
            <InlineText text={l.replace(/^\s*>\s?/, '')} />
          </Text>
        </Text>
      ))}
    </Box>
  )
}

const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/
const QUOTE_LINE = /^\s*>/

function isTableRow(line: string): boolean {
  return line.includes('|') && line.trim() !== ''
}

/** 拆表体行：去首尾竖线后按 | 分格（不支持转义竖线——lite 子集） */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

/** 表格里只渲染纯文本（不套行内标记）——行内标记会改变显示宽度，对齐就会跑偏 */
function stripInline(cell: string): string {
  return cell.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
}

/**
 * 表格（工单 19.25，清偿"表格退化"登记限制）：列宽按**显示宽度**计算——CJK 一格两列，
 * 用 padEndByWidth 补齐才不会错列。流式未收 full 的表（表头已到、分隔行未到）按普通文本降级。
 */
function TableBlock({
  keyName,
  header,
  rows,
}: {
  keyName: string
  header: string[]
  rows: string[][]
}): ReactElement {
  const cols = Math.max(header.length, ...rows.map((r) => r.length))
  const widths: number[] = []
  for (let c = 0; c < cols; c += 1) {
    let w = displayWidth(stripInline(header[c] ?? ''))
    for (const r of rows) w = Math.max(w, displayWidth(stripInline(r[c] ?? '')))
    widths.push(w)
  }
  const cell = (text: string, c: number): string => padEndByWidth(stripInline(text), widths[c] ?? 0)
  const rule = widths.map((w) => '─'.repeat(w)).join('─┼─')
  return (
    <Box key={keyName} flexDirection="column" marginLeft={2}>
      <Text wrap="truncate-end">
        <Text bold>{cell(header[0] ?? '', 0)}</Text>
        {header.slice(1).map((h, i) => (
          <Text key={i} bold>
            {' │ '}
            {cell(h, i + 1)}
          </Text>
        ))}
      </Text>
      <Text color="gray" wrap="truncate-end">
        {rule}
      </Text>
      {rows.map((r, i) => (
        <Text key={i} wrap="truncate-end">
          {cell(r[0] ?? '', 0)}
          {Array.from({ length: cols - 1 }, (_, c) => (
            <Text key={c}>
              {' │ '}
              {cell(r[c + 1] ?? '', c + 1)}
            </Text>
          ))}
        </Text>
      ))}
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
    if (QUOTE_LINE.test(line)) {
      const block: string[] = []
      while (i < lines.length && QUOTE_LINE.test(lines[i] ?? '')) {
        block.push(lines[i] ?? '')
        i += 1
      }
      out.push(<QuoteBlock keyName={`q-${key}`} lines={block} />)
      i -= 1
      continue
    }
    // 表头行 + 分隔行（|---|:--:|）才算表——只有竖线行的普通文本不误判
    if (isTableRow(line) && TABLE_SEP.test(lines[i + 1] ?? '')) {
      const header = splitRow(line)
      const body: string[][] = []
      i += 2
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        body.push(splitRow(lines[i] ?? ''))
        i += 1
      }
      out.push(<TableBlock keyName={`t-${key}`} header={header} rows={body} />)
      i -= 1
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
