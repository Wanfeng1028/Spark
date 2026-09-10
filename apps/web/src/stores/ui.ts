/**
 * 浮层开关 + 侧栏折叠态/分组模式（doc/02 §6.3 / DESIGN §13.A）：
 * SettingsDialog / CommandPalette 的受控态（快捷键 Cmd/Ctrl+, 与 Cmd/Ctrl+K 共用）；
 * 侧栏 264px ↔ 48px 图标态、分组双模式（项目/时间，工单 10.5②），localStorage 持久化（spark.ui）。
 */
import { create } from 'zustand'

const STORAGE_KEY = 'spark.ui'

/** 侧栏会话分组模式（工单 10.5②）：项目=按 cwd 目录；时间=按更新时间段 */
type SidebarGroupMode = 'project' | 'time'

/** 语音听写模式（工单 16.6）：hold=按住说话 / tap=点击开始停止 / off=隐藏麦克风 */
type VoiceMode = 'hold' | 'tap' | 'off'

interface PersistedUi {
  sidebarCollapsed: boolean
  sidebarGroupMode: SidebarGroupMode
  voiceMode: VoiceMode
}

function loadPersisted(): PersistedUi {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { sidebarCollapsed: false, sidebarGroupMode: 'project' }
    const parsed = JSON.parse(raw) as Partial<PersistedUi>
    return {
      sidebarCollapsed: parsed.sidebarCollapsed === true,
      sidebarGroupMode: parsed.sidebarGroupMode === 'time' ? 'time' : 'project',
      voiceMode: parsed.voiceMode === 'tap' || parsed.voiceMode === 'off' ? parsed.voiceMode : 'hold',
    }
  } catch {
    return { sidebarCollapsed: false, sidebarGroupMode: 'project', voiceMode: 'hold' }
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
  sidebarGroupMode: SidebarGroupMode
  setSettingsOpen: (b: boolean) => void
  setPaletteOpen: (b: boolean) => void
  toggleSidebar: () => void
  setSidebarGroupMode: (m: SidebarGroupMode) => void
  voiceMode: VoiceMode
  cycleVoiceMode: () => void
}

export const useUiStore = create<UiState>()((set, get) => ({
  settingsOpen: false,
  paletteOpen: false,
  sidebarCollapsed: loadPersisted().sidebarCollapsed,
  sidebarGroupMode: loadPersisted().sidebarGroupMode,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed
      persist({ sidebarCollapsed, sidebarGroupMode: get().sidebarGroupMode })
      return { sidebarCollapsed }
    }),
  setSidebarGroupMode: (sidebarGroupMode) => {
    persist({ sidebarCollapsed: get().sidebarCollapsed, sidebarGroupMode })
    set({ sidebarGroupMode })
  },
  voiceMode: loadPersisted().voiceMode,
  cycleVoiceMode: () => {
    // /voice 命令与长按菜单共用：hold → tap → off → hold 循环（§13.E 语音钮三态）
    const order: VoiceMode[] = ['hold', 'tap', 'off']
    const next = order[(order.indexOf(get().voiceMode) + 1) % order.length] ?? 'hold'
    persist({ sidebarCollapsed: get().sidebarCollapsed, sidebarGroupMode: get().sidebarGroupMode, voiceMode: next })
    set({ voiceMode: next })
  },
}))
