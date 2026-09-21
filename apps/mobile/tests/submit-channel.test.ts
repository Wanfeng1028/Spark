/**
 * 提交通道单测（工单 19.27 的 SubmitOutcome 半边）：提交档注入、steer 目标轮校验、
 * 三态回报、其余方法原样转发（不掺逻辑）、空闲/运行中的占位文案切换。
 */
import type { SessionDto, SubmitOutcome, Transport, TurnId } from '@spark/protocol'
import { ids } from '@spark/protocol'
import {
  OUTCOME_TEXT,
  composerPlaceholder,
  createSubmitRest,
  type SessionPageRestSlice,
} from '../src/session/submit-channel'

const SID = ids.session('ses_submit_1')
const TID = ids.turn('trn_submit_1')

interface Policy {
  delivery: () => { mode: 'now' | 'steer' | 'queue'; expectedTurnId?: TurnId | undefined }
  outcome?: SubmitOutcome | undefined
  failWith?: Error | undefined
}

function harness(policy: Policy, reports: SubmitOutcome[] = []) {
  const sendMessage = jest.fn(async (
    _sid: unknown,
    _text: string,
    opts?: Parameters<Transport['sendMessage']>[2],
  ): Promise<SubmitOutcome> => {
    if (policy.failWith !== undefined) throw policy.failWith
    return policy.outcome ?? { result: 'started' }
  })
  const getSession = jest.fn(async (): Promise<SessionDto> => ({
    id: SID,
    title: '',
    model: 'test/model',
    cwd: '/work/spark',
    createdAt: 0,
    updatedAt: 0,
    lastSeq: 0,
    status: 'idle',
  }))
  const interrupt = jest.fn(async () => undefined)
  const replyPermission = jest.fn(async () => undefined)
  const base: SessionPageRestSlice = {
    getSession,
    sendMessage,
    interrupt,
    replyPermission,
  }
  const wrapped = createSubmitRest(base, {
    delivery: policy.delivery,
    report: (o) => reports.push(o),
  })
  return { wrapped, sendMessage, getSession, interrupt, replyPermission, reports }
}

describe('createSubmitRest——提交档注入与 outcome 上报', () => {
  it('空闲档：wire 上 delivery=now，不带 expectedTurnId', async () => {
    const h = harness({ delivery: () => ({ mode: 'now' }) })
    const wrapped = h.wrapped
    if (wrapped === null) throw new Error('应返回包装后的 REST')
    await wrapped.sendMessage(SID, '你好')
    expect(h.sendMessage).toHaveBeenCalledWith(SID, '你好', { delivery: 'now' })
  })

  it('运行中 steer：带 activeTurn 作为 expectedTurnId（§5.4 目标轮校验）', async () => {
    const h = harness({ delivery: () => ({ mode: 'steer', expectedTurnId: TID }) })
    const wrapped = h.wrapped
    if (wrapped === null) throw new Error('应返回包装后的 REST')
    await wrapped.sendMessage(SID, '插一句', { attachments: ['a.png'] })
    expect(h.sendMessage).toHaveBeenCalledWith(SID, '插一句', {
      attachments: ['a.png'],
      delivery: 'steer',
      expectedTurnId: TID,
    })
  })

  it('三态各回报一次（queued 不得谎报成 started）', async () => {
    for (const outcome of [{ result: 'started' }, { result: 'steered' }, { result: 'queued' }] as const) {
      const reports: SubmitOutcome[] = []
      const h = harness({ delivery: () => ({ mode: 'now' }), outcome }, reports)
      const wrapped = h.wrapped
      if (wrapped === null) continue
      await wrapped.sendMessage(SID, 'x')
      expect(reports).toEqual([outcome])
    }
  })

  it('发送失败：不上报 outcome（错误交给 controller 的 notice 通道，此处不吞不冒充）', async () => {
    const reports: SubmitOutcome[] = []
    const h = harness(
      { delivery: () => ({ mode: 'now' }), failWith: new Error('E_NETWORK: 连不上') },
      reports,
    )
    const wrapped = h.wrapped
    if (wrapped === null) throw new Error('应返回包装后的 REST')
    await expect(wrapped.sendMessage(SID, 'x')).rejects.toThrow('连不上')
    expect(reports).toEqual([])
  })

  it('getSession/interrupt/replyPermission 原样转发（包装层不掺逻辑）', async () => {
    const h = harness({ delivery: () => ({ mode: 'now' }) })
    const wrapped = h.wrapped
    if (wrapped === null) throw new Error('应返回包装后的 REST')
    await wrapped.getSession(SID, { limit: 50 })
    await wrapped.interrupt(SID)
    await wrapped.replyPermission(ids.request('req_1'), 'once', '备注', 'project')
    expect(h.getSession).toHaveBeenCalledWith(SID, { limit: 50 })
    expect(h.interrupt).toHaveBeenCalledWith(SID)
    expect(h.replyPermission).toHaveBeenCalledWith(ids.request('req_1'), 'once', '备注', 'project')
  })

  it('未配对（rest 为 null）→ 包装层同样返回 null，控制器据此走未配置态', () => {
    expect(
      createSubmitRest(null, { delivery: () => ({ mode: 'now' }), report: () => undefined }),
    ).toBeNull()
  })
})

describe('排队语义文案', () => {
  it('三态人话齐备（started/steered/queued 都有文案）', () => {
    expect(Object.keys(OUTCOME_TEXT).sort()).toEqual(['queued', 'started', 'steered'])
    expect(OUTCOME_TEXT.queued).toContain('排队')
  })

  it('占位文案：空闲写任务；运行中按提交档说明处置方式', () => {
    expect(composerPlaceholder(false, 'now')).toBe('描述你的任务…')
    expect(composerPlaceholder(true, 'queue')).toContain('排队')
    expect(composerPlaceholder(true, 'steer')).toContain('插话')
  })
})
