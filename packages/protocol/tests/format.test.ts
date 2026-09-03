/**
 * format.ts 展示格式化纯函数单测（工单 R-B）：四端共享的 token 计数 / 时间戳 /
 * 当天判定 / 会话日期口径回归网。日期一律用本地时区分量构造（new Date(y,m,d,hh,mm)），
 * 与实现的 getHours/getDate 同口径，跨时区确定。
 */
import { describe, expect, it } from 'vitest'
import { fmtDate, fmtTokens, formatTimestamp, isToday } from '../src/format'

describe('fmtTokens（≥1000 一位小数 k）', () => {
  it('千位以下原样整数', () => {
    expect(fmtTokens(0)).toBe('0')
    expect(fmtTokens(999)).toBe('999')
  })

  it('≥1000 转一位小数 k', () => {
    expect(fmtTokens(1000)).toBe('1.0k')
    expect(fmtTokens(1500)).toBe('1.5k')
    expect(fmtTokens(12345)).toBe('12.3k')
  })
})

describe('formatTimestamp（M月D日 HH:MM）', () => {
  it('本地时分补零、月日不补零', () => {
    // 2021-07-04 09:05 本地时间
    expect(formatTimestamp(new Date(2021, 6, 4, 9, 5).getTime())).toBe('7月4日 09:05')
  })

  it('双位月日与整点', () => {
    // 2021-12-25 18:30 本地时间
    expect(formatTimestamp(new Date(2021, 11, 25, 18, 30).getTime())).toBe('12月25日 18:30')
  })
})

describe('isToday（本地年/月/日全等）', () => {
  it('当前时刻为真', () => {
    expect(isToday(Date.now())).toBe(true)
  })

  it('远古固定日为假', () => {
    expect(isToday(new Date(2000, 0, 1).getTime())).toBe(false)
  })
})

describe('fmtDate（今天=HH:MM，更早=M/D）', () => {
  it('当天走时分', () => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    expect(fmtDate(now.getTime())).toBe(`${hh}:${mm}`)
  })

  it('更早走月/日', () => {
    // 2021-07-04（非当天）→ 7/4
    expect(fmtDate(new Date(2021, 6, 4, 9, 5).getTime())).toBe('7/4')
  })
})
