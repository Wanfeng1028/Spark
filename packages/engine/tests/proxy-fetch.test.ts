/**
 * LLM 出网代理单测（阶段十二工单 12.9 / ADR D28 方案 A）：
 * config 解析 proxy 字段 / proxyFetchFor 选择（显式 > env 兜底 > undefined）/
 * Agent 缓存复用。不发真实网络请求（代理效果验证=用户侧 mitm 走查）。
 */
import { afterEach, describe, expect, test } from 'vitest'
import { proxyFetchFor, clearProxyAgents } from '../src/proxy-fetch.js'

afterEach(() => {
  clearProxyAgents()
  delete process.env.HTTPS_PROXY
  delete process.env.https_proxy
})

describe('proxyFetchFor（工单 12.9）', () => {
  test('无 proxy 字段且无 env → undefined（缺省直连零变化）', () => {
    expect(proxyFetchFor(undefined)).toBeUndefined()
  })

  test('显式 proxy → 返回 fetch 函数（同一 URL 复用 Agent）', () => {
    const f1 = proxyFetchFor('http://127.0.0.1:8888')
    const f2 = proxyFetchFor('http://127.0.0.1:8888')
    expect(f1).toBeTypeOf('function')
    expect(f2).toBe(f1) // 模块级 Agent 缓存：同 URL 同 fetch 闭包
  })

  test('env 兜底：HTTPS_PROXY 生效，显式字段优先于 env', () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:3128'
    expect(proxyFetchFor(undefined)).toBeTypeOf('function')
    const envF = proxyFetchFor(undefined)
    const explicitF = proxyFetchFor('http://explicit:8888')
    expect(envF).not.toBe(explicitF) // 不同代理 URL → 不同 Agent 闭包
  })
})
