/**
 * SessionStreamCore 状态机单测（工单 R-B.5）：四份 SSE 重连实现合一后的内核行为网。
 * connectOnce 用可编程假钩子注入（不落真实网络）——覆盖状态序列、水位推进、
 * 鉴权收敛（去重/终态/复位）、dispose 与 generation 防竞态、URL 构造两形态、
 * onReopen 重放时机、'idle' 续轮、钩子抛错的失败闭合。
 *
 * 各端既有的行为测试（apps/web http-transport.test.ts、protocol session-event-source.test.ts、
 * mobile rn-event-source.test.ts、miniapp mini-event-source.test.ts）继续作为消费侧回归网，
 * 本文件只测内核自身契约。
 */
import { describe, expect, it } from 'vitest'
import { SessionStreamCore, ids } from '../src/index'
import type {
  ConnectOnce,
  ConnectOutcome,
  SparkEventEnvelope,
  StreamConnectionStatus,
  StreamCoreContext,
} from '../src/index'

const SID = ids.session('ses_sscore00000000000000')

function envelope(seq: number): SparkEventEnvelope {
  return {
    id: ids.event(`evt_sscore${seq.toString().padStart(4, '0')}`),
    sessionId: SID,
    type: 'session.created',
    time: 1_700_000_000_000 + seq,
    seq,
    data: { cwd: '/tmp', model: 'fake/fake-chat' },
  }
}

/** 无 seq 的 live 信封（delta 类：不参与水位） */
function liveEnvelope(): SparkEventEnvelope {
  return {
    id: ids.event('evt_sscorelive0000000000'),
    sessionId: SID,
    type: 'assistant.delta',
    time: 1_700_000_000_999,
    data: { turnId: ids.turn('trn_sscore00000000000000'), text: 'x' },
  }
}

/**
 * 把同步完成的假连接体包成 ConnectOnce：体内无异步操作的用例直接写 async 会触发
 * require-await。经 then 执行——body 内同步抛错自动转 rejected promise，与真实
 * async 钩子同形（Core 的 loop 对两者走同一条失败闭合路径）。
 */
function sync(body: (ctx: StreamCoreContext) => ConnectOutcome | void): ConnectOnce {
  return (ctx) => Promise.resolve().then(() => body(ctx))
}

/**
 * 挂住本次连接直到 dispose（模拟长连接）：平台侧的 finish 接线在 abort 上。
 * 用例里「本轮已满足断言条件」后必须挂住——否则 backoffMs:[0] 下 loop 会在
 * tick 窗口内跑很多轮，状态与计数被后续轮次污染。
 */
