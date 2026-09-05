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

/** 回合工作时长（中文口语形态：N 秒 / N 分 N 秒——TurnHeader 用；ToolCard 秒表形态单独保留） */
export function formatTurnDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`
}
