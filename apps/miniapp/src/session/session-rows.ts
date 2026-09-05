/**
 * 会话页纯函数集（工单 9.4——语义对齐 apps/mobile/src/session/session-rows.ts；
 * 可测逻辑自页面抽出，vitest 单测把关；页面层只做渲染与接线）。
 * Composer 高度计算除外：小程序 Textarea autoHeight 原生自增，无需手算。
 */
import type { EventId, UiItem } from '@spark/protocol'

/** 时间戳分隔阈值：相邻消息间隔 >30 分钟（DESIGN §13.J.2.3） */
export const TIMESTAMP_GAP_MS = 30 * 60 * 1000

/** 渲染行：消息/卡片项 或 居中时间戳分隔（key 供列表渲染） */
export type SessionRow =
  | { kind: 'timestamp'; key: string; time: number }
  | { kind: 'item'; key: string; item: UiItem }

/** 时间戳分隔判定：相邻消息间隔 >30 分钟插分隔（时间缺失不插——不拿缺数据冒充） */
export function shouldInsertTimestamp(
  prevTime: number | undefined,
  curTime: number | undefined,
): boolean {
  if (prevTime === undefined || curTime === undefined) return false
  return curTime - prevTime > TIMESTAMP_GAP_MS
}

/** 行 key：tool/approval 以 callId/requestId 稳定化（同事件可派生多个工具行） */
export function rowKeyOf(item: UiItem): string {
  if (item.kind === 'tool') return `tool-${item.callId}`
  if (item.kind === 'approval') return `approval-${item.requestId}`
  return item.eventId
}

/**
 * UiItem 序列 → 渲染行（含时间戳分隔）。
 * timeOf = eventId → 事件时间侧表（页面层自信封流填充——UiItem 无 time 字段）。
 * 间隔口径只算消息（user/assistant）：工具卡/思考块/审批卡不参与间隔判定。
 */
export function buildSessionRows(
  items: readonly UiItem[],
  timeOf: (eventId: EventId) => number | undefined,
): SessionRow[] {
  const rows: SessionRow[] = []
  let lastMessageTime: number | undefined
  for (const item of items) {
    const time = timeOf(item.eventId)
    const isMessage = item.kind === 'user' || item.kind === 'assistant'
    if (isMessage && time !== undefined && shouldInsertTimestamp(lastMessageTime, time)) {
      rows.push({ kind: 'timestamp', key: `ts-${item.eventId}`, time })
    }
    rows.push({ kind: 'item', key: rowKeyOf(item), item })
    if (isMessage && time !== undefined) lastMessageTime = time
  }
  return rows
}
