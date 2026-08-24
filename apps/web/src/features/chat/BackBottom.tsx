/**
 * BackBottom（doc/02 §6.2.2）：用户上滚暂停自动跟随时悬浮的「回到底部」按钮。
 * 纯展示组件——显隐与滚动动作由 ChatView（Virtuoso atBottomStateChange）驱动。
 */
import { ArrowDown } from 'lucide-react'

export interface BackBottomProps {
  show: boolean
  onClick: () => void
}

export function BackBottom({ show, onClick }: BackBottomProps) {
  if (!show) return null
  return (
    <button
      type="button"
      aria-label="回到底部"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    >
      <ArrowDown className="size-4" />
    </button>
  )
}
