/**
 * 状态条 24px 单行细条（DESIGN.md §13.A，取代 §2 的 28px）：
 * 左起：连接状态点+文案 · 当前会话模型名 · seq 水位 · token 累计 · 上下文水位百分比（工单 6.6：
 * 最近一轮 usage ÷ contextWindow，>80% 转 warn——阈值与引擎 compactionThreshold 同源）· 提交模式；
 * 右起：主题切换 · 设置齿轮（SettingsDialog 触发器，doc/02 §6.2.3）。
 * 数据源：connection-store / session-store / settings-store 选择器（组件不直接 fetch，DESIGN §9）。
 */
import { useEffect, useState } from 'react'
import { Monitor, Moon, Settings, Sun } from 'lucide-react'
import { CONNECTION_TEXT, fmtTokens } from '@spark/protocol'
import { useConnectionStore, type ConnectionStatus } from '@/stores/connection'
import { useSettingsStore } from '@/stores/settings'
import { useActiveSlice } from '@/stores/session'
import { useModelsStore } from '@/stores/models-store'
import { useTransport } from '@/transports/context'
import { useUiStore } from '@/stores/ui'
import { CONTEXT_WARN_RATIO, contextRatio, contextTokensOf, contextWindowOf } from '@/features/chat/context-usage'
import { cn } from '@/lib/utils'

/** closed 态文案留本地：三态已下沉 protocol CONNECTION_TEXT（工单 R-B），closed 的两个触发源语义分叉，见 ui-copy.ts 头注释边界说明 1 */
const CLOSED_TEXT = '已断开'

/** 主题三档循环（§13.C）：light → dark → system */
const THEME_META = {
  light: { label: '浅色', next: '深色', icon: Sun },
  dark: { label: '深色', next: '跟随系统', icon: Moon },
  system: { label: '跟随系统', next: '浅色', icon: Monitor },
} as const

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  // DESIGN §8 状态点：绿=连接、红=断线；connecting 灰
  const cls =
    status === 'open'
      ? 'bg-[var(--spark-ok)]'
      : status === 'connecting'
        ? 'bg-muted-foreground/50'
        : 'bg-[var(--spark-err)]'
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', cls)} />
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
  const delivery = useSettingsStore((s) => s.defaultDelivery)
  const slice = useActiveSlice()
  const models = useModelsStore((s) => s.dto)
  const { transport } = useTransport()
  // 目录幂等装载（SessionPage 同源共用；失败静默下次重试）
  useEffect(() => {
    useModelsStore.getState().load(transport)
  }, [transport])

  const usage = slice?.usageTotal
  const checkpoint = slice?.lastCheckpoint
  const themeMeta = THEME_META[theme]
  const ThemeIcon = themeMeta.icon

  // 上下文水位（工单 6.6）：无 usage/未知窗口 → null 不显示
  const ratio =
    slice === null ? null : contextRatio(slice.contextUsage, contextWindowOf(models, slice.meta.model))
  const warn = ratio !== null && ratio > CONTEXT_WARN_RATIO

  return (
    <footer className="flex h-6 items-center justify-between border-t border-border px-3 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex shrink-0 items-center gap-1.5">
          <ConnectionDot status={status} />
          <span className={status === 'reconnecting' || status === 'closed' ? 'text-[var(--spark-err)]' : undefined}>
            {status === 'closed' ? CLOSED_TEXT : CONNECTION_TEXT[status]}
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
        {ratio !== null && (
          <span
            className={cn(
              'shrink-0 font-mono',
              warn && 'text-[var(--spark-warn)]',
            )}
            title={`上下文水位（最近一轮 usage 估算）——${
              slice?.contextUsage !== null && slice?.contextUsage !== undefined
                ? `约 ${contextTokensOf(slice.contextUsage)} tokens ÷ 窗口`
                : '最近一轮 usage'
            }${warn ? '，已超 80%（接近自动压缩阈值）' : ''}`}
          >
            水位 {Math.min(100, Math.round(ratio * 100))}%
          </span>
        )}
        <span
          className="shrink-0 font-mono"
          title={`提交模式（settings.defaultDelivery）——${delivery === 'now' ? '空闲时 Enter 直发' : delivery === 'steer' ? '进行中 Enter 插话注入当前轮' : 'Enter 排队下一轮执行'}`}
        >
          {delivery}
        </span>
        {checkpoint != null && <CheckpointBadge checkpointId={checkpoint.checkpointId} />}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={`主题：${themeMeta.label}（点击切换为${themeMeta.next}）`}
          title={`主题：${themeMeta.label}（点击切换为${themeMeta.next}）`}
          onClick={toggleTheme}
          className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ThemeIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="打开设置"
          title="设置 (Cmd/Ctrl+,)"
          onClick={() => useUiStore.getState().setSettingsOpen(true)}
          className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Settings className="size-3.5" />
        </button>
      </div>
    </footer>
  )
}
