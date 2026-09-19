/**
 * LLM 出网代理（阶段十二工单 12.9 / V2-06，ADR D28 方案 A）：
 * models.json provider 条目 `proxy`（http/https URL）→ undici ProxyAgent per-provider
 * fetch 注入（pi-ai ProviderRequestOptions.fetch 原生支持）；无 proxy 时回退
 * HTTPS_PROXY/https_proxy 标准环境变量；两者皆无 → undefined（缺省 fetch 零变化红线）。
 *
 * RT3-03（WO-085）：fetch 必须用 npm undici 包自己的 fetch，不能用 globalThis.fetch——
 * Node 全局 fetch 走的是 Node 内置 undici（随 Node 版本演化，与 npm 包不同步），跨包
 * 配对（npm undici 的 Agent 当 Node 内置 fetch 的 dispatcher）handler 协议不互通，
 * 实测表现 = 请求静默无响应（第三轮走查 RT3-03：带代理空响应、unset 代理即正常）。
 * 同包 fetch + 同包 Agent 配对才成立；直连路径（无 proxy）不经此函数，全局 fetch 零变化。
 */
import { ProxyAgent, fetch as undiciFetch } from 'undici'
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
  // 类型空间说明：undici 的 Request/Response 与全局同名类型是两套声明（互不相认），
  // 但运行时同形状——undici 正是 Node 全局 fetch 的实现本源；以 unknown 中转收窄。
  const proxied: FetchFunction = (input, init) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...init, dispatcher: agent } as Parameters<typeof undiciFetch>[1],
    ) as unknown as ReturnType<FetchFunction>
  cache.set(url, proxied)
  return proxied
}
