/**
 * 浮层菜单外点关闭兜底（工单 R-E③：ModelPicker/EffortPicker/Composer 档位菜单
 * 三份同构 effect 合一）。onMouseDown preventDefault 保焦点之外的最后一道防线。
 * isInside 判定注入——ref.contains（Picker 族）与 closest 选择器（Composer）同覆盖。
 */
import { useEffect, useRef } from 'react'

export function useDismissOnOutsideClick(
  active: boolean,
  onDismiss: () => void,
  isInside: (target: Node) => boolean,
  opts?: { escape?: boolean },
): void {
  // 回调经 ref 透传：effect 依赖仅 active，重订阅节奏与原实现一致
  const state = useRef({ onDismiss, isInside, escape: opts?.escape ?? true })
  state.current = { onDismiss, isInside, escape: opts?.escape ?? true }
  useEffect(() => {
    if (!active) return
    function onDocMouseDown(e: MouseEvent): void {
      if (e.target instanceof Node && !state.current.isInside(e.target)) {
        state.current.onDismiss()
      }
    }
    // LA-61：Esc 关闭兜底（默认开）——键盘可达性（L.6 开一关一对全部浮层成立）
    function onDocKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && state.current.escape) {
        state.current.onDismiss()
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [active])
}