function hang(ctx: StreamCoreContext): Promise<void> {
  return new Promise<void>((resolve) => {
    if (ctx.signal.aborted) {
      resolve()
      return
    }
    ctx.signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

/** 让微任务与短 setTimeout 走完（退避注入 [0] 时一轮即可） */
async function tick(ms = 10): Promise<void> {
  await new Promise((r) => {
    setTimeout(r, ms)
  })
}

/** 记录状态的收集器（多数用例共用） */
function collector(): {
  statuses: StreamConnectionStatus[]
  onStatus: (s: StreamConnectionStatus) => void
} {
  const statuses: StreamConnectionStatus[] = []
  return { statuses, onStatus: (s) => statuses.push(s) }
}

describe('状态序列与重连', () => {
  it('构造即报 connecting；断开 → reconnecting → 重连成功后 open', async () => {
    const { statuses, onStatus } = collector()
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onStatus,
      connectOnce: async (ctx) => {
        round++
        if (round === 1) return // 首连立即断开
        ctx.noteOpen()
        await hang(ctx)
      },
    })
    expect(statuses[0]).toBe('connecting')
    await tick()
    expect(statuses).toEqual(['connecting', 'reconnecting', 'open'])
    expect(round).toBe(2)
    core.dispose()
  })

  it('退避序列递进：连续失败时重连间隔按 backoffMs 走（末位封顶）', async () => {
    const stamps: number[] = []
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [5, 20],
      connectOnce: sync(() => {
        stamps.push(Date.now())
      }),
    })
    await tick(120)
    core.dispose()
    // 第 1→2 次间隔 ≈5ms（首项），第 2→3 次 ≈20ms（第二项）：断言递增而非精确值（计时脆弱）
    expect(stamps.length).toBeGreaterThanOrEqual(3)
    const first = (stamps[1] ?? 0) - (stamps[0] ?? 0)
    const second = (stamps[2] ?? 0) - (stamps[1] ?? 0)
    expect(second).toBeGreaterThanOrEqual(first)
  })

  it('noteOpen 复位退避计数：一次成功后再断，退避从首项重来（不沿用递增档位）', async () => {
    const stamps: number[] = []
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [10, 200],
      connectOnce: async (ctx) => {
        round++
        stamps.push(Date.now())
        if (round === 3) {
          ctx.noteOpen() // 第三轮连上：retries 归零
          return // 随即再断
        }
        if (round >= 4) await hang(ctx)
      },
    })
    await tick(400)
    core.dispose()
    // 第 2→3 次走第二档 200ms；成功复位后第 3→4 次回到首档 10ms
    const before = (stamps[2] ?? 0) - (stamps[1] ?? 0)
    const after = (stamps[3] ?? 0) - (stamps[2] ?? 0)
    expect(before).toBeGreaterThanOrEqual(150)
    expect(after).toBeLessThan(100)
  })

  it('connectOnce 抛错 = 本次连接失败：走退避重连（失败闭合，loop 不悬空）', async () => {
    const { statuses, onStatus } = collector()
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onStatus,
      connectOnce: async (ctx) => {
        round++
        if (round === 1) throw new Error('fetch 失败')
        ctx.noteOpen()
        await hang(ctx)
      },
    })
    await tick()
    expect(statuses).toEqual(['connecting', 'reconnecting', 'open'])
    core.dispose()
  })

  it('reportReconnecting：平台偏离补报（G4）后再 noteOpen → 状态机不撒谎', async () => {
    const { statuses, onStatus } = collector()
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onStatus,
      connectOnce: async (ctx) => {
        ctx.noteOpen()
        // 模拟 react-native-sse 库自行轮询重开：同一次 connectOnce 内第二次 open
        ctx.reportReconnecting()
        ctx.noteOpen()
        await hang(ctx)
      },
    })
    await tick()
    expect(statuses.slice(0, 3)).toEqual(['connecting', 'open', 'reconnecting'])
    core.dispose()
  })
})

describe('水位推进', () => {
  it('noteEnvelope 取最大 seq；乱序不倒退；无 seq 的 live 不参与水位但照常分发', async () => {
    const events: string[] = []
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      since: 3,
      onEvent: (e) => events.push(e.type),
      connectOnce: async (ctx) => {
        expect(ctx.since()).toBe(3)
        ctx.noteEnvelope(envelope(5))
        expect(ctx.since()).toBe(5)
        ctx.noteEnvelope(envelope(4)) // 乱序迟到：水位不倒退
        expect(ctx.since()).toBe(5)
        ctx.noteEnvelope(liveEnvelope()) // 无 seq：不推水位
        expect(ctx.since()).toBe(5)
        await hang(ctx)
      },
    })
    await tick()
    expect(core.since).toBe(5)
    expect(events).toEqual(['session.created', 'session.created', 'assistant.delta'])
    core.dispose()
  })

  it('指定 since：首连 URL 即带该水位（续播不重放）', async () => {
    const urls: string[] = []
    const core = new SessionStreamCore({
      baseUrl: 'http://127.0.0.1:1',
      sessionId: SID,
      since: 7,
      connectOnce: async (ctx) => {
        urls.push(ctx.url())
        await hang(ctx)
      },
    })
    await tick()
    expect(urls[0]).toBe(`http://127.0.0.1:1/api/event?sessionId=${SID}&since=7`)
    core.dispose()
  })

  it('重连 URL 带已推进的水位（断线续播不丢不重）', async () => {
    const urls: string[] = []
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://127.0.0.1:1',
      sessionId: SID,
      backoffMs: [0],
      connectOnce: async (ctx) => {
        round++
        urls.push(ctx.url())
        if (round === 1) {
          ctx.noteEnvelope(envelope(2))
          return // 断开
        }
        await hang(ctx) // 第二轮挂住，避免无限循环
      },
    })
    await tick()
    expect(urls[0]).toContain('&since=0')
    expect(urls[1]).toContain('&since=2')
    core.dispose()
  })
})

