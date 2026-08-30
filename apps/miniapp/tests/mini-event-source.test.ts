/**
 * MiniSessionEventSource 状态机单测（工单 9.4 评审修复）：
 * I1 同一 401 响应（headers + then 双路径）只计一次——连续 3 次连接才进终态；
 * I2 终态发 'closed'（不滞留 reconnecting）；
 * I6 轮询路从错误消息解析真实鉴权状态码（HTTP_403 → 403）；
 * I7 分块回调缺失不静默挂死——单向降级轮询。
 * 传输层用 vi.mock('@tarojs/taro') 替身驱动，行为按请求序逐条注入。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ids } from '@spark/protocol'

const harness = vi.hoisted(() => {
  interface Behavior {
    headersStatus: number
    /** undefined = 请求 reject（网络层失败） */
    resolveStatus?: number
    data?: unknown
    /** 不挂 onChunkReceived 回调（模拟类型档缺失——I7） */
    noChunkCallback?: boolean
  }
  const state = {
    behaviors: [] as Behavior[],
    urls: [] as string[],
  }
  function fakeRequest(options: { url: string }): unknown {
    const behavior: Behavior = state.behaviors[state.urls.length] ?? {
      headersStatus: 200,
      resolveStatus: 200,
      data: { events: [] },
    }
    state.urls.push(options.url)
    const headersCbs: Array<(res: { statusCode: number }) => void> = []
    let resolveFn: (v: { statusCode: number; data: unknown }) => void = () => undefined
    let rejectFn: (e: Error) => void = () => undefined
    const promise = new Promise<{ statusCode: number; data: unknown }>((res, rej) => {
      resolveFn = res
      rejectFn = rej
    })
    queueMicrotask(() => {
      for (const cb of headersCbs) cb({ statusCode: behavior.headersStatus })
      if (behavior.resolveStatus === undefined) rejectFn(new Error('request:fail'))
      else resolveFn({ statusCode: behavior.resolveStatus, data: behavior.data ?? null })
    })
    const task: Record<string, unknown> = {
      abort: () => undefined,
      onHeadersReceived: (cb: (res: { statusCode: number }) => void) => {
        headersCbs.push(cb)
      },
      then: (
        onF?: (v: { statusCode: number; data: unknown }) => unknown,
        onR?: (e: unknown) => unknown,
      ) => promise.then(onF, onR),
      catch: (onR?: (e: unknown) => unknown) => promise.catch(onR),
    }
    if (behavior.noChunkCallback !== true) {
      task['onChunkReceived'] = (_cb: (res: { data: ArrayBuffer }) => void) => undefined
    }
    return task
  }
  function reset(): void {
    state.behaviors = []
    state.urls = []
  }
  return { state, fakeRequest, reset }
})

vi.mock('@tarojs/taro', () => ({
  default: {
    request: (opts: { url: string }) => harness.fakeRequest(opts),
    getSystemInfoSync: () => ({ SDKVersion: '2.20.2' }),
  },
}))

import { MiniSessionEventSource } from '../src/transport/mini-event-source'
import type { MiniConnectionStatus } from '../src/transport/mini-event-source'

beforeEach(() => {
  harness.reset()
})

