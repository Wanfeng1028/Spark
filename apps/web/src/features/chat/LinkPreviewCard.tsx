/**
 * 链接预览卡（阶段十九工单 19.21 / V2-24）：assistant 正文中的 http(s) URL →
 * "favicon + 域名 + 标题"横条卡。数据源 = POST /api/link-preview（引擎侧 SSRF
 * 防护抓取——scheme 白名单/DNS 逐地址私网校验/重定向逐跳复检，见 engine
 * link-preview.ts）；抓取失败（title=null）退化为"域名-only"最小形态，不弹错
 * （预览失败不污染会话流）。每条 assistant 消息最多预览 3 个链接（防刷）。
 * 组件自取数（单 URL 单请求），错误静默降级为不可见——卡片是增强而非承诺。
 */
import { useEffect, useState } from 'react'
import type { LinkPreviewDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'

/** 正文中抽 http(s) URL（去重、截 3 个——预览是增强面不是列表） */
export function extractUrls(text: string, max = 3): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'））\]]+/g) ?? []
  const trimmed = found.map((u) => u.replace(/[.,;:!?]+$/, ''))
  return [...new Set(trimmed)].slice(0, max)
}

function LinkPreviewCard({ url }: { url: string }) {
  const { transport } = useTransport()
  const [data, setData] = useState<LinkPreviewDto | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    transport
      .fetchLinkPreview(url)
      .then((r) => {
        if (alive) setData(r)
      })
      .catch(() => {
        // 不安全/抓取失败：卡片整体不可见（不污染会话流——预览是增强非承诺）
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [url, transport])

  if (failed) return null
  if (data === null) {
    return (
      <div className="h-12 w-full max-w-sm animate-pulse rounded-lg border border-border bg-muted/40" />
    )
  }
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex h-12 w-full max-w-sm items-center gap-2.5 rounded-lg border border-border px-3 hover:bg-accent"
    >
      {/* favicon 缺省探测位 origin/favicon.ico；加载失败隐去（onError 隐藏 img 本身） */}
      <img
        src={data.iconUrl ?? undefined}
        alt=""
        aria-hidden
        className="h-4 w-4 shrink-0"
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden'
        }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-foreground">{data.title ?? data.domain}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{data.domain}</span>
      </span>
    </a>
  )
}

/** assistant 正文下的预览卡行（无 URL 时不渲染任何 DOM） */
export function LinkPreviewRow({ text }: { text: string }) {
  const urls = extractUrls(text)
  if (urls.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {urls.map((u) => (
        <LinkPreviewCard key={u} url={u} />
      ))}
    </div>
  )
}
