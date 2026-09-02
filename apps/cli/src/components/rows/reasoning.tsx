/**
 * 思考行（工单 10.36/10.46，qwen ThinkMessage 同款）：∴ 完成 / ∵ 进行中，
 * Thought for Ns / Thought briefly / Thinking…Ns；展开=缩进全文（灰）。
 */
import { Box, Text } from 'ink'
import type { UiItem } from '@spark/protocol'
import { useNow } from './shared.js'

export function ReasoningLine({
  item,
  expanded,
}: {
  item: Extract<UiItem, { kind: 'reasoning' }>
  expanded: boolean
}) {
  const streaming = item.streaming === true
  const now = useNow(streaming && item.startedAt !== undefined)
  const sec =
    item.durationMs !== undefined
      ? Math.max(1, Math.round(item.durationMs / 1000))
      : item.startedAt !== undefined
        ? Math.max(0, Math.round((now - item.startedAt) / 1000))
        : null
  if (!expanded) {
    // Qwen 对齐（工单 10.46，ThinkMessage 同款）：<1s → Thought briefly；完成 →
    // Thought for {N}s（formatDuration 数字+s）；进行中 → Thinking…{N}s
    let label: string
    if (streaming) {
      label = sec !== null ? `Thinking…${sec}s` : 'Thinking…'
    } else if (item.durationMs !== undefined && item.durationMs < 1000) {
      label = 'Thought briefly'
    } else if (sec !== null) {
      label = `Thought for ${sec}s`
    } else {
      label = 'Thinking'
    }
    return (
      <Text color="gray" italic>
        {streaming ? '∵' : '∴'} {label} (ctrl+o 展开/收起)
      </Text>
    )
  }
  return (
    <Box flexDirection="column">
      <Text color="gray" italic>
        {streaming ? '∵' : '∴'} 思考：
      </Text>
      {item.text.split('\n').map((line, i) => (
        <Text key={i} color="gray">
          {'  '}
          {line}
        </Text>
      ))}
    </Box>
  )
}
