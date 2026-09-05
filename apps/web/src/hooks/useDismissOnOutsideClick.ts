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
): void {
  // 回调经 ref 透传：effect 依赖仅 active，重订阅节奏与原实现一致
  const state = useRef({ onDismiss, isInside })
  state.current = { onDismiss, isInside }
  useEffect(() => {
    if (!active) return
    function onDocMouseDown(e: MouseEvent): void {
      if (e.target instanceof Node && !state.current.isInside(e.target)) {
        state.current.onDismiss()
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [active])
}
