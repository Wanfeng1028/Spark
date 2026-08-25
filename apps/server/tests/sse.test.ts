/**
 * SSE 单测（doc/02 §8.6 server 行）：回放+直播边界、心跳、全局订阅、404/400、
 * bye 帧。hijack 的 raw 流无法 inject，走真实 listen + fetch 流读取。
 */
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { SparkEventEnvelope } from '@spark/protocol'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

/** SSE 连接读取器：按 \n\n 切帧，支持等待条件满足 */
class SseReader {
  private readonly frames: string[] = []
  private readonly waiters: Array<{
    pred: (frames: readonly string[]) => boolean
    resolve: (frames: string[]) => void
    timer: ReturnType<typeof setTimeout>
  }> = []

  constructor(
    private readonly body: ReadableStream<Uint8Array>,
    private readonly controller: AbortController,
  ) {
    void this.pump()
  }

  private async pump(): Promise<void> {
    const reader = this.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        for (;;) {
          const idx = buf.indexOf('\n\n')
          if (idx === -1) break
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          this.frames.push(frame)
          for (const w of [...this.waiters]) {
            if (w.pred(this.frames)) {
              clearTimeout(w.timer)
              this.waiters.splice(this.waiters.indexOf(w), 1)
              w.resolve([...this.frames])
            }
          }
        }
      }
    } catch {
      // abort / 连接关闭
    }
  }

  framesUntil(
    pred: (frames: readonly string[]) => boolean,
    timeoutMs = 2000,
  ): Promise<string[]> {
    if (pred(this.frames)) return Promise.resolve([...this.frames])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.timer === timer)
        if (i !== -1) this.waiters.splice(i, 1)
        reject(new Error(`framesUntil 超时，已收 ${this.frames.length} 帧`))
      }, timeoutMs)
      this.waiters.push({ pred, resolve, timer })
    })
  }

  abort(): void {
    this.controller.abort()
  }
}

interface Opened {
  status: number
  headers: Headers
  reader: SseReader | null
  json(): Promise<unknown>
}

let fixtures: Array<{ f: ServerFixture; baseUrl: string }> = []

async function setup(opts?: { heartbeatMs?: number }): Promise<{ f: ServerFixture; baseUrl: string }> {
  const f = await makeServer(opts)
  await f.app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = f.app.server.address() as AddressInfo
  const entry = { f, baseUrl: `http://127.0.0.1:${port}` }
  fixtures.push(entry)
  return entry
}

beforeEach(() => {
  fixtures = []
})

afterEach(async () => {
  for (const { f } of fixtures) {
    f.app.sseCloseAll() // 先断全部 SSE，app.close() 才不会被挂起的长连接卡住
    await f.app.close()
    await f.engine.shutdown()
  }
})

async function openSse(baseUrl: string, query: string): Promise<Opened> {
  const controller = new AbortController()
  const res = await fetch(`${baseUrl}/api/event${query}`, { signal: controller.signal })
  if (!res.ok || res.body === null) {
    return {
      status: res.status,
      headers: res.headers,
      reader: null,
      json: () => res.json(),
    }
  }
  return {
    status: res.status,
    headers: res.headers,
    reader: new SseReader(res.body, controller),
    json: () => res.json(),
  }
}

/** 帧文本 → 信封（data: 行 JSON） */
function envelopeOf(frame: string): SparkEventEnvelope {
  const line = frame.split('\n').find((l) => l.startsWith('data: '))
  if (line === undefined) throw new Error(`帧缺 data 行：${frame}`)
  return JSON.parse(line.slice('data: '.length)) as SparkEventEnvelope
}

function messageEnvelopes(frames: readonly string[]): SparkEventEnvelope[] {
  return frames.filter((fr) => fr.startsWith('event: message')).map(envelopeOf)
}

async function restCreate(base: string): Promise<string> {
  const res = await fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const dto = (await res.json()) as Record<string, unknown>
  return dto['id'] as string
}

