/**
 * 会话流显示行推导（工单 10.4④，纯逻辑）：
 * - toolCategoryOf：内置工具 → 人话类别词（ZCode 对齐；未知工具保留原名）
 * - flowRowsOf：连续同类别工具项聚合为组行（"· N 次"）；孤立工具不组。
 * 事件→渲染的中间层，与 applyEvent 一样可独立单测。
 */
import type { UiItem } from '@spark/protocol'

export type ToolItem = Extract<UiItem, { kind: 'tool' }>

export type FlowRow =
  | { kind: 'item'; key: string; item: UiItem }
  | { kind: 'toolGroup'; key: string; category: string; tools: ToolItem[] }

/** 内置工具人话类别词（工单 10.4④）；mcp__/技能等未知工具保留原名（禁假状态） */
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

function keyOf(item: UiItem): string {
  return item.kind === 'tool' ? `tool:${item.callId}` : `${item.kind}:${item.eventId}`
}

/** 连续同类别工具聚合成组行（≥2 条才组）；其余逐项成行，顺序不变 */
export function flowRowsOf(items: UiItem[]): FlowRow[] {
  const rows: FlowRow[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]
    if (it === undefined) break
    if (it.kind !== 'tool') {
      rows.push({ kind: 'item', key: keyOf(it), item: it })
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
      rows.push({ kind: 'item', key: keyOf(it), item: it })
    }
    i = j
  }
  return rows
}

/** 定位包含指定事件的显示行下标（搜索跳转用，工单 7.13 语义迁移）；未命中 -1 */
export function rowIndexOfEvent(rows: FlowRow[], eventId: string): number {
  return rows.findIndex((r) =>
    r.kind === 'item' ? r.item.eventId === eventId : r.tools.some((t) => t.eventId === eventId),
  )
}
