/**
 * LLM 出网代理（阶段十二工单 12.9 / V2-06，ADR D28 方案 A）：
 * models.json provider 条目 `proxy`（http/https URL）→ undici ProxyAgent per-provider
 * fetch 注入（pi-ai ProviderRequestOptions.fetch 原生支持）；无 proxy 时回退
 * HTTPS_PROXY/https_proxy 标准环境变量；两者皆无 → undefined（缺省 fetch 零变化红线）。
 */
import { ProxyAgent } from 'undici'
import type { FetchFunction } from '@earendil-works/pi-ai'

/** env 兜底序：HTTPS_PROXY → https_proxy（标准变量，工单 12.9 ③） */
function envProxy(): string | undefined {
  return process.env.HTTPS_PROXY ?? process.env.https_proxy
}

/** 模块级代理 fetch 缓存（同 URL 复用同一 Agent 连接池与闭包） */
const cache = new Map<string, FetchFunction>()

export function clearProxyAgents(): void {
  cache.clear()
}

/**
 * provider → 注入代理的 fetch；无代理配置（字段缺省且无 env 兜底）→ undefined
 * = 调用方不传 fetch（全局 fetch 缺省行为零变化）。
 */
export function proxyFetchFor(proxy: string | undefined): FetchFunction | undefined {
  const url = proxy ?? envProxy()
  if (url === undefined || url === '') return undefined
  const cached = cache.get(url)
  if (cached !== undefined) return cached
  const agent = new ProxyAgent(url)
  const proxied: FetchFunction = (input, init) =>
    globalThis.fetch(input, { ...init, dispatcher: agent } as RequestInit)
  cache.set(url, proxied)
  return proxied
}
