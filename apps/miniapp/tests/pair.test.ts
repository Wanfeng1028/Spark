/**
 * 手输配对码归一单测（工单 9.4 建 / 工单 R-B 改）：
 * spark://pair 深链解析本体已下沉 @spark/protocol pair-link，原两用例集由
 * packages/protocol/tests/pair-link.test.ts 承接（mobile 与本端用例的并集，覆盖不降）；
 * parsePairCode 是小程序独有路径（扫不到码时手输兜底），单端消费故留本包，测试随实现走。
 */
import { describe, expect, it } from 'vitest'
import { parsePairCode } from '../src/transport/pair'

describe('parsePairCode', () => {
  it('手输码：去空白后恰 6 位数字合法', () => {
    expect(parsePairCode('123456')).toBe('123456')
    expect(parsePairCode(' 123 456 ')).toBe('123456')
  })

  it('非 6 位数字/全角不姑息：返回 null', () => {
    expect(parsePairCode('12345')).toBeNull()
    expect(parsePairCode('1234567')).toBeNull()
    expect(parsePairCode('12345a')).toBeNull()
    expect(parsePairCode('１２３４５６')).toBeNull() // 全角不隐式转换
    expect(parsePairCode('')).toBeNull()
  })
})
