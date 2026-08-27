/**
 * 标题栏占位 36px（DESIGN.md §2/§11）：现放应用名与主题切换（settings-store 驱动，
 * 与 StatusBar 右侧切换同步），Electron 期换自定义标题栏+窗口控制。
 * 主题三档循环：light → dark → system（§13.C；图标示意当前档，title 给人话说明）。
 */
import { Monitor, Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings'

const THEME_META = {
  light: { label: '浅色', next: '深色', icon: Sun },
  dark: { label: '深色', next: '跟随系统', icon: Moon },
  system: { label: '跟随系统', next: '浅色', icon: Monitor },
} as const

export function Titlebar() {
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const meta = THEME_META[theme]
  const Icon = meta.icon
  return (
    <header className="flex h-9 select-none items-center justify-between border-b border-border px-3">
      <span className="font-mono text-xs text-muted-foreground">Spark</span>
      <button
        type="button"
        aria-label={`主题：${meta.label}（点击切换为${meta.next}）`}
        title={`主题：${meta.label}（点击切换为${meta.next}）`}
        onClick={toggleTheme}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Icon className="size-4" />
      </button>
    </header>
  )
}
