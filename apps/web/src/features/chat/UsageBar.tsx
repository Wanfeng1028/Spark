/**
 * 上下文用量条（工单 6.6 / DESIGN §13.E）：Composer 上方细条——
 * 最近一轮 usage ÷ contextWindow；>80% 变 warn（阈值与引擎 compactionThreshold 同源）。
 * ratio=null（无 usage 或未知窗口）不渲染——禁假状态。
 */
import { cn } from '@/lib/utils'
import { CONTEXT_WARN_RATIO } from './context-usage'

export interface UsageBarProps {
  /** 0~1；null = 无数据不渲染 */
  ratio: number | null
  /** 悬浮详情（token 数等），由调用方拼好 */
  title?: string | undefined
}

export function UsageBar({ ratio, title }: UsageBarProps) {
  if (ratio === null) return null
  const pct = Math.min(100, Math.round(ratio * 100))
  const warn = ratio > CONTEXT_WARN_RATIO
  return (
    <div
      className="flex h-3 items-center gap-2"
      title={title ?? `上下文水位 ${pct}%${warn ? '（超过 80%，接近自动压缩阈值）' : ''}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="上下文水位"
    >
      <div className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            warn ? 'bg-[var(--spark-warn)]' : 'bg-primary/70',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'shrink-0 font-mono text-[11px] leading-none',
          warn ? 'text-[var(--spark-warn)]' : 'text-muted-foreground',
        )}
      >
        {pct}%
      </span>
    </div>
  )
}
