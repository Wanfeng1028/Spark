/**
 * 消息流面板：`<Static>` 承载已定稿显示行（写入终端 scrollback——保留原生滚动/搜索），
 * 底部活动区渲染仍在变化的尾部（流式 delta / 运行中工具 / 挂起审批前的过渡条目）。
 * 显示行=聚合行（工单 10.9 补齐：连续同类工具聚合「· N 次」，与 web 同套语义）——
 * 组行以整组为单位定稿入 scrollback（组内首条入 Static 后不可收回，见 flow-rows.rowSettled）。
 * 定稿判定与 web 投影同语义：条目只会由"活动"转"定稿"，前缀单调增长。
 *
 * 高度预算（工单 10.33——用户实测缺陷修复）：live 区必须装进"终端行数 − 底部固定件"
 * 的预算内，超预算只渲染尾部（保留最新内容），顶部以 `↑ N 行`折叠行明示——否则帧高
 * 超过终端，Ink 的交替帧重绘会推动终端滚动，底部固定件被顶出屏幕且光标错位不可恢复
 * （实测：发消息后界面拉长、输入框沉底；退出时残帧乱串同根因）。
 */
import { Box, Static, Text } from 'ink'
import type { ReactElement } from 'react'
import type { SessionSlice } from '@spark/protocol'
import { flowRowsOf, rowSettled } from '../flow-rows.js'
import type { FlowRow } from '../flow-rows.js'
import { ItemView, ToolGroupLine } from './items.js'
import { useCliStore } from '../store.js'

function keyOf(row: FlowRow): string {
  return row.key
}

export interface MessagePaneProps {
  /** live 区行数预算 = 终端 rows − 底部固定件行数（输入框/footer/审批框/菜单——app 计算后传入） */
  maxLiveRows?: number
}

export function MessagePane({ slice, maxLiveRows }: MessagePaneProps & { slice: SessionSlice | null }) {
  const expandedTools = useExpandedTools()
  const expandedReasoning = useExpandedReasoning()
  const expandedGroups = useExpandedGroups()

  if (slice === null) {
    return (
      <Box flexGrow={1} justifyContent="center" alignItems="center">
        <Text color="gray">无会话——Ctrl+N 新建</Text>
      </Box>
    )
  }

  const rows = flowRowsOf(slice.items)
  let committedCount = 0
  while (committedCount < rows.length && rowSettled(rows[committedCount] as FlowRow)) {
    committedCount++
  }
  const committed = rows.slice(0, committedCount)
  const allLive = rows
    .slice(committedCount)
    .filter((r) => r.kind !== 'item' || r.item.kind !== 'approval' || r.item.status === 'resolved')

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

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={committed}>{(row) => renderRow(row)}</Static>
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
    return (
      <Box key={keyOf(row)} marginBottom={1}>
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
