/**
 * Button（shadcn/ui copy-in：https://ui.shadcn.com/r/styles/new-york/button.json，MIT）。
 * 桌面化改造（DESIGN §3/§13.B + frontend-component SKILL）：sm 28 / md 32 / lg 38、
 * 13px 字号、圆角 6px、去 shadow；disabled = 前景 opacity 40% + not-allowed 光标
 * （§13.B 三态：hover 用 enabled: 限定，禁用态不出现悬浮反馈）；焦点环交给
 * theme.css 全局 :focus-visible。
 */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground enabled:hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground enabled:hover:bg-destructive/90',
        outline:
          'border border-input bg-background enabled:hover:bg-accent enabled:hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground enabled:hover:bg-secondary/80',
        ghost: 'enabled:hover:bg-accent enabled:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 enabled:hover:underline',
      },
      size: {
        default: 'h-8 px-3 text-[13px]',
        sm: 'h-7 px-2.5 text-[13px]',
        lg: 'h-9.5 px-4 text-[13px]',
        icon: 'h-7 w-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
