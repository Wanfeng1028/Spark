/**
 * 工具行与聚合组行（工单 10.44/10.47，qwen ToolMessage/CompactToolGroupDisplay 同构）：
 * 行=状态符 + 人话类别词 + 参数摘要；组行=动词句 + 对象列表 + 计数尾缀
 * （≤3 全列、>3 前三 + 以及其他 N 个；活动态进行时 + …）；拒绝整行删除线。
 */
import { Box, Text } from 'ink'
import { toolCategoryOf } from '@spark/protocol'
import type { FlowRow, UiItem } from '@spark/protocol'
import { truncateByWidth } from '../../text-width.js'
import { summarizeToolInput, toolOutputText, toolOutputLines, isDenied, useNow, strike } from './shared.js'

const HIDDEN_LINES_MIN = 10


export function ToolLine({
  item,
  expanded,
}: {
  item: Extract<UiItem, { kind: 'tool' }>
  expanded: boolean
}) {
  const running = item.status === 'running'
  const now = useNow(running && item.startedAt !== undefined)
  const category = toolCategoryOf(item.name)
  const summary = summarizeToolInput(item.input)
  const denied = isDenied(item)
  const elapsedSec =
    running && item.startedAt !== undefined
      ? Math.max(0, Math.round((now - item.startedAt) / 1000))
      : null
  const doneSec =
    !running && item.durationMs !== undefined ? Math.max(0, Math.round(item.durationMs / 1000)) : null

  const head = (() => {
    if (running) {
      const timing = elapsedSec !== null ? ` ${elapsedSec}s` : ''
      return `… ${category}${summary !== '' ? ` ${summary}` : ''}${timing} · esc to cancel`
    }
    if (denied) return strike(`✗ ${category}${summary !== '' ? ` ${summary}` : ''} · 已拒绝`)
    if (item.status === 'error') return `✗ ${category}${summary !== '' ? ` ${summary}` : ''} · 失败`
    const dur = doneSec !== null ? ` ${doneSec}s` : ''
    return `✓ ${category}${summary !== '' ? ` ${summary}` : ''}${dur}`
  })()

  const headColor =
    denied || item.status === 'error' ? (denied ? 'gray' : 'red') : running ? 'gray' : 'green'

  // 折叠态超长输出提示（工单 10.9 补齐 / §13.K K.2）：N=截断前完整行数；拒绝态未执行不提示
  const hiddenLines =
    !expanded && !running && !denied && item.output !== undefined
      ? toolOutputLines(item.output)
      : 0

  return (
    <Box flexDirection="column">
      <Text color={headColor}>
        {expanded ? 'v ' : '> '}
        {head}
        {hiddenLines >= HIDDEN_LINES_MIN ? (
          <Text color="gray"> · first {hiddenLines} lines hidden</Text>
        ) : null}
        {item.guard !== undefined ? (
          <Text color="yellow"> [{item.guard.kind === 'injection' ? '注入告警' : '密钥过滤'}]</Text>
        ) : null}
      </Text>
      {expanded && !running && item.output !== undefined ? (
        <Box paddingLeft={2}>
          <Text color="gray">{denied ? '（审批拒绝——未执行）' : toolOutputText(item.output)}</Text>
        </Box>
      ) : null}
      {expanded && !running && item.output === undefined ? (
        <Box paddingLeft={2}>
          <Text color="gray">（无输出）</Text>
        </Box>
      ) : null}
      {expanded && running && item.progressBuf !== '' ? (
        <Box paddingLeft={2}>
          <Text color="gray">{item.progressBuf.split('\n').slice(-8).join('\n')}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

export function ToolGroupLine({
  row,
  expanded,
  expandedTools,
}: {
  row: Extract<FlowRow, { kind: 'toolGroup' }>
  expanded: boolean
  expandedTools: ReadonlySet<string>
}) {
  const { category, tools } = row
  const running = tools.some((t) => t.status === 'running')
  const denied = tools.some((t) => isDenied(t))
  const failed = tools.some((t) => t.status === 'error')

  // 汇总句式（工单 10.44，qwen CompactToolGroupDisplay 同款）：动词 + 对象列表 + 计数尾缀
  // ——≤3 全列对象、>3 前 3 + `以及其他 N 个`；活动态用进行时并尾缀 …（qwen 活动态句式）
  const VERBS: Record<string, [string, string]> = {
    终端: ['运行了', '正在运行'],
    读取: ['读取了', '正在读取'],
    写入: ['写入了', '正在写入'],
    改写: ['编辑了', '正在编辑'],
    子代理: ['派发了', '正在派发'],
    浏览: ['浏览了', '正在浏览'],
  }
  const verb = VERBS[category]
  const objects = tools.map((t) => truncateByWidth(summarizeToolInput(t.input) || t.name, 28))
  let summaryLine: string
  if (verb === undefined) {
    summaryLine = `${category} · ${tools.length} 次` // 未知类别保计数式（原形态）
  } else {
    const verbNow = running ? verb[1] ?? verb[0] : verb[0] ?? ''
    const list = objects.slice(0, 3).join(', ')
    const more = objects.length > 3 ? ` ... 以及其他 ${objects.length - 3} 个` : ''
    summaryLine = `${verbNow} ${list}${more}${running ? ' …' : ''}`
  }

  return (
    <Box flexDirection="column">
      <Text color={running ? 'gray' : 'green'}>
        {expanded ? 'v ' : '> '}
        {running ? '… ' : '✓ '}
        {summaryLine}
        {!running && denied ? <Text color="red"> · 含拒绝</Text> : null}
        {!running && !denied && failed ? <Text color="red"> · 含失败</Text> : null}
        {running ? <Text color="gray"> · esc to cancel</Text> : null}
      </Text>
      {expanded
        ? tools.map((t) => (
            <Box key={t.callId} paddingLeft={2}>
              <ToolLine item={t} expanded={expandedTools.has(t.callId)} />
            </Box>
          ))
        : null}
    </Box>
  )
}
