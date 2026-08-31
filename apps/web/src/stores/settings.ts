/**
 * settings-store（doc/02 §6.4 / DESIGN §13.C + §13.D 外观区）：localStorage 持久化。
 * theme 三档（light 默认 / dark / system 跟随系统），system 档监听 prefers-color-scheme
 * 即时生效（html class 切换）；defaultDelivery 是 Composer 初始模式（常规区"交互行为"）；
 * model 只影响新建会话（模型设置页消费，工单 6.5 接 UI）。
 * 外观区字段（§13.D②）：uiFontSize/codeThemeLight/codeThemeDark/showLineNumbers/
 * wrapLongLines/codeFontSize——经 applyAppearance 落 CSS 变量与 html class，
 * AssistantBlock/Streamdown 与代码块样式即时消费。
 * 会话域开关（工单 10.20 A③）：showReasoning（关=每轮仅首条思考）/
 * showToolGroups（关=连续同类工具不聚合）——ChatView flow rows 消费。
 */
import { create } from 'zustand'
import type { Delivery } from '@spark/protocol'

export type Theme = 'light' | 'dark' | 'system'

/** shiki 代码主题（§13.D 外观区下拉的选项子集；id 为 shiki BundledTheme 名） */
export type CodeTheme = (typeof CODE_THEMES)[number]['id']

export const CODE_THEMES = [
  { id: 'github-light', label: 'GitHub Light', dark: false },
  { id: 'github-light-default', label: 'GitHub Light Default', dark: false },
  { id: 'one-light', label: 'One Light', dark: false },
  { id: 'min-light', label: 'Minimal Light', dark: false },
  { id: 'solarized-light', label: 'Solarized Light', dark: false },
  { id: 'vitesse-light', label: 'Vitesse Light', dark: false },
  { id: 'rose-pine-dawn', label: 'Rose Pine Dawn', dark: false },
  { id: 'min-dark', label: 'Minimal Dark', dark: true },
  { id: 'github-dark', label: 'GitHub Dark', dark: true },
  { id: 'github-dark-dimmed', label: 'GitHub Dark Dimmed', dark: true },
  { id: 'one-dark-pro', label: 'One Dark Pro', dark: true },
  { id: 'tokyo-night', label: 'Tokyo Night', dark: true },
  { id: 'nord', label: 'Nord', dark: true },
  { id: 'dracula', label: 'Dracula', dark: true },
  { id: 'vitesse-dark', label: 'Vitesse Dark', dark: true },
  { id: 'rose-pine-moon', label: 'Rose Pine Moon', dark: true },
] as const

const LIGHT_THEMES = new Set<string>(CODE_THEMES.filter((t) => !t.dark).map((t) => t.id))
const DARK_THEMES = new Set<string>(CODE_THEMES.filter((t) => t.dark).map((t) => t.id))

/** 界面/代码字号档位（§13.B：UI 基础 13、代码 12；范围即下拉选项） */
export const UI_FONT_SIZES = [12, 13, 14, 15, 16] as const
export const CODE_FONT_SIZES = [11, 12, 13, 14] as const

export interface SettingsState {
  theme: Theme
  defaultDelivery: Delivery
  /** 新建会话默认模型（provider/model）；空串 = 用引擎默认 */
  model: string
  /** 界面字号（§13.D 外观区，默认 13） */
  uiFontSize: (typeof UI_FONT_SIZES)[number]
  /** 浅色代码主题（默认 GitHub Light） */
  codeThemeLight: CodeTheme
  /** 深色代码主题（默认 Minimal Dark = shiki min-dark） */
  codeThemeDark: CodeTheme
  /** 代码块显示行号（默认开） */
  showLineNumbers: boolean
  /** 长行自动换行（默认开；关 = 横向滚动） */
  wrapLongLines: boolean
  /** 代码字号（默认 12） */
  codeFontSize: (typeof CODE_FONT_SIZES)[number]
  /** 显示思考过程（默认开；关 = 每轮仅展示第一条思考——工单 10.20 A③） */
  showReasoning: boolean
  /** 连续同类工具聚合为分组卡（默认开——工单 10.20 A③） */
  showToolGroups: boolean
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setDefaultDelivery: (d: Delivery) => void
  setModel: (m: string) => void
  setUiFontSize: (n: (typeof UI_FONT_SIZES)[number]) => void
  setCodeThemeLight: (t: CodeTheme) => void
  setCodeThemeDark: (t: CodeTheme) => void
  setShowLineNumbers: (b: boolean) => void
  setWrapLongLines: (b: boolean) => void
  setCodeFontSize: (n: (typeof CODE_FONT_SIZES)[number]) => void
  setShowReasoning: (b: boolean) => void
  setShowToolGroups: (b: boolean) => void
}

const STORAGE_KEY = 'spark.settings'

