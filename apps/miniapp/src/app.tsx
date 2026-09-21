/**
 * 应用入口（工单 9.4）：配置装载 + 系统深色模式跟踪 + 界面语言装载（工单 19.29）。
 * 不做全局 SSE（与移动端同口径——会话级流随会话页生命周期）。
 */
import { useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import { useConfigStore } from './store/config-store'
import { useThemeStore } from './store/theme-store'
import { useAppStore } from './store/app-store'
import { resolveLanguage } from './i18n'
import { getRestClient } from './transport/runtime'
import { AppErrorBoundary } from './components/ErrorBoundary'

function schemeOf(theme: unknown): 'light' | 'dark' | null {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  return null
}

/** 系统语言候选（WO-038 同口径走 getAppBaseInfo；H5 形态回落 navigator.language） */
function systemLanguageTags(): string[] {
  const fromBase = Taro.getAppBaseInfo()?.language
  if (typeof fromBase === 'string' && fromBase !== '') return [fromBase]
  return typeof navigator !== 'undefined' && typeof navigator.language === 'string'
    ? [navigator.language]
    : []
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

    // 界面语言（19.29 消费 19.17）：服务端 ui.language 优先；未配对或读取失败
    // 落系统语言探测——设置页/列表页首屏必有文案，不能等服务端应答才渲染中文缺省档。
    const { serverUrl, token } = useConfigStore.getState()
    const rest = getRestClient(serverUrl, token)
    const system = systemLanguageTags()
    if (rest === null) {
      useAppStore.getState().setLanguage(resolveLanguage(undefined, system))
    } else {
      rest
        .getSettings()
        .then((s) => useAppStore.getState().setLanguage(resolveLanguage(s.ui?.language, system)))
        .catch(() => useAppStore.getState().setLanguage(resolveLanguage(undefined, system)))
    }

    return () => {
      Taro.offThemeChange(onTheme)
    }
  }, [])

  // WO-039：应用级边界——任一子树渲染异常兜底一行提示，不白屏
  return <AppErrorBoundary>{children}</AppErrorBoundary>
}
