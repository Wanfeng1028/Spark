/**
 * RN 主题 token（DESIGN §13.C token 表 1:1 映射 + §13.J.0 移动端适配）。
 * 亮色默认、暗色跟随系统（App 层 useColorScheme + 设置页外观档解析）。
 * J.0 纪律：底色浅灰 #F7F7F7 + 白卡 radius 16 无边框无阴影；语义色沿用 §13.C。
 */

export interface ThemeTokens {
  /** §13.C --background（卡内/弹层底） */
  background: string
  /** J.0 屏幕底色（浅灰 #F7F7F7 / 暗 #09090b）——白卡靠底色差分层 */
  pageBackground: string
  /** --foreground */
  foreground: string
  /** --card / --popover */
  card: string
  /** --primary（主 CTA 黑底） */
  primary: string
  /** --primary-foreground */
  primaryForeground: string
  /** --secondary / --accent */
  secondary: string
  /** --muted */
  muted: string
  /** --muted-foreground（13/15px meta 文案） */
  mutedForeground: string
  /** --destructive（= spark-err 档位，危险操作红字） */
  destructive: string
  /** --border / --input（hairline 分隔） */
  border: string
  /** --ring（聚焦） */
  ring: string
  /** --spark-accent：运行/链接/焦点/选中填充（accent 唯一纪律，J.0） */
  sparkAccent: string
  /** --spark-warn：待审批/警示 */
  sparkWarn: string
  /** --spark-ok：空闲/成功 */
  sparkOk: string
  /** --spark-err：错误/断线/危险操作 */
  sparkErr: string
}

/** 亮色（§13.C :root 默认；pageBackground 按 J.0 取浅灰） */
export const lightTheme: ThemeTokens = {
  background: '#ffffff',
  pageBackground: '#F7F7F7',
  foreground: '#18181b',
  card: '#ffffff',
  primary: '#18181b',
  primaryForeground: '#fafafa',
  secondary: '#f4f4f5',
  muted: '#f4f4f5',
  mutedForeground: '#71717a',
  destructive: '#dc2626',
  border: '#e4e4e7',
  ring: '#a1a1aa',
  sparkAccent: '#4f46e5',
  sparkWarn: '#b45309',
  sparkOk: '#047857',
  sparkErr: '#b91c1c',
}

/** 暗色（§13.C .dark；pageBackground 按 J.0 取 #09090b） */
export const darkTheme: ThemeTokens = {
  background: '#09090b',
  pageBackground: '#09090b',
  foreground: '#fafafa',
  card: '#18181b',
  primary: '#fafafa',
  primaryForeground: '#18181b',
  secondary: '#27272a',
  muted: '#27272a',
  mutedForeground: '#a1a1aa',
  destructive: '#f87171',
  border: '#27272a',
  ring: '#52525b',
  sparkAccent: '#818cf8',
  sparkWarn: '#fbbf24',
  sparkOk: '#34d399',
  sparkErr: '#f87171',
}

/** §13.C 三档外观偏好（持久化；系统档跟随 prefers-color-scheme / useColorScheme） */
export type AppearancePreference = 'system' | 'light' | 'dark'

/** 外观档 + 系统色 → 生效主题（亮色默认：系统值缺失时落亮色） */
export function resolveTheme(
  preference: AppearancePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
): ThemeTokens {
  if (preference === 'light') return lightTheme
  if (preference === 'dark') return darkTheme
  return systemScheme === 'dark' ? darkTheme : lightTheme
}

/** J.3 控件规格表（移动端）——数值单一来源，屏幕层只引用本表 */
export const mobileMetrics = {
  cardRadius: 16,
  cardPadding: 16,
  cardGap: 12,
  rowHeight: 56,
  sessionRowHeight: 52,
  headerTitle: 17,
  rowTitle: 16,
  caption: 13,
  value: 15,
  floatButtonSize: 44,
  fabSize: 56,
  statusDot: 8,
  ctaHeight: 52,
} as const
