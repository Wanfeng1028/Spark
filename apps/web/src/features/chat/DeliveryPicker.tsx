/**
 * 提交模式选择 chip（§13.L L.8，DSH 三批）：原卡内 Segmented（立即/插话/排队）上移为
 * Composer 卡片上方的下拉 chip——DSH hero 模式钮同构（28px 高、16px 圆角、transparent 底、
 * 13px/500 全对比度文本 + caption chevron）。语义与禁用矩阵不变（§13.E/§6.2.2）：
 * 空闲时 steer/queue 禁用（无进行中的轮）、运行中 now 禁用（轮已在跑）。
 * 显示值经 segmentDisplay 归一（空闲恒「立即」）；busy Enter 的 wire 值亦取显示档。
 */
import { useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '@/hooks/useDismissOnOutsideClick'
import { Check, ChevronDown, Zap } from 'lucide-react'
import type { Delivery } from '@spark/protocol'
import { cn } from '@/lib/utils'

const DELIVERY_OPTIONS: ReadonlyArray<{ value: Delivery; label: string; hint: string }> = [
  { value: 'now', label: '立即', hint: '立刻开新一轮' },
  { value: 'steer', label: '插话', hint: '注入当前进行中的轮' },
  { value: 'queue', label: '排队', hint: '下一轮开始时执行' },
]

/** 禁用原因（与原 Segmented disabledReason 同文案——§13.E 状态矩阵） */
function disabledReasonOf(value: Delivery, busy: boolean): string | null {
  if (busy && value === 'now') return '本轮已在进行'
  if (!busy && value === 'steer') return '无进行中的轮可注入'
  if (!busy && value === 'queue') return '空闲时无需排队'
  return null
}

export function DeliveryPicker({
  value,
  busy,
  disabled,
  onChange,
}: {
  /** 当前显示档（segmentDisplay 归一后的值） */
  value: Delivery
  busy: boolean
  disabled?: boolean
  onChange: (d: Delivery) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useDismissOnOutsideClick(
    open,
    () => setOpen(false),
    (t) => rootRef.current !== null && rootRef.current.contains(t),
  )

  const label = DELIVERY_OPTIONS.find((o) => o.value === value)?.label ?? '立即'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="提交模式"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={`提交模式：${label}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1 rounded-2xl px-2 text-[13px] leading-5 font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <Zap className="size-3.5 shrink-0" />
        {label}
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <ul
          role="menu"
          aria-label="提交模式"
          className="absolute bottom-full left-0 z-20 mb-1.5 w-56 overflow-hidden rounded-xl bg-popover py-1 shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_3px_8px_rgba(0,0,0,0.03),0_0_16px_rgba(0,0,0,0.02)] dark:shadow-[0_0_0_0.5px_rgb(255_255_255/0.16),0_3px_8px_rgb(0_0_0/0.25)]"
        >
          {DELIVERY_OPTIONS.map((o) => {
            const reason = disabledReasonOf(o.value, busy)
            const active = o.value === value
            return (
              <li key={o.value} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={reason !== null}
                  onMouseDown={(e) => e.preventDefault()} // 保输入焦点
                  onClick={() => {
                    setOpen(false)
                    if (!active) onChange(o.value)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent',
                    reason !== null && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-tight">{o.label}</span>
                    <span className="block text-[11px] leading-tight text-muted-foreground">
                      {reason ?? o.hint}
                    </span>
                  </span>
                  {active && <Check className="size-3.5 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
