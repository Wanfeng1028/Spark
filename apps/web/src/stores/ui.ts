/**
 * 浮层开关（doc/02 §6.3）：SettingsDialog / CommandPalette 的受控态。
 * 快捷键（Cmd/Ctrl+, 与 Cmd/Ctrl+K）与 StatusBar 齿轮共用这一来源。
 */
import { create } from 'zustand'

export interface UiState {
  settingsOpen: boolean
  paletteOpen: boolean
  setSettingsOpen: (b: boolean) => void
  setPaletteOpen: (b: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  settingsOpen: false,
  paletteOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}))
