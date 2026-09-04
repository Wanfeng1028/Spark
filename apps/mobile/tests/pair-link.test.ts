/**
 * RN 配对深链接线单测（工单 9.2 建 / 工单 R-B 改）：解析本体已下沉 @spark/protocol
 * pair-link 并由 packages/protocol/tests/pair-link.test.ts 承接两端用例并集；
 * 本文件只测端侧接线——冷启动 getInitialURL 与运行期 addEventListener 双路径
 * 共用同一处理、解析失败静默忽略（不做半截配置）、取消订阅后回调不再驱动。
 * expo-linking 以可驱动的 mock 替换（不落原生模块）。
 */
import * as Linking from 'expo-linking'
import type { PairLink } from '@spark/protocol'
import { subscribePairLink } from '../src/transport/pair-link'

jest.mock('expo-linking', () => {
  // jest.mock 工厂禁止引用外部变量（类型注解里的参数名也被扫描）——一律 mock 前缀（先例 rn-event-source.test.ts）
  type MockUrlListener = (mockEvent: { url: string }) => void
  const mockListeners: MockUrlListener[] = []
  let mockInitialUrl: string | null = null
  return {
    __esModule: true,
    getInitialURL: (): Promise<string | null> => Promise.resolve(mockInitialUrl),
    addEventListener: (_type: string, fn: MockUrlListener) => {
      mockListeners.push(fn)
      return {
        remove: (): void => {
          const i = mockListeners.indexOf(fn)
          if (i >= 0) mockListeners.splice(i, 1)
        },
      }
    },
    __setInitialURL: (url: string | null): void => {
      mockInitialUrl = url
    },
    __emitUrl: (url: string): void => {
      for (const fn of [...mockListeners]) fn({ url })
    },
    __listenerCount: (): number => mockListeners.length,
    __resetListeners: (): void => {
      mockListeners.length = 0
    },
  }
})

interface MockLinking {
  __setInitialURL: (url: string | null) => void
  __emitUrl: (url: string) => void
  __listenerCount: () => number
  __resetListeners: () => void
}

const mock = Linking as unknown as MockLinking

const VALID = 'spark://pair?host=192.168.1.10&port=4318&code=123456'
const EXPECTED: PairLink = { host: '192.168.1.10', port: 4318, code: '123456' }

/** getInitialURL 的 then 回调落在微任务队列——flush 一轮再断言 */
async function flush(): Promise<void> {
  await Promise.resolve()
}

beforeEach(() => {
  mock.__setInitialURL(null)
  // 监听器在工厂闭包内跨用例存活——不清则计数与 emit 会被上例遗留订阅污染
  mock.__resetListeners()
})

describe('subscribePairLink', () => {
  it('冷启动 URL 合法：解析产物交给回调', async () => {
    mock.__setInitialURL(VALID)
    const onPair = jest.fn()
    subscribePairLink(onPair)
    await flush()
    expect(onPair).toHaveBeenCalledTimes(1)
    expect(onPair).toHaveBeenCalledWith(EXPECTED)
  })

  it('冷启动 URL 为 null（非深链启动）：不触发回调', async () => {
    const onPair = jest.fn()
    subscribePairLink(onPair)
    await flush()
    expect(onPair).not.toHaveBeenCalled()
  })

  it('冷启动 URL 非法：静默忽略（不做半截配置）', async () => {
    mock.__setInitialURL('http://pair?host=a&port=1&code=123456')
    const onPair = jest.fn()
    subscribePairLink(onPair)
    await flush()
    expect(onPair).not.toHaveBeenCalled()
  })

  it('运行期新 URL 与冷启动走同一处理', () => {
    const onPair = jest.fn()
    subscribePairLink(onPair)
    mock.__emitUrl(VALID)
    expect(onPair).toHaveBeenCalledWith(EXPECTED)
    mock.__emitUrl('spark://pair?host=a&port=1&code=12345') // 码 5 位
    expect(onPair).toHaveBeenCalledTimes(1)
  })

  it('返回的取消订阅移除监听：此后深链不再驱动回调', () => {
    const onPair = jest.fn()
    const unsubscribe = subscribePairLink(onPair)
    expect(mock.__listenerCount()).toBe(1)
    unsubscribe()
    expect(mock.__listenerCount()).toBe(0)
    mock.__emitUrl(VALID)
    expect(onPair).not.toHaveBeenCalled()
  })
})
