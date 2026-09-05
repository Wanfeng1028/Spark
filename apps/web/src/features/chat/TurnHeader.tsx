/**
 * 回合头（工单 10.4②）：「已工作 N 秒」——turn.started/completed 信封时间差。
 * 进行中（finishedAt 缺省）每秒实时计时；完成后定格。规格 "˅" 的折叠交互涉及
 * 回合内容收折，随后续工单交付，本版只做时长呈现（提交说明已注记）。
 */
import { useEffect, useState } from 'react'
import { formatTurnDuration } from '@/lib/time'

export interface TurnHeaderProps {
  startedAt: number
  /** turn.completed 回填；undefined = 进行中 */
  finishedAt: number | undefined
}

export function TurnHeader({ startedAt, finishedAt }: TurnHeaderProps) {
  const [now, setNow] = useState(() => Date.now())
  const running = finishedAt === undefined

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  const ms = Math.max(0, (finishedAt ?? now) - startedAt)
  return (
    <p className="py-0.5 font-mono text-xs text-muted-foreground/70">
      {running ? `工作中 · ${formatTurnDuration(ms)}` : `已工作 ${formatTurnDuration(ms)}`}
    </p>
  )
}

