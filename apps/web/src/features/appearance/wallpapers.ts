/**
 * 壁纸主题注册表（19.43 批 1；DESIGN §12.9 限定豁免层）。
 * 四套程序化流体定义自上游 wallpapers.ts 镜像（取证报告 §1.1，A 级产品真值）——
 * 数组顺序即选择器顺序。五套静帧主题（§1.2）随批 2 素材落地，本批不注册。
 * 调色板结构规律（四套一致，是设计意图）：c1/c5 近黑收口，c2/c3 同色系两级，
 * c4 唯一高亮点；glowColors 恒为「近白 → accent → 深暗」，accent 恒等于 glowColors[1]。
 * 彩色只允许存在于 canvas 像素里（§12.9 边界②）——本表是唯一的色值常量源，
 * 仅供渲染器/thumbnail 消费，禁止溢出到任何 CSS/Tailwind 类。
 */

/** 流体主题（colors[5] / glowColors[3] / accent；i18nKey 指 protocol i18n.ts 的 wallpaper 命名空间） */
export interface FluidWallpaper {
  kind: 'fluid'
  id: FluidWallpaperId
  i18nKey: string
  colors: readonly [string, string, string, string, string]
  glowColors: readonly [string, string, string]
  accent: string
}

export type FluidWallpaperId = 'fluid-deep-ocean' | 'fluid-aurora' | 'fluid-amethyst' | 'fluid-ember'

export const WALLPAPERS = [
  {
    kind: 'fluid',
    id: 'fluid-deep-ocean',
    i18nKey: 'fluidDeepOcean',
    colors: ['#000000', '#1A3870', '#204a7e', '#eed8aa', '#000000'],
    glowColors: ['#fff7d1', '#538dca', '#2d448b'],
    accent: '#538dca',
  },
  {
    kind: 'fluid',
    id: 'fluid-aurora',
    i18nKey: 'fluidAurora',
    colors: ['#020807', '#063c42', '#0f7168', '#b8ffd9', '#010806'],
    glowColors: ['#d9fff0', '#4be0c1', '#0b6470'],
    accent: '#4be0c1',
  },
  {
    kind: 'fluid',
    id: 'fluid-amethyst',
    i18nKey: 'fluidAmethyst',
    colors: ['#05020b', '#25115a', '#57318c', '#f0b8ff', '#08020e'],
    glowColors: ['#ffe3ff', '#b46fff', '#552b8d'],
    accent: '#b46fff',
  },
  {
    kind: 'fluid',
    id: 'fluid-ember',
    i18nKey: 'fluidEmber',
    colors: ['#080201', '#4e130b', '#92361e', '#ffd08a', '#0b0201'],
    glowColors: ['#fff1c4', '#ff8a45', '#7d2618'],
    accent: '#ff8a45',
  },
] as const satisfies readonly FluidWallpaper[]

/** 设置项取值：'none'（缺省关闭）+ 各主题 id（静帧主题批 2 追加进联合） */
export type WallpaperId = 'none' | FluidWallpaperId

/** id 白名单（settings-store 坏数据收窄用；'none' 单独判） */
export const WALLPAPER_IDS: ReadonlySet<string> = new Set(WALLPAPERS.map((w) => w.id))

/** 按 id 取主题；未知 id（含 'none'）返回 null——调用方按无壁纸处理，禁假状态 */
export function wallpaperOf(id: string): FluidWallpaper | null {
  const found = WALLPAPERS.find((w) => w.id === id)
  return found ?? null
}
