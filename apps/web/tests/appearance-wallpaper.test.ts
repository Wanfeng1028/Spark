/**
 * 19.43 批 1 流体壁纸纯判据单测（GL 装配面不测，同 desktop 判据模块分工）：
 * 注册表完整性（4 套 / id 唯一 / 色表形状 / accent===glowColors[1] 不变量）、
 * hex 解析与坏值拒收、PARAMS→uniform 映射（防漏传 + coarse 归零 + 8 项未消费参数不出现）、
 * 调色板插值收敛与非变异、30fps 帧闸漂移补偿、createFluid 无 WebGL2 时 null 回落。
 * node 环境无 DOM——createFluid 用 getContext 恒 null 的 canvas 桩走失败路径。
 */
import { describe, expect, it } from 'vitest'
import { createFluid, frameGate, hexToRgb, paletteOf, stepPalette, uniformValuesOf } from '../src/features/appearance/fluid-renderer'
import { WALLPAPERS, wallpaperOf, WALLPAPER_IDS } from '../src/features/appearance/wallpapers'
import { FLUID_PARAMS } from '../src/features/appearance/fluid-shader'

describe('壁纸注册表（19.43）', () => {
  it('四套流体主题，id 唯一且白名单与注册表一致', () => {
    expect(WALLPAPERS).toHaveLength(4)
    const ids = WALLPAPERS.map((w) => w.id)
    expect(new Set(ids).size).toBe(4)
    expect([...WALLPAPER_IDS]).toHaveLength(4)
    for (const id of ids) expect(WALLPAPER_IDS.has(id)).toBe(true)
  })

  it('色表形状与调色板结构规律：colors[5] / glowColors[3] / accent===glowColors[1]', () => {
    for (const w of WALLPAPERS) {
      expect(w.colors).toHaveLength(5)
      expect(w.glowColors).toHaveLength(3)
      expect(w.accent).toBe(w.glowColors[1])
      for (const hex of [...w.colors, ...w.glowColors, w.accent]) {
        expect(hexToRgb(hex)).not.toBeNull()
      }
    }
  })

  it('wallpaperOf：已知 id 命中、未知 id 与 none 返回 null（禁假状态）', () => {
    expect(wallpaperOf('fluid-ember')?.i18nKey).toBe('fluidEmber')
    expect(wallpaperOf('fluid-vapor')).toBeNull()
    expect(wallpaperOf('none')).toBeNull()
  })

  it('上游 PARAMS 33 键 verbatim 转录（含 8 项本实现未消费的键）', () => {
    expect(Object.keys(FLUID_PARAMS)).toHaveLength(33)
    expect(FLUID_PARAMS.speed).toBe(28)
    expect(FLUID_PARAMS.mouseRadius).toBe(0.09)
  })
})

describe('色值与 uniform 映射', () => {
  it('hexToRgb：#rrggbb 归一到 0..1；缩写/垃圾/越界拒收', () => {
    expect(hexToRgb('#204a7e')).toEqual([0x20 / 255, 0x4a / 255, 0x7e / 255])
    expect(hexToRgb('#fff')).toBeNull()
    expect(hexToRgb('204a7e')).toBeNull()
    expect(hexToRgb('#204a7g')).toBeNull()
  })

  it('uniformValuesOf：23 个静态键齐、coarse 归零笔刷、offset 除 100、五色逐通道', () => {
    const wp = wallpaperOf('fluid-deep-ocean')
    expect(wp).not.toBeNull()
    if (wp?.kind !== 'fluid') throw new Error('深海流光应为流体主题（id 拼写回归）')
    const u = uniformValuesOf(wp, false)
    expect(Object.keys(u).sort()).toEqual(
      [
        'u_bloomRange', 'u_bloomStrength', 'u_bloomThreshold', 'u_brushRadius',
        'u_brushStrength', 'u_c1', 'u_c2', 'u_c3', 'u_c4', 'u_c5', 'u_decay',
        'u_distortBoost', 'u_glowColor1', 'u_glowColor2', 'u_glowColor3',
        'u_glowIntensity', 'u_grain', 'u_lightCore', 'u_lightHalo', 'u_offset',
        'u_scale', 'u_swirlBoost', 'u_vignette',
      ].sort(),
    )
    // 深海流光 c4 = #eed8aa（唯一高亮暖点）
    expect(u.u_c4).toEqual([0xee / 255, 0xd8 / 255, 0xaa / 255])
    expect(u.u_offset).toEqual([-1.24, -0.48])
    expect(u.u_brushStrength).toBe(1.8)
    expect(u.u_glowColor2).toEqual([0x53 / 255, 0x8d / 255, 0xca / 255])
    const uCoarse = uniformValuesOf(wp, true)
    expect(uCoarse.u_brushStrength).toBe(0)
  })

  it('8 项未消费参数不进 uniform 表（无据设计防线）', () => {
    const wp = wallpaperOf('fluid-aurora')
    if (wp?.kind !== 'fluid') throw new Error('极光翡翠应为流体主题（id 拼写回归）')
    const u = uniformValuesOf(wp, false)
    for (const unused of ['noiseBoost', 'distortion', 'swirl', 'swirlIterations', 'rotation', 'proportion', 'softness', 'shapeScale']) {
      expect(Object.keys(u)).not.toContain(unused)
    }
  })

  it('paletteOf：四套全部可解析', () => {
    for (const w of WALLPAPERS) {
      expect(paletteOf(w)).not.toBeNull()
    }
  })
})

describe('插值与帧闸', () => {
  it('stepPalette 收敛到目标且不改入参', () => {
    const from: [number, number, number][] = [[0, 0, 0]]
    const to: [number, number, number][] = [[1, 0.5, 0.25]]
    const snapshot = from.map((c) => [...c] as [number, number, number])
    let cur = from
    for (let i = 0; i < 200; i++) cur = stepPalette(cur, to, 0.06)
    const last = cur[0]!
    expect(last[0]).toBeCloseTo(1, 3)
    expect(last[1]).toBeCloseTo(0.5, 3)
    expect(last[2]).toBeCloseTo(0.25, 3)
    expect(from).toEqual(snapshot)
  })

  it('frameGate：间隔内跳帧；超间隔做漂移补偿（余数扣掉）', () => {
    expect(frameGate(50, 0, 100)).toBeNull()
    expect(frameGate(250, 0, 100)).toBe(200)
    expect(frameGate(233, 100, 100)).toBe(200)
  })
})

describe('createFluid 失败闭合', () => {
  it('无 WebGL2（getContext 恒 null）返回 null，不抛错', () => {
    const fake = {
      getContext: () => null,
    } as unknown as HTMLCanvasElement
    expect(createFluid(fake)).toBeNull()
  })
})
