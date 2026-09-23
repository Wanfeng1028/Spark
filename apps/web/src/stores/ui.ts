/**
 * 浮层开关 + 侧栏折叠态/分组模式 + 辅助会话抽屉（doc/02 §6.3 / DESIGN §13.A）：
 * SettingsDialog / CommandPalette 的受控态（快捷键 Cmd/Ctrl+, 与 Cmd/Ctrl+K 共用）；
 * 侧栏 264px ↔ 48px 图标态、分组双模式（项目/时间，工单 10.5②），localStorage 持久化（spark.ui）；
 * 辅助会话抽屉态（工单 19.36）只存会话 id 与开关，不持久化——重开浏览器不该凭空多出面板。
 */
import { create } from 'zustand'
import type { KeyOverride, SessionId } from '@spark/protocol'

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
    if (raw === null) return { sidebarCollapsed: false, sidebarGroupMode: 'project', voiceMode: 'hold' }
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
  /** 强制折叠（工单 19.40 窄屏 overlay 抽屉的关闭动作——toggle 在"已是折叠态"时会反向展开） */
  setSidebarCollapsed: (b: boolean) => void
  setSidebarGroupMode: (m: SidebarGroupMode) => void
  voiceMode: VoiceMode
  cycleVoiceMode: () => void
  /** 命令面板请求打开的会话级对话框（阶段十九 19.21：/checkpoint /tree）——
   *  SessionPage 订阅后开合并自行清 Request（一次性信号，不常驻状态） */
  sessionDialogRequest: 'checkpoint' | 'tree' | null
  openSessionDialog: (d: 'checkpoint' | 'tree') => void
  clearSessionDialogRequest: () => void
  /** 推理档循环（阶段十九 19.21：/effort）——SessionPage 订阅后改 Composer 档位 */
  effortCycleSeq: number
  cycleEffort: () => void
  /**
   * 辅助会话抽屉（工单 19.36 / V2-09）：抽屉里另开的第二个会话页实例所指会话。
   * null = 未选（抽屉呈现会话选择器）；closeAux 只收面板不清此值——重开续看同一会话，
   * 且卸载实例不打断引擎在途 turn（事件流在 TransportProvider 全局入 store）。
   */
  auxSessionId: SessionId | null
  auxOpen: boolean
  setAuxSession: (sid: SessionId | null) => void
  openAux: () => void
  closeAux: () => void
  /**
   * 键位覆盖层（阶段十九 19.39 第二批）：服务端 `settings.ui.keymap.overrides` 的本地镜像。
   * 端侧物理层经 `useEffectiveKeymap` 读它比对按键，**保存后必须同步写回**——否则新键位要
   * 重载页面才生效，就成了"改了不生效"的假控件。不持久化：服务端是权威，boot 时装载
   * （与 CLI `store.keymapOverrides` 同模式）。
   */
  keymapOverrides: KeyOverride[]
  setKeymapOverrides: (overrides: KeyOverride[]) => void
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
      persist({ sidebarCollapsed, sidebarGroupMode: get().sidebarGroupMode, voiceMode: get().voiceMode })
      return { sidebarCollapsed }
    }),
  setSidebarGroupMode: (sidebarGroupMode) => {
    persist({ sidebarCollapsed: get().sidebarCollapsed, sidebarGroupMode, voiceMode: get().voiceMode })
    set({ sidebarGroupMode })
  },
  voiceMode: loadPersisted().voiceMode,
  sessionDialogRequest: null,
  effortCycleSeq: 0,
  auxSessionId: null,
  auxOpen: false,
  setAuxSession: (auxSessionId) => set({ auxSessionId }),
  openAux: () => set({ auxOpen: true }),
  closeAux: () => set({ auxOpen: false }),
  keymapOverrides: [],
  setKeymapOverrides: (keymapOverrides) => set({ keymapOverrides }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    persist({ sidebarCollapsed, sidebarGroupMode: get().sidebarGroupMode, voiceMode: get().voiceMode })
    set({ sidebarCollapsed })
  },
  openSessionDialog: (sessionDialogRequest) => set({ sessionDialogRequest }),
  clearSessionDialogRequest: () => set({ sessionDialogRequest: null }),
  cycleEffort: () => set((s) => ({ effortCycleSeq: s.effortCycleSeq + 1 })),
  cycleVoiceMode: () => {
    // /voice 命令与长按菜单共用：hold → tap → off → hold 循环（§13.E 语音钮三态）
    const order: VoiceMode[] = ['hold', 'tap', 'off']
    const next = order[(order.indexOf(get().voiceMode) + 1) % order.length] ?? 'hold'
    persist({ sidebarCollapsed: get().sidebarCollapsed, sidebarGroupMode: get().sidebarGroupMode, voiceMode: next })
    set({ voiceMode: next })
  },
}))
