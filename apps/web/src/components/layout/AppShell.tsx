import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CONNECTION_TEXT } from '@spark/protocol'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { SettingsSidebar } from '@/features/settings/SettingsSidebar'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { useTransport } from '@/transports/context'
import { cn } from '@/lib/utils'

/**
 * 工作台骨架（DESIGN.md §13.A，取代 §2 三行栅格）：
 * 主区（Sidebar 264px 可折叠 48px ｜ 内容列）+ StatusBar 24px 单行细条；
 * 会话态顶栏 44px 由 SessionPage 自带（标题+项目 chip），空态无顶栏。
 * 设置路由下左栏切 SettingsSidebar（§13.D 复用 264px，不折叠）。
 * 全局浮层与快捷键挂这里：Cmd/Ctrl+K 命令面板、Cmd/Ctrl+, 设置（doc/02 §6.3）；
 * 单键 c 新建会话 / / 搜索（工单 10.5①，非输入态生效，§6.11 登记）。
 * 断线重连条（DESIGN §9 顶部强提示）占一行 auto 行高，仅断线时出现。
 * 列宽过渡只服务侧栏折叠/展开（工单 10.14②）：进出设置的那一帧禁用过渡——
 * 否则内容列随 264px 列切换持续重排（视觉上的"逐行位移"来源之一）。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const status = useConnectionStore((s) => s.status)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const location = useLocation()
  const navigate = useNavigate()
  const { transport } = useTransport()
  const inSettings = location.pathname.startsWith('/settings')

  // 工单 10.14②：进出设置帧抑制列宽过渡。切换提交后移除 transition-property，
  // 进行中的过渡立即收敛到终值；≥duration-150 后恢复（折叠/展开动画不受影响）
  const [suppressColTransition, setSuppressColTransition] = useState(false)
  const prevInSettings = useRef(inSettings)
  useEffect(() => {
    if (prevInSettings.current === inSettings) return
    prevInSettings.current = inSettings
    setSuppressColTransition(true)
    const t = setTimeout(() => setSuppressColTransition(false), 200)
    return () => clearTimeout(t)
  }, [inSettings])

  // RT3-06（WO-087）：窄视口（375 预研档）一次性自动折叠侧栏——264px 列吃掉 2/3 宽，
  // 主内容区不可用。DESIGN §2 不做响应式断点：这里是挂载时的一次性缺省值（复用
  // toggleSidebar，持久化同口径），不是断点体系；用户可再展开，桌面 ≥640 无感。
  useEffect(() => {
    if (window.innerWidth < 640 && !useUiStore.getState().sidebarCollapsed) {
      useUiStore.getState().toggleSidebar()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod) {
        if (e.key === 'k' || e.key === 'K') {
          e.preventDefault()
          setPaletteOpen(!useUiStore.getState().paletteOpen)
        } else if (e.key === ',') {
          e.preventDefault()
          // 设置中心为全屏页（工单 6.4）；Cmd/Ctrl+, 直达外观页
          void navigate('/settings/appearance')
        }
        return
      }
      // 单键快捷键（工单 10.5①，§6.11 登记；GitHub/Linear 单键惯例）：仅非输入态、无修饰键
      if (e.altKey || e.shiftKey) return
      const target = e.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
      }
      if (e.key === 'c') {
        e.preventDefault()
        void transport.createSession().then((dto) => {
          void navigate(`/session/${dto.id}`)
        })
      } else if (e.key === '/') {
        e.preventDefault()
        void navigate('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen, navigate, transport])

  return (
    <div className="grid h-full grid-rows-[auto_1fr_24px] bg-background text-foreground">
      {status !== 'open' && <ReconnectBanner status={status} />}
      <div
        className={cn(
          'row-start-2 grid min-h-0 grid-cols-[auto_1fr]',
          !suppressColTransition && 'transition-[grid-template-columns] duration-150',
          !inSettings && collapsed ? 'grid-cols-[48px_1fr]' : 'grid-cols-[264px_1fr]',
        )}
      >
        {inSettings ? <SettingsSidebar /> : <Sidebar />}
        <main className="min-h-0 overflow-hidden">{children}</main>
      </div>
      <div className="row-start-3">
        <StatusBar />
      </div>
      <SettingsDialog />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

/** closed 态文案留本地（同 StatusBar CLOSED_TEXT）：三态已下沉 protocol，closed 触发源语义分叉，见 ui-copy.ts 头注释边界说明 1 */
const BANNER_CLOSED_TEXT = '连接已断开'

function ReconnectBanner({ status }: { status: 'connecting' | 'reconnecting' | 'closed' }) {
  const text = status === 'closed' ? BANNER_CLOSED_TEXT : CONNECTION_TEXT[status]
  return (
    <div
      role="status"
      className="row-start-1 flex h-6 items-center justify-center border-b border-[var(--spark-err)]/40 bg-[var(--spark-err)]/[0.06] px-3 text-xs text-[var(--spark-err)]"
    >
      {text}
    </div>
  )
}
