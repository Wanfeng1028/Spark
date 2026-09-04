/**
 * RnSessionEventSource 单测（评审 G1/G4/G5）：
 * - G1：dispose 即刻关闭底层 EventSource（abort 接线），残余回调不再驱动状态机；
 * - G4：同实例第二次 open（库轮询重开）补报 reconnecting → open；
 * - G5：401/403 onError 去重；连续 3 次进终态停止重连（工单 R-B.5c 起终态发 'closed'）。
 * react-native-sse 以可回放事件的 Mock 类替换（不落真实网络）；重连状态机已下沉
 * SessionStreamCore（packages/protocol/tests/session-stream-core.test.ts 测内核契约），
 * 本文件只测 RN 侧的平台接线（库事件 → 内核事实上报）。
 */
import { ids } from '@spark/protocol'
import EventSource from 'react-native-sse'
import { RnSessionEventSource } from '../src/transport/rn-event-source'
import type { RnConnectionStatus } from '../src/transport/rn-event-source'

jest.mock('react-native-sse', () => {
  // jest.mock 工厂禁止引用外部变量（参数名也扫描）——一律 mock 前缀
  type MockListener = (mockEvent?: unknown) => void
  class MockEventSource {
    static instances: MockEventSource[] = []
    static reset(): void {
      MockEventSource.instances = []
    }
    url: string
    closed = false
    private readonly listeners: Record<string, MockListener[]> = {}
    constructor(url: string) {
      this.url = url
      MockEventSource.instances.push(this)
    }
    addEventListener(type: string, fn: MockListener): void {
      ;(this.listeners[type] ??= []).push(fn)
    }
    removeEventListener(): void {}
    removeAllEventListeners(): void {}
    close(): void {
      this.closed = true
    }
    emit(type: string, mockEvent?: unknown): void {
      for (const fn of [...(this.listeners[type] ?? [])]) fn(mockEvent)
    }
  }
  return { __esModule: true, default: MockEventSource }
})

interface MockEsInstance {
  url: string
  closed: boolean
  emit(type: string, event?: unknown): void
}

const MockEventSource = EventSource as unknown as {
  instances: MockEsInstance[]
  reset(): void
}

/** 取第 i 个实例（不存在即测试失败，不静默） */
function esAt(i: number): MockEsInstance {
  const es = MockEventSource.instances[i]
  if (es === undefined) throw new Error(`期望存在第 ${i} 个 EventSource 实例`)
  return es
}

const SID = ids.session('ses_rn_es_test')

/** 让退避重连的 setTimeout(0) 与 Promise 链走完 */
async function tick(ms = 10): Promise<void> {
  await new Promise((r) => {
    setTimeout(r, ms)
  })
}

beforeEach(() => {
  MockEventSource.reset()
})

describe('G1：dispose 关闭底层连接', () => {
  it('连接 open 且空闲时，dispose 即刻 es.close()，回调不再驱动状态机', async () => {
    const statuses: RnConnectionStatus[] = []
    const events: string[] = []
    const src = new RnSessionEventSource({
      baseUrl: 'http://h:8080',
      sessionId: SID,
      backoffMs: [0],
      onStatus: (s) => statuses.push(s),
      onEvent: (e) => events.push(e.type),
    })
    expect(MockEventSource.instances).toHaveLength(1)
    const es = esAt(0)
    es.emit('open')
    expect(statuses).toEqual(['connecting', 'open'])

    src.dispose()
    expect(es.closed).toBe(true)

    // 残余回调：不再改状态、不再投影、不重建连接
    es.emit('message', { type: 'message', data: '{"id":"x"}' })
    es.emit('open')
    await tick()
    expect(statuses).toEqual(['connecting', 'open'])
    expect(events).toEqual([])
    expect(MockEventSource.instances).toHaveLength(1)
  })

  it('连接尚未 open 时 dispose 同样关闭（无僵尸等待）', async () => {
    const statuses: RnConnectionStatus[] = []
    const src = new RnSessionEventSource({
      baseUrl: 'http://h:8080',
      sessionId: SID,
      backoffMs: [0],
      onStatus: (s) => statuses.push(s),
    })
    const es = esAt(0)
    src.dispose()
    expect(es.closed).toBe(true)
    es.emit('open')
    await tick()
    expect(statuses).toEqual(['connecting'])
    expect(MockEventSource.instances).toHaveLength(1)
  })
})

describe('G4：库轮询重开的状态诚实补报', () => {
  it('同实例第二次 open 补报 reconnecting → open', () => {
    const statuses: RnConnectionStatus[] = []
    new RnSessionEventSource({
      baseUrl: 'http://h:8080',
      sessionId: SID,
      backoffMs: [0],
      onStatus: (s) => statuses.push(s),
    })
    const es = esAt(0)
    es.emit('open')
    es.emit('open') // 库轮询重开（2 系 DONE 后自行续播）
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting', 'open'])
  })
})

describe('G5：鉴权失败收敛（去重 + 终态）', () => {
  const auth401 = { type: 'error', message: 'unauthorized', xhrStatus: 401 }

  it('连续 3 次 401：onError 只上抛一次，第 3 次后进终态不再重连', async () => {
    const errors: string[] = []
    const statuses: RnConnectionStatus[] = []
    new RnSessionEventSource({
      baseUrl: 'http://h:8080',
      sessionId: SID,
      backoffMs: [0],
      onStatus: (s) => statuses.push(s),
      onError: (e) => errors.push(e.message),
    })

    esAt(0).emit('error', auth401)
    await tick()
    esAt(1).emit('error', auth401)
    await tick()
    esAt(2).emit('error', auth401)
    await tick()

    // 文案单源在 SessionStreamCore（工单 R-B.5）：与传输无关的「事件流」口径（四端逐字同）
    expect(errors).toEqual(['E_AUTH: 事件流鉴权失败（HTTP 401）']) // 同码去重
    expect(MockEventSource.instances).toHaveLength(3) // 终态：无第 4 次请求
    expect(statuses[statuses.length - 1]).toBe('closed') // 终态如实上报（不滞留 reconnecting）
  })

  it('重连成功后复位：再次鉴权失败可再次上抛', async () => {
    const errors: string[] = []
    new RnSessionEventSource({
      baseUrl: 'http://h:8080',
      sessionId: SID,
      backoffMs: [0],
      onError: (e) => errors.push(e.message),
    })

    esAt(0).emit('error', auth401)
    await tick()
    // 第 2 次连接成功（配置修复）→ 计数与去重标记复位
    esAt(1).emit('open')
    esAt(1).emit('error', auth401)
    await tick()

    expect(errors).toHaveLength(2)
  })
})
