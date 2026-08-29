/**
 * 主题解析钩子：外观档（设置页）× 系统深色模式（Taro.onThemeChange）→ 生效主题。
 * systemScheme 存 zustand（app.ts onLaunch 初始化 + onThemeChange 更新）。
 */
import { create } from 'zustand'
import { useConfigStore } from './config-store'
import { resolveTheme } from '../theme/tokens'
import type { ThemeTokens } from '../theme/tokens'

interface ThemeState {
  /** 微信深色模式（Taro.getSystemInfoSync().theme；无值 = 浅色缺省） */
  systemScheme: 'light' | 'dark' | null
  setSystemScheme: (s: 'light' | 'dark' | null) => void
}

export const useThemeStore = create<ThemeState>()((set) => ({
  systemScheme: null,
  setSystemScheme: (systemScheme) => set({ systemScheme }),
}))

/** 生效主题（组件层唯一取色入口——色值不硬编码进页面） */
export function useTheme(): ThemeTokens {
  const appearance = useConfigStore((s) => s.appearance)
  const systemScheme = useThemeStore((s) => s.systemScheme)
  return resolveTheme(appearance, systemScheme)
}
