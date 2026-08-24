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

/** 是否「今天」（Sidebar 分组：今天 / 更早） */
export function isToday(ts: number, now: number = Date.now()): boolean {
  if (ts <= 0) return false
  const a = new Date(ts)
  const b = new Date(now)
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
