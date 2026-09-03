/**
 * 会话流显示行推导（工单 R-B 下沉 / D22 四端共享资产之三，与 error-copy/keymap/apply-event 同列）：
 * 以 web 版为准合并单源（cli 版曾漂移出无显示选项的旧签名）：
 * - toolCategoryOf：内置工具 → 人话类别词；mcp__/技能等未知工具保留原名（禁假状态）；
 * - flowRowsOf：连续同类别工具项聚合为组行（「· N 次」）；孤立工具不组；其余逐项成行，顺序不变。
 *   显示选项（工单 10.20 A③）：groupTools=false 不聚合（连续工具逐项成行）；
 *   firstReasoningPerTurn=true 每轮仅保留首条思考（按显示序中 turn 头项分轮，
 *   不依赖 reasoning 自身字段）。
 *
 * 边界（刻意不入此表）：端特有派生留各端——web rowIndexOfEvent（搜索跳转行定位，工单 7.13）
 * 在 apps/web/src/features/chat/chat-flow-rows.ts；cli rowSettled（Ink Static 前缀单调）
 * 在 apps/cli/src/flow-rows.ts。两者都只在各自端成立，下沉即造死导出。
 */
import type { UiItem } from './apply-event.js'

export type ToolItem = Extract<UiItem, { kind: 'tool' }>

export type FlowRow =
  | { kind: 'item'; key: string; item: UiItem }
  | { kind: 'toolGroup'; key: string; category: string; tools: ToolItem[] }

export interface FlowRowsOptions {
  /** 连续同类工具聚合成组（缺省开） */
  groupTools?: boolean
  /** 每轮仅展示第一条思考（缺省关 = 全展示） */
  firstReasoningPerTurn?: boolean
}

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
export function flowRowsOf(items: readonly UiItem[], opts: FlowRowsOptions = {}): FlowRow[] {
  const groupTools = opts.groupTools ?? true
  const firstReasoningPerTurn = opts.firstReasoningPerTurn ?? false
  // 按 turn 头项计数分轮（不依赖 reasoning 自身字段——仅用显示序中的 turn 项）
  let turnIndex = -1
  const reasoningShownInTurn = new Set<number>()
  const rows: FlowRow[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]
    if (it === undefined) break
    if (it.kind === 'turn') turnIndex += 1
    if (it.kind === 'reasoning' && firstReasoningPerTurn) {
      // 「显示思考过程」关闭档（工单 10.20 A③）：每轮仅保留首条思考
      if (reasoningShownInTurn.has(turnIndex)) {
        i += 1
        continue
      }
      reasoningShownInTurn.add(turnIndex)
    }
    if (it.kind !== 'tool') {
      rows.push({ kind: 'item', key: keyOf(it), item: it })
      i += 1
      continue
    }
    if (!groupTools) {
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
