/**
 * 标题栏占位 36px（DESIGN.md §2/§11）：现放应用名与主题切换（settings-store 驱动，
 * 与 StatusBar 右侧切换同步），Electron 期换自定义标题栏+窗口控制。
 */
import { Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings'

export function Titlebar() {
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  return (
    <header className="flex h-9 select-none items-center justify-between border-b border-border px-3">
      <span className="font-mono text-xs text-muted-foreground">Spark</span>
      <button
        type="button"
        aria-label="切换主题"
        onClick={toggleTheme}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </header>
  )
}
