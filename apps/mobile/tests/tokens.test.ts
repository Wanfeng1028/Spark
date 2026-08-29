/**
 * 主题 token 单测（工单 9.2 要求：亮/暗两套关键键存在且为合法色值）。
 */
import {
  darkTheme,
  lightTheme,
  resolveTheme,
} from '../src/theme/tokens'
import type { ThemeTokens } from '../src/theme/tokens'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

const REQUIRED_KEYS: ReadonlyArray<keyof ThemeTokens> = [
  'background',
  'pageBackground',
  'foreground',
  'card',
  'primary',
  'primaryForeground',
  'secondary',
  'muted',
  'mutedForeground',
  'destructive',
  'border',
  'ring',
  'sparkAccent',
  'sparkWarn',
  'sparkOk',
  'sparkErr',
]

describe('theme tokens（DESIGN §13.C 1:1）', () => {
  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ])('%s 主题关键键齐全且为合法 #rrggbb', (_name, theme) => {
    for (const key of REQUIRED_KEYS) {
      const value = theme[key]
      expect(typeof value).toBe('string')
      expect(value).toMatch(HEX_RE)
    }
  })

  it('亮色默认值锚定 §13.C / J.0 关键色', () => {
    expect(lightTheme.foreground).toBe('#18181b')
    expect(lightTheme.pageBackground).toBe('#F7F7F7')
    expect(lightTheme.sparkAccent).toBe('#4f46e5')
    expect(lightTheme.sparkWarn).toBe('#b45309')
  })

  it('暗色关键色锚定 §13.C .dark', () => {
    expect(darkTheme.background).toBe('#09090b')
    expect(darkTheme.sparkAccent).toBe('#818cf8')
    expect(darkTheme.sparkErr).toBe('#f87171')
  })

  describe('resolveTheme（三档外观 × 系统色）', () => {
    it('浅色档恒定亮色', () => {
      expect(resolveTheme('light', 'dark')).toBe(lightTheme)
    })
    it('深色档恒定暗色', () => {
      expect(resolveTheme('dark', 'light')).toBe(darkTheme)
    })
    it('系统档跟随系统色', () => {
      expect(resolveTheme('system', 'dark')).toBe(darkTheme)
      expect(resolveTheme('system', 'light')).toBe(lightTheme)
    })
    it('系统色缺失落亮色（亮色默认纪律）', () => {
      expect(resolveTheme('system', null)).toBe(lightTheme)
      expect(resolveTheme('system', undefined)).toBe(lightTheme)
    })
  })
})
