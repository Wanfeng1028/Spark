/**
 * MiniRestClient 单测（工单 19.29 补齐批新增面）：归档查询参数、附件上传的
 * raw 字节请求形状、以及"发送体不带 attachments"这条与 HttpTransport 同口径的不变量。
 * 传输替身按 mini-event-source.test.ts 同法（vi.mock('@tarojs/taro')），断言靠调用记录。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ids } from '@spark/protocol'

const harness = vi.hoisted(() => {
  interface Call {
    url: string
    method?: string
    header?: Record<string, string>
    data?: unknown
    timeout?: number
  }
  const state = {
    calls: [] as Call[],
    statusCode: 200,
    responseBody: null as unknown,
  }
  return { state }
})

vi.mock('@tarojs/taro', () => ({
  default: {
    request: (opts: unknown): Promise<{ statusCode: number; data: unknown }> => {
      harness.state.calls.push(opts as { url: string })
      return Promise.resolve({
        statusCode: harness.state.statusCode,
        data: harness.state.responseBody,
      })
    },
  },
}))

import { MiniRestClient } from '../src/transport/rest'

const SID = ids.session('ses_mini_rest_1')

function client(token?: string): MiniRestClient {
  return new MiniRestClient({
    baseUrl: 'http://127.0.0.1:4318',
    ...(token !== undefined ? { token } : {}),
  })
}

beforeEach(() => {
  harness.state.calls.length = 0
  harness.state.statusCode = 200
  harness.state.responseBody = []
})

describe('listSessions（归档档数据源切换，工单 12.4 方法面）', () => {
  it('缺省不带查询串 = 服务端排除归档', async () => {
    await client().listSessions()
    expect(harness.state.calls[0]?.url).toBe('http://127.0.0.1:4318/api/sessions')
  })

  it('archived=true 进查询串；false 与缺省同形（不误列未归档）', async () => {
    await client().listSessions(true)
    expect(harness.state.calls[0]?.url).toBe('http://127.0.0.1:4318/api/sessions?archived=true')
    await client().listSessions(false)
    expect(harness.state.calls[1]?.url).toBe('http://127.0.0.1:4318/api/sessions')
  })
})

describe('uploadAttachment（raw 图片字节；形状同 HttpTransport）', () => {
  it('content-type = 图片 mime、x-file-name URI 编码、body 为 ArrayBuffer、长超时', async () => {
    harness.state.statusCode = 201
    harness.state.responseBody = { id: 'x', file: 'x.png', mime: 'image/png', size: 3, name: '中文 名.png' }
    await client('tk').uploadAttachment(SID, {
      name: '中文 名.png',
      mime: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    })
    const call = harness.state.calls[0]
    expect(call?.url).toBe(`http://127.0.0.1:4318/api/sessions/${SID}/attachments`)
    expect(call?.method).toBe('POST')
    expect(call?.header?.['content-type']).toBe('image/png')
    expect(call?.header?.['x-file-name']).toBe(encodeURIComponent('中文 名.png'))
    expect(call?.header?.['Authorization']).toBe('Bearer tk')
    expect(call?.timeout).toBeGreaterThan(15_000)
    const body = new Uint8Array(call?.data as ArrayBuffer)
    expect(Array.from(body)).toEqual([1, 2, 3])
  })

  it('上传不回 content-type: application/json（raw 通道与 JSON 通道互斥）', async () => {
    harness.state.statusCode = 201
    harness.state.responseBody = { id: 'x', file: 'x.png', mime: 'image/png', size: 0, name: 'x.png' }
    await client().uploadAttachment(SID, { name: 'x.png', mime: 'image/png', bytes: new Uint8Array() })
    expect(harness.state.calls[0]?.header?.['content-type']).not.toBe('application/json')
  })
})

describe('sendMessage（与 HttpTransport 同口径：不带 attachments）', () => {
  it('body 只有 text/delivery——server SendMessageBody 是 strictObject，多塞字段换 400', async () => {
    harness.state.statusCode = 200
    harness.state.responseBody = { result: 'started' }
    await client().sendMessage(SID, '你好')
    const body = harness.state.calls[0]?.data as string
    expect(JSON.parse(body)).toEqual({ text: '你好', delivery: 'now' })
  })
})

describe('错误映射（errorFromResponse 单源）', () => {
  it('非 2xx 抛 code: message（附件超限可被人话化）', async () => {
    harness.state.statusCode = 400
    harness.state.responseBody = { code: 'E_ATTACHMENT_TYPE', message: '仅支持 png/jpeg/gif/webp 图片' }
    await expect(client().listSessions()).rejects.toThrow('E_ATTACHMENT_TYPE')
  })

  it('无 token 时不发 Authorization 头（环回缺省形态行为不变红线）', async () => {
    await client().listSessions()
    expect(harness.state.calls[0]?.header?.['Authorization']).toBeUndefined()
  })
})
