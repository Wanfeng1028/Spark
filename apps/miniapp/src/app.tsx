/**
 * 应用入口（工单 9.4）：配置装载 + 系统深色模式跟踪。
 * 不做全局 SSE（与移动端同口径——会话级流随会话页生命周期）。
 */
import { useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import { useConfigStore } from './store/config-store'
import { useThemeStore } from './store/theme-store'

function schemeOf(theme: unknown): 'light' | 'dark' | null {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  return null
}

export default function App({ children }: PropsWithChildren) {
  useEffect(() => {
    useConfigStore.getState().load()
    useThemeStore.getState().setSystemScheme(schemeOf(Taro.getSystemInfoSync().theme))
    const onTheme = (res: { theme: string }): void => {
      useThemeStore.getState().setSystemScheme(schemeOf(res.theme))
    }
    Taro.onThemeChange(onTheme)
    return () => {
      Taro.offThemeChange(onTheme)
    }
  }, [])

  return children
}
