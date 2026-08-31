/**
 * chat-flow-rows 纯逻辑单测（工单 10.4④）：类别词映射、连续同类聚合、搜索行定位。
 */
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import type { UiItem } from '@spark/protocol'
import { flowRowsOf, rowIndexOfEvent, toolCategoryOf } from '@/features/chat/chat-flow-rows'

function tool(name: string, n: number): UiItem {
  return {
    kind: 'tool',
    eventId: ids.event(`evt_tool00${n}`),
    callId: ids.call(`cal_tool00${n}`),
    name,
    input: {},
    status: 'completed',
    progressBuf: '',
  }
}

function user(n: number): UiItem {
  return { kind: 'user', eventId: ids.event(`evt_user00${n}`), text: 'x' }
}

describe('toolCategoryOf（人话类别词）', () => {
  it('内置工具映射中文类别词', () => {
    expect(toolCategoryOf('bash')).toBe('终端')
    expect(toolCategoryOf('read')).toBe('读取')
    expect(toolCategoryOf('write')).toBe('写入')
    expect(toolCategoryOf('edit')).toBe('改写')
    expect(toolCategoryOf('task')).toBe('子代理')
    expect(toolCategoryOf('memory.save')).toBe('记忆')
    expect(toolCategoryOf('memory.search')).toBe('记忆')
    expect(toolCategoryOf('browser.open')).toBe('浏览')
    expect(toolCategoryOf('browser.screenshot')).toBe('浏览')
  })

  it('未知工具（mcp/插件）保留原名——禁假状态', () => {
    expect(toolCategoryOf('mcp__github__search')).toBe('mcp__github__search')
  })
})

describe('flowRowsOf（连续同类聚合）', () => {
  it('连续 ≥2 条同类别工具 → 组行', () => {
    const rows = flowRowsOf([tool('bash', 1), tool('bash', 2), tool('bash', 3)])
    expect(rows).toHaveLength(1)
    const g = rows[0]
    if (g === undefined || g.kind !== 'toolGroup') throw new Error('unreachable')
    expect(g.category).toBe('终端')
    expect(g.tools).toHaveLength(3)
  })

  it('孤立工具不组；跨类相邻不合并', () => {
    const rows = flowRowsOf([tool('bash', 1), tool('read', 2)])
    expect(rows.map((r) => r.kind)).toEqual(['item', 'item'])
  })

  it('非工具项打断连续性：前后两段各自聚合', () => {
    const rows = flowRowsOf([
      tool('read', 1),
      tool('read', 2),
      user(1),
      tool('read', 3),
      tool('read', 4),
      tool('read', 5),
    ])
    expect(rows.map((r) => r.kind)).toEqual(['toolGroup', 'item', 'toolGroup'])
    const g2 = rows[2]
    if (g2 === undefined || g2.kind !== 'toolGroup') throw new Error('unreachable')
    expect(g2.tools).toHaveLength(3)
  })

  it('不同类别相邻：各自单独成行不合并', () => {
    const rows = flowRowsOf([tool('bash', 1), tool('bash', 2), tool('read', 3), tool('read', 4)])
    expect(rows.map((r) => r.kind)).toEqual(['toolGroup', 'toolGroup'])
    const g0 = rows[0]
    const g1 = rows[1]
    if (g0 === undefined || g0.kind !== 'toolGroup') throw new Error('unreachable')
    if (g1 === undefined || g1.kind !== 'toolGroup') throw new Error('unreachable')
    expect(g0.category).toBe('终端')
    expect(g1.category).toBe('读取')
  })
})

describe('rowIndexOfEvent（搜索跳转行定位）', () => {
  it('命中组内工具与单项', () => {
    const rows = flowRowsOf([user(1), tool('bash', 1), tool('bash', 2)])
    expect(rowIndexOfEvent(rows, 'evt_user001')).toBe(0)
    expect(rowIndexOfEvent(rows, 'evt_tool002')).toBe(1)
    expect(rowIndexOfEvent(rows, 'evt_none000')).toBe(-1)
  })
})
