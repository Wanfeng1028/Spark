/**
 * HttpTransport 单测（doc/02 §6.6 要点 / §8.6 web 行）：SSE 帧解析（注释帧忽略/
 * data 行信封校验/坏帧断开重连）、REST 调用形状与错误体映射、退避重连与状态序列、
 * 重连成功 resync 已打开会话、dispose 后调用抛错。
 * fetch 全程 stub（vi.stubGlobal），SSE 用 Response+ReadableStream 模拟。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import { HttpTransport } from '../src/transports/http'
import type { HttpConnectionStatus } from '../src/transports/http'

const SID = ids.session('ses_httptest0000000000000000')

/** 合法信封样例（parseEnvelope 会过 zod；data 按 type 给足字段） */
function envelope(seq: number, type: 'session.created' | 'session.title' = 'session.created'): SparkEventEnvelope {
  const data =
    type === 'session.created'
      ? { cwd: '/tmp', model: 'fake/fake-chat' }
      : { title: '改名' }
  return {
    id: ids.event(`evt_httptest${seq.toString().padStart(4, '0')}`),
    sessionId: SID,
    type,
    time: 1_700_000_000_000 + seq,
    seq,
    data,
  }
}

function sseFrame(e: SparkEventEnvelope): string {
  return `event: message\ndata: ${JSON.stringify(e)}\n\n`
}

interface FetchCall {
  url: string
  init: RequestInit | undefined
}

/** SSE 流：enqueue 挂起控制器，测试随时推帧/断流 */
class SseStream {
  readonly response: Response
  private readonly controller: ReadableStreamDefaultController<Uint8Array>
  private readonly encoder = new TextEncoder()

  constructor() {
    let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c
      },
    })
    // start 回调同步执行：ctrl 必已赋值（未赋值 = 运行时异常，fail loudly）
    if (ctrl === undefined) throw new Error('ReadableStream start 未同步执行')
    this.controller = ctrl
    this.response = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  push(chunk: string): void {
    this.controller.enqueue(this.encoder.encode(chunk))
  }

  close(): void {
    this.controller.close()
  }
}

