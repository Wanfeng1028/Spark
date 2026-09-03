/**
 * 展示格式化纯函数（工单 R-B 下沉 / D22 四端共享资产之一，与 error-copy/keymap 同列）：
 * token 紧凑计数、时间戳文案、当天判定、会话列表日期——收敛 web/cli/mobile/miniapp
 * 各自的逐字复制版（止住漂移）。纯函数无平台依赖，四端一律从 @spark/protocol 导入。
 *
 * 边界（刻意不入此表）：web formatRelative（相对时间「刚刚/N 分钟前」）是 web 独有口径，
 * 留 apps/web/src/lib/time.ts；mobile/miniapp 会话列表用 fmtDate（今天=时分、更早=月/日）
 * 紧凑口径，与 web 相对时间不同源，不强并。
 */

/** token 累计的紧凑展示：≥1000 转一位小数 k（web/cli StatusBar、cli StatsPanel 同源） */
export function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/** "7月25日 18:30" 式时间戳文案（mobile/miniapp 会话流时间分隔，DESIGN §13.J.2.3 实测形态） */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`
}

/** 是否当天（本地时区年/月/日全等）——fmtDate 分组判定用 */
export function isToday(ts: number): boolean {
  const d = new Date(ts)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

/** 会话列表右侧日期 meta：今天=时分（HH:MM），更早=月/日（M/D） */
export function fmtDate(ts: number): string {
  const d = new Date(ts)
  if (isToday(ts)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}
