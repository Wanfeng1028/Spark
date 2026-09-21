/**
 * 投影与批处理单测（工单 9.4）：
 * - applyEvent 序列快照（D22 共享投影，与四端同口径）；
 * - createEventBatcher 时间窗合并（小程序 setData 频次敏感——一窗一次提交）；
 * - 重放去重（回放×直播重叠：seq<=水位跳过）。
 */
import { describe, expect, it } from 'vitest'
import type { ProjectionState, SparkEventEnvelope } from '@spark/protocol'
import { applyEvent, emptySessionSlice, ids } from '@spark/protocol'
import { BATCH_WINDOW_MS } from '../src/store/app-store'
import { buildSessionRows, lastUserTextOf } from '../src/session/session-rows'

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

describe('BATCH_WINDOW_MS（setData 频次口径——miniapp 专属约束）', () => {
  it('缺省时间窗落在任务口径内', () => {
    expect(BATCH_WINDOW_MS).toBeGreaterThanOrEqual(16)
    expect(BATCH_WINDOW_MS).toBeLessThanOrEqual(32)
  })
})

/**
 * 工单 19.29 小程序补齐批新接的两个投影消费面：
 * topBanner（本轮以 error 结束 → 重试条）与 user.message.attachments（缩略图数据源）。
 * 断言走真实 applyEvent——端上渲染只吃投影，不自己解析事件。
 */
describe('topBanner / attachments 投影消费面（工单 19.29）', () => {
  function project(events: readonly SparkEventEnvelope[]) {
    let s: ProjectionState = { byId: {}, activeId: SID }
    for (const e of events) s = applyEvent(s, e)
    return s.byId[SID] ?? emptySessionSlice(SID)
  }

  it('turn.completed finish=error 落 topBanner；下一 turn.started 清空', () => {
    const withError = project([
      env('user.message', 1000, 1, { text: '跑一下' }),
      env('turn.started', 1050, 2, { turnId: TID, delivery: 'now', userEventId: ids.event('evt_mini_dummy') }),
      env('turn.completed', 2000, 3, { turnId: TID, finish: 'error' }),
    ])
    expect(withError.topBanner?.kind).toBe('turn-error')
    expect(lastUserTextOf(withError.items)).toBe('跑一下')

    const nextTurn = project([
      env('turn.completed', 2000, 3, { turnId: TID, finish: 'error' }),
      env('turn.started', 3000, 4, { turnId: TID, delivery: 'now', userEventId: ids.event('evt_mini_dummy') }),
    ])
    expect(nextTurn.topBanner).toBeNull()
  })

  it('正常收尾不留错误横幅（finish=stop 不得冒充 error）', () => {
    const slice = project([
      env('turn.started', 1050, 1, { turnId: TID, delivery: 'now', userEventId: ids.event('evt_mini_dummy') }),
      env('turn.completed', 2000, 2, { turnId: TID, finish: 'stop' }),
    ])
    expect(slice.topBanner).toBeNull()
  })

  it('user.message 的 attachments 进投影项（缩略图渲染数据源）；无附件不建字段', () => {
    const withAttach = project([
      env('user.message', 1000, 1, { text: '看图', attachments: ['ab12.png', 'cd34.jpg'] }),
    ])
    const item = withAttach.items[0]
    expect(item?.kind === 'user' ? item.attachments : undefined).toEqual(['ab12.png', 'cd34.jpg'])

    const plain = project([env('user.message', 1000, 1, { text: '无图' })])
    const plainItem = plain.items[0]
    expect(plainItem?.kind === 'user' ? plainItem.attachments : undefined).toBeUndefined()
  })

  it('lastUserTextOf 取最后一条 user 文本；无 user 消息返回 null（重试钮不出，不撞 zod min(1)）', () => {
    const slice = project([
      env('user.message', 1000, 1, { text: '第一条' }),
      env('user.message', 1500, 2, { text: '第二条' }),
    ])
    expect(lastUserTextOf(slice.items)).toBe('第二条')
    expect(lastUserTextOf(project([env('turn.started', 1, 1, { turnId: TID, delivery: 'now', userEventId: ids.event('evt_mini_dummy') })]).items)).toBeNull()
  })
})
