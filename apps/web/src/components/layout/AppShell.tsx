import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CONNECTION_TEXT, KEYMAP_ACTIONS } from '@spark/protocol'
import { Sidebar, sidebarModeOf } from './Sidebar'
import { StatusBar } from './StatusBar'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { SettingsSidebar } from '@/features/settings/SettingsSidebar'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { AuxSessionDrawer } from '@/features/chat/AuxSessionDrawer'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'
import { useEffectiveKeymap, strokeOf } from '@/hooks/useEffectiveKeymap'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useTransport } from '@/transports/context'
import { cn } from '@/lib/utils'

/**
 * 工作台骨架（DESIGN.md §13.A，取代 §2 三行栅格）：
 * 主区（Sidebar 264px 可折叠 48px ｜ 内容列）+ StatusBar 24px 单行细条；
 * 会话态顶栏 44px 由 SessionPage 自带（标题+项目 chip），空态无顶栏。
 * 设置路由下左栏切 SettingsSidebar（§13.D 复用 264px，不折叠）。
 * 全局浮层与快捷键挂这里：命令面板与设置面两个快捷键查**生效键位表**（19.39 第二批——
 * 缺省 Cmd/Ctrl+K 与 Cmd/Ctrl+,，用户可在设置中心「键位」页改，此处不再硬编码键名；
 * doc/02 §6.3）；单键 c 新建会话 / / 搜索仍硬编码（KEYMAP 未登记这两条，见 19.39 限制登记）。
 * 断线重连条（DESIGN §9 顶部强提示）占一行 auto 行高，仅断线时出现。
 * 列宽过渡只服务侧栏折叠/展开（工单 10.14②）：进出设置的那一帧禁用过渡——
 * 否则内容列随 264px 列切换持续重排（视觉上的"逐行位移"来源之一）。
 * 工单 19.40：侧栏形态由 sidebarModeOf(折叠态, 窄视口) 推导，264px 列只在 inline 形态
 * 出现（窄屏展开态是覆盖式抽屉，栅格列仍 48px，主区不被挤扁）。
 * 工单 19.36：辅助会话抽屉挂在会话路由内（非模态第二个 SessionSurface 实例）。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const status = useConnectionStore((s) => s.status)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const narrow = useNarrowViewport()
  const location = useLocation()
  const navigate = useNavigate()
  const { transport } = useTransport()
  /** 生效键位表（19.39 第二批）：覆盖层 boot 时从服务端装载进 ui store，键位页保存后写回同一份，
   *  故改键当场生效不必重载。只有 KEYMAP 带 `spec` 的条目可改（见 protocol/keymap.ts） */
  const { presses } = useEffectiveKeymap()
  const setKeymapOverrides = useUiStore((s) => s.setKeymapOverrides)
  const { data: keymapSettings } = useTransportQuery((t) => t.getSettings())
  useEffect(() => {
    if (keymapSettings === null) return
    setKeymapOverrides(keymapSettings.ui?.keymap?.overrides ?? [])
  }, [keymapSettings, setKeymapOverrides])
  const inSettings = location.pathname.startsWith('/settings')
  /** 会话路由内（辅助会话抽屉的挂载域，工单 19.36：入口只在会话页，别处不飘面板） */
  const onSessionRoute = location.pathname.startsWith('/session/')
  const auxOpen = useUiStore((s) => s.auxOpen)
  /** 侧栏三形态（工单 19.40）：折叠=rail、展开且窄屏=overlay 抽屉、否则 inline 常规列 */
  const sidebarMode = sidebarModeOf(collapsed, narrow)

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

  // RT3-06（WO-087）+ 工单 19.40（V2-39）：窄视口（375 预研档）折叠侧栏——264px 列吃掉
  // 2/3 宽，主内容区不可用。原为挂载时一次性判定，drawer 化后跟随缩放（依赖 narrow）：
  // 进入窄屏即收成 48px 图标轨，用户再点展开才以 overlay 抽屉呈现（展开态在窄屏不占列宽）。
  // DESIGN §2 不做响应式断点：这里仍是单一 640px 缺省值判定（持久化同口径），不是断点体系。
  useEffect(() => {
    if (narrow && !useUiStore.getState().sidebarCollapsed) {
      useUiStore.getState().setSidebarCollapsed(true)
    }
  }, [narrow])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const stroke = strokeOf(e)
      if (e.metaKey || e.ctrlKey) {
        // 键名不再硬编码：查生效表，用户在键位页改过就按改后的键触发（19.39 第二批）。
        // 比对是四位修饰键全等，故 Ctrl+Shift+K 不再触发命令面板——可改键位后必须精确匹配，
        // 否则用户把某条改绑到 'Ctrl+Shift+K' 就会与旧的宽松匹配同时命中。
        if (presses(KEYMAP_ACTIONS.palette, stroke)) {
          e.preventDefault()
          setPaletteOpen(!useUiStore.getState().paletteOpen)
        } else if (presses(KEYMAP_ACTIONS.settings, stroke)) {
          e.preventDefault()
          // 设置中心为全屏页（工单 6.4）；缺省 Cmd/Ctrl+, 直达外观页
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
  }, [setPaletteOpen, navigate, transport, presses])

  // P2-3（round5）：375 预研档设置页双栏挤压——窄视口一次性判定（同 WO-087 一次性缺省
  // 口径，非响应式断点体系），设置导航转顶部横排 chip 条、内容列独占全宽；桌面/iPad 双栏不变
  const [narrowViewport] = useState(() => window.innerWidth < 640)
  const stackedSettings = narrowViewport && inSettings

  return (
    <div className="grid h-full grid-rows-[auto_1fr_24px] bg-background text-foreground">
      {status !== 'open' && <ReconnectBanner status={status} />}
      <div
        className={cn(
          'row-start-2 grid min-h-0',
          stackedSettings
            ? 'grid-rows-[auto_minmax(0,1fr)]'
            : cn(
                'grid-cols-[auto_1fr]',
                !suppressColTransition && 'transition-[grid-template-columns] duration-150',
                // 只有 inline 形态占 264px 列；rail 与 overlay 都留 48px——overlay 的面板
                // 自身 fixed 脱栅格覆盖在内容上（工单 19.40：窄屏展开不再挤压内容列）
                !inSettings && sidebarMode !== 'inline'
                  ? 'grid-cols-[48px_1fr]'
                  : 'grid-cols-[264px_1fr]',
              ),
        )}
      >
        {inSettings ? (
          <SettingsSidebar {...(stackedSettings ? { compact: true } : {})} />
        ) : (
          <Sidebar mode={sidebarMode} onOverlayClose={() => setSidebarCollapsed(true)} />
        )}
        <main className="min-h-0 overflow-hidden">{children}</main>
      </div>
      <div className="row-start-3">
        <StatusBar />
      </div>
      <SettingsDialog />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {/* 辅助会话抽屉（工单 19.36）：只挂在会话路由内；非模态（无遮罩）——主区可继续操作 */}
      {onSessionRoute && auxOpen && <AuxSessionDrawer />}
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
