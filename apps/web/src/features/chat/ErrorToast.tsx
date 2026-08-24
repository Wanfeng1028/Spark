/**
 * ErrorToast（doc/02 §6.4 处理表「error → toast；fatal → 全屏错误态」）：
 * 消费当前会话 slice.lastError——非 fatal 右下角 toast（4s 自动消失，可手动关）；
 * fatal 全屏错误态（事件流不可用，无路可走——失败闭合的 UI 终态）。
 */
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { SessionId } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'

export interface ErrorToastProps {
  sid: SessionId
}

export function ErrorToast({ sid }: ErrorToastProps) {
  const lastError = useSessionStore((s) => s.byId[sid]?.lastError ?? null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (lastError === null) return
    if (lastError.fatal) return // fatal 不自动消失——全屏态必须人工处置
    setDismissed(null)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDismissed(lastError.message), 4000)
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [lastError])

  if (lastError === null) return null
  if (dismissed === lastError.message) return null

  if (lastError.fatal) {
    return (
      <div
        role="alert"
        className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/95 px-6 text-center"
      >
        <p className="font-mono text-xs uppercase tracking-wide text-[var(--spark-err)]">
          fatal · {lastError.scope}
        </p>
        <p className="max-w-md text-[13px] leading-relaxed text-foreground">{lastError.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground"
        >
          重新加载
        </button>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="absolute bottom-3 right-3 z-40 flex max-w-sm items-start gap-2 rounded-md border border-[var(--spark-err)]/40 bg-background px-3 py-2 shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-xs text-[var(--spark-err)]">{lastError.scope}</span>
        <p className="break-words text-xs leading-relaxed text-foreground">{lastError.message}</p>
      </div>
      <button
        type="button"
        aria-label="关闭错误提示"
        onClick={() => setDismissed(lastError.message)}
        className="shrink-0 text-muted-foreground/60 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
