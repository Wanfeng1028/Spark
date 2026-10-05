/**
 * 主题 accent 对比度闸（19.43 批 2 尾片；DESIGN §12.9 边界① v2.37 拍板）：
 * 主题 accent 可改写 §13.C --spark-accent 与 §13.L --send-accent 两族点睛色，但
 * **亮色下不达 AA 4.5:1 即回落**——静帧走 accentFallback、流体走 glowColors 深暗端
 * （glowColors[2]，即「近白 → accent → 深暗」的收口位），仍不足回落缺省 indigo
 * （本函数返回 null = 不注入任何 CSS 变量，tokens.css 既有值原样生效）。
 * 深色端同走一道闸（浅 pastel 对深底普遍 >7:1，闸只是防线不是死规则）。
 * 对比面取内容底色：亮 #ffffff / 暗 #18181b（tokens.css 两端主底）。
 * 纯函数无 DOM——CSS 变量写入在 settings-store 的 applyWallpaperAccent。
 * 上游 dsh-beyond-glass 直接改写 documentElement accent 的做法**禁抄**（spike §1.3
 * 判例），闸与回落面是本仓对 DESIGN v2.37 拍板的实现形态。
 */
import type { FluidWallpaper, StaticWallpaper } from './wallpapers'

/** AA 门槛（DESIGN §12.9 边界④：对比度硬约束不豁免） */
const AA_CONTRAST = 4.5

/** 对比面（tokens.css：--background 亮 #ffffff / 暗 --sidebar-bg #18181b 系主底） */
const LIGHT_SURFACE = '#ffffff'
const DARK_SURFACE = '#18181b'

/** 6 位 hex → 线性 RGB 亮度（WCAG 2.x 相对亮度；#RRGGBB 是本注册表唯一色形） */
function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 0
  const ch = [0, 2, 4].map((i) => {
    const c = Number.parseInt(hex.slice(i + 1, i + 3), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = ch
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/** WCAG 对比度（(L1+0.05)/(L2+0.05)，恒 ≥1） */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** hex 向目标色按 t 混合（hover 派生用；亮色提亮向白、暗色压暗向黑） */
function mixHex(hex: string, toward: string, t: number): string {
  const p = (h: string): [number, number, number] => [
    Number.parseInt(h.slice(1, 3), 16),
    Number.parseInt(h.slice(3, 5), 16),
    Number.parseInt(h.slice(5, 7), 16),
  ]
  const [a1, a2, a3] = p(hex)
  const [b1, b2, b3] = p(toward)
  const q = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${q(a1 ?? 0, b1 ?? 0)}${q(a2 ?? 0, b2 ?? 0)}${q(a3 ?? 0, b3 ?? 0)}`
}

interface ResolvedThemeAccent {
  /** 过闸点睛色（写 --spark-accent 与 --send-accent） */
  accent: string
  /** hover 派生（写 --send-accent-hover）：亮色向白 25% 提亮 / 暗色向黑 25% 压暗——
   *  方向拟合既有 --send-accent 对（亮 hover 提亮、暗 hover 压暗），值不逐字复刻 */
  hover: string
}

/**
 * 解析主题点睛色：按亮/暗取对比面，候选链 [accent → 回落位] 首个过 AA 者胜；
 * 全部落选返回 null（= 缺省 indigo 原样，不注入变量）。回落位：静帧 accentFallback、
 * 流体 glowColors[2]。
 */
export function resolveThemeAccent(
  w: FluidWallpaper | StaticWallpaper,
  dark: boolean,
): ResolvedThemeAccent | null {
  const surface = dark ? DARK_SURFACE : LIGHT_SURFACE
  const fallback = w.kind === 'static' ? w.accentFallback : w.glowColors[2]
  for (const candidate of [w.accent, fallback]) {
    if (contrastRatio(candidate, surface) >= AA_CONTRAST) {
      return {
        accent: candidate,
        hover: mixHex(candidate, dark ? '#000000' : '#ffffff', 0.25),
      }
    }
  }
  return null
}
