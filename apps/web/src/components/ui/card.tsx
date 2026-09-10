/**
 * Card（shadcn/ui copy-in：https://ui.shadcn.com/r/styles/new-york/card.json，MIT）。
 * 桌面化改造（DESIGN §13.B 卡片行 + frontend-component SKILL）：1px border、**不用
 * 阴影**（§3 分隔优先边框与留白）；圆角走 §13.B 封闭集两档卡位——variant `grouped`
 * = 12px 分组卡（默认，设置族行分组）、`info` = 16px 大信息卡（§13.B，对齐 §13.J
 * 移动端白卡）、`flush` = 16px 无边框底色差（§13.J.0 形态，bg-secondary 靠底色分层，
 * 用于配对/自动化页信息卡）；内边距上游 p-6 收紧为 p-4（§13.B 卡片内边距 12~16px），
 * 标题 14px semibold（§13.B 区块标题）、说明 12px meta 色。
 */
import * as React from 'react'

import { cn } from '@/lib/utils'

const cardVariants = {
  grouped: 'rounded-xl border border-border bg-card',
  info: 'rounded-2xl border border-border bg-card',
  flush: 'rounded-2xl border-0 bg-secondary',
} as const

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof cardVariants
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'grouped', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-card-foreground', cardVariants[variant], className)}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm font-semibold leading-none', className)} {...props} />
  ),
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-xs text-muted-foreground', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-4 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
