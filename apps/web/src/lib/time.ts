/**
 * 相对时间格式化（Sidebar 会话项 / 欢迎页会话卡片共用；doc/02 §6.2.1「相对时间」）。
 */

export function formatRelative(ts: number, now: number = Date.now()): string {
  if (ts <= 0) return ''
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// LA-53：回合时长文案收敛 protocol `turnDurationText` 单源——本文件不再自持实现；
// TurnHeader 改引单源（ToolCard 的秒表形态「完成 · fmtDuration」按 ui-copy 头注单独保留）。
export { turnDurationText as formatTurnDuration } from '@spark/protocol'
