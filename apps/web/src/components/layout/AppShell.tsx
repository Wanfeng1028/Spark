import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { SettingsSidebar } from '@/features/settings/SettingsSidebar'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { cn } from '@/lib/utils'

/**
 * 工作台骨架（DESIGN.md §13.A，取代 §2 三行栅格）：
 * 主区（Sidebar 264px 可折叠 48px ｜ 内容列）+ StatusBar 24px 单行细条；
 * 会话态顶栏 44px 由 SessionPage 自带（标题+项目 chip），空态无顶栏。
 * 设置路由下左栏切 SettingsSidebar（§13.D 复用 264px，不折叠）。
 * 全局浮层与快捷键挂这里：Cmd/Ctrl+K 命令面板、Cmd/Ctrl+, 设置（doc/02 §6.3）。
 * 断线重连条（DESIGN §9 顶部强提示）占一行 auto 行高，仅断线时出现。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const status = useConnectionStore((s) => s.status)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const location = useLocation()
  const navigate = useNavigate()
  const inSettings = location.pathname.startsWith('/settings')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        setPaletteOpen(!useUiStore.getState().paletteOpen)
      } else if (e.key === ',') {
        e.preventDefault()
        // 设置中心为全屏页（工单 6.4）；Cmd/Ctrl+, 直达外观页
        void navigate('/settings/appearance')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen, navigate])

  return (
    <div className="grid h-full grid-rows-[auto_1fr_24px] bg-background text-foreground">
      {status !== 'open' && <ReconnectBanner status={status} />}
      <div
        className={cn(
          'grid min-h-0 grid-cols-[auto_1fr] transition-[grid-template-columns] duration-150',
          !inSettings && collapsed ? 'grid-cols-[48px_1fr]' : 'grid-cols-[264px_1fr]',
        )}
      >
        {inSettings ? <SettingsSidebar /> : <Sidebar />}
        <main className="min-h-0 overflow-hidden">{children}</main>
      </div>
      <StatusBar />
      <SettingsDialog />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

function ReconnectBanner({ status }: { status: 'connecting' | 'reconnecting' | 'closed' }) {
  const text =
    status === 'reconnecting'
      ? '已断线，重连中…'
      : status === 'connecting'
        ? '连接中…'
        : '连接已断开'
  return (
    <div
      role="status"
      className="flex h-6 items-center justify-center border-b border-[var(--spark-err)]/40 bg-[var(--spark-err)]/[0.06] px-3 text-xs text-[var(--spark-err)]"
    >
      {text}
    </div>
  )
}
