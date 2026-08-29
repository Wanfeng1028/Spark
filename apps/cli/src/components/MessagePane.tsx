/**
 * 消息流面板：`<Static>` 承载已定稿条目（写入终端 scrollback——保留原生滚动/搜索），
 * 底部活动区渲染仍在变化的尾部（流式 delta / 运行中工具 / 挂起审批前的过渡条目）。
 * 定稿判定与 web 投影同语义：条目只会由"活动"转"定稿"，前缀单调增长。
 */
import { Box, Static, Text } from 'ink'
import type { SessionSlice, UiItem } from '@spark/protocol'
import { ItemView } from './items.js'
import { useCliStore } from '../store.js'

function isSettled(it: UiItem): boolean {
  switch (it.kind) {
    case 'user':
      return true
    case 'assistant':
      return it.streaming === undefined
    case 'reasoning':
      return it.streaming !== true
    case 'tool':
      return it.status !== 'running'
    case 'approval':
      return it.status === 'resolved'
  }
}

function keyOf(it: UiItem): string {
  return it.kind === 'tool' ? `tool:${it.callId}` : `${it.kind}:${it.eventId}`
}

export function MessagePane({ slice }: { slice: SessionSlice | null }) {
  const expandedTools = useExpandedTools()
  const expandedReasoning = useExpandedReasoning()

  if (slice === null) {
    return (
      <Box flexGrow={1} justifyContent="center" alignItems="center">
        <Text color="gray">无会话——Ctrl+N 新建</Text>
      </Box>
    )
  }

  const items = slice.items
  let committedCount = 0
  while (committedCount < items.length && isSettled(items[committedCount] as UiItem)) {
    committedCount++
  }
  const committed = items.slice(0, committedCount)
  const live = items.slice(committedCount).filter((it) => it.kind !== 'approval' || it.status === 'resolved')

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={committed}>
        {(it) => (
          <Box key={keyOf(it)} marginBottom={1}>
            <ItemView
              item={it}
              expandedTools={expandedTools}
              expandedReasoning={expandedReasoning}
            />
          </Box>
        )}
      </Static>
      {live.map((it) => (
        <Box key={keyOf(it)} marginBottom={1}>
          <ItemView
            item={it}
            expandedTools={expandedTools}
            expandedReasoning={expandedReasoning}
          />
        </Box>
      ))}
    </Box>
  )
}

// 展开态选择器拆出——避免本组件订阅整 store 造成无关重渲染
function useExpandedTools(): ReadonlySet<string> {
  return useCliStore((s) => s.expandedTools)
}
function useExpandedReasoning(): ReadonlySet<string> {
  return useCliStore((s) => s.expandedReasoning)
}
