/**
 * 会话列表控制器单测（工单 19.27）：筛选档→数据源映射（已归档档必须真的带
 * `archived=true` 去请求）、失败闭合（旧快照不丢）、切档重取、就地校正、dispose 静默。
 */
import type { SessionDto, Transport } from '@spark/protocol'
import { ids } from '@spark/protocol'
import {
  createSessionListController,
  groupSessions,
  projectNameOf,
  type SessionListSnapshot,
} from '../src/session/session-list'

const SID = ids.session('ses_list_ctrl_1')

/** notice 自清定时器给长值——断言只看动作当场写入的那一帧，不被定时器抢跑 */
const NOTICE_MS = 60_000

function dto(id: string, updatedAt: number, cwd = '/work/spark-app'): SessionDto {
  return {
    id: ids.session(id),
    title: id,
    model: 'test/model',
    cwd,
    createdAt: updatedAt - 1000,
    updatedAt,
    lastSeq: 0,
    status: 'idle',
  }
}

/** 等一轮宏任务：让 void this.refresh() 的在途请求落地 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** 只实现控制器用到的那一个方法（其余方法用不上，形状由 Pick 约束） */
function restOf(transport: Pick<Transport, 'listSessions'>): () => Pick<Transport, 'listSessions'> {
  return () => transport
}

function harness(initial: SessionDto[] = []) {
  const snapshots: SessionListSnapshot[] = []
  const page = initial
  const listSessions = jest.fn((archived?: boolean): Promise<SessionDto[]> =>
    Promise.resolve(archived === true ? [dto('archived-1', 500)] : page),
  )
  const controller = createSessionListController({
    rest: restOf({ listSessions }),
    onUpdate: (s) => snapshots.push(s),
    unconfiguredNotice: '未配置服务器',
    noticeMs: NOTICE_MS,
  })
  return {
    controller,
    snapshots,
    listSessions,
    last: () => snapshots[snapshots.length - 1],
  }
}

describe('session-list 控制器——筛选档与数据源', () => {
  it('缺省档取未归档列表：listSessions(false)', async () => {
    const h = harness([dto(SID, 1000)])
    await h.controller.refresh()
    expect(h.listSessions).toHaveBeenCalledWith(false)
    expect(h.last()?.sessions).toHaveLength(1)
    expect(h.last()?.loaded).toBe(true)
    expect(h.last()?.notice).toBeNull()
    h.controller.dispose()
  })

  it('切到"已归档"档即以 archived=true 重取（V2-23 接通，不再是置灰占位）', async () => {
    const h = harness([dto(SID, 1000)])
    await h.controller.refresh()
    h.controller.setFilter('archived')
    await flush()
    expect(h.listSessions).toHaveBeenLastCalledWith(true)
    expect(h.last()?.filter).toBe('archived')
    expect(h.last()?.sessions.map((s) => s.title)).toEqual(['archived-1'])
    h.controller.dispose()
  })

  it('切回"全部"再取 archived=false（两次 REST，不是本地过滤）', async () => {
    const h = harness([dto(SID, 1000)])
    h.controller.setFilter('archived')
    await flush()
    h.controller.setFilter('all')
    await flush()
    expect(h.listSessions.mock.calls.flat()).toEqual([true, false])
    h.controller.dispose()
  })

  it('同档重复 setFilter 不重取（无谓请求）', async () => {
    const h = harness()
    await h.controller.refresh()
    const calls = h.listSessions.mock.calls.length
    h.controller.setFilter('all')
    expect(h.listSessions.mock.calls.length).toBe(calls)
    h.controller.dispose()
  })

  it('未配置服务器：不发请求、如实提示、结束装载态', async () => {
    const snapshots: SessionListSnapshot[] = []
    const controller = createSessionListController({
      rest: () => null,
      onUpdate: (s) => snapshots.push(s),
      unconfiguredNotice: '未配置服务器',
      noticeMs: NOTICE_MS,
    })
    await controller.refresh()
    const last = snapshots[snapshots.length - 1]
    expect(last?.notice).toBe('未配置服务器')
    expect(last?.loaded).toBe(true)
    expect(last?.refreshing).toBe(false)
    controller.dispose()
  })
})

describe('session-list 控制器——失败闭合与就地校正', () => {
  it('取列表失败：保留旧快照（不拿空列表冒充"没有会话"）并挂人话错误', async () => {
    const snapshots: SessionListSnapshot[] = []
    let shouldFail = false
    const controller = createSessionListController({
      rest: restOf({
        listSessions: (): Promise<SessionDto[]> => {
          if (shouldFail) return Promise.reject(new Error('E_NETWORK: 连不上'))
          return Promise.resolve([dto(SID, 1000)])
        },
      }),
      onUpdate: (s) => snapshots.push(s),
      unconfiguredNotice: '未配置服务器',
      noticeMs: NOTICE_MS,
    })
    await controller.refresh()
    shouldFail = true
    await controller.refresh()
    const last = snapshots[snapshots.length - 1]
    expect(last?.sessions).toHaveLength(1)
    expect(last?.notice).toContain('连不上')
    controller.dispose()
  })

  it('dispose 后在途结果不写回（切页竞态：旧 controller 不得污染新页面）', async () => {
    const snapshots: SessionListSnapshot[] = []
    const settled: { resolve: ((v: SessionDto[]) => void) | null } = { resolve: null }
    const controller = createSessionListController({
      rest: restOf({
        listSessions: () =>
          new Promise<SessionDto[]>((res) => {
            settled.resolve = res
          }),
      }),
      onUpdate: (s) => snapshots.push(s),
      unconfiguredNotice: '未配置服务器',
      noticeMs: NOTICE_MS,
    })
    const inflight = controller.refresh()
    controller.dispose()
    const afterDispose = snapshots.length
    settled.resolve?.([dto(SID, 1000)])
    await inflight
    expect(snapshots.length).toBe(afterDispose)
  })
})

describe('groupSessions——三档分段', () => {
  const rows = [
    dto('a', 1_000, '/work/alpha'),
    dto('b', 2_000, '/work/beta'),
    dto('c', 3_000, '/work/alpha'),
  ]

  it('时间档按 todayOf 注入分"今天/更早"，组内 updatedAt 倒序', () => {
    const sections = groupSessions(rows, 'all', (ts) => ts >= 2_500)
    expect(sections.map((s) => s.key)).toEqual(['today', 'earlier'])
    expect(sections[0]?.items.map((s) => s.title)).toEqual(['c'])
    expect(sections[1]?.items.map((s) => s.title)).toEqual(['b', 'a'])
  })

  it('项目档按 cwd 末级目录名分组（首现顺序），空 cwd 归"未分组"', () => {
    const sections = groupSessions([...rows, dto('d', 4_000, '')], 'project')
    expect(sections.map((s) => s.title)).toEqual(['未分组', 'alpha', 'beta'])
    expect(sections[1]?.items.map((s) => s.title)).toEqual(['c', 'a'])
  })

  it('已归档档沿用时间分段（与"全部"同形态，只是数据源不同）', () => {
    const sections = groupSessions(rows, 'archived', (ts) => ts === 3_000)
    expect(sections.map((s) => s.key)).toEqual(['today', 'earlier'])
  })

  it('projectNameOf：正斜杠/反斜杠/带尾斜杠/空串', () => {
    expect(projectNameOf('/a/b/c')).toBe('c')
    expect(projectNameOf('C:\\work\\spark')).toBe('spark')
    expect(projectNameOf('/a/b/')).toBe('b')
    expect(projectNameOf('')).toBe('未分组')
  })
})
