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
  const now0 = Date.now()
  const earlier0 = now0 - 3 * DAY

  it('时间档：今天/更早两段，updatedAt 倒序', () => {
    const list = [ses('old1', '/w/a', earlier0), ses('t1', '/w/a', now0 - 1000), ses('t2', '/w/b', now0)]
    const sections = buildSections(list, 'all')
    expect(sections.map((sec) => sec.title)).toEqual(['今天', '更早'])
    expect(sections[0]?.items.map((i) => i.title)).toEqual(['t2', 't1'])
  })

  it('项目档：按首现顺序出组，组内仍倒序；空组不占位', () => {
    const list = [
      ses('a1', '/w/alpha', now0),
      ses('b1', '/w/beta', now0 - 1000),
      ses('a2', '/w/alpha', now0 - 2000),
    ]
    const sections = buildSections(list, 'project')
    expect(sections.map((sec) => `${sec.key}:${sec.items.length}`)).toEqual([
      'project:alpha:2',
      'project:beta:1',
    ])
    expect(sections[0]?.items.map((i) => i.title)).toEqual(['a1', 'a2'])
  })

  it('归档档沿用时间分组（分组语义不随档位分叉）', () => {
    const sections = buildSections([ses('g1', '/w/a', now0)], 'archived')
    expect(sections.map((sec) => sec.key)).toEqual(['today'])
  })
})

describe('buildSections——置顶段（19.29 收口批，19.41 接入）', () => {
  // 时间戳用相对当前时刻——分档走 isToday（本地时区与真实今天全等），写死纪元值
  // 永远落「更早」段（CI Linux 首裁确定性红，run 37117095474 取证）
  const now0 = Date.now()
  const pinnedOld = { ...ses('pinned-old', '/work/app', now0 - 3 * DAY), pinned: true } as SessionDto
  const today1 = ses('today-1', '/work/app', now0 - 1000)
  const today2 = ses('today-2', '/work/app', now0 - 2000)

  it('置顶会话从各段提出合成首个「置顶」组；其余段不再含置顶项', () => {
    const sections = buildSections([today1, pinnedOld, today2], 'all')
    expect(sections[0]?.key).toBe('pinned')
    expect(sections[0]?.items.map((s) => s.title)).toEqual(['pinned-old'])
    expect(sections).toHaveLength(2)
    const today = sections.find((s) => s.key === 'today')
    expect(today?.items.map((s) => s.title)).toEqual(['today-1', 'today-2'])
  })

  it('无置顶会话不出现「置顶」段（禁假状态）；项目档同样先出置顶组', () => {
    expect(buildSections([today1], 'all').map((s) => s.key)).toEqual(['today'])
    const sections = buildSections([pinnedOld, today1], 'project')
    expect(sections[0]?.key).toBe('pinned')
    expect(sections).toHaveLength(2)
  })
})


describe('buildSections——时间与项目档（旧主组，19.29 收口批后保留）', () => {
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