describe('MiniSessionEventSource——鉴权收敛状态机（评审 I1/I2）', () => {
  it('I1：headers 与 then 双路径各见 401，同一响应只计一次——第 3 次连接才进终态', async () => {
    harness.state.behaviors = [
      { headersStatus: 401, resolveStatus: 401 },
      { headersStatus: 401, resolveStatus: 401 },
      { headersStatus: 401, resolveStatus: 401 },
    ]
    const statuses: MiniConnectionStatus[] = []
    const errors: string[] = []
    const src = new MiniSessionEventSource({
      baseUrl: 'http://fake',
      sessionId: ids.session('ses_mauth1'),
      chunkedSupported: true,
      backoffMs: [1, 1, 1],
      onStatus: (s) => statuses.push(s),
      onError: (e) => errors.push(e.message),
    })
    await vi.waitFor(() => {
      expect(statuses).toContain('closed')
    }, { timeout: 2000 })
    // 双计 bug 下 2 次连接即达 4 次计数进终态——修复后恰 3 次连接
    expect(harness.state.urls).toHaveLength(3)
    // 同一错误码 onError 只上抛一次（去重口径不破）
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('HTTP 401')
    src.dispose()
  })

  it('I2：终态发 closed，之后不再发状态（不滞留 reconnecting 谎报）', async () => {
    harness.state.behaviors = [
      { headersStatus: 403, resolveStatus: 403 },
      { headersStatus: 403, resolveStatus: 403 },
      { headersStatus: 403, resolveStatus: 403 },
    ]
    const statuses: MiniConnectionStatus[] = []
    const src = new MiniSessionEventSource({
      baseUrl: 'http://fake',
      sessionId: ids.session('ses_mauth2'),
      chunkedSupported: true,
      backoffMs: [1, 1, 1],
      onStatus: (s) => statuses.push(s),
    })
    await vi.waitFor(() => {
      expect(statuses).toContain('closed')
    }, { timeout: 2000 })
    expect(statuses[statuses.length - 1]).toBe('closed')
    const len = statuses.length
    await new Promise((r) => setTimeout(r, 30))
    // 终态后循环已退出：无后续状态、无新增请求
    expect(statuses).toHaveLength(len)
    expect(harness.state.urls).toHaveLength(3)
    src.dispose()
  })
})

describe('MiniSessionEventSource——轮询降级路径（评审 I6/I7）', () => {
  it('I6：轮询路鉴权状态码从错误消息解析真实值（HTTP_403 → 403）', async () => {
    harness.state.behaviors = [
      { headersStatus: 403, resolveStatus: 403, data: { code: 'HTTP_403', message: 'forbidden' } },
      { headersStatus: 403, resolveStatus: 403, data: { code: 'HTTP_403', message: 'forbidden' } },
      { headersStatus: 403, resolveStatus: 403, data: { code: 'HTTP_403', message: 'forbidden' } },
    ]
    const statuses: MiniConnectionStatus[] = []
    const errors: string[] = []
    const src = new MiniSessionEventSource({
      baseUrl: 'http://fake',
      sessionId: ids.session('ses_mauth3'),
      forcePolling: true,
      pollIntervalMs: 1,
      backoffMs: [1, 1, 1],
      onStatus: (s) => statuses.push(s),
      onError: (e) => errors.push(e.message),
    })
    await vi.waitFor(() => {
      expect(statuses).toContain('closed')
    }, { timeout: 2000 })
    // 真实状态码 403（而非硬编码 401）——错误文案与 SSE 路同口径
    expect(errors[0]).toContain('HTTP 403')
    expect(statuses[statuses.length - 1]).toBe('closed')
    expect(harness.state.urls).toHaveLength(3)
    src.dispose()
  })

  it('I7：onChunkReceived 缺失不静默挂死——单向降级轮询继续供数', async () => {
    harness.state.behaviors = [
      // 首次 SSE：200 但无分块回调 → 应即刻降级
      { headersStatus: 200, resolveStatus: 200, noChunkCallback: true },
      // 其后轮询：正常空页
      { headersStatus: 200, resolveStatus: 200, data: { events: [] } },
      { headersStatus: 200, resolveStatus: 200, data: { events: [] } },
    ]
    const statuses: MiniConnectionStatus[] = []
    const src = new MiniSessionEventSource({
      baseUrl: 'http://fake',
      sessionId: ids.session('ses_mauth4'),
      chunkedSupported: true,
      pollIntervalMs: 1,
      backoffMs: [1],
      onStatus: (s) => statuses.push(s),
    })
    await vi.waitFor(() => {
      // 降级后轮询成功置 open（证明没挂死在 SSE 等待）
      expect(statuses.filter((s) => s === 'open').length).toBeGreaterThanOrEqual(1)
    }, { timeout: 2000 })
    // 首个请求是 SSE 探测，其后全部走轮询端点
    expect(harness.state.urls[0]).toContain('/api/event?')
    expect(harness.state.urls.length).toBeGreaterThanOrEqual(2)
    for (const url of harness.state.urls.slice(1)) {
      expect(url).toContain('/api/sessions/')
    }
    src.dispose()
  })
})
