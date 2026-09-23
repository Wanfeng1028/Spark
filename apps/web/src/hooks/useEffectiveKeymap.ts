/**
 * 生效键位表（阶段十九 19.39 第二批）：ui store 里的覆盖层 → `mergeKeymap` 生效表。
 * 端侧物理层一律经 `presses(action, stroke)` 比对按键，**不再硬编码键名**——硬编码的话覆盖层
 * 写得再对也不生效（第一批只交付了 CLI 的显示面，本批把 web 的按下逻辑接上）。
 * 数据源是 ui store 而非就地 fetch：设置页保存后写回同一份，快捷键当场生效不必重载。
 * 只有 KEYMAP 里带 `spec` 的条目真能被改动，判据与理由见 protocol/keymap.ts 的 KeyBinding.spec。
 */
import { useCallback, useMemo } from 'react'
import {
  effectiveSpecOf,
  mergeKeymap,
  specMatchesStroke,
  type EffectiveKeyBinding,
  type KeyStroke,
} from '@spark/protocol'
import { useUiStore } from '@/stores/ui'

export function useEffectiveKeymap(): {
  entries: EffectiveKeyBinding[]
  presses: (action: string, stroke: KeyStroke) => boolean
} {
  const overrides = useUiStore((s) => s.keymapOverrides)
  const entries = useMemo(() => mergeKeymap(overrides).entries, [overrides])
  const presses = useCallback(
    (action: string, stroke: KeyStroke): boolean => {
      const spec = effectiveSpecOf(entries, action)
      return spec !== null && specMatchesStroke(spec, stroke)
    },
    [entries],
  )
  return { entries, presses }
}

/** KeyboardEvent → 协议侧的中性按键快照（protocol 不认识 DOM 类型，抽取在端侧） */
export function strokeOf(e: KeyboardEvent): KeyStroke {
  return { key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey }
}
