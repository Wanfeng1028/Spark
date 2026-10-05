/**
 * 会话页纯函数集（工单 9.3）——共享部分已收敛为 protocol 单源的端侧转发（审计
 * doc/13 §4.1 B-1 下沉：buildSessionRows/时间戳判定与 miniapp 曾逐字双份，落点
 * packages/protocol/src/session-rows.ts；新代码请直接从 @spark/protocol 导入）。
 * Composer 自增高度是 RN TextInput 平台数学，留本文件（miniapp 走原生 autoHeight）。
 * 屏幕层只做渲染与接线，不含业务计算（AGENTS §2.7 纯逻辑可测化同律）。
 */
export {
  TIMESTAMP_GAP_MS,
  buildSessionRows,
  lastUserTextOf,
  shouldInsertTimestamp,
} from '@spark/protocol'
export type { SessionRow } from '@spark/protocol'

/** Composer 规格（J.2.1）：高 52 起、行高 20、6 行上限（同 web Composer 纪律） */
export const COMPOSER_BASE_HEIGHT = 52
export const COMPOSER_LINE_HEIGHT = 20
const COMPOSER_MAX_LINES = 6

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
