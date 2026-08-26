/**
 * 浮层开关 + 侧栏折叠态（doc/02 §6.3 / DESIGN §13.A）：
 * SettingsDialog / CommandPalette 的受控态（快捷键 Cmd/Ctrl+, 与 Cmd/Ctrl+K 共用）；
 * 侧栏 264px ↔ 48px 图标态，localStorage 持久化（spark.ui）。
 */
import { create } from 'zustand'

const STORAGE_KEY = 'spark.ui'

interface PersistedUi {
  sidebarCollapsed: boolean
}

function loadPersisted(): PersistedUi {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { sidebarCollapsed: false }
    const parsed = JSON.parse(raw) as Partial<PersistedUi>
    return { sidebarCollapsed: parsed.sidebarCollapsed === true }
  } catch {
    return { sidebarCollapsed: false }
  }
}

function persist(state: PersistedUi): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage 不可用（隐私模式等）：折叠态退化为会话级，不影响功能
  }
}

export interface UiState {
  settingsOpen: boolean
  paletteOpen: boolean
  sidebarCollapsed: boolean
  setSettingsOpen: (b: boolean) => void
  setPaletteOpen: (b: boolean) => void
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  settingsOpen: false,
  paletteOpen: false,
  sidebarCollapsed: loadPersisted().sidebarCollapsed,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed
      persist({ sidebarCollapsed })
      return { sidebarCollapsed }
    }),
}))
