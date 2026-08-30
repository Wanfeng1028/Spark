/**
 * 轮询降级过滤单测（工单 9.4）：尾部切片按水位过滤——
 * 只留 seq>水位、推进水位至所见最大、无 seq 事件原样放行（防御性）。
 */
import { describe, expect, it } from 'vitest'
import type { SparkEventEnvelope } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { filterFreshEvents } from '../src/transport/poll'

const SID = ids.session('ses_mini_poll_1')

function env(seq: number | undefined, id: string): SparkEventEnvelope {
  return {
    id: ids.event(`evt_mini_poll_${id}`),
    sessionId: SID,
    time: 1000,
    ...(seq !== undefined ? { seq } : {}),
    type: 'user.message',
    data: { text: id },
  }
}

describe('filterFreshEvents——轮询尾部切片过滤', () => {
  it('只留 seq>水位的新事件，水位推进到所见最大', () => {
    const { fresh, watermark } = filterFreshEvents([env(1, 'a'), env(2, 'b'), env(3, 'c')], 1)
    expect(fresh.map((e) => e.seq)).toEqual([2, 3])
    expect(watermark).toBe(3)
  })

  it('重叠期不重复投影：水位内事件全部滤除（与 SSE 切换同口径）', () => {
    const { fresh, watermark } = filterFreshEvents([env(1, 'a'), env(2, 'b')], 2)
    expect(fresh).toHaveLength(0)
    expect(watermark).toBe(2)
  })

  it('空尾页：水位不变、无新事件', () => {
    const { fresh, watermark } = filterFreshEvents([], 5)
    expect(fresh).toHaveLength(0)
    expect(watermark).toBe(5)
  })

  it('无 seq 事件（live，防御性）：原样放行、不参与水位', () => {
    const { fresh, watermark } = filterFreshEvents([env(undefined, 'live'), env(3, 'c')], 2)
    expect(fresh).toHaveLength(2)
    expect(watermark).toBe(3)
  })

  it('保持到达序：服务端升序返回不重排；水位后到的较小 seq 自然滤除', () => {
    const { fresh } = filterFreshEvents([env(2, 'b'), env(3, 'c')], 0)
    expect(fresh.map((e) => e.seq)).toEqual([2, 3])
  })
})
