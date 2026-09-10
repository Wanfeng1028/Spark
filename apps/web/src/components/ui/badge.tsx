/**
 * Badge（shadcn/ui copy-in：https://ui.shadcn.com/r/styles/new-york/badge.json，MIT）。
 * 桌面化改造（DESIGN §13.B chip/徽章行 + frontend-component SKILL）：h-6（24px）、
 * **rounded-full 胶囊**、11px 字号 medium；去 shadow 与 hover 反馈（徽章非交互，
 * 三态只对可交互件）。variant 语义沿用上游四档；本仓手搓 chip 多为 outline 形态
 * （细边框 + meta 前景），是 18.4 迁移的默认落点。
 */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium [&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
