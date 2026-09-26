/**
 * 链接预览 SSRF 防护单测（阶段十九工单 19.21 / V2-24）：
 * 私网地址表逐段覆盖 / scheme 白名单 / DNS 解析到私网的 rebinding 拒绝 /
 * 解析失败的宽容语义（回最小卡形态）/ 缓存命中。
 * 不发真实网络请求（外网抓取走查留用户；单测只打不了网的假主机名）。
 */
import { describe, expect, test } from 'vitest'
import { fetchLinkPreview, isPrivateAddress } from '../src/link-preview.js'

describe('isPrivateAddress（19.21 SSRF 防护表）', () => {
  test('IPv4 私网/保留段全部判真', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true)
    expect(isPrivateAddress('10.1.2.3')).toBe(true)
    expect(isPrivateAddress('172.16.0.1')).toBe(true)
    expect(isPrivateAddress('172.31.255.255')).toBe(true)
    expect(isPrivateAddress('192.168.1.1')).toBe(true)
    expect(isPrivateAddress('169.254.1.1')).toBe(true)
    expect(isPrivateAddress('0.0.0.0')).toBe(true)
    expect(isPrivateAddress('100.64.0.1')).toBe(true) // CGNAT
    expect(isPrivateAddress('224.0.0.1')).toBe(true) // multicast
    expect(isPrivateAddress('240.0.0.1')).toBe(true) // reserved
  })

  test('IPv4 公网判假', () => {
    expect(isPrivateAddress('1.2.3.4')).toBe(false)
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
    expect(isPrivateAddress('172.32.0.1')).toBe(false) // 172.16/12 之外
    expect(isPrivateAddress('100.63.0.1')).toBe(false) // CGNAT 之外
  })

  test('IPv6 特殊段判真、公网判假', () => {
    expect(isPrivateAddress('::1')).toBe(true)
    expect(isPrivateAddress('::')).toBe(true)
    expect(isPrivateAddress('fe80::1')).toBe(true)
    expect(isPrivateAddress('fc00::1')).toBe(true)
    expect(isPrivateAddress('fd12:3456::1')).toBe(true)
    expect(isPrivateAddress('ff02::1')).toBe(true)
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true) // IPv4-mapped 私网
    expect(isPrivateAddress('2606:4700::1')).toBe(false)
  })
})

describe('fetchLinkPreview（19.21）', () => {
  test('非 http/https scheme → E_LINK_PREVIEW_UNSAFE', async () => {
    await expect(fetchLinkPreview('file:///etc/passwd')).rejects.toThrow('E_LINK_PREVIEW_UNSAFE')
    await expect(fetchLinkPreview('ftp://example.com/x')).rejects.toThrow('E_LINK_PREVIEW_UNSAFE')
  })

  test('DNS 解析到回环 → E_LINK_PREVIEW_UNSAFE（rebinding 面；127.0.0.1 无需网络）', async () => {
    await expect(fetchLinkPreview('http://127.0.0.1:4318/secret')).rejects.toThrow(
      'E_LINK_PREVIEW_UNSAFE',
    )
    await expect(fetchLinkPreview('http://[::1]:4318/')).rejects.toThrow('E_LINK_PREVIEW_UNSAFE')
    await expect(fetchLinkPreview('http://10.0.0.1/x')).rejects.toThrow('E_LINK_PREVIEW_UNSAFE')
    await expect(fetchLinkPreview('http://192.168.1.1/admin')).rejects.toThrow('E_LINK_PREVIEW_UNSAFE')
  })

  test('解析失败的假主机名 → 最小卡形态（不抛、title/icon null、域名在）', async () => {
    const r = await fetchLinkPreview('http://spark-link-preview-nonexistent.invalid/x')
    expect(r.domain).toBe('spark-link-preview-nonexistent.invalid')
    expect(r.title).toBeNull()
    expect(r.iconUrl).toBeNull()
  })

  test('同 URL 二次调用命中缓存（同一对象引用）', async () => {
    const url = 'http://spark-link-preview-cache.invalid/a'
    const a = await fetchLinkPreview(url)
    const b = await fetchLinkPreview(url)
    expect(b).toBe(a)
  })

})
