/**
 * ReasoningCollapsible（doc/02 §6.3 / DESIGN §8）：思考过程折叠面板。
 * 流式时自动展开、结束自动折叠；用户手动操作后优先于自动行为（manual ref 记忆）。
 * 摘要行显示首行文本（token 数无数据源，阶段三网关接入后补）。
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

export interface ReasoningCollapsibleProps {
  text: string
  streaming?: boolean | undefined
  durationMs?: number | undefined
}

export function ReasoningCollapsible({ text, streaming, durationMs }: ReasoningCollapsibleProps) {
  const [open, setOpen] = useState<boolean>(streaming ?? false)
  const manual = useRef(false)

  // 自动行为：streaming 变化时展开/折叠；手动操作过则不再干预
  useEffect(() => {
    if (manual.current) return
    setOpen(streaming ?? false)
  }, [streaming])

  function toggle() {
    manual.current = true
    setOpen((v) => !v)
  }

  const firstLine = (text.split('\n')[0] ?? '').trim()

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
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {streaming ? '思考中…' : '思考过程'}
        </span>
        {!streaming && durationMs !== undefined && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
            · {(durationMs / 1000).toFixed(1)}s
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
