/**
 * Select 下拉（原生 select 桌面化：§13.B 输入高度 32px、圆角 6px、13px 字号；
 * 选项弹层走系统原生——桌面应用感，无自定义弹层依赖）。
 */
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
}

export interface SelectProps<T extends string | number> {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  'aria-label'?: string
  disabled?: boolean
  className?: string
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  disabled,
  className,
}: SelectProps<T>) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <select
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value
          const match = options.find((o) => String(o.value) === raw)
          if (match !== undefined) onChange(match.value)
        }}
        className="h-8 w-full appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-[13px] outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-40"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
