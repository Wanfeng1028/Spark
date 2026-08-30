/**
 * App 根（工单 9.2 骨架）：配置装载 → 主题解析（§13.C 三档 × 系统色）→
 * NavigationContainer（token 映射导航主题）→ 单栈+抽屉。
 * 配对深链：spark://pair 经 parsePairLink 解析后落 config.pendingPair，
 * 设置页呈现确认卡（冷启动 getInitialURL + 运行期 addEventListener 双路径）。
 */
import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import {
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native'
import type { Theme as NavTheme } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppNavigator } from './src/navigation/AppNavigator'
import { useConfigStore } from './src/store/config-store'
import { resolveTheme } from './src/theme/tokens'
import { parsePairLink } from './src/transport/pair-link'

/** §13.C token → react-navigation 主题（导航容器背景/文本与屏幕同口径） */
function navTheme(dark: boolean, colors: NavTheme['colors']): NavTheme {
  return { ...DefaultTheme, dark, colors, fonts: DefaultTheme.fonts }
}

export default function App() {
  const scheme = useColorScheme()
  // ColorSchemeName 含 'unspecified'——归一为 null（亮色默认纪律）
  const system = scheme === 'light' || scheme === 'dark' ? scheme : null
  const appearance = useConfigStore((s) => s.appearance)
  const hydrated = useConfigStore((s) => s.hydrated)
  const t = resolveTheme(appearance, system)

  // 启动装载持久化配置（失败闭合：读失败按未配置呈现）
  useEffect(() => {
    void useConfigStore.getState().load()
  }, [])

  // 配对深链：冷启动 + 运行期同一路径（解析失败 = 未识别，静默忽略）
  useEffect(() => {
    const handle = (url: string | null): void => {
      if (url === null) return
      const pair = parsePairLink(url)
      if (pair !== null) useConfigStore.getState().setPendingPair(pair)
    }
    void Linking.getInitialURL().then(handle)
    const sub = Linking.addEventListener('url', (e) => handle(e.url))
    return () => sub.remove()
  }, [])

  if (!hydrated) return null

  const theme = navTheme(appearance === 'dark' || (appearance === 'system' && system === 'dark'), {
    primary: t.sparkAccent,
    background: t.pageBackground,
    card: t.card,
    text: t.foreground,
    border: t.border,
    notification: t.sparkAccent,
  })

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <AppNavigator />
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
