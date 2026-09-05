/**
 * 会话级推理档位选择器（DESIGN §13.E 底部工具条中位，工单 10.6）：
 * 三档（低/中/高，OpenAI reasoning_effort 映射）；当前档勾选，未设置显示「自动」
 * （= 未覆盖，按 provider/模型默认——禁假状态）。
 * 切换走 PUT /api/sessions/:id/effort（引擎内存态，下一 turn 生效）；
 * 显示态只随父级 onChange 成功后的 props 更新（禁乐观更新）。
 */
import { useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '@/hooks/useDismissOnOutsideClick'
import { Check, ChevronsUpDown, Gauge } from 'lucide-react'
import type { ReasoningEffort } from '@spark/protocol'

export interface EffortPickerProps {
  /** 当前生效档位；undefined = 未设置（显示「自动」） */
  current: ReasoningEffort | undefined
  onChange: (effort: ReasoningEffort) => Promise<ReasoningEffort>
  disabled?: boolean
}

const EFFORT_OPTIONS: ReadonlyArray<{ value: ReasoningEffort; label: string; hint: string }> = [
  { value: 'low', label: '低', hint: '快答——更少推理' },
  { value: 'medium', label: '中', hint: '均衡' },
  { value: 'high', label: '高', hint: '深思考——更多推理' },
]

export function EffortPicker({ current, onChange, disabled }: EffortPickerProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 容器外点击关闭（hook 合一——工单 R-E③）
  useDismissOnOutsideClick(
    open,
    () => setOpen(false),
    (t) => rootRef.current !== null && rootRef.current.contains(t),
  )

  const label = EFFORT_OPTIONS.find((o) => o.value === current)?.label ?? '自动'

  async function choose(value: ReasoningEffort): Promise<void> {
    setOpen(false)
    if (value === current || busy) return
    setBusy(true)
    try {
      await onChange(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled === true || busy}
        onClick={() => setOpen((v) => !v)}
        title={`推理档位：${label}（切换后下一轮生效）`}
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Gauge className="size-3.5 shrink-0" />
        {label}
        <ChevronsUpDown className="size-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <ul
          role="menu"
          aria-label="推理档位"
          className="absolute bottom-full left-0 z-20 mb-1.5 w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-md"
        >
          {EFFORT_OPTIONS.map((o) => (
            <li key={o.value} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={o.value === current}
                onMouseDown={(e) => e.preventDefault()} // 保输入焦点
                onClick={() => void choose(o.value)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-tight">{o.label}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">
                    {o.hint}
                  </span>
                </span>
                {o.value === current && <Check className="size-3.5 shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
