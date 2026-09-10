/**
 * Input（shadcn/ui copy-in：https://ui.shadcn.com/r/styles/new-york/input.json，MIT）。
 * 桌面化改造（DESIGN §13.B 输入框行 + frontend-component SKILL）：h-9.5（38px 输入
 * 高度档）、**圆角胶囊 rounded-full**（§13.B 控件档，工单 18.1）、13px 字号、去
 * shadow；焦点环交给 theme.css 全局 :focus-visible（2px 中性环，不用 accent）。
 * 底色按 §13.B 输入框底色条与 v2.15 AA 例外执行：**默认只取弱边框不取浅灰底**——
 * 本仓输入框几乎全数承载 placeholder（--muted-foreground 压 --secondary 算得
 * 4.44:1，低于 4.5:1 文本红线），无 placeholder 的触发器（如 ui/select）才上
 * bg-secondary；disabled = 前景 opacity 40% + not-allowed 光标（§13.B 三态）。
 */
import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9.5 w-full rounded-full border border-input bg-transparent px-3.5 text-[13px] transition-colors file:border-0 file:bg-transparent file:text-[13px] file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
