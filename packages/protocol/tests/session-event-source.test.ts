/**
 * SessionEventSource 行为单测（工单 8.4）：断线退避重连 + since=seq 续播。
 * fetch 打桩为可控 SSE 流——首连回放水位推进、重连 URL 带水位、dispose 后不再重连。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionEventSource, ids } from '../src/index'
import type { HttpConnectionStatus, SparkEventEnvelope } from '../src/index'

const SID = ids.session('ses_setest00000000000000')

function envelope(seq: number): SparkEventEnvelope {
  return {
    id: ids.event(`evt_setest${seq.toString().padStart(4, '0')}`),
    sessionId: SID,
    type: 'session.created',
    time: 1_700_000_000_000 + seq,
    seq,
    data: { cwd: '/tmp', model: 'fake/fake-chat' },
  }
}

function frame(e: SparkEventEnvelope): string {
  return `event: message\ndata: ${JSON.stringify(e)}\n\n`
}

/** 单块推完即关的 SSE 响应（模拟断线） */
function sseResponse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

/** 永不结束的流（挂住泵读，模拟直播中） */
function hangingResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({ start: () => undefined })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SessionEventSource', () => {
  it('首连回放推水位；断线重连 URL 带 since=水位（续播不重放）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(frame(envelope(1)) + frame(envelope(2))))
      .mockResolvedValue(hangingResponse())
    vi.stubGlobal('fetch', fetchMock)

    const events: SparkEventEnvelope[] = []
    const statuses: HttpConnectionStatus[] = []
    const source = new SessionEventSource({
      baseUrl: 'http://127.0.0.1:1',
      sessionId: SID,
      backoffMs: [1],
      onStatus: (s) => statuses.push(s),
      onEvent: (e) => events.push(e),
    })

    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(source.since).toBe(2) // 水位 = 已收 durable 最大 seq
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:1/api/event?sessionId=${SID}&since=0`,
    )

    // 流关闭 → 退避后重连，since 带水位
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`sessionId=${SID}&since=2`)
    expect(statuses.slice(0, 3)).toEqual(['connecting', 'open', 'reconnecting'])

    source.dispose()
  })

  it('指定 since：首连即从该水位续播', async () => {
    const fetchMock = vi.fn().mockResolvedValue(hangingResponse())
    vi.stubGlobal('fetch', fetchMock)

    const source = new SessionEventSource({
      baseUrl: 'http://127.0.0.1:1',
      sessionId: SID,
      since: 7,
      onEvent: () => undefined,
    })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('&since=7')

    source.dispose()
  })

  it('dispose 后不再重连（失败闭合不留悬挂连接）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(frame(envelope(1))))
    vi.stubGlobal('fetch', fetchMock)

    const events: SparkEventEnvelope[] = []
    const source = new SessionEventSource({
      baseUrl: 'http://127.0.0.1:1',
      sessionId: SID,
      backoffMs: [1000],
      onEvent: (e) => events.push(e),
    })

    await vi.waitFor(() => expect(events).toHaveLength(1))
    source.dispose() // 流关闭后的退避睡眠被 abort 打断
    await new Promise((r) => setTimeout(r, 60))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
