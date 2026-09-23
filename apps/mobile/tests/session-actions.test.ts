/**
 * 会话菜单动作控制器单测（工单 19.27）：调用序列（用到哪个 Transport 方法、参数是什么）、
 * 单飞闸门（连点不产生第二次请求）、失败闭合（不写成功态、不假报）、
 * 反馈票型表只在请求成功后更新（禁乐观更新）。
 *
 * teardown 纪律：notice 自清定时器（本文件给 60s）是**活动句柄**——用例结束不 dispose
 * 就把它留在事件循环上，jest worker 收尾时等不到进程退出，只能被强制 kill
 * （CI 的 "A worker process has failed to exit gracefully and has been force exited"
 * 即此）。控制器一律经 `created` 登记、由 afterEach 统一 dispose，不靠每个用例记得关。
 */
import type {
  FeedbackEntryDto,
  PermissionPreset,
  SessionDto,
} from '@spark/protocol'
import { errorMessageOf, ids } from '@spark/protocol'
import {
  createSessionActionsController,
  votesOf,
  type SessionActions,
  type SessionActionsRest,
  type SessionActionsSnapshot,
} from '../src/session/session-actions'

const SID = ids.session('ses_actions_1')
const EID = ids.event('evt_actions_1')

/** notice 自清给长值：断言只看动作当场那一帧 */
const NOTICE_MS = 60_000

function sessionDto(over: Partial<SessionDto> = {}): SessionDto {
  return {
    id: SID,
    title: '改名后',
    model: 'test/model',
    cwd: '/work/spark',
    createdAt: 1000,
    updatedAt: 2000,
    lastSeq: 3,
    status: 'idle',
    ...over,
  }
}

function feedbackEntry(vote: 'up' | 'down'): FeedbackEntryDto {
  return { id: 1, sessionId: SID, eventId: EID, vote, note: '', createdAt: 5000 }
}

function baseMocks() {
  return {
    renameSession: jest.fn(
      (_sid: unknown, _title: string): Promise<SessionDto> => Promise.resolve(sessionDto()),
    ),
    archiveSession: jest.fn(
      (_sid: unknown, archived: boolean): Promise<SessionDto> =>
        Promise.resolve(sessionDto(archived ? { archivedAt: '2026-09-22T00:00:00.000Z' } : {})),
    ),
    deleteSession: jest.fn((): Promise<void> => Promise.resolve(undefined)),
    submitFeedback: jest.fn(
      (input: { vote: 'up' | 'down' }): Promise<FeedbackEntryDto> =>
        Promise.resolve(feedbackEntry(input.vote)),
    ),
    listFeedback: jest.fn(
      (): Promise<FeedbackEntryDto[]> => Promise.resolve([feedbackEntry('up')]),
    ),
    withdrawFeedback: jest.fn((): Promise<boolean> => Promise.resolve(true)),
    getPermissionPreset: jest.fn((): Promise<PermissionPreset> => Promise.resolve('auto-edit')),
    setPermissionPreset: jest.fn((): Promise<void> => Promise.resolve(undefined)),
    executeCommand: jest.fn((): Promise<void> => Promise.resolve(undefined)),
  }
}

type Mocks = ReturnType<typeof baseMocks>

/** 用例创建的控制器登记处：afterEach 统一 dispose（见文件头 teardown 纪律） */
const created: SessionActions[] = []

afterEach(() => {
  for (const actions of created.splice(0)) actions.dispose()
})

function harness(over: Partial<Mocks> = {}) {
  const mocks = { ...baseMocks(), ...over }
  const transport: SessionActionsRest = mocks
  const snapshots: SessionActionsSnapshot[] = []
  const changed: Array<[string, SessionDto | null]> = []
  const actions = createSessionActionsController({
    sessionId: SID,
    rest: () => transport,
    onUpdate: (s) => snapshots.push(s),
    onChanged: (kind, dto) => changed.push([kind, dto]),
    noticeMs: NOTICE_MS,
  })
  created.push(actions)
  return {
    mocks,
    snapshots,
    changed,
    actions,
    last: () => snapshots[snapshots.length - 1],
  }
}

