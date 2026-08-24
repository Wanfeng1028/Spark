/**
 * TurnStatusBar（doc/02 §6.3）：ChatView 顶部悬浮细条——
 * `step N` · 运行中工具徽标（工具名×并发数）· 等待审批时 amber 文案；idle 时隐藏。
 * props 数据由 SessionPage 从 activeTurn + items 推导（工具名需查 items）。
 */
import { cn } from '@/lib/utils'

export interface TurnStatusBarProps {
  turn: {
    turnId: string
    stepCount: number
    /** 运行中工具名（含重复——并发数按同名计数） */
    runningTools: string[]
    /** permission.asked 置位（§6.4「activeTurn 标 waiting」） */
    waiting: boolean
  } | null
}

export function TurnStatusBar({ turn }: TurnStatusBarProps) {
  if (turn === null) return null

  const badge = (name: string, count: number): string => (count > 1 ? `${name}×${count}` : name)
  const counts = new Map<string, number>()
  for (const n of turn.runningTools) counts.set(n, (counts.get(n) ?? 0) + 1)

  return (
    <div
      role="status"
      className={cn(
        'flex h-6 items-center gap-2 rounded-md border border-border bg-background/95 px-2.5 font-mono text-xs text-muted-foreground',
        turn.waiting && 'border-[var(--spark-warn)]/50 text-[var(--spark-warn)]',
      )}
    >
      <span>step {turn.stepCount}</span>
      {[...counts.entries()].map(([name, count]) => (
        <span key={name} className="rounded-sm bg-muted px-1">
          {badge(name, count)}
        </span>
      ))}
      {turn.waiting && <span>等待审批</span>}
    </div>
  )
}
