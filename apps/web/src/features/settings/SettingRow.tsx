/**
 * 设置行与分组卡（DESIGN §13.D 页面骨架）：
 * 行=左"标题 13px + 说明 12px"右控件，行高 56~64px（py-4 + 控件 32）；
 * 相关行合入圆角 8px 分组卡，行间 1px border 分隔。
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SettingRowProps {
  title: string
  description?: string
  /** 右侧控件（Select/Switch/按钮等） */
  children?: ReactNode
  /** 占位行：右侧以 badge 代替控件（desktop 特化/后续工单） */
  placeholderBadge?: string
}

export function SettingRow({ title, description, children, placeholderBadge }: SettingRowProps) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] leading-tight">{title}</p>
        {description !== undefined && (
          <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{description}</p>
        )}
      </div>
      {placeholderBadge !== undefined ? (
        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
          {placeholderBadge}
        </span>
      ) : (
        children
      )}
    </div>
  )
}

export interface SettingGroupCardProps {
  /** 卡内行间 1px 分隔（首行无上边框） */
  children: ReactNode
  className?: string
}

export function SettingGroupCard({ children, className }: SettingGroupCardProps) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}
