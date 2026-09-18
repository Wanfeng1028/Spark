/**
 * 应用入口（工单 9.4）：配置装载 + 系统深色模式跟踪。
 * 不做全局 SSE（与移动端同口径——会话级流随会话页生命周期）。
 */
import { useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import { useConfigStore } from './store/config-store'
import { useThemeStore } from './store/theme-store'
import { AppErrorBoundary } from './components/ErrorBoundary'

function schemeOf(theme: unknown): 'light' | 'dark' | null {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  return null
}

export default function App({ children }: PropsWithChildren) {
  useEffect(() => {
    useConfigStore.getState().load()
    // WO-038：getSystemInfoSync 基础库 2.20.1 起废弃——拆用 getAppBaseInfo().theme
    const appBase = Taro.getAppBaseInfo()
    useThemeStore.getState().setSystemScheme(schemeOf(appBase?.theme))
    const onTheme = (res: { theme: string }): void => {
      useThemeStore.getState().setSystemScheme(schemeOf(res.theme))
    }
    Taro.onThemeChange(onTheme)
    return () => {
      Taro.offThemeChange(onTheme)
    }
  }, [])

  // WO-039：应用级边界——任一子树渲染异常兜底一行提示，不白屏
  return <AppErrorBoundary>{children}</AppErrorBoundary>
}
