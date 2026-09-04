/**
 * errorFromResponse 单测（工单 R-B 下沉）：非 2xx 响应 → `Error("code: message")`。
 * 两个调用方口径都要覆盖——transport-node（fetch，有 statusText、body 需自行 json 解析，
 * 解析失败传 null）与 miniapp rest（Taro，无 statusText 故缺省空串、body 已由框架解析）。
 * 出口形状与本文件 humanizeError 的前缀解析配套，故加一条端到端人话化用例钉住。
 */
import { describe, expect, it } from 'vitest'
import { ERROR_COPY, errorFromResponse, errorMessageOf, humanizeError } from '../src/error-copy'

describe('errorFromResponse——错误体命中', () => {
  it('code 与 message 均为 string 时取用', () => {
    const err = errorFromResponse(403, { code: 'E_AUTH', message: 'token 无效' }, 'Forbidden')
    expect(err.message).toBe('E_AUTH: token 无效')
  })

  it('只命中其一：另一侧落 HTTP 缺省（不给假值）', () => {
    expect(errorFromResponse(404, { message: '会话不存在' }, 'Not Found').message).toBe(
      'HTTP_404: 会话不存在',
    )
    expect(errorFromResponse(404, { code: 'E_NOT_FOUND' }, 'Not Found').message).toBe(
      'E_NOT_FOUND: Not Found',
    )
  })

  it('字段非 string（数字/对象/null）忽略，落缺省', () => {
    expect(errorFromResponse(500, { code: 500, message: null }, 'Boom').message).toBe(
      'HTTP_500: Boom',
    )
  })
})

describe('errorFromResponse——错误体不可用', () => {
  it('body 为 null/undefined/字符串/数字：落 HTTP_<status> + statusText', () => {
    expect(errorFromResponse(502, null, 'Bad Gateway').message).toBe('HTTP_502: Bad Gateway')
    expect(errorFromResponse(502, undefined, 'Bad Gateway').message).toBe('HTTP_502: Bad Gateway')
    expect(errorFromResponse(500, '内部错误', 'ISE').message).toBe('HTTP_500: ISE')
    expect(errorFromResponse(500, 42, 'ISE').message).toBe('HTTP_500: ISE')
  })

  it('statusText 缺省空串（Taro 口径）：形状仍为 "code: message"', () => {
    expect(errorFromResponse(500, null).message).toBe('HTTP_500: ')
    expect(errorFromResponse(409, { code: 'E_TURN_ACTIVE', message: '本轮进行中' }).message).toBe(
      'E_TURN_ACTIVE: 本轮进行中',
    )
  })
})

describe('errorFromResponse——与人话化出口配套', () => {
  it('表内码经 errorMessageOf 得文案（调用方禁自造文案，D22）', () => {
    const err = errorFromResponse(401, { code: 'E_AUTH', message: 'missing token' }, 'Unauthorized')
    expect(errorMessageOf(err)).toBe(ERROR_COPY['E_AUTH'])
  })

  it('HTTP_<status> 不在表内：humanizeError 保留原始消息（不吞信息）', () => {
    const c = humanizeError(errorFromResponse(502, null, 'Bad Gateway').message)
    expect(c.code).toBe('HTTP_502')
    expect(c.title).toBe('Bad Gateway')
  })
})
