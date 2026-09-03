/**
 * flow-rows 共享核单测（工单 R-B 下沉）：类别词映射、连续同类聚合、显示选项。
 * 承接自 apps/web/tests/chat-flow-rows.test.ts（实现上移后测试随实现走——四端同一回归网）；
 * 端特有派生各自留端测：web rowIndexOfEvent 在 apps/web/tests/chat-flow-rows.test.ts，
 * cli rowSettled 在 apps/cli/tests/render.test.tsx。
 */
import { describe, expect, it } from 'vitest'
import { ids } from '../src/ids'
import type { UiItem } from '../src/apply-event'
import { flowRowsOf, toolCategoryOf } from '../src/flow-rows'

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

function reasoning(n: number): UiItem {
  return { kind: 'reasoning', eventId: ids.event(`evt_reas00${n}`), text: '思考' }
}

function turn(n: number): UiItem {
  return {
    kind: 'turn',
    eventId: ids.event(`evt_turn00${n}`),
    turnId: ids.turn(`trn_000${n}`),
    startedAt: 0,
  }
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

  it('key 稳定：工具项按 callId、其余按 kind+eventId、组行按组内首条 callId', () => {
    const rows = flowRowsOf([user(1), tool('read', 1), tool('read', 2), tool('bash', 3)])
    expect(rows.map((r) => r.key)).toEqual([
      'user:evt_user001',
      'group:cal_tool001',
      'tool:cal_tool003',
    ])
  })
})

describe('flowRowsOf 显示选项（工单 10.20 A③）', () => {
  it('groupTools=false：连续同类工具不聚合，逐项成行', () => {
    const rows = flowRowsOf([tool('bash', 1), tool('bash', 2), tool('bash', 3)], {
      groupTools: false,
    })
    expect(rows.map((r) => r.kind)).toEqual(['item', 'item', 'item'])
  })

  it('firstReasoningPerTurn：每轮仅保留首条思考；跨轮各自保留', () => {
    const rows = flowRowsOf([turn(1), reasoning(1), reasoning(2), turn(2), reasoning(3)], {
      firstReasoningPerTurn: true,
    })
    // 保留：turn1 + trn1 首条思考 + turn2 + trn2 首条思考；trn1 第二条思考被隐藏
    expect(rows).toHaveLength(4)
    const kept = rows[1]
    if (kept === undefined || kept.kind !== 'item') throw new Error('unreachable')
    expect(kept.item.eventId).toBe('evt_reas001')
  })

  it('firstReasoningPerTurn 缺省关：全部思考照常展示', () => {
    const rows = flowRowsOf([turn(1), reasoning(1), reasoning(2)])
    expect(rows).toHaveLength(3)
  })

  it('readonly 入参可直传（cli 侧 items 为只读切片——签名并集验证）', () => {
    const items: readonly UiItem[] = [tool('bash', 1), tool('bash', 2)]
    expect(flowRowsOf(items)).toHaveLength(1)
  })
})
