/**
 * 协议 round-trip 单测（doc/02 §8.6 protocol 行；工单 1.2 验收）：
 * 26 种事件逐一构造样例 → 信封+data 双步校验 → JSON 序列化往返仍通过。
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
  'session.mode.changed': { mode: 'plan', previous: 'default' },
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
    patterns: ['cmd:pnpm test', 'cmd:pnpm *'],
    alwaysPatterns: ['cmd:pnpm test'],
  },
  'permission.resolved': { requestId: req, reply: 'once' },
  'compaction.started': { turnId: trn },
  'compaction.completed': {
    summary: '已压缩：修 bug 全程',
    keptFromEventId: evt(30),
    tokensBefore: 98000,
  },
  'checkpoint.created': { checkpointId: ckp, files: ['src/a.ts'], turnId: trn },
  error: { scope: 'llm', message: 'provider 429 重试穷尽' },
  'io.warning': {
    turnId: trn,
    callId: cal,
    tool: 'bash',
    kind: 'injection',
    rules: ['injection.ignore-instructions'],
  },
  'memory.injected': {
    turnId: trn,
    query: '数据库连接配置',
    memories: [{ id: 7, content: '用户偏好 PostgreSQL，连接串在 .env', createdAt: 1787800000000 }],
  },
  // 持续目标（工单 16.7 / ADR D33）：durable 非 surface
  'goal.set': { goal: '修好所有失败的测试' },
  'goal.updated': {
    goal: '修好所有失败的测试',
    iterations: 2,
    usedTokens: 18300,
    status: 'active',
  },
  'goal.completed': { iterations: 3, usedTokens: 41200 },
  'goal.paused': { reason: 'maxIterations', iterations: 50, usedTokens: 198600 },
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
  it('词表共 26 种（durable 23 + live 3）', () => {
    expect(Object.keys(EventSchemas)).toHaveLength(26)
  })

  it('CallId 透传上游 id（工单 10.39：OpenAI call_xxx / Anthropic toolu_xxx 过闸，不重写）', () => {
    for (const upstream of ['call_abc123XYZ', 'toolu_01AbCdEfG', 'cal_01HXSPARK0000000000000000']) {
      const e = envelopeOf('tool.completed', { ...samples['tool.completed'], callId: ids.call(upstream) }, 3)
      expect(parseEnvelope(e).type).toBe('tool.completed')
    }
    // 明显越界（空白/超长）仍 fail-closed
    const bad = envelopeOf('tool.completed', { ...samples['tool.completed'], callId: ids.call('has space') }, 3)
    expect(() => parseEnvelope(bad)).toThrow()
  })

  it('surface 事件类型层强制标记（编译期断言的运行时副本）', () => {
    const e = envelopeOf('user.message', samples['user.message'], 2)
    // @ts-expect-error —— SurfaceEnvelope 要求 surface:true，缺标记应编译报错
    const _typed: SurfaceEnvelope<SurfaceEventType> = e
    expect(_typed).toBeDefined()
  })
})

describe('round-trip：26 种事件逐一', () => {
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

describe('compaction.completed 双层压缩扩展字段（工单 13.4 / ADR D29）', () => {
  const schema = EventSchemas['compaction.completed']
  const base = { summary: '摘要正文', keptFromEventId: evt(30), tokensBefore: 98000 }

  it('keptFiles 与 distilled 可选扩展：解析 + JSON 往返 + 信封级 round-trip', () => {
    const data = schema.parse({
      ...base,
      keptFiles: ['src/a.ts', 'doc/b.md'],
      distilled: { cal_01HXSPARK0000000000000000: '要点：a.ts 共 42 行' },
    })
    expect(data.keptFiles).toEqual(['src/a.ts', 'doc/b.md'])
    expect(data.distilled).toEqual({ cal_01HXSPARK0000000000000000: '要点：a.ts 共 42 行' })
    expect(schema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data)
    const envelope = envelopeOf('compaction.completed', data, 31)
    expect(parseEnvelope(JSON.parse(JSON.stringify(envelope)))).toEqual(parseEnvelope(envelope))
  })

  it('两字段可省：旧磁盘行与旧 wire 帧仍合法（可选字段演进不破坏既有会话）', () => {
    const data = schema.parse(base)
    expect(data.keptFiles).toBeUndefined()
    expect(data.distilled).toBeUndefined()
    expect(parseEnvelope(envelopeOf('compaction.completed', data, 31)).type).toBe(
      'compaction.completed',
    )
  })

  it('空值拒收（min(1) 双端）：keptFiles 空串条目 / distilled 空值 / distilled 空键', () => {
    expect(schema.safeParse({ ...base, keptFiles: [''] }).success).toBe(false)
    expect(schema.safeParse({ ...base, distilled: { cal_x: '' } }).success).toBe(false)
    expect(schema.safeParse({ ...base, distilled: { '': 'x' } }).success).toBe(false)
  })

  it('strictObject 仍生效：加可选字段不等于开未知键口子', () => {
    expect(schema.safeParse({ ...base, keptFiles: ['a'], droppedOriginals: true }).success).toBe(false)
  })
})
