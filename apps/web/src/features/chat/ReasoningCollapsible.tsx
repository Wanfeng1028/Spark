/**
 * ReasoningCollapsible（doc/02 §6.3 / DESIGN §8 / §13.H）：思考过程折叠面板。
 * 流式时自动展开、结束自动折叠；用户手动操作后优先于自动行为（manual ref 记忆）。
 * 摘要行=图标+"思考过程 · 持续了 N 秒"+首行文本（§13.H；流式中实时计时，工单 10.4③）。
 */
import { useEffect, useRef, useState } from 'react'
import { Brain, ChevronRight } from 'lucide-react'

export interface ReasoningCollapsibleProps {
  text: string
  streaming?: boolean | undefined
  /** 首帧 reasoning.delta 信封时间——流式实时计时（工单 10.4③） */
  startedAt?: number | undefined
  /** reasoning.ended 回填的时长——"持续了 N 秒"定格 */
  durationMs?: number | undefined
}

export function ReasoningCollapsible({
  text,
  streaming,
  startedAt,
  durationMs,
}: ReasoningCollapsibleProps) {
  const [open, setOpen] = useState<boolean>(streaming ?? false)
  const manual = useRef(false)
  const [now, setNow] = useState(() => Date.now())

  // 自动行为：streaming 变化时展开/折叠；手动操作过则不再干预
  useEffect(() => {
    if (manual.current) return
    setOpen(streaming ?? false)
  }, [streaming])

  // 流式中实时计时（§13.H"流式中实时计时"）
  useEffect(() => {
    if (streaming !== true || startedAt === undefined) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [streaming, startedAt])

  function toggle() {
    manual.current = true
    setOpen((v) => !v)
  }

  const firstLine = (text.split('\n')[0] ?? '').trim()
  const liveSec =
    streaming === true && startedAt !== undefined
      ? Math.max(0, Math.floor((now - startedAt) / 1000))
      : null

  return (
    <div className="my-1 rounded-md border border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left"
      >
        <ChevronRight
          className={
            'size-3.5 shrink-0 text-muted-foreground transition-transform ' +
            (open ? 'rotate-90' : '')
          }
        />
        <Brain className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {streaming === true ? '思考' : '思考过程'}
        </span>
        {liveSec !== null && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground/70">· {liveSec} 秒</span>
        )}
        {!streaming && durationMs !== undefined && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
            · 持续了 {Math.max(1, Math.round(durationMs / 1000))} 秒
          </span>
        )}
        <span className="truncate text-xs text-muted-foreground/70">{firstLine}</span>
      </button>
      {open && (
        <p className="border-t border-border px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {text}
        </p>
      )}
    </div>
  )
}