describe('会话菜单动作——调用序列', () => {
  it('改名走 renameSession(sid, trim 后标题) 并回调 onChanged("rename")', async () => {
    const h = harness()
    const dto = await h.actions.rename('  改名后  ')
    expect(h.mocks.renameSession).toHaveBeenCalledWith(SID, '改名后')
    expect(h.changed[0]?.[0]).toBe('rename')
    expect(dto?.title).toBe('改名后')
    expect(h.last()?.running).toBeNull()
  })

  it('空白标题不发请求，只给错误条', async () => {
    const h = harness()
    expect(await h.actions.rename('   ')).toBeNull()
    expect(h.mocks.renameSession).not.toHaveBeenCalled()
    expect(h.last()?.notice).toBe('标题不能为空')
  })

  it('归档走 archiveSession(sid, true)，恢复走 false，并用服务端 DTO 回报归档态', async () => {
    const archive = harness()
    await archive.actions.setArchived(true)
    expect(archive.mocks.archiveSession).toHaveBeenCalledWith(SID, true)
    expect(archive.changed[0]?.[1]?.archivedAt).toBeDefined()

    const un = harness()
    await un.actions.setArchived(false)
    expect(un.mocks.archiveSession).toHaveBeenCalledWith(SID, false)
    expect(un.changed[0]?.[1]?.archivedAt).toBeUndefined()
  })

  it('删除走 deleteSession，成功后 onChanged("delete", null)', async () => {
    const h = harness()
    expect(await h.actions.remove()).toBe(true)
    expect(h.mocks.deleteSession).toHaveBeenCalledWith(SID)
    expect(h.changed).toEqual([['delete', null]])
  })

  it('档位读写走 getPermissionPreset/setPermissionPreset；退出计划模式走 executeCommand(sid,"plan","exit")', async () => {
    const h = harness()
    await h.actions.loadPreset()
    expect(h.mocks.getPermissionPreset).toHaveBeenCalledWith(SID)
    expect(h.last()?.preset).toBe('auto-edit')

    expect(await h.actions.setPreset('plan')).toBe(true)
    expect(h.mocks.setPermissionPreset).toHaveBeenCalledWith(SID, 'plan')
    expect(h.last()?.preset).toBe('plan')

    expect(await h.actions.exitPlan()).toBe(true)
    expect(h.mocks.executeCommand).toHaveBeenCalledWith(SID, 'plan', 'exit')
  })
})

describe('会话菜单动作——反馈（19.19）', () => {
  it('装载票型：listFeedback({sessionId}) → votes 表', async () => {
    const h = harness()
    await h.actions.loadVotes()
    expect(h.mocks.listFeedback).toHaveBeenCalledWith({ sessionId: SID })
    expect(h.last()?.votes[EID]).toEqual(['up'])
  })

  it('未投过 → submitFeedback；已投同票 → withdrawFeedback（再点即撤回）', async () => {
    const h = harness()
    await h.actions.loadVotes()
    expect(await h.actions.toggleVote(EID, 'up')).toBe(true)
    expect(h.mocks.withdrawFeedback).toHaveBeenCalledWith(SID, EID, 'up')
    expect(h.mocks.submitFeedback).not.toHaveBeenCalled()
    expect(h.last()?.votes[EID]).toEqual([])
  })

  it('异票改票：保留原票再补一张（后端按 vote 分行，互不覆盖）', async () => {
    const h = harness()
    await h.actions.loadVotes()
    expect(await h.actions.toggleVote(EID, 'down')).toBe(true)
    expect(h.mocks.submitFeedback).toHaveBeenCalledWith({
      sessionId: SID,
      eventId: EID,
      vote: 'down',
    })
    expect(h.last()?.votes[EID]).toEqual(['up', 'down'])
  })

  it('备注：空串不写字段（同票幂等更新，不堆行）', async () => {
    const h = harness()
    await h.actions.saveNote(EID, 'up', '   ')
    expect(h.mocks.submitFeedback).toHaveBeenCalledWith({
      sessionId: SID,
      eventId: EID,
      vote: 'up',
    })
    const h2 = harness()
    await h2.actions.saveNote(EID, 'down', ' 结论不对 ')
    expect(h2.mocks.submitFeedback).toHaveBeenCalledWith({
      sessionId: SID,
      eventId: EID,
      vote: 'down',
      note: '结论不对',
    })
  })

  it('提交失败：票型表不写（不假装已反馈）+ 人话错误条', async () => {
    const message = 'E_NOT_FOUND: 反馈没落库'
    const h = harness({
      submitFeedback: jest.fn((_input: { vote: 'up' | 'down' }): Promise<FeedbackEntryDto> =>
        Promise.reject(new Error(message)),
      ),
    })
    expect(await h.actions.toggleVote(EID, 'up')).toBe(false)
    expect(h.last()?.votes[EID]).toBeUndefined()
    // notice 是纯文本出口，取 errorMessageOf 的 title（detail 只在带折叠区的端露出）——
    // 期望值同样由文案单源算出，不硬编中文措辞，映射被改动时本断言仍会红
    expect(h.last()?.notice).toBe(errorMessageOf(new Error(message)))
  })
})

