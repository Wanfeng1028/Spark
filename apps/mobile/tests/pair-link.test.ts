/**
 * 配对深链解析单测（工单 9.2 要求：合法/非法/缺参三类）。
 */
import { baseUrlOf, parsePairLink } from '../src/transport/pair-link'

describe('parsePairLink', () => {
  describe('合法输入', () => {
    it('解析标准 spark://pair 深链', () => {
      expect(
        parsePairLink('spark://pair?host=192.168.1.10&port=4318&code=123456'),
      ).toEqual({ host: '192.168.1.10', port: 4318, code: '123456' })
    })

    it('容忍首尾空白', () => {
      expect(
        parsePairLink('  spark://pair?host=spark.local&port=80&code=000111  '),
      ).toEqual({ host: 'spark.local', port: 80, code: '000111' })
    })

    it('URL 编码的值可还原', () => {
      expect(
        parsePairLink('spark://pair?host=10.0.0.1&port=4318&code=654321&extra=x'),
      ).toEqual({ host: '10.0.0.1', port: 4318, code: '654321' })
    })
  })

  describe('非法输入', () => {
    it('错误协议拒绝', () => {
      expect(parsePairLink('http://pair?host=a&port=1&code=123456')).toBeNull()
    })

    it('错误主机段拒绝', () => {
      expect(parsePairLink('spark://redeem?host=a&port=1&code=123456')).toBeNull()
    })

    it('端口越界拒绝', () => {
      expect(parsePairLink('spark://pair?host=a&port=70000&code=123456')).toBeNull()
      expect(parsePairLink('spark://pair?host=a&port=0&code=123456')).toBeNull()
    })

    it('端口非数字拒绝', () => {
      expect(parsePairLink('spark://pair?host=a&port=abc&code=123456')).toBeNull()
    })

    it('配对码非 6 位数字拒绝', () => {
      expect(parsePairLink('spark://pair?host=a&port=4318&code=12345')).toBeNull()
      expect(parsePairLink('spark://pair?host=a&port=4318&code=1234567')).toBeNull()
      expect(parsePairLink('spark://pair?host=a&port=4318&code=12a456')).toBeNull()
    })

    it('host 含注入字符拒绝', () => {
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

    it('合法域名/IPv4 通过（白名单不误伤）', () => {
      expect(
        parsePairLink('spark://pair?host=my-server.local&port=4318&code=123456'),
      ).toEqual({ host: 'my-server.local', port: 4318, code: '123456' })
      expect(
        parsePairLink('spark://pair?host=172.16.0.2&port=4318&code=123456'),
      ).toEqual({ host: '172.16.0.2', port: 4318, code: '123456' })
    })

    it('乱序转义拒绝', () => {
      expect(parsePairLink('spark://pair?host=%E0%A4%A&port=1&code=123456')).toBeNull()
    })

    it('非 URL 文本拒绝', () => {
      expect(parsePairLink('')).toBeNull()
      expect(parsePairLink('不是链接')).toBeNull()
    })
  })

  describe('缺参输入', () => {
    it('缺 host', () => {
      expect(parsePairLink('spark://pair?port=4318&code=123456')).toBeNull()
    })
    it('缺 port', () => {
      expect(parsePairLink('spark://pair?host=a&code=123456')).toBeNull()
    })
    it('缺 code', () => {
      expect(parsePairLink('spark://pair?host=a&port=4318')).toBeNull()
    })
    it('无查询段', () => {
      expect(parsePairLink('spark://pair')).toBeNull()
    })
  })

  it('baseUrlOf 口径与设置页一致', () => {
    expect(baseUrlOf('192.168.1.10', 4318)).toBe('http://192.168.1.10:4318')
  })
})
