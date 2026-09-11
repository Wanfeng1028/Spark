/**
 * 条目渲染分发（工单 10.47 拆分后=分发壳；行组件见 rows/ 目录——qwen messages/ 同构）：
 * 单一高密度行优先，展开才出多行。视觉纪律（DESIGN §13.I cli 行 / §13.K K.9）：
 * 默认前景 + gray 两档，语义色只表达状态；✓/… 为无色彩排版记号。
 */
import { Box, Text } from 'ink'
import type { UiItem } from '@spark/protocol'
import { TurnLine } from './rows/turn.js'
import { ReasoningLine } from './rows/reasoning.js'
import { ToolLine } from './rows/tool.js'
import { Markdown } from './markdown.js'
import { strike } from './rows/shared.js'

export { summarizeToolInput, toolOutputText, toolOutputLines, useNow } from './rows/shared.js'
export { ToolGroupLine } from './rows/tool.js'

export function ItemView({
  item,
  expandedTools,
  expandedReasoning,
}: {
  item: UiItem
  expandedTools: ReadonlySet<string>
  expandedReasoning: ReadonlySet<string>
}) {
  if (item.kind === 'user') {
    // Qwen 对齐（工单 10.38，PrefixedTextMessage 同构）：前缀列固定 2 列（符号+1 空隙），
    // 正文 flexGrow 换行后对齐前缀列右侧；前缀与正文同为 accent 紫
    return (
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text color="#CBA6F7">&gt;</Text>
        </Box>
        <Box flexGrow={1}>
          <Text color="#CBA6F7">{item.text}</Text>
        </Box>
      </Box>
    )
  }

  if (item.kind === 'turn') {
    return <TurnLine startedAt={item.startedAt} finishedAt={item.finishedAt} />
  }

  if (item.kind === 'assistant') {
    const text =
      item.streaming !== undefined
        ? item.streaming.textBuf
        : item.content
            .map((c) => (c.type === 'text' ? c.text : ''))
            .filter((t) => t !== '')
            .join('\n')
    // Qwen 对齐（工单 10.48）：◆ 前缀列 + 正文 Markdown-lite 渲染（粗体/行内 code/围栏）
    return (
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text color="#CBA6F7">◆︎</Text>
        </Box>
        <Box flexGrow={1}>
          <Markdown text={text} />
        </Box>
      </Box>
    )
  }

  if (item.kind === 'reasoning') {
    return <ReasoningLine item={item} expanded={expandedReasoning.has(item.eventId)} />
  }

  if (item.kind === 'tool') {
    return <ToolLine item={item} expanded={expandedTools.has(item.callId)} />
  }

  // LSP 诊断行（工单 16.9）：语言 + 文件 + 摘要（E/W 计数），逐条消息进展开态不计（只读快照）
  if (item.kind === 'diagnostics') {
    const file = item.uri.startsWith('file:') ? item.uri.slice('file:'.length) : item.uri
    const errors = item.diagnostics.filter((d) => d.severity === 1).length
    const warnings = item.diagnostics.filter((d) => d.severity === 2).length
    const head =
      item.diagnostics.length === 0
        ? `LSP ${item.language} ${file} —— 诊断已清零`
        : `LSP ${item.language} ${file} —— ${item.diagnostics.length} 条（E ${errors} / W ${warnings}）`
    return (
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text color="gray">▤</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text color="gray">{head}</Text>
          {item.diagnostics.slice(0, 5).map((d, i) => (
            <Text key={i} wrap="truncate-end" {...(d.severity === 1 ? { color: 'red' as const } : {})}>
              [{d.severity === 1 ? 'E' : d.severity === 2 ? 'W' : 'I'}] {d.range.start.line + 1}:
              {d.range.start.character + 1} {d.message}
            </Text>
          ))}
        </Box>
      </Box>
    )
  }

  // approval 已解决态（挂起态由 ApprovalPrompt 单独渲染——交互焦点不同）
  const denied = item.reply === 'reject'
  const replyText =
    item.reply === 'once' ? '允许一次' : item.reply === 'always' ? '总是允许' : denied ? '已拒绝' : '已处理'
  return (
    <Text color="gray">
      {denied ? strike(`[审批] ${item.action} ${item.resource}`) : `[审批] ${item.action} ${item.resource}`} —{' '}
      {replyText}
    </Text>
  )
}
