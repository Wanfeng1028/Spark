import type { ReactNode } from 'react'
import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { useConnectionStore } from '@/stores/connection'

/**
 * 工作台骨架（doc/02 §6.1 / DESIGN.md §2）：
 * titlebar 36px + 断线重连条（断线时出现，DESIGN §9 顶部强提示）+ 主区（Sidebar 240px | 内容）+ StatusBar 28px。
 * 页面级不滚动，只有内容区内部滚动。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const status = useConnectionStore((s) => s.status)

  return (
    <div className="grid h-full grid-rows-[36px_auto_1fr_28px] bg-background text-foreground">
      <Titlebar />
      {status !== 'open' && <ReconnectBanner status={status} />}
      <div className="grid min-h-0 grid-cols-[240px_1fr]">
        <Sidebar />
        <main className="min-h-0 overflow-hidden">{children}</main>
      </div>
      <StatusBar />
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
