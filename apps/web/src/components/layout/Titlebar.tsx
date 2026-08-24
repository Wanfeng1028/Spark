import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'

/**
 * 标题栏占位 36px（DESIGN.md §2/§11）：现放应用名与主题切换，Electron 期换自定义标题栏+窗口控制。
 * dark 默认；切换即改 html class（ThemeProvider 到设置弹窗时再抽）。
 */
export function Titlebar() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    document.documentElement.classList.toggle('dark')
    setDark(document.documentElement.classList.contains('dark'))
  }
  return (
    <header className="flex h-9 select-none items-center justify-between border-b border-border px-3">
      <span className="font-mono text-xs text-muted-foreground">Spark</span>
      <button
        type="button"
        aria-label="切换主题"
        onClick={toggle}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </header>
  )
}
