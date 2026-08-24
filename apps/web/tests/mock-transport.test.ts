/**
 * MockTransport 单测（工单 1.4）：锚点解析（@delay/@wait/@speed）+ 回放状态机
 * （sendMessage 触发、审批挂起/回复覆写、@wait message 恢复、场景切换重置）。
 * 场景文件本身的逐行协议校验在 @spark/protocol/tests/mock-sessions.test.ts（工单 1.3）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { MockTransport, parseScenarioScript } from '../src/transports/mock'
import rawNormal from '../../../examples/mock-sessions/normal.jsonl?raw'

/** 记录事件与 fake-clock 发射时刻（验证 @delay 固定间隔） */
function recorder(t: MockTransport): { events: SparkEventEnvelope[]; at: number[] } {
  const events: SparkEventEnvelope[] = []
  const at: number[] = []
  t.onEvent((e) => {
    events.push(e)
    at.push(Date.now()) // fake timers 下 Date 一并被 mock，可作发射时刻
  })
  return { events, at }
}

/** 按词表窄化事件类型（SparkEventEnvelope 是接口非联合，TS 不做判别收窄，须显式守卫） */
function ofType<T extends SparkEventType>(e: SparkEventEnvelope, t: T): e is SparkEventEnvelope<T> {
  return e.type === t
}

describe('parseScenarioScript 锚点解析', () => {
  it('normal：锚点 4 行（approval/delay×2/message），其余为合法事件信封', () => {
    const script = parseScenarioScript(rawNormal)
    const anchors = script.lines.filter((l) => l.kind !== 'event')
    expect(anchors).toEqual([
      { kind: 'wait', target: 'approval' },
      { kind: 'delay', ms: 120 },
      { kind: 'delay', ms: 40 },
      { kind: 'wait', target: 'message' },
    ])
    for (const l of script.lines) {
      if (l.kind === 'event') expect(l.envelope.id).toMatch(/^evt_[0-9A-Za-z]+$/)
    }
    expect(script.sessionId).toBe('ses_01HXMOCKNRML0000000000')
  })

  it('首行非元数据 / 坏锚点值 → 抛错（fail loudly）', () => {
    expect(() => parseScenarioScript('{"id":"evt_x"}\n')).toThrow(/E_MOCK_BAD_META/)
    expect(() => parseScenarioScript('{"sparkVersion":"0.1.0"}\n{"@wait":"forever"}\n')).toThrow(/E_MOCK_BAD_ANCHOR/)
  })
})