/** fetch stub：/api/event 走注入的流工厂序列；REST 走按序脚本 */
function stubFetch(
  sseFactory: () => SseStream | Response,
  rest: (url: string, init?: RequestInit) => Response = () => jsonResponse(200, {}),
): {
  calls: FetchCall[]
} {
  const calls: FetchCall[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init })
    if (url.endsWith('/api/event') || url.includes('/api/event?')) {
      const res = sseFactory()
      return Promise.resolve(res instanceof SseStream ? res.response : res)
    }
    return Promise.resolve(rest(url, init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

/** 请求体 JSON 解析（init.body 恒为 string——本测试只发 JSON.stringify 产物） */
function bodyJson(call: FetchCall | undefined): unknown {
  const body = call?.init?.body
  return typeof body === 'string' ? JSON.parse(body) : undefined
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, { code, message })
}

let transports: HttpTransport[] = []

function makeTransport(opts?: ConstructorParameters<typeof HttpTransport>[0]): HttpTransport {
  const t = new HttpTransport(opts)
  transports.push(t)
  return t
}

beforeEach(() => {
  transports = []
})

afterEach(() => {
  for (const t of transports) t.dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** 轮询等待条件（事件流是异步泵读） */
async function waitFor<T>(pred: () => T | undefined, timeoutMs = 500): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = pred()
    if (v !== undefined) return v
    if (Date.now() > deadline) throw new Error('waitFor 超时')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('SSE 事件流', () => {
  it('帧解析：注释帧忽略，data 行信封分发到 onEvent；跨 chunk 帧拼接', async () => {
    const e1 = envelope(1)
    const e2 = envelope(2, 'session.title')
    const stream = new SseStream()
    stubFetch(() => stream)
    const events: SparkEventEnvelope[] = []
    const t = makeTransport()
    t.onEvent((e) => events.push(e))
    stream.push(': connected\n\n')
    stream.push(sseFrame(e1).slice(0, 20)) // 半帧
    stream.push(sseFrame(e1).slice(20)) // 补齐
    stream.push(': heartbeat\n\n')
    stream.push(sseFrame(e2))
    await waitFor(() => (events.length >= 2 ? events : undefined))
    expect(events[0]?.id).toBe(e1.id)
    expect(events[1]?.id).toBe(e2.id)
    expect(events.every((e) => e.seq !== undefined)).toBe(true)
  })

  it('坏信封帧：断开当前连接进入重连（失败闭合——不静默跳过）', async () => {
    const statuses: HttpConnectionStatus[] = []
    const stream = new SseStream()
    stubFetch(() => stream)
    makeTransport({
      backoffMs: [1],
      onStatus: (s) => statuses.push(s),
    })
    stream.push('event: message\ndata: {"id":"evt_x","type":"not-a-type"}\n\n')
    await waitFor(() => (statuses.includes('reconnecting') ? statuses : undefined))
    // 坏帧连接已断（流被 cancel 后 transport 重新 fetch）
    expect(statuses).toContain('open')
    expect(statuses).toContain('reconnecting')
  })

  it('插件扩展事件（ignorable 未知类型帧）：跳过不断流，后续帧照常分发（工单 5.5 / ADR D18）', async () => {
    const e1 = envelope(1)
    const pluginFrame =
      'event: message\ndata: ' +
      JSON.stringify({
        id: ids.event('evt_plugintest0000000000000'),
        sessionId: SID,
        type: 'plugin.demo.ping',
        time: 1_700_000_000_001,
        seq: 2,
        version: 1,
        ignorable: true,
        data: { skill: 'demo-ping', sourceEventId: 'evt_x', sourceType: 'session.created' },
      }) +
      '\n\n'
    const stream = new SseStream()
    stubFetch(() => stream)
    const events: SparkEventEnvelope[] = []
    const statuses: HttpConnectionStatus[] = []
    const t = makeTransport({ backoffMs: [1], onStatus: (s) => statuses.push(s) })
    t.onEvent((e) => events.push(e))
    stream.push(sseFrame(e1))
    stream.push(pluginFrame)
    const e2 = envelope(3, 'session.title')
    stream.push(sseFrame(e2))
    await waitFor(() => (events.some((e) => e.id === e2.id) ? events : undefined))
    expect(events.map((e) => e.id)).toEqual([e1.id, e2.id]) // 插件帧被跳过
    expect(statuses).not.toContain('reconnecting') // 未触发断开重连
  })

  it('event: bye 帧无 data 行：忽略；流结束后走重连', async () => {
    const statuses: HttpConnectionStatus[] = []
    let closed = false
    stubFetch(() => {
      if (closed) {
        const s = new SseStream()
        return s
      }
      closed = true
      const s = new SseStream()
      s.push('event: bye\ndata: {}\n\n')
      return s
    })
    const t = makeTransport({ backoffMs: [1], onStatus: (s) => statuses.push(s) })
    await waitFor(() => (statuses.filter((s) => s === 'reconnecting').length >= 1 ? statuses : undefined))
    expect(statuses[0]).toBe('connecting')
    expect(statuses[1]).toBe('open')
    t.dispose()
  })
})

describe('REST 调用形状', () => {
  it('sendMessage：POST /:id/messages，body 含 text 与 delivery（缺省 now）', async () => {
    const { calls } = stubFetch(() => new SseStream(), () => jsonResponse(200, { result: 'started' }))
    const t = makeTransport()
    const outcome = await t.sendMessage(SID, '你好')
    expect(outcome).toEqual({ result: 'started' })
    const call = calls.find((c) => c.url.includes(`/api/sessions/${SID}/messages`))
    expect(call?.init?.method).toBe('POST')
    expect(bodyJson(call)).toEqual({ text: '你好', delivery: 'now' })
  })

  it('interrupt/replyPermission：POST 直通；feedback 缺省不带键', async () => {
    const { calls } = stubFetch(() => new SseStream(), () => jsonResponse(200, { ok: true }))
    const t = makeTransport()
    await t.interrupt(SID)
    await t.replyPermission(ids.request('req_httptest000000000000000'), 'reject')
    const interruptCall = calls.find((c) => c.url.endsWith(`/api/sessions/${SID}/interrupt`))
    expect(interruptCall?.init?.method).toBe('POST')
    const replyCall = calls.find((c) => c.url.includes('/api/permissions/'))
    expect(bodyJson(replyCall)).toEqual({ reply: 'reject' })
  })

  it('compact：POST /:id/compact 直通（工单 4.3）；409 E_TURN_ACTIVE 透传错误体', async () => {
    const { calls } = stubFetch(() => new SseStream(), () => jsonResponse(200, { ok: true }))
    const t = makeTransport()
    await t.compact(SID)
    const call = calls.find((c) => c.url.endsWith(`/api/sessions/${SID}/compact`))
    expect(call?.init?.method).toBe('POST')
    t.dispose()

    stubFetch(() => new SseStream(), () => errorResponse(409, 'E_TURN_ACTIVE', 'turn 进行中'))
    const t2 = makeTransport()
    await expect(t2.compact(SID)).rejects.toThrow('E_TURN_ACTIVE: turn 进行中')
    t2.dispose()
  })

  it('getSession：GET /:id 返回 dto 并登记 openSessions（重连 resync 集合）', async () => {
    const dto = {
      id: SID,
      title: '',
      model: 'fake/fake-chat',
      cwd: '/tmp',
      createdAt: 1,
      updatedAt: 2,
      lastSeq: 2,
      status: 'idle' as const,
      events: [envelope(1)],
    }
    stubFetch(() => new SseStream(), (url) =>
      url.includes(`/api/sessions/${SID}`) ? jsonResponse(200, dto) : jsonResponse(200, []),
    )
    const t = makeTransport()
    const got = await t.getSession(SID)
    expect(got.events).toHaveLength(1)
    expect(got.id).toBe(SID)
  })

  it('错误体映射：非 2xx → Error("code: message")', async () => {
    stubFetch(() => new SseStream(), () => errorResponse(404, 'E_NOT_FOUND', 'not found'))
    const t = makeTransport()
    await expect(t.listSessions()).rejects.toThrow('E_NOT_FOUND: not found')
    await expect(t.getSession(SID)).rejects.toThrow('E_NOT_FOUND: not found')
  })

  it('非 JSON 错误体：保留 HTTP 状态信息', async () => {
    stubFetch(
      () => new SseStream(),
      () => new Response('Bad Gateway', { status: 502, statusText: '' }),
    )
    const t = makeTransport()
    await expect(t.listSessions()).rejects.toThrow('HTTP_502')
  })

  it('createSession：POST /api/sessions（无 title 时空 body 对象）', async () => {
    const dto = {
      id: SID,
      title: 't',
      model: 'm',
      cwd: '/tmp',
      createdAt: 1,
      updatedAt: 1,
      lastSeq: 0,
      status: 'idle' as const,
    }
    const { calls } = stubFetch(() => new SseStream(), () => jsonResponse(201, dto))
    const t = makeTransport()
    await t.createSession()
    const call = calls.find((c) => c.url.endsWith('/api/sessions') && c.init?.method === 'POST')
    expect(bodyJson(call)).toEqual({})
    await t.createSession({ title: '测试' })
    const titled = calls.filter((c) => c.url.endsWith('/api/sessions') && c.init?.method === 'POST')
    expect(bodyJson(titled[1])).toEqual({ title: '测试' })
  })
})

describe('重连状态机', () => {
  it('断流 → 退避重连 → open；状态序列 connecting/open/reconnecting/open', async () => {
    const statuses: HttpConnectionStatus[] = []
    let stream: SseStream | null = null
    stubFetch(() => {
      stream = stream ?? new SseStream()
      return stream
    })
    makeTransport({ backoffMs: [1], onStatus: (s) => statuses.push(s) })
    await waitFor(() => (statuses.includes('open') ? statuses : undefined))
    stream!.close() // 模拟断线
    await waitFor(() => (statuses.includes('reconnecting') ? statuses : undefined))
    await waitFor(() => (statuses.filter((s) => s === 'open').length >= 2 ? statuses : undefined))
    expect(statuses[0]).toBe('connecting')
  })

  it('重连成功 → onResync 携带曾 getSession 的会话；首连不 resync', async () => {
    const resynced: Array<readonly string[]> = []
    let round = 0
    stubFetch(() => {
      round++
      const s = new SseStream()
      if (round >= 2) {
        // 第二次连接：保持打开
        setTimeout(() => undefined, 0)
      } else {
        setTimeout(() => s.close(), 5) // 首连很快断
      }
      return s
    }, (url) =>
      url.includes(`/api/sessions/${SID}`)
        ? jsonResponse(200, { id: SID, title: '', model: 'm', cwd: '/tmp', createdAt: 1, updatedAt: 1, lastSeq: 0, status: 'idle', events: [] })
        : jsonResponse(200, []),
    )
    const t = makeTransport({
      backoffMs: [1],
      onResync: (sids) => resynced.push(sids),
    })
    expect(resynced).toHaveLength(0) // 首连不 resync
    await t.getSession(SID) // 登记会话
    await waitFor(() => (resynced.length >= 1 ? resynced : undefined))
    expect(resynced[0]).toEqual([SID])
  })
})

describe('dispose', () => {
  it('dispose 后调用抛错；SSE fetch 被 abort', async () => {
    const streams: SseStream[] = []
    const { calls } = stubFetch(() => {
      const s = new SseStream()
      streams.push(s)
      return s
    })
    const t = makeTransport()
    await waitFor(() => (calls.length >= 1 ? calls : undefined))
    const signal = calls[0]?.init?.signal as AbortSignal
    const aborted = new Promise<boolean>((resolve) =>
      signal.addEventListener('abort', () => resolve(true)),
    )
    t.dispose()
    expect(await aborted).toBe(true)
    await expect(t.listSessions()).rejects.toThrow(/E_HTTP_DISPOSED/)
    expect(() => t.onEvent(() => undefined)).toThrow(/E_HTTP_DISPOSED/)
  })
})
