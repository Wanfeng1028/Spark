/**
 * 状态条 28px（DESIGN.md §2 / doc/02 §6.3）：
 * 左起：连接状态点+文案 · 当前会话模型名 · seq 水位 · token 累计（含 checkpoint 短暂徽标）；
 * 右起：主题切换（设置齿轮是工单 6 SettingsDialog 的触发器）。
 * 数据源：connection-store / session-store 选择器（组件不直接 fetch，DESIGN §9）。
 */
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useConnectionStore } from '@/stores/connection'
import { useSettingsStore } from '@/stores/settings'
import { useActiveSlice } from '@/stores/session'
import { cn } from '@/lib/utils'

const CONNECTION_TEXT = {
  connecting: '连接中…',
  open: '已连接',
  reconnecting: '已断线，重连中…',
  closed: '已断开',
} as const

function ConnectionDot({ status }: { status: keyof typeof CONNECTION_TEXT }) {
  // DESIGN §8 状态点：绿=连接、红=断线；connecting 灰
  const cls =
    status === 'open'
      ? 'bg-[var(--spark-ok)]'
      : status === 'connecting'
        ? 'bg-muted-foreground/50'
        : 'bg-[var(--spark-err)]'
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', cls)} />
}

/** token 累计的紧凑展示（k=千位截断；title 悬浮给精确值） */
function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/** checkpoint.created 的短暂徽标（§6.4：StatusBar 短暂显示后淡出） */
function CheckpointBadge({ checkpointId }: { checkpointId: string }) {
  const [show, setShow] = useState(true)
  useEffect(() => {
    setShow(true)
    const t = setTimeout(() => setShow(false), 2500)
    return () => clearTimeout(t)
  }, [checkpointId])
  if (!show) return null
  return (
    <span className="rounded-sm border border-border px-1 text-[11px] leading-4 text-muted-foreground">
      ckpt {checkpointId.slice(4, 12)}
    </span>
  )
}

export function StatusBar() {
  const status = useConnectionStore((s) => s.status)
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const slice = useActiveSlice()

  const usage = slice?.usageTotal
  const checkpoint = slice?.lastCheckpoint

  return (
    <footer className="flex h-7 items-center justify-between border-t border-border px-3 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex shrink-0 items-center gap-1.5">
          <ConnectionDot status={status} />
          <span className={status === 'reconnecting' || status === 'closed' ? 'text-[var(--spark-err)]' : undefined}>
            {CONNECTION_TEXT[status]}
          </span>
        </span>
        <span className="shrink-0 font-mono" title="当前会话模型">
          {slice === null || slice.meta.model === '' ? '—' : slice.meta.model}
        </span>
        <span className="shrink-0 font-mono" title="事件序号水位">
          seq {slice?.lastSeq ?? 0}
        </span>
        {usage !== undefined && (
          <span
            className="shrink-0 font-mono"
            title={`输入 ${usage.inputTokens} · 输出 ${usage.outputTokens} · 思考 ${usage.reasoningTokens ?? 0}`}
          >
            ↑{fmtTokens(usage.inputTokens)} ↓{fmtTokens(usage.outputTokens)}
          </span>
        )}
        {checkpoint != null && <CheckpointBadge checkpointId={checkpoint.checkpointId} />}
      </div>
      <button
        type="button"
        aria-label="切换主题"
        onClick={toggleTheme}
        className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      </button>
    </footer>
  )
}
