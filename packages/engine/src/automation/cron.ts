/**
 * cron 表达式解析与匹配（阶段七工单 7.6 / H06 / ADR D26）：
 * 标准 5 字段（分 时 日 月 周）子集——`*`、`M`、`M-N`、`M,N` 组合，
 * 以及 `*` 或范围后追加「斜杠+正整数」的步长写法；
 * 周字段 0/7=周日。匹配语义 = 经典 cron tick-match（当前时刻匹配即触发，
 * 由 AutomationManager 的分钟去重保证一分钟只发一次）。
 * 解析失败抛错（配置错误不带病运行——触发器加载/创建时 fail 闭合）。
 */

/** 单字段解析 → 命中值集合（月/周名称缩写不支持——数字语义够用且可 grep） */
function parseField(spec: string, min: number, max: number): Set<number> {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const p = part.trim()
    if (p === '*') {
      for (let v = min; v <= max; v++) out.add(v)
      continue
    }
    const step = /^(\*|\d+-\d+)\/(\d+)$/.exec(p)
    if (step !== null) {
      const base = step[1] ?? ''
      const interval = Number(step[2])
      if (interval <= 0) throw new Error(`E_CRON: 步长须为正整数 "${p}"`)
      const [lo, hi] =
        base === '*' ? [min, max] : [Number(base.split('-')[0]), Number(base.split('-')[1])]
      for (let v = lo; v <= hi; v += interval) out.add(v)
      continue
    }
    const range = /^(\d+)-(\d+)$/.exec(p)
    if (range !== null) {
      const lo = Number(range[1])
      const hi = Number(range[2])
      if (lo < min || hi > max || lo > hi) {
        throw new Error(`E_CRON: 范围越界 "${p}"（允许 ${min}-${max}）`)
      }
      for (let v = lo; v <= hi; v++) out.add(v)
      continue
    }
    if (/^\d+$/.test(p)) {
      const v = Number(p)
      if (v < min || v > max) {
        throw new Error(`E_CRON: 值越界 "${p}"（允许 ${min}-${max}）`)
      }
      out.add(v)
      continue
    }
    throw new Error(`E_CRON: 无法解析字段 "${p}"`)
  }
  return out
}

export interface CronSpec {
  minutes: Set<number>
  hours: Set<number>
  daysOfMonth: Set<number>
  months: Set<number>
  daysOfWeek: Set<number>
}

/** 解析 5 字段表达式（解析一次重复匹配——AutomationManager tick 热路径） */
export function parseCron(expr: string): CronSpec {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`E_CRON: 须为 5 字段（分 时 日 月 周）"${expr}"`)
  }
  const daysOfWeek = parseField(fields[4] ?? '', 0, 7)
  // 周字段 7 折算 0（周日）——POSIX 两种写法等价；JS getDay() 周日=0
  if (daysOfWeek.has(7)) {
    daysOfWeek.delete(7)
    daysOfWeek.add(0)
  }
  return {
    minutes: parseField(fields[0] ?? '', 0, 59),
    hours: parseField(fields[1] ?? '', 0, 23),
    daysOfMonth: parseField(fields[2] ?? '', 1, 31),
    months: parseField(fields[3] ?? '', 1, 12),
    daysOfWeek,
  }
}

/** 当前时刻是否命中（JS Date 的 getDay 0=周日与 cron 周字段语义一致） */
export function cronMatches(spec: CronSpec, now: Date): boolean {
  return (
    spec.minutes.has(now.getMinutes()) &&
    spec.hours.has(now.getHours()) &&
    spec.daysOfMonth.has(now.getDate()) &&
    spec.months.has(now.getMonth() + 1) &&
    spec.daysOfWeek.has(now.getDay())
  )
}
