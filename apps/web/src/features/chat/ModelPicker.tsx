/**
 * 会话级模型选择器（DESIGN §13.E 底部工具条中位 / §13.D③，工单 6.5）：
 * 供应商/模型级联下拉——按供应商分组列出可选模型；当前模型高亮勾选。
 * 数据源=GET /api/models（ModelsDto）；切换走 PUT /api/sessions/:id/model（下一 turn 生效）。
 * 显示态只随父级 onChange 成功后的 props 更新（禁乐观更新）；失败由调用方 hint 反馈。
 */
import { useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '@/hooks/useDismissOnOutsideClick'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { ModelEntryDto, ModelProviderDto } from '@spark/protocol'
import { cn } from '@/lib/utils'

export interface ModelPickerProps {
  /** 当前生效模型（"provider/model"） */
  current: string
  models: ModelEntryDto[]
  providers: ModelProviderDto[]
  /** 切换模型（引擎内存态，下一 turn 生效）；resolve 回显生效值 */
  onChange: (model: string) => Promise<string>
  disabled?: boolean
}

/** 上下文窗口 badge 文案（§13.D③「200K 式」） */
function windowBadge(ctx: number): string {
  if (ctx >= 1_000_000) return `${Math.round(ctx / 1_000_000)}M`
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}K`
  return String(ctx)
}

export function ModelPicker({ current, models, providers, onChange, disabled }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 容器外点击关闭（hook 合一——工单 R-E③）
  useDismissOnOutsideClick(
    open,
    () => setOpen(false),
    (t) => rootRef.current !== null && rootRef.current.contains(t),
  )

  const label = providers.find((p) => current.startsWith(`${p.id}/`))?.label
  const modelName = current.slice(current.indexOf('/') + 1)

  // 分组：仅列已配置供应商下的可选模型（未配置供应商不可选——引擎 E_CONFIG）
  const configured = new Set(providers.filter((p) => p.configured).map((p) => p.id))
  const groups = providers
    .filter((p) => configured.has(p.id) && models.some((m) => m.provider === p.id))
    .map((p) => ({
      provider: p,
      entries: models.filter((m) => m.provider === p.id),
    }))

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={`当前模型：${current}（切换后下一轮生效）`}
        className="flex h-7 max-w-56 items-center gap-1 rounded-md px-1.5 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <span className="truncate">
          {label !== undefined ? `${label}/` : ''}
          {modelName}
        </span>
        <ChevronsUpDown className="size-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1.5 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
          <ul role="menu" aria-label="选择模型">
            {groups.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-muted-foreground">
                无可选模型——models.json 未配置任何供应商
              </li>
            )}
            {groups.map((g) => (
              <li key={g.provider.id}>
                <p className="px-2.5 pb-0.5 pt-2 text-[11px] text-muted-foreground">
                  {g.provider.label}
                  {g.provider.hasKey && (
                    <span
                      className="ml-1.5 inline-block size-1.5 rounded-full bg-[var(--spark-ok)] align-middle"
                      title="API Key 已配置"
                    />
                  )}
                </p>
                <ul>
                  {g.entries.map((m) => {
                    const value = `${m.provider}/${m.model}`
                    const active = value === current
                    return (
                      <li key={value}>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            setOpen(false)
                            if (!active) void onChange(value)
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {m.model}
                          </span>
                          <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">
                            {windowBadge(m.contextWindow)}
                          </span>
                          {active && <Check className="size-3.5 shrink-0" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
            切换对下一轮对话生效
          </p>
        </div>
      )}
    </div>
  )
}
