/**
 * 配对深链解析单测（工单 R-B 下沉——承接 apps/mobile tests/pair-link.test.ts 与
 * apps/miniapp tests/pair.test.ts 两份用例的并集，覆盖不降）：
 * 合法/非法/缺参三类，任何不合法一律 null（失败闭合，不做半截配置）。
 * 安全面重点：host 白名单（评审 G7——黑名单会漏 `:` 与 `\`）与百分号坏转义。
 */
import { describe, expect, it } from 'vitest'
import { baseUrlOf, parsePairLink } from '../src/pair-link'

describe('parsePairLink——合法输入', () => {
  it('解析标准 spark://pair 深链（host/port/code 三参齐备）', () => {
    expect(parsePairLink('spark://pair?host=192.168.1.10&port=4318&code=123456')).toEqual({
      host: '192.168.1.10',
      port: 4318,
      code: '123456',
    })
  })

  it('容忍首尾空白（扫码结果偶带）', () => {
    expect(parsePairLink('  spark://pair?host=spark.local&port=80&code=000111  ')).toEqual({
      host: 'spark.local',
      port: 80,
      code: '000111',
    })
  })

  it('未知查询参数忽略（前向兼容）', () => {
    expect(parsePairLink('spark://pair?host=10.0.0.1&port=4318&code=654321&extra=x')).toEqual({
      host: '10.0.0.1',
      port: 4318,
      code: '654321',
    })
  })

  it('合法域名/连字符主机名/IPv4 均通过（白名单不误伤）', () => {
    expect(parsePairLink('spark://pair?host=my-server.local&port=4318&code=123456')).toEqual({
      host: 'my-server.local',
      port: 4318,
      code: '123456',
    })
    expect(parsePairLink('spark://pair?host=172.16.0.2&port=4318&code=123456')?.host).toBe(
      '172.16.0.2',
    )
    expect(parsePairLink('spark://pair?host=my-host&port=4318&code=123456')?.host).toBe('my-host')
  })

  it('端口边界值 1 与 65535 合法', () => {
    expect(parsePairLink('spark://pair?host=a&port=1&code=123456')?.port).toBe(1)
    expect(parsePairLink('spark://pair?host=a&port=65535&code=123456')?.port).toBe(65535)
  })
})

describe('parsePairLink——非法输入', () => {
  it('协议/路径段不符一律 null', () => {
    expect(parsePairLink('http://pair?host=a&port=1&code=123456')).toBeNull()
    expect(parsePairLink('spark://redeem?host=a&port=1&code=123456')).toBeNull()
    expect(parsePairLink('spark://other?host=a&port=1&code=123456')).toBeNull()
  })

  it('非 URL 文本与无查询段一律 null', () => {
    expect(parsePairLink('')).toBeNull()
    expect(parsePairLink('不是链接')).toBeNull()
    expect(parsePairLink('spark://pair')).toBeNull()
  })

  it('端口越界/非数字拒绝', () => {
    expect(parsePairLink('spark://pair?host=a&port=0&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=70000&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=65536&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=abc&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=x&code=123456')).toBeNull()
  })

  it('配对码非 6 位数字拒绝（含字母）', () => {
    expect(parsePairLink('spark://pair?host=a&port=1&code=12345')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=1&code=1234567')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=1&code=12a456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a&port=1&code=abcdef')).toBeNull()
  })

  it('host 空值/含空格/含斜杠拒绝', () => {
    expect(parsePairLink('spark://pair?host=&port=1&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a b&port=1&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a/b&port=1&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a%20b&port=1&code=123456')).toBeNull()
  })

  it('host 白名单拒绝黑名单漏网字符（评审 G7）', () => {
    // IPv6 字面量（含冒号）：当前配对协议仅支持主机名/IPv4
    expect(parsePairLink('spark://pair?host=::1&port=1&code=123456')).toBeNull()
    // 反斜杠（黑名单漏网）
    expect(parsePairLink('spark://pair?host=a\\b&port=1&code=123456')).toBeNull()
    // 冒号（黑名单漏网；防 host:port 拼接歧义）
    expect(parsePairLink('spark://pair?host=a:8080&port=1&code=123456')).toBeNull()
  })

  it('百分号坏转义拒绝（decodeURIComponent 抛错即整链 null）', () => {
    expect(parsePairLink('spark://pair?host=%E0%A4%A&port=1&code=123456')).toBeNull()
    expect(parsePairLink('spark://pair?host=a%zz&port=1&code=123456')).toBeNull()
  })
})

describe('parsePairLink——缺参输入', () => {
  it('缺 host', () => {
    expect(parsePairLink('spark://pair?port=4318&code=123456')).toBeNull()
  })
  it('缺 port', () => {
    expect(parsePairLink('spark://pair?host=a&code=123456')).toBeNull()
  })
  it('缺 code', () => {
    expect(parsePairLink('spark://pair?host=a&port=4318')).toBeNull()
  })
})

describe('baseUrlOf', () => {
  it('拼 http 基址（传输构造与设置页回显同一口径）', () => {
    expect(baseUrlOf('192.168.1.10', 4318)).toBe('http://192.168.1.10:4318')
  })
})