describe('会话菜单动作——失败闭合与单飞闸门', () => {
  it('在途期间第二次动作被丢弃（连点不产生两次请求）', async () => {
    const settled: { resolve: ((v: SessionDto) => void) | null } = { resolve: null }
    const h = harness({
      renameSession: jest.fn(
        async (_sid: unknown, _title: string) =>
          new Promise<SessionDto>((res) => {
            settled.resolve = res
          }),
      ),
    })
    const first = h.actions.rename('甲')
    const second = h.actions.rename('乙')
    expect(h.mocks.renameSession.mock.calls.length).toBe(1)
    expect(await second).toBeNull()
    expect(h.last()?.running).toBe('rename')
    settled.resolve?.(sessionDto())
    expect(await first).not.toBeNull()
    expect(h.last()?.running).toBeNull()
  })

  it('服务端拒绝删除（运行中 409）：返回 false、不回调 onChanged、不导航', async () => {
    const h = harness({
      deleteSession: jest.fn((): Promise<void> =>
        Promise.reject(new Error('E_RUNNING: 会话运行中不可删除')),
      ),
    })
    expect(await h.actions.remove()).toBe(false)
    expect(h.changed).toEqual([])
    expect(h.last()?.notice).toContain('运行中')
  })

  it('未配置服务器：动作不发请求且给出配对提示', async () => {
    const snapshots: SessionActionsSnapshot[] = []
    const actions = createSessionActionsController({
      sessionId: SID,
      rest: () => null,
      onUpdate: (s) => snapshots.push(s),
      noticeMs: NOTICE_MS,
    })
    created.push(actions)
    expect(await actions.setArchived(true)).toBeNull()
    expect(snapshots[snapshots.length - 1]?.notice).toBe('未配置服务器：请先在设置页完成配对')
  })

  it('档位读取失败：标不可用而不是回落缺省档（禁假状态）', async () => {
    const message = 'E_NOT_FOUND: 无此会话'
    const h = harness({
      getPermissionPreset: jest.fn((): Promise<PermissionPreset> =>
        Promise.reject(new Error(message)),
      ),
    })
    await h.actions.loadPreset()
    expect(h.last()?.preset).toBeNull()
    expect(h.last()?.presetUnavailable).toBe(true)
    expect(h.last()?.notice).toBe(errorMessageOf(new Error(message)))
  })
})

describe('会话菜单动作——dispose 收口（进程句柄纪律）', () => {
  // 假定时器只为把"还剩几枚待发定时器"变成可断言的量（本文件其余用例仍走真定时器）：
  // 只在本例内开关，不删不改任何断言——notice 定时器在 dispose 之前确实挂在事件循环上。
  it('notice 挂着自清定时器；dispose 后归零（不留拖住 worker 收尾的活动句柄）', async () => {
    jest.useFakeTimers()
    try {
      const h = harness()
      expect(await h.actions.rename('   ')).toBeNull() // 空白标题：只走 setNotice，不发请求
      expect(h.last()?.notice).toBe('标题不能为空')
      expect(jest.getTimerCount()).toBe(1)
      h.actions.dispose()
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('votesOf——反馈表聚合', () => {
  it('同 event 两张不同票型都留；重复行去重', () => {
    const table = votesOf([feedbackEntry('up'), feedbackEntry('up'), feedbackEntry('down')])
    expect(table[EID]).toEqual(['up', 'down'])
  })
})