describe('URL 构造两形态', () => {
  async function urlOf(opts: {
    sessionId?: typeof SID
    authToken?: string
    since?: number
  }): Promise<string> {
    const urls: string[] = []
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      ...opts,
      connectOnce: async (ctx) => {
        urls.push(ctx.url())
        await hang(ctx)
      },
    })
    await tick()
    core.dispose()
    return urls[0] ?? ''
  }

  it('全局流（省略 sessionId）：只有 /api/event，无查询串', async () => {
    expect(await urlOf({})).toBe('http://h:1/api/event')
  })

  it('全局流带 token：?token= 且 URL 编码（工单 9.1 / D24 双口径）', async () => {
    expect(await urlOf({ authToken: 'a b/c' })).toBe('http://h:1/api/event?token=a%20b%2Fc')
  })

  it('会话级流带 token：sessionId+since 之后追加 &token=', async () => {
    expect(await urlOf({ sessionId: SID, authToken: 'tk' })).toBe(
      `http://h:1/api/event?sessionId=${SID}&since=0&token=tk`,
    )
  })
})

describe('鉴权收敛（401/403）', () => {
  it('同一错误码只上抛一次；连续 3 次进 closed 终态并停止重连', async () => {
    const { statuses, onStatus } = collector()
    const errors: string[] = []
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onStatus,
      onError: (e) => errors.push(e.message),
      connectOnce: sync((ctx) => {
        round++
        ctx.noteAuthFailure(401)
      }),
    })
    await tick(40)
    expect(errors).toEqual(['E_AUTH: 事件流鉴权失败（HTTP 401）']) // 同码去重
    expect(round).toBe(3) // 终态：无第 4 次请求
    expect(statuses[statuses.length - 1]).toBe('closed')
    core.dispose()
  })

  it('不同状态码分别上抛（401 与 403 各一次）', async () => {
    const errors: string[] = []
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onError: (e) => errors.push(e.message),
      connectOnce: async (ctx) => {
        ctx.noteAuthFailure(401)
        ctx.noteAuthFailure(403)
        await hang(ctx) // 计数 2 未达终态：挂住不再跑下一轮
      },
    })
    await tick()
    expect(errors).toEqual([
      'E_AUTH: 事件流鉴权失败（HTTP 401）',
      'E_AUTH: 事件流鉴权失败（HTTP 403）',
    ])
    core.dispose()
  })

  it('重连成功复位：计数与去重标记清零，再次失败可再上抛且不即进终态', async () => {
    const errors: string[] = []
    const { statuses, onStatus } = collector()
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onStatus,
      onError: (e) => errors.push(e.message),
      connectOnce: async (ctx) => {
        round++
        if (round === 1) {
          ctx.noteAuthFailure(401)
          ctx.noteAuthFailure(401)
          return
        }
        ctx.noteOpen() // 配置修复：复位
        ctx.noteAuthFailure(401)
        await hang(ctx)
      },
    })
    await tick()
    expect(errors).toHaveLength(2) // 复位后同码可再抛
    expect(statuses).not.toContain('closed') // 计数已清零，未达终态
    expect(round).toBe(2)
    core.dispose()
  })
})

describe('onReopen（重连重放时机）', () => {
  it('首连不触发（无旧快照）；重连成功触发一次', async () => {
    let reopens = 0
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      // 退避拉长：让「首连已 open、重连未发生」这个中间态可断言
      backoffMs: [20],
      onReopen: () => {
        reopens++
      },
      connectOnce: async (ctx) => {
        round++
        ctx.noteOpen()
        if (round === 1) return // 首连很快断，制造一次重连
        await hang(ctx)
      },
    })
    await tick(5)
    expect(reopens).toBe(0) // 首连不重放
    await tick(40)
    expect(reopens).toBe(1) // 重连成功
    expect(round).toBe(2)
    core.dispose()
  })

  it('noteOpen 幂等高频调用（miniapp 每分块都调）：open 逐次上报，reopen 逐次触发', async () => {
    const { statuses, onStatus } = collector()
    let reopens = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      onStatus,
      onReopen: () => {
        reopens++
      },
      connectOnce: async (ctx) => {
        ctx.noteOpen()
        ctx.noteOpen()
        ctx.noteOpen()
        await hang(ctx)
      },
    })
    await tick()
    expect(statuses).toEqual(['connecting', 'open', 'open', 'open'])
    expect(reopens).toBe(2) // 第 2、3 次 noteOpen 已是"非首次"
    core.dispose()
  })
})

