/**
 * ToolGroupRow（工单 10.4④）：连续同类别工具调用的聚合行——
 * 头部「类别词 · N 次」（运行中带 spinner、含失败/拒绝注记），点击展开逐个 ToolCard。
 * 展开态为本行局部状态（虚拟化回收后重置——v1 可接受，展开是瞬态查看动作）。
 */
import { useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToolCard } from './ToolCard'
import type { ToolItem } from './chat-flow-rows'

export interface ToolGroupRowProps {
  category: string
  tools: ToolItem[]
  /** 搜索跳转定位闪烁（工单 7.13）：命中组内任一工具时整组短暂底色 */
  highlight?: boolean
}

export function ToolGroupRow({ category, tools, highlight }: ToolGroupRowProps) {
  const [open, setOpen] = useState(false)
  const running = tools.some((t) => t.status === 'running')
  const denied = tools.some(
    (t) =>
      t.status !== 'running' &&
      typeof t.output === 'object' &&
      t.output !== null &&
      (t.output as Record<string, unknown>).code === 'E_PERMISSION',
  )
  const failed = tools.some((t) => t.status === 'error')

  return (
    <div className={cn('my-1', highlight === true && 'rounded-md bg-secondary ring-1 ring-border')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-1.5 rounded-md border border-border px-2 text-left"
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        {running && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
        <span className="shrink-0 text-xs">{category}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">· {tools.length} 次</span>
        {!running && (failed || denied) && (
          <span className="shrink-0 font-mono text-xs text-[var(--spark-err)]">
            {failed ? '含失败' : '含拒绝'}
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-col">
          {tools.map((t) => (
            <ToolCard
              key={t.callId}
              name={t.name}
              input={t.input}
              status={t.status}
              progressBuf={t.progressBuf}
              output={t.output}
              isError={t.status === 'error'}
              {...(t.durationMs !== undefined ? { durationMs: t.durationMs } : {})}
            />
          ))}
        </div>
      )}
    </div>
  )
}
