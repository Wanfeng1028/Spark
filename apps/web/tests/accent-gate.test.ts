/**
 * accent 对比度闸单测（19.43 批 2 尾片；DESIGN §12.9 边界①）：
 * 亮色下不达 AA 4.5:1 回落（静帧 accentFallback / 流体 glowColors[2]），
 * 深色端浅 pastel 直接过闸；候选全落选返回 null（= 缺省 indigo 不注入）。
 * 断言九套注册主题在两端各有落点——回归护住"新增主题忘了 fallback"这一漂移面。
 */
import { describe, expect, it } from 'vitest'
import { STATIC_WALLPAPERS, WALLPAPERS, wallpaperOf } from '@/features/appearance/wallpapers'
import { contrastRatio, resolveThemeAccent } from '@/features/appearance/accent-gate'
import type { StaticWallpaper } from '@/features/appearance/wallpapers'

const WHITE = '#ffffff'
const DARK = '#18181b'

describe('contrastRatio（WCAG 数学件）', () => {
  it('黑白对比恒等 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })
  it('同色对比为 1', () => {
    expect(contrastRatio('#4f46e5', '#4f46e5')).toBeCloseTo(1, 5)
  })
})

describe('resolveThemeAccent：亮色回落闸', () => {
  it('五套静帧浅 pastel 亮色必然回落 accentFallback', () => {
    for (const w of STATIC_WALLPAPERS) {
      expect(contrastRatio(w.accent, WHITE), w.id).toBeLessThan(4.5)
      const r = resolveThemeAccent(w, false)
      expect(r, w.id).not.toBeNull()
      expect(r?.accent, w.id).toBe(w.accentFallback)
    }
  })

  it('四套流体亮色回落 glowColors[2] 深暗端（accent 恒不达闸）', () => {
    for (const w of WALLPAPERS) {
      expect(contrastRatio(w.accent, WHITE), w.id).toBeLessThan(4.5)
      const r = resolveThemeAccent(w, false)
      expect(r, w.id).not.toBeNull()
      expect(r?.accent, w.id).toBe(w.glowColors[2])
    }
  })

  it('回落值与深色 accent 全部过 AA（九套 × 两端的解析产物逐个验闸）', () => {
    for (const w of [...WALLPAPERS, ...STATIC_WALLPAPERS]) {
      const light = resolveThemeAccent(w, false)
      const dark = resolveThemeAccent(w, true)
      expect(contrastRatio(light?.accent ?? '', WHITE), w.id).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(dark?.accent ?? '', DARK), w.id).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('深色端直接用主题 accent（浅 pastel 对深底 >7:1 无需回落）', () => {
    const misty = STATIC_WALLPAPERS[0]
    const fluid = WALLPAPERS[0]
    expect(resolveThemeAccent(misty, true)?.accent).toBe(misty.accent)
    expect(resolveThemeAccent(fluid, true)?.accent).toBe(fluid.accent)
  })

  it('候选全落选返回 null（缺省 indigo 原样）', () => {
    const fake = {
      kind: 'static',
      id: 'static-snow-peaks',
      i18nKey: 'x',
      src: '/x.jpg',
      accent: '#ffffff',
      accentFallback: '#fefefe',
    } as StaticWallpaper
    expect(resolveThemeAccent(fake, false)).toBeNull()
  })

  it('注册表取值走 wallpaperOf 与注册表同源（防测试造数漂移）', () => {
    expect(wallpaperOf('static-ocean-drift')?.kind).toBe('static')
    expect(wallpaperOf('fluid-aurora')?.kind).toBe('fluid')
    expect(wallpaperOf('none')).toBeNull()
  })
})
