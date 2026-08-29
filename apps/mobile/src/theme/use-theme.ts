/** 主题解析 hook：外观档（设置页）× 系统色（useColorScheme）→ 生效 token（亮色默认） */
import { useColorScheme } from 'react-native'
import { useConfigStore } from '../store/config-store'
import { resolveTheme } from './tokens'
import type { ThemeTokens } from './tokens'

export function useTheme(): ThemeTokens {
  const appearance = useConfigStore((s) => s.appearance)
  const scheme = useColorScheme()
  // ColorSchemeName 含 'unspecified'——归一为 null（亮色默认纪律）
  const system = scheme === 'light' || scheme === 'dark' ? scheme : null
  return resolveTheme(appearance, system)
}
