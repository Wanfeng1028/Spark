/**
 * 错误码→文案表单测（工单 6.7）：前缀解析、命中/未命中路径、errorMessageOf、
 * 工单指定判例 E_MOCK_UNKNOWN_SESSION。
 */
import { describe, expect, it } from 'vitest'
import { ERROR_COPY, errorMessageOf, humanizeError } from '../src/lib/error-copy'

describe('humanizeError', () => {
  it('工单判例：E_MOCK_UNKNOWN_SESSION → 「会话不存在或已被清理」，原码折叠详情', () => {
    const c = humanizeError('E_MOCK_UNKNOWN_SESSION: ses_01ABC')
    expect(c.title).toBe('会话不存在或已被清理')
    expect(c.code).toBe('E_MOCK_UNKNOWN_SESSION')
    expect(c.detail).toBe('E_MOCK_UNKNOWN_SESSION: ses_01ABC')
  })

  it('表中命中：title 用文案，detail 保原码+原始消息', () => {
    const c = humanizeError('E_TURN_ACTIVE: 手动压缩')
    expect(c.title).toBe('本轮对话仍在进行中，请等待结束后再操作')
    expect(c.detail).toBe('E_TURN_ACTIVE: 手动压缩')
  })

  it('未命中码：title 用原始消息（可读优先），detail 保全文', () => {
    const c = humanizeError('E_SOMETHING_NEW: 新错误')
    expect(c.title).toBe('新错误')
    expect(c.code).toBe('E_SOMETHING_NEW')
    expect(c.detail).toBe('E_SOMETHING_NEW: 新错误')
  })

  it('无码前缀（引擎 error 事件人话）：原样返回，code/detail null', () => {
    const c = humanizeError('LLM 网关错误：连接超时')
    expect(c).toEqual({ title: 'LLM 网关错误：连接超时', code: null, detail: null })
  })

  it('码后无消息：detail 只含码', () => {
    const c = humanizeError('E_CONFIG')
    expect(c.title).toBe(ERROR_COPY['E_CONFIG'])
    expect(c.detail).toBe('E_CONFIG')
  })

  it('文案表覆盖 server §7.4 全部 12 码', () => {
    const serverCodes = [
      'E_VALIDATION',
      'E_NOT_FOUND',
      'E_ALREADY_RESOLVED',
      'E_TURN_ACTIVE',
      'E_TURN_MISMATCH',
      'E_INVALID_BOUNDARY',
      'E_OPEN_TURN',
      'E_ALREADY_EXISTS',
      'E_CHECKPOINT_ROLLBACK',
      'E_CONFIG',
      'E_SHUTTING_DOWN',
      'E_INTERNAL',
    ]
    for (const code of serverCodes) expect(ERROR_COPY[code]).toBeDefined()
  })
})

describe('errorMessageOf', () => {
  it('Error 实例与非 Error 值均出人话 title', () => {
    expect(errorMessageOf(new Error('E_NOT_FOUND: xxx'))).toBe(
      '目标不存在（会话/请求/快照可能已被清理）',
    )
    expect(errorMessageOf('E_SHUTTING_DOWN: 引擎正在关闭')).toBe('引擎正在关闭，请稍后重启应用')
    expect(errorMessageOf('plain text')).toBe('plain text')
  })
})
