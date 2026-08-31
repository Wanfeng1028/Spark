/**
 * 显示宽度工具单测（工单 10.19）：CJK 双列 / emoji 字位 / 截断补齐口径。
 */
import { describe, expect, it } from 'vitest'
import { displayWidth, graphemesOf, padEndByWidth, truncateByWidth } from '../src/text-width.js'

describe('displayWidth', () => {
  it('ASCII 一字符一列', () => {
    expect(displayWidth('abc')).toBe(3)
  })

  it('CJK 一字占 2 列', () => {
    expect(displayWidth('中文')).toBe(4)
    expect(displayWidth('a中b')).toBe(4)
  })

  it('emoji 代理对按单字位计宽', () => {
    expect(graphemesOf('👍').length).toBe(1) // 代理对不切半
    expect(displayWidth('👍')).toBe(2)
  })
})

describe('graphemesOf', () => {
  it('组合字符按字位切分（不切半）', () => {
    expect(graphemesOf('中文abc').join('')).toBe('中文abc')
    expect(graphemesOf('👍👎')).toHaveLength(2)
  })
})

describe('truncateByWidth', () => {
  it('不超宽原样返回', () => {
    expect(truncateByWidth('abc', 5)).toBe('abc')
    expect(truncateByWidth('中文', 4)).toBe('中文')
  })

  it('超宽截断补 …（按字位不切半）', () => {
    expect(truncateByWidth('abcdef', 4)).toBe('abc…')
    const t = truncateByWidth('中文测试', 5)
    expect(t.endsWith('…')).toBe(true)
    expect(displayWidth(t)).toBeLessThanOrEqual(5)
  })

  it('maxWidth 极小不崩', () => {
    expect(truncateByWidth('中文', 0)).toBe('')
    expect(truncateByWidth('中', 1)).not.toContain('…')
  })
})

describe('padEndByWidth', () => {
  it('ASCII 补齐到指定宽度', () => {
    expect(padEndByWidth('ab', 5)).toBe('ab   ')
  })

  it('CJK 按显示宽度补齐', () => {
    const padded = padEndByWidth('中', 6)
    expect(displayWidth(padded)).toBe(6)
  })

  it('超宽先截断', () => {
    const padded = padEndByWidth('abcdef', 4)
    expect(displayWidth(padded)).toBeLessThanOrEqual(4)
  })
})
