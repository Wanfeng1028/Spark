/**
 * 主题 token AA 对比度复核（DESIGN §13.C / 工单 6.1 验收）：
 * 解析 tokens.css 的 :root（light）与 .dark 两块 token，按 WCAG 2.1 相对亮度公式
 * 计算文本色×背景的对比度——正文 ≥4.5:1（小号文本色全部按正文标准把关）。
 * token 值改动即在此红灯，取代人工肉眼复核。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../src/styles/tokens.css')
const css = readFileSync(cssPath, 'utf8')

/** 提取选择器块内的 --token: #hex 映射 */
function tokensOf(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`tokens.css 缺 ${selector} 块`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const map: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
    const name = m[1]
    const value = m[2]
    if (name !== undefined && value !== undefined) map[name] = value.toLowerCase()
  }
  return map
}

const light = tokensOf(':root')
const dark = tokensOf('.dark')

/** sRGB 分量 → 线性亮度 */
function channel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** 文本×背景断言对（§13.C 表中承载文本的 token；小号文本一律按正文 4.5:1 把关） */
const PAIRS: [fg: string, bg: string][] = [
  ['--foreground', '--background'],
  ['--foreground', '--card'],
  ['--foreground', '--popover'],
  ['--muted-foreground', '--background'],
  ['--muted-foreground', '--card'],
  ['--primary-foreground', '--primary'],
  ['--accent-foreground', '--accent'],
  ['--secondary-foreground', '--secondary'],
  ['--destructive', '--background'],
  ['--spark-accent', '--background'],
  ['--spark-warn', '--background'],
  ['--spark-ok', '--background'],
  ['--spark-err', '--background'],
]

describe.each([
  ['light (:root)', light],
  ['dark (.dark)', dark],
])('主题 %s AA 对比度', (_name, tokens) => {
  it.each(PAIRS)('%s on %s ≥ 4.5:1', (fg, bg) => {
    const fgHex = tokens[fg]
    const bgHex = tokens[bg]
    if (fgHex === undefined) throw new Error(`token ${fg} 未定义`)
    if (bgHex === undefined) throw new Error(`token ${bg} 未定义`)
    const ratio = contrast(fgHex, bgHex)
    expect(ratio, `${fgHex} on ${bgHex} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })
})