interface PersistedSettings {
  theme: Theme
  defaultDelivery: Delivery
  model: string
  uiFontSize: (typeof UI_FONT_SIZES)[number]
  codeThemeLight: CodeTheme
  codeThemeDark: CodeTheme
  showLineNumbers: boolean
  wrapLongLines: boolean
  codeFontSize: (typeof CODE_FONT_SIZES)[number]
  showReasoning: boolean
  showToolGroups: boolean
}

const DEFAULTS: PersistedSettings = {
  theme: 'light',
  defaultDelivery: 'now',
  model: '',
  uiFontSize: 13,
  codeThemeLight: 'github-light',
  codeThemeDark: 'min-dark',
  showLineNumbers: true,
  wrapLongLines: true,
  codeFontSize: 12,
  showReasoning: true,
  showToolGroups: true,
}

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
      uiFontSize: UI_FONT_SIZES.includes(parsed.uiFontSize as (typeof UI_FONT_SIZES)[number])
        ? (parsed.uiFontSize as (typeof UI_FONT_SIZES)[number])
        : DEFAULTS.uiFontSize,
      codeThemeLight:
        typeof parsed.codeThemeLight === 'string' && LIGHT_THEMES.has(parsed.codeThemeLight)
          ? parsed.codeThemeLight
          : DEFAULTS.codeThemeLight,
      codeThemeDark:
        typeof parsed.codeThemeDark === 'string' && DARK_THEMES.has(parsed.codeThemeDark)
          ? parsed.codeThemeDark
          : DEFAULTS.codeThemeDark,
      showLineNumbers:
        typeof parsed.showLineNumbers === 'boolean' ? parsed.showLineNumbers : DEFAULTS.showLineNumbers,
      wrapLongLines:
        typeof parsed.wrapLongLines === 'boolean' ? parsed.wrapLongLines : DEFAULTS.wrapLongLines,
      codeFontSize: CODE_FONT_SIZES.includes(parsed.codeFontSize as (typeof CODE_FONT_SIZES)[number])
        ? (parsed.codeFontSize as (typeof CODE_FONT_SIZES)[number])
        : DEFAULTS.codeFontSize,
      showReasoning:
        typeof parsed.showReasoning === 'boolean' ? parsed.showReasoning : DEFAULTS.showReasoning,
      showToolGroups:
        typeof parsed.showToolGroups === 'boolean' ? parsed.showToolGroups : DEFAULTS.showToolGroups,
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

/** 外观区副作用：界面/代码字号与换行走 CSS 变量 + html class，全局即时生效 */
function applyAppearance(s: Pick<PersistedSettings, 'uiFontSize' | 'codeFontSize' | 'wrapLongLines'>): void {
  const root = document.documentElement
  root.style.setProperty('--spark-ui-font-size', `${s.uiFontSize}px`)
  root.style.setProperty('--spark-code-font-size', `${s.codeFontSize}px`)
  root.classList.toggle('spark-code-wrap', s.wrapLongLines)
}

const initial = load()
applyTheme(initial.theme)
applyAppearance(initial)

// system 档实时跟随系统（手动档不受影响）
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    const { theme } = useSettingsStore.getState()
    if (theme === 'system') applyTheme('system')
  })

export const useSettingsStore = create<SettingsState>()((set, get) => {
  /** 持久化当前全量偏好（每次 setter 共用） */
  function save(patch: Partial<PersistedSettings>): void {
    const s = { ...get(), ...patch } as PersistedSettings
    persist(s)
    set(patch)
  }

  return {
    ...initial,
    setTheme: (theme) => {
      applyTheme(theme)
      save({ theme })
    },
    toggleTheme: () => {
      const order: Theme[] = ['light', 'dark', 'system']
      const next = order[(order.indexOf(get().theme) + 1) % order.length] ?? 'light'
      get().setTheme(next)
    },
    setDefaultDelivery: (defaultDelivery) => save({ defaultDelivery }),
    setModel: (model) => save({ model }),
    setUiFontSize: (uiFontSize) => {
      applyAppearance({ ...get(), uiFontSize })
      save({ uiFontSize })
    },
    setCodeThemeLight: (codeThemeLight) => save({ codeThemeLight }),
    setCodeThemeDark: (codeThemeDark) => save({ codeThemeDark }),
    setShowLineNumbers: (showLineNumbers) => save({ showLineNumbers }),
    setWrapLongLines: (wrapLongLines) => {
      applyAppearance({ ...get(), wrapLongLines })
      save({ wrapLongLines })
    },
    setCodeFontSize: (codeFontSize) => {
      applyAppearance({ ...get(), codeFontSize })
      save({ codeFontSize })
    },
    setShowReasoning: (showReasoning) => save({ showReasoning }),
    setShowToolGroups: (showToolGroups) => save({ showToolGroups }),
  }
})
