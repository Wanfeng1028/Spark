/**
 * 链接预览抓取（阶段十九工单 19.21 / V2-24）：为正文中出现的 URL 抓取
 * `<title>` 与 favicon 地址，供四端渲染"图标+域名+标题"预览卡。
 *
 * **SSRF 防护（本模块的核心职责）**——引擎"替用户访问任意 URL"是经典 SSRF 面：
 * ① scheme 白名单：仅 http/https（file/gopher/ftp 等直接拒）；
 * ② DNS 解析后**逐地址**校验：回环/私网/链路本地/保留段一律拒（校验发生在解析后、
 *    连接前，防 DNS rebinding）；IPv6 特殊段（::1、fc00::/7、fe80::/10）同拒；
 * ③ 重定向手动逐跳跟随（上限 3），**每一跳重新做 scheme + DNS 校验**——
 *    公网 URL 302 到内网是最常见的绕过手法；
 * ④ 5s 超时 + 响应体 512KB 上限（够 <title> 用，防超大响应拖垮内存）；
 * ⑤ 仅取首个响应的 <title> 与 origin/favicon.ico，不执行任何页面内容。
 *
 * 抓取失败（超时/非 HTML/404）如实回 null 字段——卡片退化为"图标+域名"最小形态；
 * 只有"不安全 URL"抛 E_LINK_PREVIEW_UNSAFE（调用方映射 400）。
 */
import { lookup } from 'node:dns/promises'
import { request } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { URL } from 'node:url'

const FETCH_TIMEOUT_MS = 5_000
const MAX_BODY_BYTES = 512 * 1024
const MAX_REDIRECTS = 3

export interface LinkPreviewResult {
  /** 规范化后的最终 URL（跟随重定向后） */
  url: string
  domain: string
  title: string | null
  /** origin/favicon.ico（页面未声明 icon 时的缺省探测位） */
  iconUrl: string | null
}

/** 私网/保留段判定（IPv4 + IPv6；解析出的每个地址都必须是公网才放行） */
export function isPrivateAddress(ip: string): boolean {
  if (ip.includes('.')) {
    const parts = ip.split('.').map((v) => Number(v))
    if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) return true
    const [a, b] = parts as [number, number, number, number]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true // link-local
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true // multicast + reserved
    return false
  }
  const v6 = ip.toLowerCase()
  if (v6 === '::' || v6 === '::1') return true
  if (v6.startsWith('fe80:') || v6.startsWith('fc') || v6.startsWith('fd')) return true // link-local / ULA
  if (v6.startsWith('ff')) return true // multicast
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7)) // IPv4-mapped
  return false
}

/** scheme 白名单 + 主机非空；返回错误消息或 null（null = 合法） */
function schemeError(url: URL): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'E_LINK_PREVIEW_UNSAFE: 仅允许 http/https 链接'
  }
  if (url.hostname === '') return 'E_LINK_PREVIEW_UNSAFE: 链接缺主机名'
  return null
}

/** DNS 解析 + 逐地址私网校验（防 DNS rebinding：解析后才连） */
async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: { address: string }[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    return // 解析失败交给请求自行报错——不构成 SSRF 面
  }
  for (const a of addresses) {
    if (isPrivateAddress(a.address)) {
      throw new Error(`E_LINK_PREVIEW_UNSAFE: ${hostname} 解析到非公网地址（${a.address}）`)
    }
  }
}

/** 单跳 GET（http/https 二选一），响应体截断到上限 */
function fetchOnce(
  url: URL,
  timeoutMs: number,
): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : request)(
      url,
      { method: 'GET', headers: { accept: 'text/html,*/*' }, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = []
        let total = 0
        res.on('data', (c: Buffer) => {
          total += c.length
          if (total <= MAX_BODY_BYTES) chunks.push(c)
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            ...(res.headers.location !== undefined ? { location: res.headers.location } : {}),
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new Error('E_LINK_PREVIEW_FAILED: 抓取超时')))
    req.on('error', reject)
    req.end()
  })
}

/** 抓取单 URL（重定向逐跳重新校验），解析 <title> */
async function fetchMetadata(rawUrl: string): Promise<LinkPreviewResult> {
  let current = new URL(rawUrl)
  const schemeErr = schemeError(current)
  if (schemeErr !== null) throw new Error(schemeErr)
  for (let hop = 0; ; hop++) {
    if (hop > MAX_REDIRECTS) throw new Error('E_LINK_PREVIEW_FAILED: 重定向次数超限')
    await assertPublicHost(current.hostname)
    const res = await fetchOnce(current, FETCH_TIMEOUT_MS)
    if (res.status >= 300 && res.status < 400 && res.location !== undefined) {
      const next = new URL(res.location, current)
      const err = schemeError(next)
      if (err !== null) throw new Error(err)
      current = next
      continue
    }
    const titleMatch = /<title[^>]*>([^<]{0,300})/i.exec(res.body)
    const raw = titleMatch?.[1]?.trim() ?? ''
    return {
      url: current.toString(),
      domain: current.hostname,
      title: raw !== '' ? raw : null,
      iconUrl: `${current.origin}/favicon.ico`,
    }
  }
}

/** 模块级缓存（同 URL 进程内只抓一次；容量封顶 FIFO 淘汰） */
const cache = new Map<string, LinkPreviewResult>()
const CACHE_MAX = 128

/**
 * 抓取入口：不安全 URL 抛 E_LINK_PREVIEW_UNSAFE（server 映射 400）；
 * 网络层失败/非 HTML → title/icon 为 null 的最小卡形态（不抛——预览失败不污染会话流）。
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewResult> {
  const cached = cache.get(rawUrl)
  if (cached !== undefined) return cached
  try {
    const result = await fetchMetadata(rawUrl)
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(rawUrl, result)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('E_LINK_PREVIEW_UNSAFE')) throw err
    const u = new URL(rawUrl)
    return { url: u.toString(), domain: u.hostname, title: null, iconUrl: null }
  }
}
