/**
 * settings-store（doc/02 §6.4 / DESIGN §13.C）：{ theme, defaultDelivery, model }，localStorage 持久化。
 * theme 三档（light 默认 / dark / system 跟随系统），system 档监听 prefers-color-scheme
 * 即时生效（html class 切换）；defaultDelivery 是 Composer 初始模式；
 * model 只影响新建会话（设置中心消费，工单 6 接 UI）。
 */
import { create } from 'zustand'
import type { Delivery } from '@spark/protocol'

export type Theme = 'light' | 'dark' | 'system'

export interface SettingsState {
  theme: Theme
  defaultDelivery: Delivery
  /** 新建会话默认模型（provider/model）；空串 = 用引擎默认 */
  model: string
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setDefaultDelivery: (d: Delivery) => void
  setModel: (m: string) => void
}

const STORAGE_KEY = 'spark.settings'

interface PersistedSettings {
  theme: Theme
  defaultDelivery: Delivery
  model: string
}

const DEFAULTS: PersistedSettings = { theme: 'light', defaultDelivery: 'now', model: '' }

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>
    return {
      theme:
        parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system'
          ? parsed.theme
          : DEFAULTS.theme,
      defaultDelivery:
        parsed.defaultDelivery === 'steer' || parsed.defaultDelivery === 'queue'
          ? parsed.defaultDelivery
          : 'now',
      model: typeof parsed.model === 'string' ? parsed.model : '',
    }
  } catch {
    // 坏数据按默认处理（本地偏好，不值得 fail loudly）
    return { ...DEFAULTS }
  }
}

function persist(s: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // 存不进（隐私模式等）——仅本次会话内生效
  }
}

function applyTheme(t: Theme): void {
  const dark =
    t === 'dark' ||
    (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

const initial = load()
applyTheme(initial.theme)

// system 档实时跟随系统（手动档不受影响）
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    const { theme } = useSettingsStore.getState()
    if (theme === 'system') applyTheme('system')
  })

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...initial,
  setTheme: (theme) => {
    applyTheme(theme)
    persist({ theme, defaultDelivery: get().defaultDelivery, model: get().model })
    set({ theme })
  },
  toggleTheme: () => {
    const order: Theme[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(get().theme) + 1) % order.length] ?? 'light'
    get().setTheme(next)
  },
  setDefaultDelivery: (defaultDelivery) => {
    persist({ theme: get().theme, defaultDelivery, model: get().model })
    set({ defaultDelivery })
  },
  setModel: (model) => {
    persist({ theme: get().theme, defaultDelivery: get().defaultDelivery, model })
    set({ model })
  },
}))
