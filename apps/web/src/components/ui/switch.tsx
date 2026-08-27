/**
 * Switch 开关（DESIGN §13.B：高 32 控件系内、轨道 16px、圆角全弧；
 * zinc 中性三态；role=switch 无障碍语义）。即存即生效场景专用。
 */
import { cn } from '@/lib/utils'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  'aria-label'?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, 'aria-label': ariaLabel, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-primary bg-primary' : 'border-border bg-secondary',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute size-3 rounded-full transition-[left] duration-150',
          checked ? 'left-3.5 bg-primary-foreground' : 'left-0.5 bg-muted-foreground',
        )}
      />
    </button>
  )
}
