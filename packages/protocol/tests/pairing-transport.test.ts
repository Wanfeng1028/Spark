/**
 * 配对鉴权传输面单测（阶段九工单 9.1 / ADR D24）：
 * - splitSseFrames 切帧纯函数（跨 chunk 拼帧 / 单块多帧 / 尾帧无空行残留）；
 * - authToken 注入双口径（与服务端 tokenOf 一致）：REST 附 Bearer 头 / SSE URL 附 ?token=；
 * - redeemPair round-trip（POST /api/pair 短码兑长效 token）。
 * fetch 打桩形态同 apps/web/tests/http-transport.test.ts（类型化调用记录）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpTransport, SessionEventSource, ids, splitSseFrames } from '../src/index'

const SID = ids.session('ses_pttest0000000000000')

interface FetchCall {
  url: string
  init?: RequestInit
}

/** 永不结束的 SSE 流（挂住泵读，只验证连接 URL） */
function hangingResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({ start: () => undefined })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** fetch stub：记录全部调用；响应由 rest 回调按 URL 给 */
function stubFetch(rest: (url: string, init?: RequestInit) => Response): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(init === undefined ? { url } : { url, init })
    return Promise.resolve(rest(url, init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

/** 请求头（init.headers 恒为普通对象——本测试只经 req 统一封装发出） */
function headersOf(call: FetchCall | undefined): Record<string, string> {
  const h: unknown = call?.init?.headers
  return typeof h === 'object' && h !== null && !Array.isArray(h)
    ? { ...(h as Record<string, string>) }
    : {}
}

/** 请求体 JSON 解析（init.body 恒为 string——本测试只发 JSON.stringify 产物） */
function bodyJson(call: FetchCall | undefined): unknown {
  const body = call?.init?.body
  return typeof body === 'string' ? JSON.parse(body) : undefined
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('splitSseFrames（SSE 切帧纯函数）', () => {
  it('单块多帧：按 \\n\\n 全切出，无残留', () => {
    const { frames, rest } = splitSseFrames(': connected\n\nevent: bye\n\n', '')
    expect(frames).toEqual([': connected', 'event: bye'])
    expect(rest).toBe('')
  })

  it('跨 chunk 拼帧：半帧留缓冲，续块拼齐后切出', () => {
    const first = splitSseFrames('event: message\nda', '')
    expect(first.frames).toEqual([])
    expect(first.rest).toBe('event: message\nda')

    const second = splitSseFrames('ta: {}\n\n', first.rest)
    expect(second.frames).toEqual(['event: message\ndata: {}'])
    expect(second.rest).toBe('')
  })

  it('尾帧无空行结尾：切出完整帧，半帧留待下一块', () => {
    const { frames, rest } = splitSseFrames('a\n\nb\n', '')
    expect(frames).toEqual(['a'])
    expect(rest).toBe('b\n')
  })

  it('空缓冲 + 空串：无帧无残留', () => {
    const { frames, rest } = splitSseFrames('', '')
    expect(frames).toEqual([])
    expect(rest).toBe('')
  })
})

describe('authToken 注入双口径（工单 9.1：与服务端 tokenOf 一致）', () => {
  it('REST：req 附 Authorization: Bearer <token> 头', async () => {
    const { calls } = stubFetch(() => jsonResponse([]))
    const t = new HttpTransport({
      baseUrl: 'http://127.0.0.1:1',
      eventStream: false,
      authToken: 'spk_abc',
    })
    await t.listSessions()
    expect(headersOf(calls[0])).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer spk_abc',
    })
    t.dispose()
  })

  it('REST：无 authToken 不附鉴权头（缺省红线形态）', async () => {
    const { calls } = stubFetch(() => jsonResponse([]))
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:1', eventStream: false })
    await t.listSessions()
    expect(headersOf(calls[0])).toEqual({ 'content-type': 'application/json' })
    t.dispose()
  })

  it('全局 SSE：URL 附 ?token= 查询参数（EventSource 无法自定义头）', async () => {
    const { calls } = stubFetch(() => hangingResponse())
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:1', authToken: 'spk_abc' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]?.url).toBe('http://127.0.0.1:1/api/event?token=spk_abc')
    t.dispose()
  })

  it('全局 SSE：无 authToken URL 不带查询参数（缺省红线形态）', async () => {
    const { calls } = stubFetch(() => hangingResponse())
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:1' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]?.url).toBe('http://127.0.0.1:1/api/event')
    t.dispose()
  })

  it('SessionEventSource：URL 附 &token= 查询参数', async () => {
    const { calls } = stubFetch(() => hangingResponse())
    const source = new SessionEventSource({
      baseUrl: 'http://127.0.0.1:1',
      sessionId: SID,
      authToken: 'spk_abc',
      onEvent: () => undefined,
    })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]?.url).toBe(
      `http://127.0.0.1:1/api/event?sessionId=${SID}&since=0&token=spk_abc`,
    )
    source.dispose()
  })
})

describe('redeemPair round-trip（POST /api/pair 移动端兑换口）', () => {
  it('短码兑换：POST + body 原样发送 → 长效 token 返回', async () => {
    const { calls } = stubFetch(() => jsonResponse({ token: 'spk_longlived' }))
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:1', eventStream: false })
    const dto = await t.redeemPair({ code: '123456', name: '我的手机' })
    expect(dto).toEqual({ token: 'spk_longlived' })

    expect(calls[0]?.url).toBe('http://127.0.0.1:1/api/pair')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(bodyJson(calls[0])).toEqual({ code: '123456', name: '我的手机' })
    t.dispose()
  })

  it('服务端拒绝（错码 401）→ 错误码经消息透出', async () => {
    const { calls } = stubFetch(() =>
      jsonResponse({ code: 'E_PAIR', message: '配对码无效或已过期' }, 401),
    )
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:1', eventStream: false })
    await expect(t.redeemPair({ code: '000000' })).rejects.toThrow(/^E_PAIR: /)
    expect(calls).toHaveLength(1)
    t.dispose()
  })
})