async function restSend(base: string, id: string, text: string): Promise<void> {
  const res = await fetch(`${base}/api/sessions/${id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  expect(res.status).toBe(200)
}

/** 轮询详情接口等 turn.completed；返回当前 lastSeq（最后一个 durable 的 seq） */
async function waitTurnDone(base: string, id: string): Promise<number> {
  const deadline = Date.now() + 2000
  for (;;) {
    const res = await fetch(`${base}/api/sessions/${id}`)
    const dto = (await res.json()) as Record<string, unknown>
    const events = dto['events'] as Array<Record<string, unknown>>
    if (events.some((e) => e['type'] === 'turn.completed')) {
      return events[events.length - 1]!['seq'] as number
    }
    if (Date.now() > deadline) throw new Error('等待 turn.completed 超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('GET /api/event', () => {
  test('响应头（text/event-stream / no-cache / X-Accel-Buffering）', async () => {
    const { baseUrl } = await setup()
    const opened = await openSse(baseUrl, '')
    expect(opened.status).toBe(200)
    expect(opened.headers.get('content-type')).toBe('text/event-stream')
    expect(opened.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(opened.headers.get('x-accel-buffering')).toBe('no')
    opened.reader?.abort()
  })

  test('全局订阅（省略 sessionId）：不回放，直播其他会话事件', async () => {
    const { f, baseUrl } = await setup()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '收到' }] })
    // 先建会话（订阅建立前的事件不应回放）
    const id = await restCreate(baseUrl)
    const opened = await openSse(baseUrl, '')
    await restSend(baseUrl, id, '你好')
    const frames = await opened.reader!
      .framesUntil((fs) => fs.some((fr) => fr.startsWith('event: message')))
    const types = messageEnvelopes(frames).map((e) => e.type)
    expect(types).toContain('user.message') // 直播收到
    expect(types).not.toContain('session.created') // 订阅前的事件不回放
    opened.reader!.abort()
  })

  test('会话回放（sessionId+since）：seq>since 的 durable 按序补发', async () => {
    const { f, baseUrl } = await setup()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '一轮' }] })
    const id = await restCreate(baseUrl)
    await restSend(baseUrl, id, '跑一轮')
    await waitTurnDone(baseUrl, id) // durable 齐了再连

    const opened = await openSse(baseUrl, `?sessionId=${id}&since=0`)
    const frames = await opened.reader!.framesUntil(
      (fs) => messageEnvelopes(fs).some((e) => e.type === 'turn.completed'),
    )
    const envelopes = messageEnvelopes(frames)
    const seqs = envelopes.map((e) => e.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => (a ?? 0) - (b ?? 0))) // 升序
    expect(envelopes.map((e) => e.type)).toEqual(
      expect.arrayContaining(['session.created', 'user.message', 'turn.started', 'turn.completed']),
    )
    opened.reader!.abort()
  })

  test('回放水位：since=当前 lastSeq → 不补发旧事件，新消息直播到达', async () => {
    const { f, baseUrl } = await setup()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '一轮' }] })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '二轮' }] })
    const id = await restCreate(baseUrl)
    await restSend(baseUrl, id, '第一轮')
    const lastSeq = await waitTurnDone(baseUrl, id) // seq 定格

    const opened = await openSse(baseUrl, `?sessionId=${id}&since=${lastSeq}`)
    await restSend(baseUrl, id, '第二轮')
    const frames = await opened.reader!
      .framesUntil((fs) => messageEnvelopes(fs).some((e) => e.type === 'user.message'))
    const envelopes = messageEnvelopes(frames)
    expect(envelopes.map((e) => e.type)).toEqual(['user.message']) // 旧事件一条不补
    opened.reader!.abort()
  })

  test('心跳帧（heartbeatMs 注入缩短）', async () => {
    const { baseUrl } = await setup({ heartbeatMs: 20 })
    const opened = await openSse(baseUrl, '')
    const frames = await opened.reader!.framesUntil((fs) =>
      fs.some((fr) => fr.startsWith(': heartbeat')),
    )
    expect(frames.some((fr) => fr.startsWith(': heartbeat'))).toBe(true)
    opened.reader!.abort()
  })

  test('未知 sessionId → 404 JSON；since 非法 → 400', async () => {
    const { baseUrl } = await setup()
    const missing = await openSse(baseUrl, '?sessionId=ses_notexist00000000000000000')
    expect(missing.status).toBe(404)
    const missingBody = (await missing.json()) as Record<string, unknown>
    expect(missingBody['code']).toBe('E_NOT_FOUND')

    const bad = await openSse(baseUrl, '?since=abc')
    expect(bad.status).toBe(400)
    const badBody = (await bad.json()) as Record<string, unknown>
    expect(badBody['code']).toBe('E_VALIDATION')
  })

  test('sseCloseAll：连接收到 event: bye 后断开', async () => {
    const { f, baseUrl } = await setup()
    const opened = await openSse(baseUrl, '')
    f.app.sseCloseAll()
    const frames = await opened.reader!.framesUntil((fs) =>
      fs.some((fr) => fr.startsWith('event: bye')),
    )
    expect(frames.some((fr) => fr === 'event: bye\ndata: {}')).toBe(true)
    f.app.sseCloseAll() // 幂等：已断连接再关一次不报错
  })
})
