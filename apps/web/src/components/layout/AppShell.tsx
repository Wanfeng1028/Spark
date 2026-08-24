import type { ReactNode } from 'react'
import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'

/**
 * 工作台骨架（doc/02 §6.1 / DESIGN.md §2）：
 * titlebar 36px 占位（Electron 期换自定义标题栏）+ 主区（Sidebar 240px | 内容）+ StatusBar 28px。
 * 页面级不滚动，只有内容区内部滚动（阶段二 ChatView 接管）。
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full grid-rows-[36px_1fr_28px] bg-background text-foreground">
      <Titlebar />
      <div className="grid min-h-0 grid-cols-[240px_1fr]">
        <Sidebar />
        <main className="min-h-0 overflow-hidden">{children}</main>
      </div>
      <StatusBar />
    </div>
  )
}
