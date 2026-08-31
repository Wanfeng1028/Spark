/**
 * 显示宽度工具（工单 10.19）：终端按显示宽度排版——CJK 一字占 2 列、emoji/代理对
 * 是单字位，UTF-16 code unit 口径（length/slice/padEnd）与终端实际换行不一致=中文行错位。
 * 口径清单：
 * - displayWidth：string-width（MIT；依赖理由见 package.json——终端宽度事实表，
 *   自维护宽度表是复发温床，能复用开源就不自己写）；
 * - graphemesOf：Intl.Segmenter 字位数组（光标/退格按字位移动，代理对不被切半）；
 * - truncateByWidth / padEndByWidth：宽度口径截断/补齐（截断补 …）。
 * 落位＝cli 本地而非 @spark/protocol 出口：终端宽度只有 CLI 用；置于共享 index 会让
 * ESM-only 的 string-width 被动进入 web/mobile/miniapp 依赖图（mobile Jest 解析不了）。
 */
import stringWidth from 'string-width'

/** 终端显示宽度（CJK=2 列、emoji 单字位、控制符 0） */
export function displayWidth(text: string): number {
  return stringWidth(text)
}

/** 字位数组（光标语义的单位；Intl.Segmenter 缺省环境回退码点数组） */
export function graphemesOf(text: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
      (s) => s.segment,
    )
  }
  return Array.from(text)
}

/**
 * 按显示宽度截断：不超原样返回；超出截到 maxWidth-1 列内并补 …（maxWidth≤1 时不补省略号）。
 * 按字位切——代理对/组合字符不被切半。
 */
export function truncateByWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  if (stringWidth(text) <= maxWidth) return text
  const budget = maxWidth > 1 ? maxWidth - 1 : maxWidth
  let used = 0
  let out = ''
  for (const g of graphemesOf(text)) {
    const w = stringWidth(g)
    if (used + w > budget) break
    out += g
    used += w
  }
  return maxWidth > 1 ? `${out}…` : out
}

/** 补齐到指定显示宽度（尾部补空格；超宽先截断） */
export function padEndByWidth(text: string, width: number): string {
  const t = truncateByWidth(text, width)
  return t + ' '.repeat(Math.max(0, width - stringWidth(t)))
}
