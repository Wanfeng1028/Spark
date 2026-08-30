/**
 * 条目渲染（web MessageItem 的终端对位）：单一高密度行优先，展开才出多行。
 * 视觉纪律（DESIGN §13.I cli 行）：默认前景 + gray 两档，禁 emoji 装饰与硬编码 ANSI 色号；
 * 颜色只用 Ink 命名色（chalk 按终端能力自动降级——无真彩也可用，ADR D19）。
 */
import { Box, Text } from 'ink'
import type { UiItem } from '@spark/protocol'

/** 工具输入的一句话摘要（终端单行折叠用；未知形状如实空串） */
export function summarizeToolInput(input: unknown): string {
  if (input === null || typeof input !== 'object') return ''
  const rec = input as Record<string, unknown>
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = rec[k]
      if (typeof v === 'string' && v !== '') return v
    }
    return ''
  }
  const s = pick('command', 'file_path', 'path', 'query', 'prompt')
  // 单行化：空白压一格，超长截断（展开态看全量）
  const one = s.replace(/\s+/g, ' ')
  return one.length > 60 ? `${one.slice(0, 57)}...` : one
}

/** 工具输出 → 文本（字符串原样；对象紧凑 JSON；截头保尾同 reducer 纪律） */
export function toolOutputText(output: unknown, maxLines = 50): string {
  const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  const lines = raw.split('\n')
  if (lines.length <= maxLines) return raw
  return `...（前 ${lines.length - maxLines} 行已截断）\n${lines.slice(-maxLines).join('\n')}`
}

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
    return (
      <Text>
        <Text bold>&gt; </Text>
        {item.text}
      </Text>
    )
  }

  if (item.kind === 'assistant') {
    const text =
      item.streaming !== undefined
        ? item.streaming.textBuf
        : item.content
            .map((c) => (c.type === 'text' ? c.text : ''))
            .filter((t) => t !== '')
            .join('\n')
    return <Text>{text}</Text>
  }

  if (item.kind === 'reasoning') {
    const expanded = expandedReasoning.has(item.eventId)
    if (!expanded) {
      const label = item.streaming === true ? '思考中...' : `思考（${item.text.length} 字）`
      return <Text color="gray">- {label}，Ctrl+O 展开</Text>
    }
    return (
      <Box flexDirection="column">
        <Text color="gray">- 思考：</Text>
        {item.text.split('\n').map((line, i) => (
          <Text key={i} color="gray">
            {'  '}
            {line}
          </Text>
        ))}
      </Box>
    )
  }

  if (item.kind === 'tool') {
    const expanded = expandedTools.has(item.callId)
    const summary = summarizeToolInput(item.input)
    const statusMark =
      item.status === 'running' ? (
        <Text color="yellow">运行中</Text>
      ) : item.status === 'error' ? (
        <Text color="red">失败</Text>
      ) : (
        <Text color="green">完成</Text>
      )
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="gray">{expanded ? 'v' : '&gt;'}</Text> {item.name}
          {summary !== '' ? <Text color="gray"> {summary}</Text> : null} {statusMark}
          {item.guard !== undefined ? (
            <Text color="yellow">
              {' '}
              [{item.guard.kind === 'injection' ? '注入告警' : '密钥过滤'}]
            </Text>
          ) : null}
        </Text>
        {expanded && item.status !== 'running' && item.output !== undefined ? (
          <Box paddingLeft={2}>
            <Text color="gray">{toolOutputText(item.output)}</Text>
          </Box>
        ) : null}
        {expanded && item.status === 'running' && item.progressBuf !== '' ? (
          <Box paddingLeft={2}>
            <Text color="gray">{item.progressBuf.split('\n').slice(-8).join('\n')}</Text>
          </Box>
        ) : null}
      </Box>
    )
  }

  if (item.kind === 'turn') {
    const sec = Math.max(0, Math.round(((item.finishedAt ?? Date.now()) - item.startedAt) / 1000))
    return <Text color="gray">— 回合 · 已工作 {sec} 秒</Text>
  }

  // approval 已解决态（挂起态由 ApprovalPrompt 单独渲染——交互焦点不同）
  const replyText =
    item.reply === 'once'
      ? '允许一次'
      : item.reply === 'always'
        ? '总是允许'
        : item.reply === 'reject'
          ? '已拒绝'
          : '已处理'
  return (
    <Text color="gray">
      [审批] {item.action} {item.resource} — {replyText}
    </Text>
  )
}
