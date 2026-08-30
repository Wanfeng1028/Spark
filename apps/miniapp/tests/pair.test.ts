/**
 * 配对深链/码解析单测（工单 9.4）：语义对齐 apps/mobile pair-link.test.ts——
 * spark://pair 深链（扫码所得）与手输 6 位码共用解析口径，失败闭合返回 null。
 */
import { describe, expect, it } from 'vitest'
import { baseUrlOf, parsePairCode, parsePairLink } from '../src/transport/pair'

describe('parsePairLink——spark://pair 深链解析', () => {
  it('合法深链：host/port/code 三参齐备', () => {
    expect(parsePairLink('spark://pair?host=192.168.1.10&port=4318&code=123456')).toEqual({
      host: '192.168.1.10',
      port: 4318,
      code: '123456',
    })
  })

  it('主机名为字母域名亦可', () => {
    expect(parsePairLink('spark://pair?host=spark.local&port=80&code=000001')?.host).toBe(
      'spark.local',
    )
  })

  it('前后空白容忍（扫码结果偶带）', () => {
    expect(
      parsePairLink('  spark://pair?host=127.0.0.1&port=4318&code=123456  '),
    ).not.toBeNull()
  })

  it('协议不符一律 null（失败闭合，不做半截配置）', () => {
    expect(parsePairLink('http://pair?host=a&port=1&code=123456')).toBeNull()
    expect(parsePairLink('spark://other?host=a&port=1&code=123456')).toBeNull()
    expect(parsePairLink('')).toBeNull()
    expect(parsePairLink('spark://pair')).toBeNull()
  })

  it('缺参/坏值一律 null', () => {
    expect(parsePairLink('spark://pair?host=a&port=1')).toBeNull()
    expect(parsePairLink('spark://pair?host=&port=1&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a b&port=1&code=123456')).toBeNull() // 非法主机段
    expect(parsePairLink('spark://pair?host=a&port=0&code=123456')).toBeNull() // 端口越界
    expect(parsePairLink('spark://pair?host=a&port=65536&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=x&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=1&code=12345')).toBeNull() // 5 位
    expect(parsePairLink('spark://pair?host=a&port=1&code=1234567')).toBeNull() // 7 位
    expect(parsePairLink('spark://pair?host=a&port=1&code=abcdef')).toBeNull()
  })

  it('百分号转义解码；坏转义返回 null', () => {
    expect(
      parsePairLink('spark://pair?host=my-host&port=4318&code=123456')?.host,
    ).toBe('my-host')
    expect(parsePairLink('spark://pair?host=a%zz&port=1&code=123456')).toBeNull()
  })
})

describe('baseUrlOf / parsePairCode', () => {
  it('baseUrlOf 拼 http 基址', () => {
    expect(baseUrlOf('192.168.1.10', 4318)).toBe('http://192.168.1.10:4318')
  })

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
