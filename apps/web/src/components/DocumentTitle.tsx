/**
 * 文档标题 = 当前会话标题（工单 19.33）。
 *
 * 桌面壳的窗口菜单靠 `webContents.getTitle()` 取窗口名，多窗口下没有它就只剩
 * 「窗口 1／窗口 2」这种分不清的项；浏览器标签页同样受益。
 * 非会话页与空标题会话都落回 index.html 的 `Spark`（壳层据此退到「窗口 N」）——
 * **不拿会话 id 顶替标题**：ULID 串在菜单里既读不出区别也占满宽度，那是假装有信息。
 *
 * 独立成模块（不写在 App.tsx 里）：单测只渲染这一个组件，不必把整棵路由树拖进 jsdom。
 */
import { useEffect } from 'react'
import { useSessionStore } from '@/stores/session'

export function DocumentTitle() {
  const title = useSessionStore((s) =>
    s.activeId === null ? null : (s.byId[s.activeId]?.meta.title ?? null),
  )
  useEffect(() => {
    document.title = title === null || title === '' ? 'Spark' : `${title} · Spark`
  }, [title])
  return null
}
