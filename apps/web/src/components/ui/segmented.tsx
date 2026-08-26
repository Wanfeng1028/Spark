/**
 * Segmented 分段控件（DESIGN §13.B：高 28px、圆角 6px、字号 12px、
 * 选中段 zinc-100 底（暗 zinc-800）= bg-secondary token；轨道带 1px border）。
 * 单选语义走 role=radiogroup/radio；禁用段保留占位（题目 title 说明原因）。
 */
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** 禁用并说明原因（如 busy 时 now 段不可用） */
  disabledReason?: string
}

export interface SegmentedProps<T extends string> {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  'aria-label'?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex h-7 items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
    >
      {options.map((o) => {
        const disabled = o.disabledReason !== undefined
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            title={o.disabledReason}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-6 rounded px-2 text-xs leading-none transition-colors',
              selected
                ? 'bg-secondary font-medium text-secondary-foreground'
                : 'text-muted-foreground enabled:hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-40',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
