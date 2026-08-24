/**
 * EventBus 单测（doc/02 §8.6 engine/bus 行）：
 * durable seq 单调且落盘后才广播；live 不计数；订阅者异常隔离；背压 pause/resume。
 */
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import { EventBus } from '../src/bus.js'
import type { EventSink } from '../src/bus.js'

const SID = ids.session('ses_test0000000000000000000000')
const TID = ids.turn('trn_test0000000000000000000000')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 可切换 append 行为的 sink 桩：received 记录原始信封，impl 可替换 */
function makeSink() {
  const received: SparkEventEnvelope[] = []
  let impl: (e: SparkEventEnvelope) => Promise<SparkEventEnvelope> = (e) => Promise.resolve(e)
  const sink: EventSink = {
    append(e) {
      received.push(e)
      return impl(e)
    },
  }
  return {
    received,
    sink,
    setImpl: (fn: (e: SparkEventEnvelope) => Promise<SparkEventEnvelope>): void => {
      impl = fn
    },
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
} {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('durable 事件', () => {
  it('落盘完成后才广播（append 未 resolve 前订阅者不收到）', async () => {
    const { sink } = makeSink()
    const gate = deferred<void>()
    sink.append = async (e) => {
      await gate.promise
      return e
    }
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    bus.subscribe((e) => {
      got.push(e)
    })

    const p = bus.emit(SID, 'session.created', { cwd: '/tmp', model: 'deepseek/deepseek-chat' })
    await sleep(5)
    expect(got).toHaveLength(0) // 落盘未完成

    gate.resolve()
    await p
    expect(got).toHaveLength(1)
    expect(got[0]?.type).toBe('session.created')
  })

  it('seq 单调递增且订阅者按序收到', async () => {
    const { sink, received } = makeSink()
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    bus.subscribe((e) => {
      got.push(e)
    })

    await bus.emit(SID, 'session.created', { cwd: '/tmp', model: 'm' })
    await bus.emit(SID, 'session.title', { title: 't' })
    await bus.emit(SID, 'error', { scope: 'engine', message: 'x' })

    expect(received.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(got.map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('surface 事件信封带 surface:true，其余不带', async () => {
    const { sink } = makeSink()
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    bus.subscribe((e) => {
      got.push(e)
    })

    await bus.emit(SID, 'session.created', { cwd: '/tmp', model: 'm' })
    await bus.emit(SID, 'user.message', { text: 'hi' })

    expect('surface' in (got[0] ?? {})).toBe(false)
    expect('surface' in (got[1] ?? {})).toBe(true)
  })

  it('per-session 串行：并发 emit 的 append 顺序与 seq 一致', async () => {
    const { sink } = makeSink()
    const order: number[] = []
    sink.append = async (e) => {
      const seq = e.seq ?? 0
      if (seq === 1) await sleep(20) // 第一个慢盘
      order.push(seq)
      return e
    }
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    bus.subscribe((e) => {
      got.push(e)
    })

    await Promise.all([
      bus.emit(SID, 'session.created', { cwd: '/tmp', model: 'm' }),
      bus.emit(SID, 'session.title', { title: 't' }),
    ])

    expect(order).toEqual([1, 2]) // 第二个等第一个落完才进 append
    expect(got.map((e) => e.seq)).toEqual([1, 2])
  })

  it('append 失败：emit reject 且 seq 不跳号（失败事件未消耗序号）', async () => {
    const { sink, received, setImpl } = makeSink()
    setImpl(() => Promise.reject(new Error('disk full')))
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    bus.subscribe((e) => {
      got.push(e)
    })

    await expect(bus.emit(SID, 'session.created', { cwd: '/tmp', model: 'm' })).rejects.toThrow(
      'disk full',
    )
    expect(got).toHaveLength(0)

    setImpl((e) => Promise.resolve(e)) // 磁盘恢复
    await bus.emit(SID, 'session.title', { title: 't' })
    expect(received[1]?.seq).toBe(1) // 重用失败的 seq，无洞
  })

  it('data 校验失败直接 throw（E_BUS_INVALID_DATA）', async () => {
    const { sink, received } = makeSink()
    const bus = new EventBus({ sink })

    // session.created 缺 cwd
    await expect(
      bus.emit(SID, 'session.created', { model: 'm' } as never),
    ).rejects.toThrow(/E_BUS_INVALID_DATA/)
    expect(received).toHaveLength(0)
  })

  it('restoreSeq 续号；活动会话重设抛错', async () => {
    const { sink, received } = makeSink()
    const bus = new EventBus({ sink })

    bus.restoreSeq(SID, 5)
    await bus.emit(SID, 'session.title', { title: 't' })
    expect(received[0]?.seq).toBe(6)

    expect(() => bus.restoreSeq(SID, 99)).toThrow(/E_BUS_SESSION_ACTIVE/)
  })
})

describe('live 事件', () => {
  it('不落盘、无 seq、不经 per-session 落盘队列直接到达', async () => {
    const { sink, received } = makeSink()
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    bus.subscribe((e) => {
      got.push(e)
    })

    bus.emitLive(SID, 'assistant.delta', { turnId: TID, text: 'a' })
    await sleep(1) // 订阅者派发队列是微任务级——不等任何 IO

    expect(received).toHaveLength(0) // 不落盘
    expect(got).toHaveLength(1)
    expect(got[0]?.seq).toBeUndefined() // 不计数
    expect(got[0]?.type).toBe('assistant.delta')
  })

  it('delta 先于 message 定稿（慢盘下 live 不排队）', async () => {
    const { sink } = makeSink()
    const order: string[] = []
    sink.append = async (e) => {
      await sleep(20)
      return e
    }
    const bus = new EventBus({ sink })
    bus.subscribe((e) => {
      order.push(e.type)
    })

    void bus.emit(SID, 'assistant.message', { turnId: TID, content: [] })
    bus.emitLive(SID, 'assistant.delta', { turnId: TID, text: 'a' })
    await sleep(1) // 微任务级：delta 已达，message 还在慢盘 append 中

    expect(order[0]).toBe('assistant.delta')
  })

  it('data 校验失败直接 throw', () => {
    const { sink } = makeSink()
    const bus = new EventBus({ sink })

    expect(() =>
      bus.emitLive(SID, 'assistant.delta', { text: '缺 turnId' } as never),
    ).toThrow(/E_BUS_INVALID_DATA/)
  })
})

describe('订阅者', () => {
  it('异常隔离：一个 handler throw 不影响其他订阅者', async () => {
    const { sink } = makeSink()
    const errors: unknown[] = []
    const bus = new EventBus({
      sink,
      onSubscriberError: (err) => {
        errors.push(err)
      },
    })
    const gotB: SparkEventEnvelope[] = []
    bus.subscribe(() => {
      throw new Error('boom')
    })
    bus.subscribe((e) => {
      gotB.push(e)
    })

    await bus.emit(SID, 'session.title', { title: 't' })
    await bus.emit(SID, 'error', { scope: 'engine', message: 'x' })

    expect(gotB).toHaveLength(2) // 订阅者 B 不受影响
    expect(errors).toHaveLength(2) // A 的异常被记录
  })

  it('filter.sessionId 只收该会话事件', async () => {
    const { sink } = makeSink()
    const bus = new EventBus({ sink })
    const SID2 = ids.session('ses_other00000000000000000000')
    const got: SparkEventEnvelope[] = []
    bus.subscribe(
      (e) => {
        got.push(e)
      },
      { sessionId: SID },
    )

    await bus.emit(SID, 'session.title', { title: 't' })
    await bus.emit(SID2, 'session.title', { title: 't2' })

    expect(got).toHaveLength(1)
    expect(got[0]?.sessionId).toBe(SID)
  })

  it('unsubscribe 后不再收到', async () => {
    const { sink } = makeSink()
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    const handle = bus.subscribe((e) => {
      got.push(e)
    })

    await bus.emit(SID, 'session.title', { title: 't' })
    handle.unsubscribe()
    await bus.emit(SID, 'session.title', { title: 't2' })

    expect(got).toHaveLength(1)
  })
})

describe('背压 pause/resume', () => {
  it('handler 返回 false → 暂停并缓冲；resume 续传', async () => {
    const { sink } = makeSink()
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    const handle = bus.subscribe((e) => {
      got.push(e)
      if (got.length === 1) return false // 第一个事件后背压
      return
    })

    await bus.emit(SID, 'session.title', { title: '1' })
    await bus.emit(SID, 'session.title', { title: '2' })
    await bus.emit(SID, 'session.title', { title: '3' })
    await sleep(5)
    expect(got).toHaveLength(1) // 2、3 被缓冲

    handle.resume()
    await sleep(5)
    expect(got.map((e) => (e.data as { title: string }).title)).toEqual(['1', '2', '3'])
  })

  it('Promise<false> 异步背压同样生效', async () => {
    const { sink } = makeSink()
    const bus = new EventBus({ sink })
    const got: SparkEventEnvelope[] = []
    const handle = bus.subscribe((e) => {
      got.push(e)
      if (got.length === 1) return Promise.resolve(false) // 异步背压信号
      return
    })

    await bus.emit(SID, 'session.title', { title: '1' })
    await bus.emit(SID, 'session.title', { title: '2' })
    await sleep(5)
    expect(got).toHaveLength(1)

    handle.resume()
    await sleep(5)
    expect(got).toHaveLength(2)
  })

  it('环形缓冲溢出丢最老（durable 可由 since 回放补）', async () => {
    const { sink } = makeSink()
    const bus = new EventBus({ sink, bufferCapacity: 2 })
    const got: SparkEventEnvelope[] = []
    const handle = bus.subscribe((e) => {
      got.push(e)
      if (got.length === 1) return false
    })

    await bus.emit(SID, 'session.title', { title: '1' })
    await bus.emit(SID, 'session.title', { title: '2' })
    await bus.emit(SID, 'session.title', { title: '3' })
    await bus.emit(SID, 'session.title', { title: '4' })
    await sleep(5)
    expect(got).toHaveLength(1) // 全部缓冲中

    handle.resume()
    await sleep(5)
    // 容量 2：缓冲只保留 3、4（最老的 2 被覆盖）
    expect(got.map((e) => (e.data as { title: string }).title)).toEqual(['1', '3', '4'])
  })

  it('live 事件同样走缓冲（可丢语义：溢出覆盖）', async () => {
    const { sink } = makeSink()
    const bus = new EventBus({ sink, bufferCapacity: 1 })
    const got: SparkEventEnvelope[] = []
    const handle = bus.subscribe((e) => {
      got.push(e)
      if (got.length === 1) return false
    })

    bus.emitLive(SID, 'assistant.delta', { turnId: TID, text: 'a' })
    await sleep(1) // 等 a 的同步背压信号生效（paused=true）
    bus.emitLive(SID, 'assistant.delta', { turnId: TID, text: 'b' })
    bus.emitLive(SID, 'assistant.delta', { turnId: TID, text: 'c' })

    handle.resume()
    await sleep(5)
    expect(got.map((e) => (e.data as { text: string }).text)).toEqual(['a', 'c'])
  })
})
