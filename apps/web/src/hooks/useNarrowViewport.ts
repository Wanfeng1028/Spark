/**
 * 窄视口判定（工单 19.40 / V2-39）：单一口径 640px，沿用 AppShell WO-087 已确立的
 * 「窄屏」阈值（原为挂载时一次性 innerWidth 判定，drawer 化后必须跟随实时缩放，
 * 否则侧栏展开时主区仍被挤扁）。这不是响应式断点体系（DESIGN §2 反网站化不变），
 * 只服务「窄屏侧栏改 overlay 抽屉」这一个形态开关。
 */
import { useEffect, useState } from 'react'

/** 窄视口媒体查询（与 640px 阈值同源，改阈值只改这里） */
const NARROW_QUERY = '(max-width: 639px)'

function isNarrow(): boolean {
  return window.innerWidth < 640
}

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(isNarrow)
  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY)
    const onChange = (e: MediaQueryListEvent): void => setNarrow(e.matches)
    // jsdom / 老浏览器：matchMedia 存在但不派生事件——初值已按 innerWidth 定，订阅失败即退化
    mql.addEventListener('change', onChange)
    setNarrow(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return narrow
}
