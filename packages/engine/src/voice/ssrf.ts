/**
 * 转写端点 SSRF 防护（工单 16.6；qwen-code voice-transcriber 必抄项的等价实现）：
 * 转写端点来自用户可写的 models.json，fetch 前必须解析 DNS 并拒绝一切非公网地址——
 * 否则本机引擎会被诱导请求 127.0.0.1/内网服务（元数据/管理面）。
 * 覆盖面：IPv4 私网/环回/链路本地/CGNAT/保留段 + IPv6 ULA/链路本地/组播 +
 * **过渡地址**（IPv4-mapped ::ffff:0:0/96、NAT64 64:ff9b::/96 与 64:ff9b:1::/48、
 * 6to4 2002::/16——映射内网 v4 借道 v6 绕过纯 v4 黑名单的经典手法，故单独列）。
 */
import { BlockList } from 'node:net'
import { lookup } from 'node:dns/promises'

/** 全局黑名单（进程级单例；BlockList 自带区间二分，无热路径压力） */
let blocklist: BlockList | null = null

function blocklistOf(): BlockList {
  if (blocklist !== null) return blocklist
  const bl = new BlockList()
  // IPv4
  bl.addSubnet('0.0.0.0', 8) // 未指定/本网段（含 0.0.0.0）
  bl.addSubnet('10.0.0.0', 8) // 私网
  bl.addSubnet('172.16.0.0', 12) // 私网
  bl.addSubnet('192.168.0.0', 16) // 私网
  bl.addSubnet('127.0.0.0', 8) // 环回
  bl.addSubnet('169.254.0.0', 16) // 链路本地（云元数据 169.254.169.254 在此段）
  bl.addSubnet('100.64.0.0', 10) // CGNAT
  bl.addSubnet('192.0.0.0', 24) // IETF 协议保留
  bl.addSubnet('198.18.0.0', 15) // 基准测试保留
  bl.addSubnet('224.0.0.0', 4) // 组播
  bl.addSubnet('240.0.0.0', 4) // 保留（含广播）
  // IPv6
  bl.addSubnet('::', 128) // 未指定
  bl.addSubnet('::1', 128) // 环回
  bl.addSubnet('fc00::', 7) // ULA 私网
  bl.addSubnet('fe80::', 10) // 链路本地
  bl.addSubnet('ff00::', 8) // 组播
  bl.addSubnet('::ffff:0:0', 96) // IPv4-mapped 过渡地址（内网 v4 借 v6 通道）
  bl.addSubnet('64:ff9b::', 96) // NAT64 过渡（well-known 前缀）
  bl.addSubnet('64:ff9b:1::', 48) // NAT64 过渡（本地前缀变体）
  bl.addSubnet('2002::', 16) // 6to4 过渡（内嵌 v4 地址）
  blocklist = bl
  return bl
}

/** 地址是否被拒（IP 字面量或 DNS 解析结果均可直查；非 IP 输入返回 true——fail-closed） */
export function isBlockedAddress(address: string): boolean {
  // BlockList.check 对非法输入返回 false——先显式校验，解析不出即拒绝
  const asV4 = BlockList.isIPv4(address)
  const asV6 = BlockList.isIPv6(address)
  if (!asV4 && !asV6) return true
  // IPv4-mapped 冒充：先规范化 v6（::ffff:a.b.c.d 形式 BlockList 可查，但十六进制
  // 变体 ::ffff:a01:101 也合法——两种都进 v6 检查，mapped 段已整段入黑名单）
  return blocklistOf().check(address)
}

export interface PublicUrlDeps {
  lookupFn?: typeof lookup
}

/**
 * 校验 http(s) URL 的主机可安全外呼：协议白名单 → 主机若是 IP 字面量直接查黑名单；
 * 域名则 DNS 解析**全部**地址逐一检查（任一命中即拒——解析出多栈地址时最保守）。
 * 通过后返回原 URL（fetch 仍以域名发起；check-then-fetch 的 TOCTOU 与 qwen 同口径接受）。
 */
export async function assertPublicUrl(url: string, deps?: PublicUrlDeps): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`E_TRANSCRIBE_UNCONFIGURED: 转写端点不是合法 URL：${url}`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('E_TRANSCRIBE_UNCONFIGURED: 转写端点协议只允许 http/https')
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '') // IPv6 字面量去方括号
  if (BlockList.isIPv4(hostname) || BlockList.isIPv6(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new Error('E_TRANSCRIBE_BLOCKED: 转写端点指向内网/保留地址，已拒绝')
    }
    return parsed
  }
  const lookupFn = deps?.lookupFn ?? lookup
  let records: { address: string }[]
  try {
    records = await lookupFn(hostname, { all: true })
  } catch {
    throw new Error(`E_TRANSCRIBE_UPSTREAM: 转写端点域名解析失败：${hostname}`)
  }
  if (records.length === 0 || records.some((r) => isBlockedAddress(r.address))) {
    throw new Error('E_TRANSCRIBE_BLOCKED: 转写端点解析到内网/保留地址，已拒绝')
  }
  return parsed
}
