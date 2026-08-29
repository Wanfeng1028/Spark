/**
 * 会话页纯函数集（工单 9.3——可测逻辑自屏幕组件抽出，Jest 单测把关）：
 * 分页历史升序合并 / 时间戳分隔判定与格式化 / 消息行构建 / Composer 自增高度。
 * 屏幕层只做渲染与接线，不含业务计算（AGENTS §2.7 纯逻辑可测化同律）。
 */
import type { EventId, SparkEventEnvelope, UiItem } from '@spark/protocol'

/** 时间戳分隔阈值：相邻消息间隔 >30 分钟（DESIGN §13.J.2.3） */
export const TIMESTAMP_GAP_MS = 30 * 60 * 1000

/** Composer 规格（J.2.1）：高 52 起、行高 20、6 行上限（同 web Composer 纪律） */
export const COMPOSER_BASE_HEIGHT = 52
export const COMPOSER_LINE_HEIGHT = 20
export const COMPOSER_MAX_LINES = 6

/** 渲染行：消息/卡片项 或 居中时间戳分隔（key 供 FlatList） */
export type SessionRow =
  | { kind: 'timestamp'; key: string; time: number }
  | { kind: 'item'; key: string; item: UiItem }

function seqOf(e: SparkEventEnvelope): number {
  // live 事件无 seq——稳定排序下保持到达序置于尾部
  return e.seq ?? Number.MAX_SAFE_INTEGER
}

/**
 * 分页合并：较旧一页（升序）并入既有窗口（升序）——按 id 去重、按 seq 升序输出。
 * 幂等：同页重复合并不产生重复事件（弱网重试安全）。
 */
export function mergeEventPage(
  olderPage: readonly SparkEventEnvelope[],
  existing: readonly SparkEventEnvelope[],
): SparkEventEnvelope[] {
  const seen = new Set(existing.map((e) => e.id))
  const merged = [...olderPage.filter((e) => !seen.has(e.id)), ...existing]
  return merged.sort((a, b) => seqOf(a) - seqOf(b))
}

/** 时间戳分隔判定：相邻消息间隔 >30 分钟插分隔（时间缺失不插——不拿缺数据冒充） */
export function shouldInsertTimestamp(
  prevTime: number | undefined,
  curTime: number | undefined,
): boolean {
  if (prevTime === undefined || curTime === undefined) return false
  return curTime - prevTime > TIMESTAMP_GAP_MS
}

/** "7月25日 18:30" 式时间戳文案（13 meta，J.2.3 实测形态） */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`
}

/** 行 key：tool/approval 以 callId/requestId 稳定化（同事件可派生多个工具行） */
export function rowKeyOf(item: UiItem): string {
  if (item.kind === 'tool') return `tool-${item.callId}`
  if (item.kind === 'approval') return `approval-${item.requestId}`
  return item.eventId
}

/**
 * UiItem 序列 → 渲染行（含时间戳分隔）。
 * timeOf = eventId → 事件时间侧表（屏幕层自信封流填充——UiItem 无 time 字段）。
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
 * Composer 自增高度：单行 52 起、每多一行 +20、封顶 6 行（超出滚动输入）。
 */
export function composerHeight(lineCount: number): number {
  const lines = Math.max(1, Math.min(lineCount, COMPOSER_MAX_LINES))
  return COMPOSER_BASE_HEIGHT + (lines - 1) * COMPOSER_LINE_HEIGHT
}

/** TextInput contentSize 高度 → 行数（1 起步、6 封顶）——与 composerHeight 配对 */
export function composerLinesFromContentSize(contentHeight: number): number {
  const lines = Math.ceil(contentHeight / COMPOSER_LINE_HEIGHT)
  return Math.max(1, Math.min(lines, COMPOSER_MAX_LINES))
}
