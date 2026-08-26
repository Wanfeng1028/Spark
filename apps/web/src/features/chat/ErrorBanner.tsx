/**
 * ErrorBanner（工单 6.7 / DESIGN §13.A 顶部细条）：错误人话 title + 原码折叠详情 + 重试。
 * SessionPage 装载失败等页面级错误出口统一走本组件（断线重连细条由 StatusBar/连接态承担）。
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { humanizeError } from '@/lib/error-copy'

export interface ErrorBannerProps {
  /** 原始错误消息（"E_CODE: rest" 或引擎人话） */
  message: string
  /** 重试回调（缺省不渲染重试钮） */
  onRetry?: () => void
  /** 重试钮文案（默认「重试」） */
  retryLabel?: string
}

export function ErrorBanner({ message, onRetry, retryLabel = '重试' }: ErrorBannerProps) {
  const [open, setOpen] = useState(false)
  const copy = humanizeError(message)
  return (
    <div
      role="alert"
      className="flex min-h-7 flex-wrap items-center gap-2 rounded-md border border-[var(--spark-err)]/40 bg-[var(--spark-err)]/[0.05] px-2.5 py-1 text-xs"
    >
      <span className="min-w-0 flex-1 break-words text-foreground">{copy.title}</span>
      {copy.detail !== null && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {copy.code}
        </button>
      )}
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 hover:bg-accent',
          )}
        >
          <RotateCcw className="size-3" />
          {retryLabel}
        </button>
      )}
      {open && copy.detail !== null && (
        <p className="w-full break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
          {copy.detail}
        </p>
      )}
    </div>
  )
}
