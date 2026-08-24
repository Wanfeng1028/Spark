/**
 * 协议 round-trip 单测（doc/02 §8.6 protocol 行；工单 1.2 验收）：
 * 19 种事件逐一构造样例 → 信封+data 双步校验 → JSON 序列化往返仍通过。
 */
import { describe, expect, it } from 'vitest'
import { EnvelopeSchema, EventSchemas, jsonSchemas, parseEnvelope } from '../src/index.js'
import type {
  SparkEventMap,
  SparkEventType,
  SparkEventEnvelope,
  SurfaceEventType,
  SurfaceEnvelope,
} from '../src/index.js'
import { ids } from '../src/index.js'

const sid = ids.session('ses_01HXSPARK0000000000000000')
const trn = ids.turn('trn_01HXSPARK0000000000000000')
const evt = (n: number) => ids.event(`evt_01HXSPARK${String(n).padStart(7, '0')}0000000`)
const cal = ids.call('cal_01HXSPARK0000000000000000')
const req = ids.request('req_01HXSPARK0000000000000000')
const ckp = ids.checkpoint('ckp_01HXSPARK0000000000000000')

/** 每种事件一个合法样例（exhaustive map——新增词表条目漏样例即编译错） */
const samples: { [K in SparkEventType]: SparkEventMap[K] } = {
  'session.created': { cwd: 'E:/code/demo', model: 'deepseek/deepseek-chat' },
  'session.resumed': { fromSeq: 42 },
  'session.title': { title: '修登录 bug' },
  'turn.started': { turnId: trn, delivery: 'now', userEventId: evt(2) },
  'turn.completed': { turnId: trn, finish: 'stop', usage: { inputTokens: 100, outputTokens: 20 } },
  'user.message': { text: '读一下 src/index.ts', attachments: ['src/index.ts'] },
  'assistant.delta': { turnId: trn, text: '该文件' },
  'assistant.message': {
    turnId: trn,
    content: [
      { type: 'reasoning', text: '用户要总结' },
      { type: 'text', text: '42 行的入口模块' },
      { type: 'toolCall', callId: cal, name: 'read', input: { path: 'src/index.ts' } },
      { type: 'toolResult', callId: cal, output: { lines: 42 }, isError: false },
    ],
    usage: { inputTokens: 1210, outputTokens: 86 },
  },
  'reasoning.delta': { turnId: trn, text: '思考中…' },
  'reasoning.ended': { turnId: trn, text: '完整推理文本' },
  'tool.started': { turnId: trn, callId: cal, name: 'bash', input: { command: 'pnpm test' } },
  'tool.progress': { turnId: trn, callId: cal, chunk: '✓ protocol (12ms)\n' },
  'tool.completed': {
    turnId: trn,
    callId: cal,
    output: { code: 0 },
    isError: false,
    durationMs: 1200,
  },
  'permission.asked': {
    requestId: req,
    callId: cal,
    action: 'shell.exec',
    resource: 'cmd:pnpm test',
    reason: 'bash 默认需审批',
  },
  'permission.resolved': { requestId: req, reply: 'once' },
  'compaction.started': { turnId: trn },
  'compaction.completed': { summary: '已压缩：修 bug 全程', keptFromSeq: 30, tokensBefore: 98000 },
  'checkpoint.created': { checkpointId: ckp, files: ['src/a.ts'], turnId: trn },
  error: { scope: 'llm', message: 'provider 429 重试穷尽' },
}

/** 组装信封：durable 类带 seq/parentId；surface 类带 surface 标记（编译期强制） */
function envelopeOf<K extends SparkEventType>(
  type: K,
  data: SparkEventMap[K],
  n: number,
): SparkEventEnvelope<K> {
  const surface = type === 'user.message' || type === 'assistant.message'
  const isLive =
    type === 'assistant.delta' || type === 'reasoning.delta' || type === 'tool.progress'
  const base = {
    id: evt(n),
    sessionId: sid,
    type,
    time: 1761280000000 + n,
    data,
    ...(isLive ? {} : { seq: n, parentId: evt(n - 1), version: 1 as const }),
    ...(surface ? { surface: true as const } : {}),
  }
  return base
}

describe('事件词表', () => {
  it('词表共 19 种（durable 16 + live 3）', () => {
    expect(Object.keys(EventSchemas)).toHaveLength(19)
  })

  it('surface 事件类型层强制标记（编译期断言的运行时副本）', () => {
    const e = envelopeOf('user.message', samples['user.message'], 2)
    // @ts-expect-error —— SurfaceEnvelope 要求 surface:true，缺标记应编译报错
    const _typed: SurfaceEnvelope<SurfaceEventType> = e
    expect(_typed).toBeDefined()
  })
})

describe('round-trip：19 种事件逐一', () => {
  for (const key of Object.keys(samples) as SparkEventType[]) {
    it(`${key}：构造 → parseEnvelope → JSON 往返 → 再 parse`, () => {
      const envelope = envelopeOf(key, samples[key], 3)
      const parsed = parseEnvelope(envelope)
      expect(parsed.type).toBe(key)
      const roundTripped = parseEnvelope(JSON.parse(JSON.stringify(envelope)))
      expect(roundTripped).toEqual(parsed)
    })
  }
})

describe('fail-closed 与边界', () => {
  it('未知事件 type 拒绝（E_PROTOCOL_UNKNOWN_EVENT）', () => {
    const bad = envelopeOf('error', samples.error, 3)
    expect(() => parseEnvelope({ ...bad, type: 'future.event' })).toThrow(/未知事件 type/)
  })

  it('user.message 空文本拒绝（min(1)）', () => {
    const bad = envelopeOf('user.message', { text: '' }, 3)
    expect(() => parseEnvelope(bad)).toThrow()
  })

  it('ID 前缀错误拒绝', () => {
    const bad = { ...envelopeOf('error', samples.error, 3), id: 'not_an_id' }
    expect(() => EnvelopeSchema.parse(bad)).toThrow()
  })

  it('多余字段拒绝（strictObject）', () => {
    const bad = envelopeOf('session.title', { title: 'x' }, 3)
    expect(() => parseEnvelope({ ...bad, data: { ...bad.data, extra: 1 } })).toThrow()
  })

  it('jsonSchemas 可序列化（工具清单导出可用）', () => {
    expect(JSON.stringify(jsonSchemas.envelope)).toContain('sessionId')
  })
})
