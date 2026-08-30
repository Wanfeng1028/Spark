/**
 * 投影与批处理单测（工单 9.4）：
 * - applyEvent 序列快照（D22 共享投影，与四端同口径）；
 * - createEventBatcher 时间窗合并（小程序 setData 频次敏感——一窗一次提交）；
 * - 重放去重（回放×直播重叠：seq<=水位跳过）。
 */
import { describe, expect, it } from 'vitest'
import type { ProjectionState, SparkEventEnvelope } from '@spark/protocol'
import { applyEvent, emptySessionSlice, ids } from '@spark/protocol'
import { BATCH_WINDOW_MS, createEventBatcher } from '../src/store/app-store'
import { buildSessionRows } from '../src/session/session-rows'

const SID = ids.session('ses_mini_proj_1')
const TID = ids.turn('trn_mini_proj_1')

let eventNo = 0
function eid(): string {
  eventNo += 1
  return `evt_mini_proj_${eventNo}`
}

function env(
  type: SparkEventEnvelope['type'],
  time: number,
  seq: number | undefined,
  data: SparkEventEnvelope['data'],
): SparkEventEnvelope {
  return {
    id: ids.event(eid()),
    sessionId: SID,
    time,
    ...(seq !== undefined ? { seq } : {}),
    type,
    data,
  }
}

describe('applyEvent 序列快照（小程序逻辑层复用口径）', () => {
  it('用户消息 → 流式增量 → 定稿 → 工具调用：投影形态稳定', () => {
    const events = [
      env('user.message', 1000, 1, { text: '帮我跑测试' }),
      env('assistant.delta', 1100, undefined, { turnId: TID, text: '好的' }),
      env(
        'assistant.message',
        1200,
        2,
        {
          turnId: TID,
          content: [
            { type: 'text', text: '好的' },
            { type: 'toolCall', callId: ids.call('cal_mini_1'), name: 'bash', input: {} },
          ],
        },
      ),
    ]
    let s: ProjectionState = { byId: {}, activeId: SID }
    for (const e of events) s = applyEvent(s, e)
    const slice = s.byId[SID] ?? emptySessionSlice(SID)
    const rows = buildSessionRows(slice.items, () => 1000)
    expect(rows).toMatchSnapshot()
  })

  it('审批 pending → resolved：三键卡收敛为已处理态', () => {
    const asked = env('permission.asked', 5000, 1, {
      requestId: ids.request('req_mini_1'),
      callId: ids.call('cal_mini_perm'),
      action: 'bash',
      resource: 'rm -rf /tmp/x',
      reason: '命令含删除语义',
    })
    const resolved = env('permission.resolved', 6000, 2, {
      requestId: ids.request('req_mini_1'),
      reply: 'once',
    })
    let s: ProjectionState = { byId: {}, activeId: SID }
    s = applyEvent(s, asked)
    expect(buildSessionRows((s.byId[SID] ?? emptySessionSlice(SID)).items, () => 5000)).toMatchSnapshot()
    s = applyEvent(s, resolved)
    expect(buildSessionRows((s.byId[SID] ?? emptySessionSlice(SID)).items, () => 5000)).toMatchSnapshot()
  })

  it('回放×直播重叠：seq<=水位跳过（两路共用去重口径）', () => {
    const e1 = env('user.message', 1000, 1, { text: '一' })
    const e1Replay = env('user.message', 1000, 1, { text: '一' })
    let s: ProjectionState = { byId: {}, activeId: SID }
    s = applyEvent(s, e1)
    const afterReplay = applyEvent(s, e1Replay)
    expect(afterReplay).toBe(s) // 同一引用 = 无投影变更
  })
})

describe('createEventBatcher——时间窗合并（24ms 缺省，任务口径 16–32ms）', () => {
  it('缺省时间窗落在任务口径内', () => {
    expect(BATCH_WINDOW_MS).toBeGreaterThanOrEqual(16)
    expect(BATCH_WINDOW_MS).toBeLessThanOrEqual(32)
  })

  it('窗口内多事件一次提交：按到达序、一窗一次', () => {
    const applied: number[] = []
    const scheduled: Array<() => void> = []
    const batcher = createEventBatcher(
      (e) => applied.push(e.time),
      (fn) => {
        scheduled.push(fn)
      },
    )
    batcher.enqueue(env('user.message', 1, 1, { text: 'a' }))
    batcher.enqueue(env('user.message', 2, 2, { text: 'b' }))
    batcher.enqueue(env('user.message', 3, 3, { text: 'c' }))
    // 三事件同窗：只调度一次
    expect(scheduled).toHaveLength(1)
    expect(applied).toHaveLength(0)
    scheduled[0]?.()
    expect(applied).toEqual([1, 2, 3])
  })

  it('窗口到期后新事件另起一窗', () => {
    const applied: number[] = []
    const scheduled: Array<() => void> = []
    const batcher = createEventBatcher(
      (e) => applied.push(e.time),
      (fn) => {
        scheduled.push(fn)
      },
    )
    batcher.enqueue(env('user.message', 1, 1, { text: 'a' }))
    scheduled[0]?.()
    batcher.enqueue(env('user.message', 2, 2, { text: 'b' }))
    expect(scheduled).toHaveLength(2)
    scheduled[1]?.()
    expect(applied).toEqual([1, 2])
  })

  it('flushNow 立即提交挂起缓冲（卸载/测试断言用）', () => {
    const applied: number[] = []
    const batcher = createEventBatcher(
      (e) => applied.push(e.time),
      () => {
        /* 调度器永不到期——仅靠 flushNow */
      },
    )
    batcher.enqueue(env('user.message', 7, 1, { text: 'x' }))
    batcher.enqueue(env('user.message', 8, 2, { text: 'y' }))
    expect(applied).toHaveLength(0)
    batcher.flushNow()
    expect(applied).toEqual([7, 8])
    // flush 幂等：无挂起时再调不重复提交
    batcher.flushNow()
    expect(applied).toEqual([7, 8])
  })
})
