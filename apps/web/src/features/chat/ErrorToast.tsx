/**
 * ErrorToast（doc/02 §6.4 处理表「error → toast」）：
 * 消费当前会话 slice.lastError——右下角 toast（4s 自动消失，可手动关）。
 * 工单 6.7：message 带 E_ 码走文案表（人话 title + 原码折叠详情，单一来源 error-copy.ts）。
 * LA-62：原「fatal → 全屏错误态」删除——引擎侧不存在 fatal:true 发射点（error 事件
 * 无一携带 fatal），全屏态是永不可达的死 UI；reducer 的 fatal 位保留（协议面零变化），
 * 将来真有不可恢复场景再连发射点一起恢复。
 */
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { SessionId } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'
import { humanizeError } from '@/lib/error-copy'

export interface ErrorToastProps {
  sid: SessionId
  /** LA-62尾：回放中（冷启动/重连全量回放）——历史 error 是既成事实的旧闻，
   *  逐条弹 toast 是噪声；静默消费（slice 里保留，UI 不提示） */
  replaying?: boolean | undefined
}

export function ErrorToast({ sid, replaying }: ErrorToastProps) {
  const lastError = useSessionStore((s) => s.byId[sid]?.lastError ?? null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (lastError === null) return
    setDismissed(null)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDismissed(lastError.message), 4000)
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [lastError])

  if (lastError === null) return null
  if (replaying === true) return null // 回放期抑制（LA-62尾）
  if (dismissed === lastError.message) return null

  const copy = humanizeError(lastError.message)

  return (
    <div
      role="alert"
      className="absolute bottom-3 right-3 z-40 flex max-w-sm items-start gap-2 rounded-xl border border-[var(--spark-err)]/40 bg-background px-3 py-2 shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-xs text-[var(--spark-err)]">{lastError.scope}</span>
        <p className="break-words text-xs leading-relaxed text-foreground">{copy.title}</p>
        {copy.detail !== null && (
          <p className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
            {copy.detail}
          </p>
        )}
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