describe('MockTransport 回放状态机', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sendMessage 触发回放：先吐 session.created，事件按序、脚本尾自然停止', async () => {
    const t = new MockTransport('normal')
    const { events } = recorder(t)
    const outcome = await t.sendMessage()
    expect(outcome.result).toBe('started')
    await vi.advanceTimersByTimeAsync(10_000)

    expect(events[0]?.type).toBe('session.created')
    const types = events.map((e) => e.type)
    // 顺序锚点：user.message 在 turn.started 前、reasoning 先于 tool
    expect(types.indexOf('user.message')).toBeLessThan(types.indexOf('turn.started'))
    expect(types.indexOf('reasoning.delta')).toBeLessThan(types.indexOf('tool.started'))
    expect(types).toContain('assistant.delta')
    // 未到审批锚点前不应出现 turn.completed 之后的第二 turn
    expect(types.filter((x) => x === 'turn.completed')).toHaveLength(0)
  })

  it('@wait approval：permission.asked 后挂起，replyPermission 覆写 resolved 并恢复', async () => {
    const t = new MockTransport('normal')
    const { events } = recorder(t)
    await t.sendMessage()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(t.status()).toBe('waiting-approval')
    expect(events.map((e) => e.type)).not.toContain('permission.resolved')

    await t.replyPermission(ids.request('req_01HXMOCKNRMLPERM00000000000'), 'reject', '不要改了')
    await vi.advanceTimersByTimeAsync(60_000)

    const resolved = events.find((e) => e.type === 'permission.resolved')
    expect(resolved?.data).toMatchObject({ reply: 'reject', feedback: '不要改了' })
    // 挂起解除后回放推进到 @wait message（第一 turn 已完成）
    expect(events.filter((e) => e.type === 'turn.completed')).toHaveLength(1)
    expect(t.status()).toBe('idle')
  })

  it('审批挂起中 sendMessage 返回 queued 且不解除挂起', async () => {
    const t = new MockTransport('normal')
    await t.sendMessage()
    await vi.advanceTimersByTimeAsync(10_000)
    const before = t.status()

    const outcome = await t.sendMessage()
    expect(outcome.result).toBe('queued')
    expect(t.status()).toBe(before)
  })

  it('@wait message：sendMessage 恢复回放并返回 steered（第二 turn 至脚本尾）', async () => {
    const t = new MockTransport('normal')
    const { events } = recorder(t)
    await t.sendMessage()
    await vi.advanceTimersByTimeAsync(10_000)
    await t.replyPermission(ids.request('req_01HXMOCKNRMLPERM00000000000'), 'once')
    await vi.advanceTimersByTimeAsync(60_000)
    // 此刻挂在 @wait message：第一 turn 已闭合，第二 turn 的 user.message 未吐
    expect(events.filter((e) => e.type === 'turn.completed')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'user.message')).toHaveLength(1)

    const outcome = await t.sendMessage()
    expect(outcome.result).toBe('steered')
    await vi.advanceTimersByTimeAsync(60_000)

    expect(events.filter((e) => e.type === 'turn.completed')).toHaveLength(2)
    // 脚本耗尽后再发 → queued（无假回放）
    expect((await t.sendMessage()).result).toBe('queued')
  })

  it('@delay 锚点：其后事件按固定间隔发射（fake clock 验证）', async () => {
    const t = new MockTransport('normal')
    const { events, at } = recorder(t)
    await t.sendMessage()
    await vi.advanceTimersByTimeAsync(60_000)
    // bash 工具段在审批锚点之后：先放行审批，回放进入 @delay 120 段
    await t.replyPermission(ids.request('req_01HXMOCKNRMLPERM00000000000'), 'once')
    await vi.advanceTimersByTimeAsync(60_000)

    // @delay 120 生效于 bash 工具段（tool.started 之后连发 4 条 progress，间隔 120ms）
    const startedIdx = events.findIndex((e) => {
      if (!ofType(e, 'tool.started')) return false
      return e.data.name === 'bash'
    })
    expect(startedIdx).toBeGreaterThan(0)
    const a = at[startedIdx]
    const b = at[startedIdx + 1]
    if (a === undefined || b === undefined) throw new Error('bash 工具段 progress 事件不足')
    expect(b - a).toBe(120)
  })

  it('error-finish 场景：error 事件与 turn.completed{error} 闭合（失败闭合演示）', async () => {
    const t = new MockTransport('error-finish')
    const { events } = recorder(t)
    await t.sendMessage()
    await vi.advanceTimersByTimeAsync(10_000)
    const types = events.map((e) => e.type)
    expect(types).toContain('error')
    const finish = events.find((e) => e.type === 'turn.completed')
    expect(finish?.data).toMatchObject({ finish: 'error' })
  })

  it('interrupt 停止回放并合成 turn.completed{aborted}（失败闭合）；场景切换重置指向新脚本会话', async () => {
    const t = new MockTransport('normal')
    const { events } = recorder(t)
    await t.sendMessage()
    await vi.advanceTimersByTimeAsync(1_000)
    await t.interrupt()
    const countAfterStop = events.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(events.length).toBe(countAfterStop)
    // 中止合成：最后的 turn.completed finish=aborted（事件流不悬空）
    const last = events[countAfterStop - 1]
    expect(last?.type).toBe('turn.completed')
    expect(last?.data).toMatchObject({ finish: 'aborted' })

    t.setScenario('reject')
    const dto = await t.createSession()
    expect(dto.id).toBe('ses_01HXMOCKRJCT0000000000')
    expect(dto.title).toBe('改配置超时')
  })

  it('审批挂起中 interrupt：合成 permission.resolved{reject} + aborted，且可从下一 turn 继续', async () => {
    const t = new MockTransport('normal')
    const { events } = recorder(t)
    await t.sendMessage()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.status()).toBe('waiting-approval')

    await t.interrupt()
    const types = events.map((e) => e.type)
    expect(types[types.length - 2]).toBe('permission.resolved')
    expect(types[types.length - 1]).toBe('turn.completed')
    const resolved = events.find((e) => e.type === 'permission.resolved')
    expect(resolved?.data).toMatchObject({ reply: 'reject' })
    const aborted = events.find((e) => e.type === 'turn.completed')
    expect(aborted?.data).toMatchObject({ finish: 'aborted' })

    // 中断后 sendMessage：从第二 turn 的 user.message 继续回放到脚本尾
    const outcome = await t.sendMessage()
    expect(outcome.result).toBe('started')
    await vi.advanceTimersByTimeAsync(60_000)
    const finishes = events.filter((e) => e.type === 'turn.completed')
    expect(finishes).toHaveLength(2)
    expect(t.status()).toBe('idle')
  })

  it('listSessions：四场景各一条 SessionDto', async () => {
    const t = new MockTransport('normal')
    const list = await t.listSessions()
    expect(list.map((s) => s.id).sort()).toEqual(
      [
        'ses_01HXMOCKERRF0000000000',
        'ses_01HXMOCKLONG0000000000',
        'ses_01HXMOCKNRML0000000000',
        'ses_01HXMOCKRJCT0000000000',
      ].sort(),
    )
  })
})
