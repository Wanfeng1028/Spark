/**
 * Markdown-lite 渲染扩展单测（阶段十九 19.25 第二批）：表格与引用块。
 * 表格断言的是**显示宽度对齐**（CJK 一格两列——按 code unit 数算宽度必然错列），
 * 以及流式未收 full 时按普通文本降级（不得画出半截表格）。
 */
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { Markdown } from '../src/components/markdown.js'
import { displayWidth } from '../src/text-width.js'

function frameOf(text: string): string[] {
  const { lastFrame } = render(<Markdown text={text} />)
  return (lastFrame() ?? '').split('\n').map((l) => l.replace(/\s+$/, ''))
}

/** 分隔符所在显示宽度列（对齐判据）：表头与表体的分隔符是 `│`，分隔线那一行是 `┼`——
 *  两者按实现都在"列宽 + 1"同一列（行拼 `' │ '`、线拼 `'─┼─'`），只找 `│` 会把分隔线
 *  读成 -1，于是"各行同列"永远不成立 */
function ruleColumn(line: string): number {
  const hits = ['│', '┼'].map((c) => line.indexOf(c)).filter((i) => i >= 0)
  if (hits.length === 0) return -1
  return displayWidth(line.slice(0, Math.min(...hits)))
}

describe('Markdown 引用块（工单 19.25）', () => {
  it('连续 > 行归一块，左竖线一次一行且块内行内标记照常', () => {
    const lines = frameOf('> 第一**加粗**\n> 第二行\n普通行')
    expect(lines.some((l) => l.includes('│ 第一'))).toBe(true)
    expect(lines.some((l) => l.includes('│ 第二行'))).toBe(true)
    expect(lines.some((l) => l.includes('│ 普通行'))).toBe(false)
  })

  it('单个 > 行也成块（不因只有一行而退化）', () => {
    expect(frameOf('> 唯一一行').some((l) => l.includes('│ 唯一一行'))).toBe(true)
  })
})

describe('Markdown 表格（工单 19.25）', () => {
  const table = ['| 名称 | 大小 |', '| --- | --- |', '| markdown.tsx | 3KB |', '| items.tsx | 12KB |'].join(
    '\n',
  )

  it('表头/分隔行/表体齐全才成表，且各行竖线同列（CJK 对齐）', () => {
    const lines = frameOf(table)
    const rule = lines.find((l) => l.includes('─'))
    expect(rule).toBeDefined()
    const header = lines.find((l) => l.includes('名称') && l.includes('│'))
    const body = lines.filter((l) => l.includes('markdown.tsx') || l.includes('items.tsx'))
    expect(header).toBeDefined()
    expect(body).toHaveLength(2)
    const cols = new Set([header, rule, ...body].map((l) => ruleColumn(l ?? '')))
    expect(cols.size).toBe(1)
  })

  it('只有竖线、没有分隔行 → 按普通文本降级（不误判成表）', () => {
    const lines = frameOf('| a | b |\n| c | d |')
    expect(lines.some((l) => l.includes('─'))).toBe(false)
    expect(lines.some((l) => l.includes('| a | b |'))).toBe(true)
  })

  it('流式半截表（表头到、分隔行未到）不画表格框', () => {
    expect(frameOf('| 名称 | 大小 |').some((l) => l.includes('─'))).toBe(false)
  })

  it('行内标记在表格里剥掉——保留会改变显示宽度从而错列', () => {
    const lines = frameOf(['| **名称** | 大小 |', '| --- | --- |', '| `a` | 1 |'].join('\n'))
    expect(lines.some((l) => l.includes('**'))).toBe(false)
    expect(lines.some((l) => l.includes('`'))).toBe(false)
    const header = lines.find((l) => l.includes('名称') && l.includes('│'))
    const body = lines.find((l) => l.includes('a') && l.includes('│') && !l.includes('─'))
    expect(ruleColumn(header ?? '')).toBe(ruleColumn(body ?? ''))
  })

  it('围栏代码块内的竖线不成表（代码原样呈现）', () => {
    const lines = frameOf(['```', '| a | b |', '| --- | --- |', '```'].join('\n'))
    expect(lines.some((l) => l.includes('─'))).toBe(false)
    expect(lines.some((l) => l.includes('| a | b |'))).toBe(true)
  })
})
