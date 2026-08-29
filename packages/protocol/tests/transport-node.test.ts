/**
 * transport-node 共享解析单测（工单 8.1）：envelopeFromSseFrame 的
 * 注释帧/无 data 帧/ignorable 未知扩展事件跳过/坏帧抛错（失败闭合）路径。
 * SSE 流泵读与重连状态机的行为测试沿用 apps/web http-transport.test.ts（同一实现）。
 */
import { describe, expect, it } from 'vitest'
import { envelopeFromSseFrame, ids } from '../src/index'
import type { SparkEventEnvelope } from '../src/index'

const SID = ids.session('ses_tntest00000000000000')

function envelope(seq: number): SparkEventEnvelope {
  return {
    id: ids.event(`evt_tntest${seq.toString().padStart(4, '0')}`),
    sessionId: SID,
    type: 'session.created',
    time: 1_700_000_000_000 + seq,
    seq,
    data: { cwd: '/tmp', model: 'fake/fake-chat' },
  }
}

function frame(e: SparkEventEnvelope): string {
  return `event: message\ndata: ${JSON.stringify(e)}\n\n`
}

describe('envelopeFromSseFrame', () => {
  it('注释帧（connected/heartbeat）→ null', () => {
    expect(envelopeFromSseFrame(': connected')).toBeNull()
    expect(envelopeFromSseFrame(': heartbeat')).toBeNull()
  })

  it('无 data 行帧（event: bye）→ null', () => {
    expect(envelopeFromSseFrame('event: bye\ndata2: x')).toBeNull()
  })

  it('合法信封帧 → parseEnvelope 结果', () => {
    const e = envelope(1)
    const got = envelopeFromSseFrame(frame(e))
    expect(got?.id).toBe(e.id)
    expect(got?.seq).toBe(1)
  })

  it('ignorable 未知扩展事件（未注册词表）→ null 不断流（ADR D18）', () => {
    const raw = JSON.stringify({
      id: ids.event('evt_plugin00000000000000000'),
      sessionId: SID,
      type: 'plugin.demo.ping',
      time: 1_700_000_000_001,
      seq: 2,
      ignorable: true,
      data: { skill: 'demo-ping', sourceEventId: 'evt_x', sourceType: 'session.created' },
    })
    expect(envelopeFromSseFrame(`event: message\ndata: ${raw}`)).toBeNull()
  })

  it('坏 JSON 帧抛错（调用方断开重连——失败闭合）', () => {
    expect(() => envelopeFromSseFrame('event: message\ndata: {not-json')).toThrow()
  })

  it('非法信封（非 ignorable）抛错', () => {
    expect(() =>
      envelopeFromSseFrame('event: message\ndata: {"id":"evt_x","type":"not-a-type"}'),
    ).toThrow()
  })
})
