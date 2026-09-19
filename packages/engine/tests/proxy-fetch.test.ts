/**
 * LLM 出网代理单测（阶段十二工单 12.9 / ADR D28 方案 A）：
 * config 解析 proxy 字段 / proxyFetchFor 选择（显式 > env 兜底 > undefined）/
 * Agent 缓存复用。不发真实网络请求（代理效果验证=用户侧 mitm 走查）。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { proxyFetchFor, clearProxyAgents } from '../src/proxy-fetch.js'

// 生产读取面 = HTTPS_PROXY/https_proxy（proxy-fetch.ts env 兜底序）；回归报告
//（docs/audit/regression）发现宿主沙箱还可能注入 PROXY/HTTP_PROXY/http_proxy——
// 虽不影响生产逻辑，一并 stub 清空使断言路径与宿主环境完全解耦
const HOSTILE_PROXY_ENVS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'PROXY'] as const

beforeEach(() => {
  for (const k of HOSTILE_PROXY_ENVS) vi.stubEnv(k, '')
})

afterEach(() => {
  clearProxyAgents()
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
  })

  test('env 兜底：HTTPS_PROXY 生效，显式字段优先于 env', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://env-proxy:3128') // 覆盖 beforeEach 空桩
    expect(proxyFetchFor(undefined)).toBeTypeOf('function')
    const envF = proxyFetchFor(undefined)
    const explicitF = proxyFetchFor('http://explicit:8888')
    expect(envF).not.toBe(explicitF) // 不同代理 URL → 不同 Agent 闭包
  })
})
