/**
 * 会话流显示行推导（工单 10.9 补齐 / §13.K K.2，与 web chat-flow-rows 同套语义）：
 * - toolCategoryOf：内置工具 → 人话类别词（未知工具保留原名——禁假状态）；
 * - flowRowsOf：连续同类别工具项聚合为组行（「· N 次」）；孤立工具不组；
 * - rowSettled：行级定稿判定（组行需全组定稿——Static 前缀单调的前提）。
 * 事件→渲染的中间层，纯逻辑可独立单测。
 */
import type { UiItem } from '@spark/protocol'

export type ToolItem = Extract<UiItem, { kind: 'tool' }>

export type FlowRow =
  | { kind: 'item'; key: string; item: UiItem }
  | { kind: 'toolGroup'; key: string; category: string; tools: ToolItem[] }

/** 内置工具人话类别词（与 web chat-flow-rows 同映射；未知工具保留原名） */
export function toolCategoryOf(name: string): string {
  if (name === 'bash') return '终端'
  if (name === 'read') return '读取'
  if (name === 'write') return '写入'
  if (name === 'edit') return '改写'
  if (name === 'task') return '子代理'
  if (name === 'memory.save' || name === 'memory.search') return '记忆'
  if (name.startsWith('browser.')) return '浏览'
  return name
}

function itemKey(item: UiItem): string {
  return item.kind === 'tool' ? `tool:${item.callId}` : `${item.kind}:${item.eventId}`
}

/** 连续同类别工具聚合成组行（≥2 条才组）；其余逐项成行，顺序不变 */
export function flowRowsOf(items: readonly UiItem[]): FlowRow[] {
  const rows: FlowRow[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]
    if (it === undefined) break
    if (it.kind !== 'tool') {
      rows.push({ kind: 'item', key: itemKey(it), item: it })
      i += 1
      continue
    }
    const category = toolCategoryOf(it.name)
    let j = i + 1
    while (j < items.length) {
      const nx = items[j]
      if (nx === undefined || nx.kind !== 'tool' || toolCategoryOf(nx.name) !== category) break
      j += 1
    }
    const group = items.slice(i, j) as ToolItem[]
    const first = group[0]
    if (group.length >= 2 && first !== undefined) {
      rows.push({ kind: 'toolGroup', key: `group:${first.callId}`, category, tools: group })
    } else {
      rows.push({ kind: 'item', key: itemKey(it), item: it })
    }
    i = j
  }
  return rows
}

/** 条目定稿（与 MessagePane 既有判定同语义：只会由活动转定稿，前缀单调） */
function itemSettled(it: UiItem): boolean {
  switch (it.kind) {
    case 'user':
      return true
    case 'turn':
      return it.finishedAt !== undefined
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

/** 行级定稿：组行需全组定稿（组内首条定稿进 Static 后不可收回——组以整组为单位入 scrollback） */
export function rowSettled(row: FlowRow): boolean {
  return row.kind === 'item' ? itemSettled(row.item) : row.tools.every((t) => t.status !== 'running')
}