describe('dispose 与 generation', () => {
  it('dispose 后不再调 connectOnce，且静默退出（不发 closed）', async () => {
    const { statuses, onStatus } = collector()
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onStatus,
      connectOnce: sync(() => {
        round++
      }),
    })
    await tick(5)
    const before = round
    core.dispose()
    await tick(30)
    expect(round).toBe(before) // 不再新建连接
    expect(statuses).not.toContain('closed') // 主动关闭不报终态
  })

  it('signal 在 dispose 时 abort（平台侧接线后可即刻断开空闲连接）', async () => {
    // 用数组容器承接闭包内赋值：`let x: AbortSignal | null` 会被 TS 控制流分析收窄成 never
    const signals: AbortSignal[] = []
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      connectOnce: async (ctx) => {
        signals.push(ctx.signal)
        await hang(ctx)
      },
    })
    await tick(5)
    expect(signals).toHaveLength(1)
    expect(signals[0]?.aborted).toBe(false)
    core.dispose()
    expect(signals[0]?.aborted).toBe(true)
  })

  it('stale()：dispose 后为真，平台侧迟到回调据此收敛', async () => {
    const seen: boolean[] = []
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      connectOnce: sync((ctx) => {
        seen.push(ctx.stale())
        core.dispose()
        seen.push(ctx.stale())
      }),
    })
    await tick()
    expect(seen).toEqual([false, true])
  })

  it('连接进行中 dispose：loop 立即退出，不报 reconnecting', async () => {
    const { statuses, onStatus } = collector()
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onStatus,
      connectOnce: async (ctx) => {
        ctx.noteOpen()
        // 模拟长连接：等到 abort 再结束（平台侧 finish 接线）
        await hang(ctx)
      },
    })
    await tick(5)
    expect(statuses).toEqual(['connecting', 'open'])
    core.dispose()
    await tick(20)
    expect(statuses).toEqual(['connecting', 'open']) // 无 reconnecting 尾巴
  })
})

describe("'idle' 续轮（轮询降级节奏）", () => {
  it('返回 idle：按 idleDelayMs 续轮，不报 reconnecting 不退避', async () => {
    const { statuses, onStatus } = collector()
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      idleDelayMs: 1,
      onStatus,
      connectOnce: sync((ctx) => {
        round++
        ctx.noteOpen()
        return 'idle'
      }),
    })
    await tick(30)
    expect(round).toBeGreaterThanOrEqual(2) // 持续续轮
    expect(statuses).not.toContain('reconnecting')
    expect(statuses.every((s) => s === 'connecting' || s === 'open')).toBe(true)
    core.dispose()
  })

  it('idle 与 disconnected 混合：只有后者报 reconnecting', async () => {
    const { statuses, onStatus } = collector()
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      idleDelayMs: 1,
      onStatus,
      connectOnce: sync(() => {
        round++
        return round % 2 === 0 ? 'idle' : 'disconnected'
      }),
    })
    await tick(30)
    core.dispose()
    expect(statuses).toContain('reconnecting') // 奇数轮 disconnected
    expect(round).toBeGreaterThanOrEqual(3)
  })

  it('显式返回 disconnected 与省略返回值同义', async () => {
    const { statuses, onStatus } = collector()
    let round = 0
    const core = new SessionStreamCore({
      baseUrl: 'http://h:1',
      backoffMs: [0],
      onStatus,
      connectOnce: async (ctx) => {
        round++
        if (round === 1) return 'disconnected'
        ctx.noteOpen()
        await hang(ctx)
      },
    })
    await tick()
    expect(statuses).toEqual(['connecting', 'reconnecting', 'open'])
    core.dispose()
  })
})
