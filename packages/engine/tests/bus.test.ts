/**
 * EventBus 单测（doc/02 §8.6 engine/bus 行）：
 * durable seq 单调且落盘后才广播；live 不计数；订阅者异常隔离；背压 pause/resume。
 */
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import { EventBus } from '../src/bus.js'
import { redactSecretText } from '../src/observability/redaction.js'
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

describe('LA-34：error 事件单点脱敏', () => {
  it('redactError 注入后：落盘与广播同一份脱敏文案（sk-ant- 形状与 Bearer 均覆盖）', async () => {
    const { sink, received } = makeSink()
    const bus = new EventBus({ sink, redactError: (m) => redactSecretText(m) })
    await bus.emit(SID, 'error', {
      scope: 'engine',
      message: 'invalid key sk-ant-api03-abcdefghij0123456789 and Bearer plain-secret-xyz',
    })
    expect(received).toHaveLength(1)
    const e = received[0]
    if (e === undefined) throw new Error('error 事件未到达')
    expect(e.type).toBe('error')
    const msg = (e.data as { message: string }).message
    expect(msg).not.toContain('sk-ant-api03')
    expect(msg).not.toContain('plain-secret-xyz')
    expect(msg).toContain('***')
  })

  it('未注入 redactError：error 文案原样（行为不变）', async () => {
    const { sink, received } = makeSink()
    const bus = new EventBus({ sink })
    await bus.emit(SID, 'error', { scope: 'engine', message: 'raw message' })
    expect((received[0]?.data as { message: string } | undefined)?.message).toBe('raw message')
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

  it('环形缓冲溢出（全 durable）：不再丢最老——通知 onDurableOverflow 断链补播', async () => {
    const { sink } = makeSink()
    const overflowed: SparkEventEnvelope[] = []
    const bus = new EventBus({ sink, bufferCapacity: 2 })
    const got: SparkEventEnvelope[] = []
    const handle = bus.subscribe(
      (e) => {
        got.push(e)
        if (got.length === 1) return false
      },
      {
        onDurableOverflow: (e) => {
          overflowed.push(e)
        },
      },
    )

    await bus.emit(SID, 'session.title', { title: '1' })
    await bus.emit(SID, 'session.title', { title: '2' })
    await bus.emit(SID, 'session.title', { title: '3' })
    await bus.emit(SID, 'session.title', { title: '4' })
    await sleep(5)
    expect(got).toHaveLength(1) // 2、3 已缓冲
    expect(overflowed).toHaveLength(1) // 第 4 笔无法保全 → 断链通知（一次）
    expect((overflowed[0]?.data as { title: string }).title).toBe('4')

    handle.resume()
    await sleep(5)
    // AUD-11：durable 绝不静默丢——已缓冲的 2、3 完整续传，4 经断链由客户端按水位重连补播
    expect(got.map((e) => (e.data as { title: string }).title)).toEqual(['1', '2', '3'])
  })

  it('LA-36：溢出降级粘滞——drain 不复位通知，recovered() 显式确认后才重新武装', async () => {
    const { sink } = makeSink()
    const overflows: string[] = []
    const bus = new EventBus({ sink, bufferCapacity: 2 })
    const got: SparkEventEnvelope[] = []
    const pauseOn = (e: SparkEventEnvelope): boolean =>
      (e.data as { title: string }).title === 'pause'
    const handle = bus.subscribe(
      (e) => {
        got.push(e)
        if (pauseOn(e)) return false
      },
      {
        onDurableOverflow: (e) => overflows.push((e.data as { title: string }).title),
      },
    )
    const emitTitle = (t: string): Promise<unknown> => bus.emit(SID, 'session.title', { title: t })

    // 第一轮：pause 后 2/3 进缓冲，4 溢出 → 通知一次
    await emitTitle('pause')
    await sleep(5)
    await emitTitle('2')
    await emitTitle('3')
    await emitTitle('4')
    await sleep(5)
    expect(overflows).toEqual(['4'])

    handle.resume()
    await sleep(5)
    expect(got.map((e) => (e.data as { title: string }).title)).toEqual(['pause', '2', '3'])

    // 第二轮（未 recovered）：再次溢出不再通知——drain 排空不等于缺口已补齐
    await emitTitle('pause')
    await sleep(5)
    await emitTitle('a')
    await emitTitle('b')
    await emitTitle('c')
    await sleep(5)
    expect(overflows).toEqual(['4']) // 粘滞：旧实现 resume 已把溢出标记复位（缺口被遗忘）
    handle.resume()
    await sleep(5)

    // recovered() 显式确认重放完成 → 重新武装一次性通知
    handle.recovered()
    await emitTitle('pause')
    await sleep(5)
    await emitTitle('x')
    await emitTitle('y')
    await emitTitle('z')
    await sleep(5)
    expect(overflows).toEqual(['4', 'z'])
  })

  it('live 事件溢出：新到 live 直接丢弃（缓冲内已收的保留——不再 shift 丢最老）', async () => {
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
    // AUD-11：满 + live → 丢新到的 c，先收的 b 保留（旧策略 shift 丢 b 留 c）
    expect(got.map((e) => (e.data as { text: string }).text)).toEqual(['a', 'b'])
  })

  it('AUD-11：满 + durable 到来 → 驱逐最老 live 腾位（丢直播保事实，不触发断链）', async () => {
    const { sink } = makeSink()
    const overflowed: SparkEventEnvelope[] = []
    const bus = new EventBus({ sink, bufferCapacity: 2 })
    const got: SparkEventEnvelope[] = []
    const handle = bus.subscribe(
      (e) => {
        got.push(e)
        if (got.length === 1) return false
      },
      {
        onDurableOverflow: (e) => {
          overflowed.push(e)
        },
      },
    )

    await bus.emit(SID, 'session.title', { title: 'd1' })
    await sleep(1) // d1 已送达并触发暂停
    bus.emitLive(SID, 'assistant.delta', { turnId: TID, text: 'l1' })
    bus.emitLive(SID, 'assistant.delta', { turnId: TID, text: 'l2' })
    await bus.emit(SID, 'session.title', { title: 'd2' }) // 满：驱逐 l1 放入 d2
    await sleep(5)

    handle.resume()
    await sleep(5)
    const titles = got
      .filter((e) => e.type === 'session.title')
      .map((e) => (e.data as { title: string }).title)
    expect(titles).toEqual(['d1', 'd2']) // durable 全保全
    expect(overflowed).toHaveLength(0) // 有 live 可驱逐，未到断链阈值
  })
})
