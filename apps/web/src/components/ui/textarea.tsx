/**
 * Textarea（shadcn/ui copy-in：https://ui.shadcn.com/r/styles/new-york/textarea.json，MIT）。
 * 桌面化改造（DESIGN §13.B + frontend-component SKILL）：多行控件**不取胶囊**——
 * 圆角取 §13.B 封闭集 8px 小件档（工单 18.3 判定：胶囊随行数增长会变形，多行编辑器
 * 收在 12px 分组卡内取 8px 成体系；单行输入用 ui/Input），min-h-15 起步、高度随行数
 * 自增（§13.B 输入框行"textarea 多行 auto"）；13px 字号、去 shadow；底色与 disabled
 * 口径同 ui/Input 头注（v2.15 AA 例外：承载 placeholder 不上浅灰底）；焦点环交给
 * theme.css 全局 :focus-visible（2px 中性环，不用 accent）。
 */
import * as React from 'react'

import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-15 w-full rounded-lg border border-input bg-transparent px-3.5 py-2 text-[13px] transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
