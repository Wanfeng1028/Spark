/**
 * 消息流面板（工单 10.38 重构——qwen MainContent 同构）：
 * `<Static>` items = [BootHeader 首项, ...已定稿显示行]——Header 恒为第一项印在终端
 * scrollback 顶部（qwen AppHeader 同款），消息紧随其后，输入区紧跟内容下方（紧凑贴顶，
 * 不再垂直居中/沉底）。staticKey 变化（/new 清屏、/resume、/rollback）强制 Static 重挂
 * 重打（qwen historyRemountKey 同款机制，配合 ANSI 清屏实现"整屏回到欢迎首屏"）。
 * 显示行=聚合行（工单 10.9：连续同类工具聚合「· N 次」）；行级定稿判定见 flow-rows.rowSettled。
 * 高度预算（工单 10.33）：live 区只渲染尾部 maxLiveRows 行，顶部「↑ N 行已折叠」明示。
 * 密度/缩进（HistoryItemDisplay 同构）：全行 marginX=2；user/assistant/reasoning 首块
 * marginTop=1，tool/turn/组行紧贴。
 */
import { Box, Static, Text } from 'ink'
import type { ReactElement, ReactNode } from 'react'
import { flowRowsOf } from '@spark/protocol'
import type { FlowRow, SessionSlice } from '@spark/protocol'
import { rowSettled } from '../flow-rows.js'
import { ItemView, ToolGroupLine } from './items.js'
import { useCliStore } from '../store.js'

function keyOf(row: FlowRow): string {
  return row.key
}

export interface MessagePaneProps {
  slice: SessionSlice | null
  /** live 区行数预算 = 终端 rows − 底部固定件行数（app 计算后传入） */
  maxLiveRows?: number
  /** BootHeader 渲染所需 props（Static 首项恒印一次——qwen AppHeader 同款） */
  header?: ReactNode
  /** Static 重挂键：/new 清屏、/resume、/rollback 时 +1（配合 ANSI 清屏整屏重印） */
  staticKey?: number
}

interface StaticEntry {
  key: string
  row?: FlowRow
  header?: ReactNode
}

export function MessagePane({ slice, maxLiveRows, header, staticKey = 0 }: MessagePaneProps) {
  const expandedTools = useExpandedTools()
  const expandedReasoning = useExpandedReasoning()
  const expandedGroups = useExpandedGroups()

  const rows =
    slice === null
      ? []
      : flowRowsOf(slice.items).filter(
          (r) => r.kind !== 'item' || r.item.kind !== 'approval' || r.item.status !== 'pending',
        )
  let committedCount = 0
  while (committedCount < rows.length && rowSettled(rows[committedCount] as FlowRow)) {
    committedCount++
  }
  const committed = rows.slice(0, committedCount)
  const allLive = rows.slice(committedCount)

  // 高度预算：只装得下尾部 maxLiveRows 行时，裁掉头部并明示折叠行（预算缺省不裁——
  // 渲染测试/无 stdin 场景高度未知，保持原行为）
  let clipped: number
  let live: FlowRow[]
  if (maxLiveRows !== undefined && allLive.length > maxLiveRows) {
    clipped = allLive.length - maxLiveRows
    live = allLive.slice(clipped)
  } else {
    clipped = 0
    live = allLive
  }

  const staticItems: StaticEntry[] = [
    ...(header !== undefined ? [{ key: 'boot-header', header }] : []),
    ...committed.map((row) => ({ key: keyOf(row), row })),
  ]

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* staticKey 作为 Static 组件自身的 React key：变化时整个 Static 卸载重建
          （index 游标归零）——配合 ANSI 清屏实现"整屏重印"。items 内部 key 恒定。 */}
      <Static key={staticKey} items={staticItems}>
        {(entry) =>
          entry.header !== undefined ? (
            <Box key={entry.key} marginLeft={2} marginRight={2}>
              {entry.header}
            </Box>
          ) : (
            renderRow(entry.row as FlowRow)
          )
        }
      </Static>
      {clipped > 0 ? (
        <Text color="gray">↑ {clipped} 行已折叠（定稿后进上方滚动区）</Text>
      ) : null}
      {live.map((row) => renderRow(row))}
    </Box>
  )

  function renderRow(row: FlowRow): ReactElement {
    const content =
      row.kind === 'item' ? (
        <ItemView
          item={row.item}
          expandedTools={expandedTools}
          expandedReasoning={expandedReasoning}
        />
      ) : (
        <ToolGroupLine row={row} expanded={expandedGroups.has(row.key)} expandedTools={expandedTools} />
      )
    // 密度与缩进（HistoryItemDisplay 同构）：全行 marginX=2；行距按类——
    // user/assistant/reasoning 首块 marginTop=1，tool/turn/组行紧贴
    const kind = row.kind === 'item' ? row.item.kind : 'toolGroup'
    const marginTop = kind === 'user' || kind === 'assistant' || kind === 'reasoning' ? 1 : 0
    return (
      <Box key={keyOf(row)} marginLeft={2} marginRight={2} marginTop={marginTop}>
        {content}
      </Box>
    )
  }
}

// 展开态选择器拆出——避免本组件订阅整 store 造成无关重渲染
function useExpandedTools(): ReadonlySet<string> {
  return useCliStore((s) => s.expandedTools)
}
function useExpandedReasoning(): ReadonlySet<string> {
  return useCliStore((s) => s.expandedReasoning)
}
function useExpandedGroups(): ReadonlySet<string> {
  return useCliStore((s) => s.expandedGroups)
}
