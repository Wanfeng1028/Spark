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
  // §13.L L.5（WO-064/069）：34px 圆钮贴右下、白底无边框一层柔影
  return (
    <button
      type="button"
      aria-label="回到底部"
      onClick={onClick}
      className="absolute right-4 bottom-4 flex size-[34px] items-center justify-center rounded-full bg-card text-muted-foreground shadow-[0_2px_10px_rgb(0_0_0/0.12)] hover:bg-accent hover:text-accent-foreground"
    >
      <ArrowDown className="size-4" />
    </button>
  )
}
