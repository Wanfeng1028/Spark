/**
 * 通知事件流的断线重连单测（工单 19.30）：帧解析（含跨 chunk 半截帧与 CRLF 归一）、
 * 坏帧忽略、退避序列与封顶、建立起流后重连计数复位、abort 收口。
 * fetch/sleep 全注入——不引 electron、不跑真端口。
 */
import { describe, expect, test } from 'vitest'
import { NOTIFY_BACKOFF_MS, parseSseFrame, runNotifyStream } from '../src/notify-stream.js'

/** 一次连接的最小假响应：ok + 分块 body（read() 逐块吐字节，吐完 done） */
function sseResponse(chunks: string[], ok = true): Response {
  let i = 0
  const encoder = new TextEncoder()
  const reader = {
    read: async () =>
      i < chunks.length
        ? { done: false as const, value: encoder.encode(chunks[i++] as string) }
        : { done: true as const, value: undefined },
  }
  return {
    ok,
    status: ok ? 200 : 503,
    body: { getReader: () => reader },
  } as unknown as Response
}

interface Harness {
  events: unknown[]
  statuses: string[]
  delays: number[]
  attempts: () => number
  promise: Promise<void>
}

/**
 * 跑一轮假流：第 n 次连接取 responses[n]（取完即抛错，模拟连不上）。
 * `stopAfterSleeps` 到点后 abort，循环即收口——注入的 sleep 不真等，测试毫秒级完成。
 */
function run(
  responses: Array<() => Response>,
  stopAfterSleeps: number,
  backoffMs?: readonly number[],
): Harness {
  const controller = new AbortController()
  const events: unknown[] = []
  const statuses: string[] = []
  const delays: number[] = []
  const queue = [...responses]
  let fetched = 0
  let slept = 0

  const promise = runNotifyStream({
    url: 'http://127.0.0.1:4399/api/event',
    fetchFn: async () => {
      fetched++
      const next = queue.shift()
      if (next === undefined) throw new Error('E_NO_MORE_RESPONSE')
      return next()
    },
    signal: controller.signal,
    onEvent: (p) => events.push(p),
    onStatus: (s) => statuses.push(s),
    // exactOptionalPropertyTypes：可选属性不写 undefined，未注入时整个键省略
    ...(backoffMs === undefined ? {} : { backoffMs }),
    sleep: async (ms) => {
      delays.push(ms)
      slept++
      if (slept >= stopAfterSleeps) controller.abort()
    },
  })
  return { events, statuses, delays, attempts: () => fetched, promise }
}

const frame = (o: unknown): string => `event: message\ndata: ${JSON.stringify(o)}\n\n`
const turn = (sessionId: string): unknown => ({ type: 'turn.completed', sessionId })

describe('parseSseFrame', () => {
  test('取 data: 行拼 JSON；注释帧/坏 JSON/空帧返回 null', () => {
    expect(parseSseFrame(frame(turn('s1')))).toEqual({ type: 'turn.completed', sessionId: 's1' })
    expect(parseSseFrame(': heartbeat\n')).toBeNull()
    expect(parseSseFrame('data: {坏\n')).toBeNull()
    expect(parseSseFrame('')).toBeNull()
  })
})

describe('runNotifyStream 首连', () => {
  test('多帧逐条交 onEvent，跨 chunk 的半截帧拼回来不丢', async () => {
    const one = frame(turn('s1'))
    const h = run([() => sseResponse([one.slice(0, 12), one.slice(12) + frame(turn('s2'))])], 1)
    await h.promise
    expect(h.events).toEqual([turn('s1'), turn('s2')])
    expect(h.statuses).toEqual(['open', 'reconnecting'])
  })

  test('心跳注释帧与坏帧只跳过，不断连也不产出事件', async () => {
    const h = run([() => sseResponse([': connected\n\n', 'event: message\ndata: {截断\n\n', frame(turn('s9'))])], 1)
    await h.promise
    expect(h.events).toEqual([turn('s9')])
    expect(h.statuses).toEqual(['open', 'reconnecting'])
  })

  test('CRLF 帧边界归一（与协议侧 splitSseFrames 同语义）', async () => {
    const h = run([() => sseResponse(['event: message\r\ndata: {"type":"turn.completed","sessionId":"crlf"}\r\n\r\n'])], 1)
    await h.promise
    expect(h.events).toEqual([turn('crlf')])
  })

  test('signal 已 abort 时一次都不 fetch（stop 之后不留尾巴）', async () => {
    const controller = new AbortController()
    controller.abort()
    let fetched = 0
    await runNotifyStream({
      url: 'http://127.0.0.1:4399/api/event',
      fetchFn: async () => {
        fetched++
        return sseResponse([frame(turn('s1'))])
      },
      signal: controller.signal,
      onEvent: () => undefined,
      sleep: async () => undefined,
    })
    expect(fetched).toBe(0)
  })
})

describe('runNotifyStream 断线重连（19.30）', () => {
  test('流正常结束也算断开：退避后重连并继续收帧', async () => {
    const h = run([() => sseResponse([frame(turn('a'))]), () => sseResponse([frame(turn('b'))])], 2)
    await h.promise
    expect(h.events).toEqual([turn('a'), turn('b')])
    expect(h.attempts()).toBe(2)
    // 建立起过流 = 一次故障一次计数复位（不是"越连越久"）
    expect(h.delays).toEqual([1000, 1000])
    expect(h.statuses).toEqual(['open', 'reconnecting', 'open', 'reconnecting'])
  })

  test('连不上时按 1/2/5/10s 加档并封顶（缺省表与 session-stream-core 同值）', async () => {
    expect(NOTIFY_BACKOFF_MS).toEqual([1000, 2000, 5000, 10_000])
    const h = run([], 5)
    await h.promise
    expect(h.delays).toEqual([1000, 2000, 5000, 10_000, 10_000])
    expect(h.statuses.every((s) => s === 'reconnecting')).toBe(true)
    expect(h.attempts()).toBe(5)
  })

  test('非 2xx 不算建立起流（sidecar 重启窗口的 503 同路径退避）', async () => {
    const h = run([() => sseResponse([], false)], 1)
    await h.promise
    expect(h.statuses).toEqual(['reconnecting'])
    expect(h.delays).toEqual([1000])
  })

  test('退避表可注入，末位封顶', async () => {
    const h = run([], 3, [7, 9])
    await h.promise
    expect(h.delays).toEqual([7, 9, 9])
  })

  test('fetch 抛错不外泄：runNotifyStream 只 resolve 不 reject', async () => {
    const h = run([], 2)
    await expect(h.promise).resolves.toBeUndefined()
  })
})
