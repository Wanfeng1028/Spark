/**
 * settings-store（doc/02 §6.4）：{ theme, defaultDelivery, model }，localStorage 持久化。
 * theme 即时生效（html class 切换，dark 默认）；defaultDelivery 是 Composer 初始模式；
 * model 只影响新建会话（SettingsDialog 消费，工单 6 接 UI）。
 */
import { create } from 'zustand'
import type { Delivery } from '@spark/protocol'

export type Theme = 'light' | 'dark'

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

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { theme: 'dark', defaultDelivery: 'now', model: '' }
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      defaultDelivery:
        parsed.defaultDelivery === 'steer' || parsed.defaultDelivery === 'queue'
          ? parsed.defaultDelivery
          : 'now',
      model: typeof parsed.model === 'string' ? parsed.model : '',
    }
  } catch {
    // 坏数据按默认处理（本地偏好，不值得 fail loudly）
    return { theme: 'dark', defaultDelivery: 'now', model: '' }
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
  document.documentElement.classList.toggle('dark', t === 'dark')
}

const initial = load()
applyTheme(initial.theme)

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...initial,
  setTheme: (theme) => {
    applyTheme(theme)
    persist({ theme, defaultDelivery: get().defaultDelivery, model: get().model })
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setDefaultDelivery: (defaultDelivery) => {
    persist({ theme: get().theme, defaultDelivery, model: get().model })
    set({ defaultDelivery })
  },
  setModel: (model) => {
    persist({ theme: get().theme, defaultDelivery: get().defaultDelivery, model })
    set({ model })
  },
}))
