/**
 * 侧栏分组纯函数单测（工单 19.41）：置顶单列首组的规则。
 * 断言的是"组序与组内序"，不是渲染——分组键由调用方传入，故这里用最小 keyOf/orderOf。
 */
import { describe, expect, test } from 'vitest'
import type { SessionDto } from '@spark/protocol'
import { groupSessionsForSidebar } from '@/components/layout/session-groups'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

function dto(id: string, over: Partial<SessionDto> = {}): SessionDto {
  return {
    id: id as SessionDto['id'],
    title: id,
    model: 'fake/fake-chat',
    cwd: '/repo/alpha',
    createdAt: NOW - 10 * DAY,
    updatedAt: NOW - DAY,
    lastSeq: 1,
    status: 'idle',
    ...over,
  }
}

const projectKey = (s: SessionDto): string => s.cwd.split('/').pop() ?? s.cwd
const noOrder = (): number => -1

describe('groupSessionsForSidebar（置顶首组）', () => {
  test('pinned 会话从各组提出并合成首个「置顶」组，组内按 updatedAt 倒序', () => {
    const groups = groupSessionsForSidebar(
      [
        dto('a', { pinned: true, updatedAt: NOW - 3 * DAY, cwd: '/repo/beta' }),
        dto('b', { updatedAt: NOW - 1 * DAY, cwd: '/repo/alpha' }),
        dto('c', { pinned: true, updatedAt: NOW - 9 * DAY, cwd: '/repo/gamma' }),
      ],
      '',
      projectKey,
      noOrder,
    )
    expect(groups.map((g) => g.name)).toEqual(['置顶', 'alpha', 'beta', 'gamma'])
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(['a', 'c'])
  })

  test('无置顶时不得出现空的「置顶」组（禁假结构）', () => {
    const groups = groupSessionsForSidebar([dto('a'), dto('b')], '', projectKey, noOrder)
    expect(groups.some((g) => g.name === '置顶')).toBe(false)
  })

  test('pinned 缺省（未置顶不携带字段）不得被误判为置顶', () => {
    const groups = groupSessionsForSidebar([dto('a', { pinned: undefined })], '', projectKey, noOrder)
    expect(groups[0]?.name).toBe('alpha')
  })

  test('搜索过滤同样作用于置顶组（不匹配的置顶项不出现）', () => {
    const groups = groupSessionsForSidebar(
      [dto('keep', { pinned: true }), dto('drop', { pinned: true, title: '另一个' })],
      'keep',
      projectKey,
      noOrder,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(['keep'])
  })

  test('时间模式固定段序保持，置顶组仍在其前', () => {
    const orderOf = (name: string): number =>
      ['今天', '昨天', '7 天内', '更早'].indexOf(name)
    const groups = groupSessionsForSidebar(
      [
        dto('today', { updatedAt: NOW - 1 }),
        dto('older', { updatedAt: NOW - 30 * DAY }),
        dto('pin', { pinned: true, updatedAt: NOW - 40 * DAY }),
      ],
      '',
      () => 'x',
      orderOf,
    )
    expect(groups.map((g) => g.name)).toEqual(['置顶', '今天', '更早'])
  })
})
