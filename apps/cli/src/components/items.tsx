/**
 * 条目渲染（工单 10.9 / §13.K K.2，与 10.4 同套语义的 CLI 呈现）：
 * 单一高密度行优先，展开才出多行。回合头实时计时；工具块人话类别词
 * （终端/读取/写入/改写/子代理/记忆/浏览；未知工具保留原名——禁假状态）；
 * 运行中「… Ns · esc to cancel」；完成 ✓；审批拒绝整行删除线。
 * 视觉纪律（DESIGN §13.I cli 行 / §13.K K.9）：默认前景 + gray 两档，
 * 语义色只表达状态；禁 emoji 装饰（✓/… 为无色彩排版记号）；
 * 颜色用 Ink 命名色与 hex（chalk 按终端能力自动降级，ADR D19）。
 */
import { Box, Text } from 'ink'
import { useEffect, useState } from 'react'
import type { UiItem } from '@spark/protocol'
import { truncateByWidth } from '../text-width.js'
import { toolCategoryOf } from '../flow-rows.js'
import type { FlowRow } from '../flow-rows.js'

export { toolCategoryOf }

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
  // 单行化：空白压一格，超长按**显示宽度**截断（工单 10.19②：CJK 占 2 列，
  // code unit 计数与终端换行不一致=错列；展开态看全量）
  const one = s.replace(/\s+/g, ' ')
  return truncateByWidth(one, 60)
}

/** 工具输出 → 文本（字符串原样；对象紧凑 JSON；截头保尾同 reducer 纪律） */
export function toolOutputText(output: unknown, maxLines = 50): string {
  const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  const lines = raw.split('\n')
  if (lines.length <= maxLines) return raw
  return `...（前 ${lines.length - maxLines} 行已截断）\n${lines.slice(-maxLines).join('\n')}`
}

/** 工具输出完整行数（截断前——折叠态「first N lines hidden」的 N；工单 10.9 补齐） */
export function toolOutputLines(output: unknown): number {
  const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  return raw.split('\n').length
}

/** 审批拒绝判定（引擎管线拒绝路径 output={code:'E_PERMISSION'}——与 10.4④ 同源） */
function isDenied(item: Extract<UiItem, { kind: 'tool' }>): boolean {
  return (
    item.status !== 'running' &&
    typeof item.output === 'object' &&
    item.output !== null &&
    (item.output as Record<string, unknown>).code === 'E_PERMISSION'
  )
}

/** 秒级时长（进行中每秒自刷——终端重绘由 state 驱动） */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/** ANSI 删除线（Ink 无原生删除线——\u001b[9m 包裹，弱终端降级为原文） */
function strike(text: string): string {
  return `\u001b[9m${text}\u001b[29m`
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
    // Qwen 对齐（工单 10.36）：前缀 > 与正文同为 accent 紫（UserMessage 同款）
    return (
      <Text color="#CBA6F7">
        &gt; {item.text}
      </Text>
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
    // Qwen 对齐（工单 10.36）：◆ 前缀（VS15 锁 1 列宽）accent 紫，正文默认前景
    return (
      <Text>
        <Text color="#CBA6F7">{'◆︎ '}</Text>
        {text}
      </Text>
    )
  }

  if (item.kind === 'reasoning') {
    return <ReasoningLine item={item} expanded={expandedReasoning.has(item.eventId)} />
  }

  if (item.kind === 'tool') {
    return <ToolLine item={item} expanded={expandedTools.has(item.callId)} />
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

/** 回合头（§13.K K.2）：「已工作 N 秒」；进行中实时计时 */
function TurnLine({ startedAt, finishedAt }: { startedAt: number; finishedAt: number | undefined }) {
  const running = finishedAt === undefined
  const now = useNow(running)
  const sec = Math.max(0, Math.round(((finishedAt ?? now) - startedAt) / 1000))
  return <Text color="gray">{running ? `工作中 · ${sec} 秒` : `已工作 ${sec} 秒`}</Text>
}

/** 思考行（§13.K K.2）：摘要「.: 思考 · 持续 N 秒 (ctrl+o 展开/收起)」；展开=缩进全文 */
function ReasoningLine({
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
    const label =
      sec !== null
        ? streaming
          ? `Thinking…${sec} 秒`
          : `Thought for ${sec} 秒`
        : streaming
          ? 'Thinking…'
          : `思考（${item.text.length} 字）`
    // Qwen 对齐（工单 10.36）：∴ 完成 / ∵ 进行中，dimColor italic（ThinkMessage 同款）
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

/** 折叠态「超长输出隐藏行数」阈值（§13.K K.2：超长输出才显示 first N lines hidden） */
const HIDDEN_LINES_MIN = 10

/** 工具块（§13.K K.2）：运行中「… Ns · esc to cancel」；完成 ✓（折叠态超长输出附 first N lines hidden）；拒绝整行删除线 */
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

/** 聚合组行（§13.K K.2 / 与 web ToolGroupRow 同语义）：「类别 · N 次」，展开=逐条 ToolLine */
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
  return (
    <Box flexDirection="column">
      <Text color={running ? 'gray' : 'green'}>
        {expanded ? 'v ' : '> '}
        {running ? '… ' : '✓ '}
        {category}
        <Text color="gray"> · {tools.length} 次</Text>
        {!running && denied ? <Text color="red"> 含拒绝</Text> : null}
        {!running && !denied && failed ? <Text color="red"> 含失败</Text> : null}
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
