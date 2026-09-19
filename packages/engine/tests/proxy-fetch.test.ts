/**
 * LLM 出网代理单测（阶段十二工单 12.9 / ADR D28 方案 A）：
 * config 解析 proxy 字段 / proxyFetchFor 选择（显式 > env 兜底 > undefined）/
 * Agent 缓存复用。不发真实网络请求（代理效果验证=用户侧 mitm 走查）。
 *
 * RT3-03（WO-085）：undici 以 vi.mock 打桩——锁死"代理 fetch = npm undici 自己的
 * fetch + 同包 ProxyAgent dispatcher"配对，且全局 fetch 不被触碰（跨包配对 =
 * Node 内置 undici 与 npm 包 handler 协议不互通，实测空响应，本次回归的根因）。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { proxyFetchFor, clearProxyAgents } from '../src/proxy-fetch.js'

const undiciMock = vi.hoisted(() => ({
  fetch: vi.fn(async () => ({ ok: true })),
  agents: [] as string[],
}))

vi.mock('undici', () => ({
  ProxyAgent: class {
    readonly url: string
    constructor(url: string) {
      this.url = url
      undiciMock.agents.push(url)
    }
  },
  fetch: undiciMock.fetch,
}))

// 生产读取面 = HTTPS_PROXY/https_proxy（proxy-fetch.ts env 兜底序）；回归报告
//（docs/audit/regression）发现宿主沙箱还可能注入 PROXY/HTTP_PROXY/http_proxy——
// 虽不影响生产逻辑，一并 stub 清空使断言路径与宿主环境完全解耦
const HOSTILE_PROXY_ENVS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'PROXY'] as const

beforeEach(() => {
  for (const k of HOSTILE_PROXY_ENVS) vi.stubEnv(k, '')
})

afterEach(() => {
  clearProxyAgents()
  undiciMock.fetch.mockClear()
  undiciMock.agents.length = 0
  // WO-019：unstub 恢复宿主真实值（不破坏测试进程 env）；delete 兜底历史直写
  vi.unstubAllEnvs()
  for (const k of HOSTILE_PROXY_ENVS) delete process.env[k]
})

describe('proxyFetchFor（工单 12.9）', () => {
  test('无 proxy 字段且无 env → undefined（缺省直连零变化）', () => {
    // 宿主代理变量已由 beforeEach 全组空桩（回归报告发现①）
    expect(proxyFetchFor(undefined)).toBeUndefined()
  })

  test('显式 proxy → 返回 fetch 函数（同一 URL 复用 Agent）', () => {
    const f1 = proxyFetchFor('http://127.0.0.1:8888')
    const f2 = proxyFetchFor('http://127.0.0.1:8888')
    expect(f1).toBeTypeOf('function')
    expect(f2).toBe(f1) // 模块级 Agent 缓存：同 URL 同 fetch 闭包
    expect(undiciMock.agents).toHaveLength(1) // 同 URL 只建一个 ProxyAgent
  })

  test('env 兜底：HTTPS_PROXY 生效，显式字段优先于 env', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://env-proxy:3128') // 覆盖 beforeEach 空桩
    expect(proxyFetchFor(undefined)).toBeTypeOf('function')
    const envF = proxyFetchFor(undefined)
    const explicitF = proxyFetchFor('http://explicit:8888')
    expect(envF).not.toBe(explicitF) // 不同代理 URL → 不同 Agent 闭包
    expect(undiciMock.agents).toEqual(['http://env-proxy:3128', 'http://explicit:8888'])
  })

  test('RT3-03 回归锁：代理请求走 undici 同源 fetch + 同包 dispatcher，不触全局 fetch', async () => {
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch')
    const f = proxyFetchFor('http://127.0.0.1:8888')
    expect(f).toBeTypeOf('function')
    if (f === undefined) throw new Error('代理 fetch 未生成（测试前提不成立）')
    await f('https://api.example.com/v1/chat/completions')
    expect(undiciMock.fetch).toHaveBeenCalledTimes(1)
    // mock.fn 实参形状未在替身类型中声明——经 unknown 收窄读取（严格模式）
    const call = undiciMock.fetch.mock.calls[0] as unknown as
      | [string, { dispatcher?: { url?: string } }]
      | undefined
    expect(call).toBeDefined()
    if (call === undefined) return
    const [input, init] = call
    expect(input).toBe('https://api.example.com/v1/chat/completions')
    expect(init.dispatcher?.url).toBe('http://127.0.0.1:8888')
    expect(globalFetchSpy).not.toHaveBeenCalled()
    globalFetchSpy.mockRestore()
  })
})
