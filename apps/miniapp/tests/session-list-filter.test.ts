/**
 * 会话列表筛选纯函数单测（工单 19.29）：三档筛选的查询参数、页头标题、分组结果。
 * 守的两条红线：① 归档档必须真的换数据源（archived=true 进查询串，客户端筛不出归档）；
 * ② 已归档不再是置灰占位（菜单必含该档，§13.J.2.2 原口径作废后不得回退）。
 */
import { describe, expect, it } from 'vitest'
import type { SessionDto } from '@spark/protocol'
import { ids } from '@spark/protocol'
import {
  SESSION_FILTERS,
  archivedQueryOf,
  buildSections,
  listTitleOf,
  projectOf,
} from '../src/session/session-list-filter'

const DAY = 24 * 60 * 60 * 1000

function ses(id: string, cwd: string, updatedAt: number): SessionDto {
  return {
    id: ids.session(`ses_mini_${id}`),
    title: id,
    model: 'openai/gpt-test',
    cwd,
    createdAt: updatedAt - DAY,
    updatedAt,
    lastSeq: 1,
    status: 'idle',
  }
}

describe('archivedQueryOf / listTitleOf（档位 → 数据源与标题）', () => {
  it('归档档切查询参数；其余档不带（缺省排除归档）', () => {
    expect(archivedQueryOf('all')).toBeUndefined()
    expect(archivedQueryOf('project')).toBeUndefined()
    expect(archivedQueryOf('archived')).toBe(true)
  })

  it('三档标题与菜单选项一一对应（标题写"全部会话"而停在归档档 = 谎报现状）', () => {
    expect(SESSION_FILTERS.map((f) => f.value)).toEqual(['all', 'project', 'archived'])
    for (const f of SESSION_FILTERS) expect(listTitleOf(f.value)).not.toBe('')
    expect(listTitleOf('archived')).toBe('已归档会话')
  })
})

describe('projectOf（分组键 = cwd 末段目录名）', () => {
  it('posix 与 windows 分隔符都取末段；空 cwd 归"未分组"', () => {
    expect(projectOf(ses('a', '/home/u/code/spark', 1))).toBe('spark')
    expect(projectOf(ses('b', 'C:\\code\\spark\\', 1))).toBe('spark')
    expect(projectOf(ses('c', '', 1))).toBe('未分组')
    expect(projectOf(ses('d', '   ', 1))).toBe('未分组')
  })
})

describe('buildSections（分组与排序）', () => {
  const now = Date.now()
  const earlier = now - 3 * DAY

  it('时间档：今天/更早两段，updatedAt 倒序', () => {
    const list = [ses('old1', '/w/a', earlier), ses('t1', '/w/a', now - 1000), ses('t2', '/w/b', now)]
    const sections = buildSections(list, 'all')
    expect(sections.map((s) => s.title)).toEqual(['今天', '更早'])
    expect(sections[0]?.items.map((i) => i.title)).toEqual(['t2', 't1'])
  })

  it('项目档：按首现顺序出组，组内仍倒序；空组不占位', () => {
    const list = [
      ses('a1', '/w/alpha', now),
      ses('b1', '/w/beta', now - 1000),
      ses('a2', '/w/alpha', now - 2000),
    ]
    const sections = buildSections(list, 'project')
    expect(sections.map((s) => `${s.key}:${s.items.length}`)).toEqual([
      'project:alpha:2',
      'project:beta:1',
    ])
    expect(sections[0]?.items.map((i) => i.title)).toEqual(['a1', 'a2'])
  })

  it('归档档沿用时间分组（分组语义不随档位分叉）', () => {
    const sections = buildSections([ses('g1', '/w/a', now)], 'archived')
    expect(sections.map((s) => s.key)).toEqual(['today'])
  })

  it('空列表出空分组（页面据此呈现空态，不拿假分组凑版面）', () => {
    expect(buildSections([], 'all')).toEqual([])
    expect(buildSections([], 'project')).toEqual([])
  })

  it('入参不可变：不排序调用方持有的快照数组', () => {
    const list = [ses('x', '/w/a', now), ses('y', '/w/a', now + 1000)]
    buildSections(list, 'all')
    expect(list.map((s) => s.title)).toEqual(['x', 'y'])
  })
})
