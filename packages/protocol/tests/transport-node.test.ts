/**
 * transport-node 共享解析单测（工单 8.1）：envelopeFromSseFrame 的
 * 注释帧/无 data 帧/ignorable 未知扩展事件跳过/坏帧抛错（失败闭合）路径。
 * SSE 流泵读与重连状态机的行为测试沿用 apps/web http-transport.test.ts（同一实现）。
 * 工单 10.12 追加：req() content-type 纪律（无 body 不带头/带 body 必带）与
 * createSession model 下发断言（接口为准，修实现漂移）。
 */
import { describe, expect, it } from 'vitest'
import { envelopeFromSseFrame, ids, HttpTransport } from '../src/index'
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

// ---- req() content-type 纪律（工单 10.12）----
// Fastify 5 对 content-type=application/json + 空 body 在路由前即拒
// （FST_ERR_CTP_EMPTY_JSON_BODY）：无 body 的 11 处调用点不得带头；带 body 必须带。

/** 记录请求的 fake fetch（一律 200 + `{"ok":true}`——本组用例只断言请求侧） */
function recordingFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = ((url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} })
    return Promise.resolve(new Response('{"ok":true}', { status: 200 }))
  }) as unknown as typeof fetch
  return { impl, calls }
}

function headersOf(call: { url: string; init: RequestInit }): Record<string, string> {
  return (call.init.headers ?? {}) as Record<string, string>
}

describe('req() content-type 纪律（工单 10.12）', () => {
  async function withTransport<T>(
    fn: (t: HttpTransport, calls: Array<{ url: string; init: RequestInit }>) => Promise<T>,
  ): Promise<T> {
    const rec = recordingFetch()
    const original = globalThis.fetch
    globalThis.fetch = rec.impl
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:4318', eventStream: false })
    try {
      return await fn(t, rec.calls)
    } finally {
      t.dispose()
      globalThis.fetch = original
    }
  }

  it('无 body 请求不带 content-type（POST interrupt / DELETE 密钥同口径）', () =>
    withTransport(async (t, calls) => {
      await t.interrupt(SID)
      await t.removeSecret('deepseek')
      expect(calls).toHaveLength(2)
      for (const call of calls) {
        expect(headersOf(call)['content-type']).toBeUndefined()
      }
      expect(calls[0]?.init.method).toBe('POST')
      expect(calls[1]?.init.method).toBe('DELETE')
    }))

  it('带 body 请求必须带 content-type（回归红线）', () =>
    withTransport(async (t, calls) => {
      await t.sendMessage(SID, '你好')
      expect(calls).toHaveLength(1)
      const call = calls[0]
      if (call === undefined) throw new Error('无请求记录')
      expect(headersOf(call)['content-type']).toBe('application/json')
      expect(call.init.body).toBe(JSON.stringify({ text: '你好', delivery: 'now' }))
    }))

  it('createSession 以接口为准：model 随请求体下发（修复漂移）', () =>
    withTransport(async (t, calls) => {
      await t.createSession({ title: '新会话', model: 'deepseek/deepseek-chat' })
      expect(calls).toHaveLength(1)
      const call = calls[0]
      if (call === undefined) throw new Error('无请求记录')
      expect(call.url).toBe('http://127.0.0.1:4318/api/sessions')
      expect(headersOf(call)['content-type']).toBe('application/json')
      expect(JSON.parse(call.init.body as string)).toEqual({
        title: '新会话',
        model: 'deepseek/deepseek-chat',
      })
    }))

  it('createSession 无参：空对象 body + content-type（既有形态不变）', () =>
    withTransport(async (t, calls) => {
      await t.createSession()
      const call = calls[0]
      if (call === undefined) throw new Error('无请求记录')
      expect(call.init.body).toBe('{}')
      expect(headersOf(call)['content-type']).toBe('application/json')
    }))
})
