/**
 * 会话页渲染行纯函数集（审计 doc/13 §4.1 B-1 / §4.2 B-2 下沉——四端共享核纪律 §1.1）：
 * mobile/miniapp 曾逐字双份 buildSessionRows、lastUserTextOf 曾四份（web/CLI/mobile/miniapp）
 * 且「取最后一条用户消息」的边界判定无共享约束。本模块是唯一来源，端侧只留平台被迫部分
 * （mobile Composer 高度数学、时间戳格式化随端主题等），从本模块 re-export 或直接导入。
 * 纯常量与纯函数，无平台依赖，不依赖引擎。
 */
import type { EventId } from './ids.js'
import type { UiItem } from './apply-event.js'

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
function rowKeyOf(item: UiItem): string {
  if (item.kind === 'tool') return `tool-${item.callId}`
  if (item.kind === 'approval') return `approval-${item.requestId}`
  return item.eventId
}

/**
 * UiItem 序列 → 渲染行（含时间戳分隔）。
 * timeOf = eventId → 事件时间侧表（端层自信封流填充——UiItem 无 time 字段）。
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

/**
 * 投影里最后一条 user 文本（topBanner/错误重试的回发目标）。
 * 无 user 消息（首轮即错）返回 null——重试钮不出，不拿空文本去撞 zod min(1)。
 * 重发即新一条 user.message，不做原地改写（事件流只追加）。
 */
export function lastUserTextOf(items: readonly UiItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it !== undefined && it.kind === 'user') return it.text
  }
  return null
}
