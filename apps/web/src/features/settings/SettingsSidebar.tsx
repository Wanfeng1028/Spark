/**
 * 设置中心导航（DESIGN §13.D：复用左栏 264px，三组——基础设置/Agent 能力/数据与统计）。
 * 设置路由下替代会话侧栏渲染（AppShell 条件切换）；顶部"返回"直达目的地。
 * 组头 28px / 导航项 32px（§13.A 同规格）；折叠态由 AppShell 栅格统一驱动（此组件不折叠）。
 * 导航纪律（工单 10.14）：返回=直达最后激活会话（无则欢迎页）且 replace——不再
 * navigate(-1) 逐历史回退（逛过 N 个分区要按 N 次返回）；分区互切 replace:true——
 * 同层平级不堆历史，浏览器后退不陷入设置内部。
 */
import { useLocation, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { SessionId } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'
import { SETTINGS_GROUPS } from './settings-pages'
import { cn } from '@/lib/utils'

/** 返回目的地（工单 10.14①）：最后激活会话直达；无激活会话回欢迎页（纯函数可单测） */
export function settingsBackTarget(activeSessionId: SessionId | null): string {
  return activeSessionId !== null ? `/session/${activeSessionId}` : '/welcome'
}

export function SettingsSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeSessionId = useSessionStore((s) => s.activeId)
  const activePage = location.pathname.startsWith('/settings/')
    ? (location.pathname.split('/')[2] ?? '')
    : ''

  /** 返回=直达目的地（工单 10.14①）；replace 不堆历史，浏览器后退不陷入设置内部 */
  function backHome(): void {
    void navigate(settingsBackTarget(activeSessionId), { replace: true })
  }

  return (
    <nav
      aria-label="设置导航"
      className="flex h-full min-h-0 flex-col gap-2 border-r border-border bg-sidebar p-2"
    >
      <button
        type="button"
        onClick={backHome}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <ArrowLeft className="size-4 shrink-0" />
        返回
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {SETTINGS_GROUPS.map((g) => (
          <section key={g.label} className="mb-1">
            <p className="flex h-7 items-center px-2 text-xs font-medium text-muted-foreground">
              {g.label}
            </p>
            <ul className="flex flex-col">
              {g.pages.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void navigate(`/settings/${p.id}`, { replace: true })}
                    aria-current={p.id === activePage ? 'page' : undefined}
                    className={cn(
                      'flex h-8 w-full items-center gap-2 rounded-md border border-transparent px-3 text-left text-[13px] hover:bg-accent',
                      p.id === activePage && 'border-border bg-secondary',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{p.title}</span>
                    {p.status === 'ready' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[var(--spark-ok)]" aria-label="已落地" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  )
}
