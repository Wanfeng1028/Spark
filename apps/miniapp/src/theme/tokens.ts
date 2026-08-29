/**
 * 小程序主题 token（DESIGN §13.C 色值 1:1 映射 + §13.J.0 移动端适配——
 * 与 apps/mobile theme/tokens.ts 同色值；尺寸纪律差异见下）。
 * 亮色默认、暗色跟随系统（Taro.onThemeChange + 设置页外观档）。
 *
 * §13.I 小程序行纪律：系统字体（不设 font-family）、禁多层阴影（CSS 里至多一档）、
 * rpx 保持 4 的倍数——750 设计稿 1px≈2rpx 换算后取 4 的倍数就近圆整
 * （如 17px→34rpx 取 36、13px→26rpx 取 24），尺寸数值集中在各页 CSS，
 * 本表只承载颜色与外观档解析（色值不进 WXSS 变量，暗色走内联样式）。
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
  /** --muted-foreground（meta 文案） */
  mutedForeground: string
  /** --destructive（危险操作红字） */
  destructive: string
  /** --border / --input（hairline 分隔） */
  border: string
  /** --ring（占位/弱前景） */
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

/** §13.C 三档外观偏好（持久化；系统档跟随微信深色模式） */
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
