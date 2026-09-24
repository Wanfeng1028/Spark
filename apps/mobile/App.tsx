/**
 * App 根（工单 9.2 骨架）：配置装载 → 主题解析（§13.C 三档 × 系统色）→
 * NavigationContainer（token 映射导航主题）→ 单栈+抽屉。
 * 配对深链：spark://pair 经 subscribePairLink（解析本体在 @spark/protocol pair-link）落 config.pendingPair，
 * 设置页呈现确认卡（冷启动 getInitialURL + 运行期 addEventListener 双路径）。
 * 界面语言（工单 19.17）：配置装载完成后从服务端 ui.language 取一次，配对/改址即重取。
 */
import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import {
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native'
import type { Theme as NavTheme } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppNavigator } from './src/navigation/AppNavigator'
import { useConfigStore } from './src/store/config-store'
import { resolveTheme } from './src/theme/tokens'
import { subscribePairLink } from './src/transport/pair-link'
import { syncUiLanguage } from './src/transport/runtime'

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
  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const t = resolveTheme(appearance, system)

  // 启动装载持久化配置（失败闭合：读失败按未配置呈现）
  useEffect(() => {
    void useConfigStore.getState().load()
  }, [])

  // 界面语言（工单 19.17）：服务端 ui.language 单源；配置装载完成后再取，配对/改址即重取。
  // 取不到时 syncUiLanguage 自己保持现值并回 null，此处无需处置（理由见 src/i18n.ts）
  useEffect(() => {
    if (!hydrated) return
    void syncUiLanguage(serverUrl, token)
  }, [hydrated, serverUrl, token])

  // 配对深链：冷启动 + 运行期同一路径（接线在 transport/pair-link；解析失败 = 未识别，静默忽略）
  useEffect(() => subscribePairLink((pair) => useConfigStore.getState().setPendingPair(pair)), [])

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
