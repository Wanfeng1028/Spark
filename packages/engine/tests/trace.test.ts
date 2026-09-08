/**
 * 会话链路聚合单测（工单 13.7 / V2-11 / doc/07 H27）：
 * 回合分组与时长 · 步（= 一次模型往返）与 usage（缺 usage 为 null 不以 0 充数）·
 * 工具配对（durationMs 直取事件）与重试启发式（同回合内、不跨回合）·
 * error 位置归属（回合内 vs looseErrors）· 标记归属（记忆注入先于 turn.started、
 * 手动压缩挂最近回合、快照按 turnId）· 未闭合回合与悬挂调用不伪造 · 千事件 <200ms。
 */
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope, SparkEventMap, SparkEventType } from '@spark/protocol'
import { buildTrace } from '../src/trace.js'

const SID = ids.session('ses_trace01')
const T1 = ids.turn('trn_trace01')
const T2 = ids.turn('trn_trace02')

let n = 0
function ev<T extends SparkEventType>(
  type: T,
  data: SparkEventMap[T],
  time: number,
): SparkEventEnvelope {
  n += 1
  return { id: ids.event(`evt_trace${n}`), sessionId: SID, seq: n, time, type, data }
}

/** 一个带 usage 的 assistant.message */
function msg(turnId: typeof T1, time: number, usage?: { inputTokens: number; outputTokens: number; costUsd?: number }) {
  return ev(
    'assistant.message',
    { turnId, content: [], ...(usage !== undefined ? { usage } : {}) },
    time,
  )
}

describe('正常回合聚合', () => {
  test('时长/步/工具/合计逐项对齐事件流', () => {
    const events = [
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u1') }, 1000),
      msg(T1, 1500, { inputTokens: 100, outputTokens: 20, costUsd: 0.01 }),
      ev('tool.started', { turnId: T1, callId: ids.call('c1'), name: 'read', input: {} }, 1600),
      ev(
        'tool.completed',
        { turnId: T1, callId: ids.call('c1'), output: 'ok', isError: false, durationMs: 80 },
        1680,
      ),
      msg(T1, 2200),
      ev(
        'turn.completed',
        { turnId: T1, finish: 'stop', usage: { inputTokens: 300, outputTokens: 60, costUsd: 0.03 } },
        2400,
      ),
    ]
    const trace = buildTrace(SID, events)
    expect(trace.sessionId).toBe(SID)
    expect(trace.turns.length).toBe(1)
    const turn = trace.turns[0]
    expect(turn?.turnId).toBe(T1)
    expect(turn?.finish).toBe('stop')
    expect(turn?.durationMs).toBe(1400)
    // 步 0 到步 1 的间隔 = 700（含工具执行）；末步到回合闭合 = 200
    expect(turn?.steps.map((s) => [s.index, s.at, s.durationMs, s.toolCalls])).toEqual([
      [0, 1500, 700, 1],
      [1, 2200, 200, 0],
    ])
    expect(turn?.steps[0]?.usage).toEqual({
      costUsd: 0.01,
      inputTokens: 100,
      outputTokens: 20,
      cacheRead: 0,
      cacheWrite: 0,
    })
    // 第二步无 usage → null（不以 0 充数）
    expect(turn?.steps[1]?.usage).toBeNull()
    expect(turn?.tools[0]).toMatchObject({
      callId: 'c1',
      name: 'read',
      startedAt: 1600,
      durationMs: 80,
      isError: false,
      retry: false,
      approvalAsked: false,
      warnings: [],
    })
    // turn.completed.usage 优先于各步累加
    expect(turn?.usage?.costUsd).toBe(0.03)
    expect(trace.totals).toMatchObject({
      turns: 1,
      steps: 2,
      toolCalls: 1,
      toolErrors: 0,
      errors: 0,
      durationMs: 1400,
    })
    expect(trace.looseErrors).toEqual([])
  })

  test('turn.completed 无 usage → 累加各步；各步都无 → null', () => {
    const summed = buildTrace(SID, [
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u2') }, 1000),
      msg(T1, 1100, { inputTokens: 10, outputTokens: 2 }),
      msg(T1, 1200, { inputTokens: 5, outputTokens: 1, costUsd: 0.002 }),
      ev('turn.completed', { turnId: T1, finish: 'stop' }, 1300),
    ])
    expect(summed.turns[0]?.usage).toEqual({
      costUsd: 0.002,
      inputTokens: 15,
      outputTokens: 3,
      cacheRead: 0,
      cacheWrite: 0,
    })

    const none = buildTrace(SID, [
      ev('turn.started', { turnId: T2, delivery: 'now', userEventId: ids.event('evt_u3') }, 2000),
      msg(T2, 2100),
      ev('turn.completed', { turnId: T2, finish: 'stop' }, 2200),
    ])
    expect(none.turns[0]?.usage).toBeNull()
    expect(none.totals.usage).toEqual({
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
    })
  })
})

describe('工具重试与护栏（启发式如实标注）', () => {
  test('同回合内同名工具失败后再调用 → retry=true；审批与告警按 callId 命中', () => {
    const trace = buildTrace(SID, [
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u4') }, 1000),
      ev('tool.started', { turnId: T1, callId: ids.call('c1'), name: 'write', input: {} }, 1100),
      ev('permission.asked', {
        requestId: ids.request('req_r1'),
        callId: ids.call('c1'),
        action: 'fs.write',
        resource: 'file:a.ts',
        reason: '缺省 ask',
      }, 1110),
      ev(
        'tool.completed',
        { turnId: T1, callId: ids.call('c1'), output: 'denied', isError: true, durationMs: 30 },
        1140,
      ),
      ev('tool.started', { turnId: T1, callId: ids.call('c2'), name: 'write', input: {} }, 1200),
      ev('io.warning', {
        turnId: T1,
        callId: ids.call('c2'),
        tool: 'write',
        kind: 'secret',
        rules: ['apikey'],
        redacted: 1,
      }, 1210),
      ev(
        'tool.completed',
        { turnId: T1, callId: ids.call('c2'), output: 'ok', isError: false, durationMs: 45 },
        1245,
      ),
      ev('turn.completed', { turnId: T1, finish: 'stop' }, 1300),
    ])
    const tools = trace.turns[0]?.tools ?? []
    expect(tools.map((t) => [t.callId, t.isError, t.retry, t.approvalAsked, t.warnings])).toEqual([
      ['c1', true, false, true, []],
      ['c2', false, true, false, ['secret']],
    ])
    expect(trace.totals.toolErrors).toBe(1)
  })

  test('重试判据不跨回合：第二回合首次调用同名工具 retry=false', () => {
    const trace = buildTrace(SID, [
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u5') }, 1000),
      ev('tool.started', { turnId: T1, callId: ids.call('c1'), name: 'bash', input: {} }, 1100),
      ev(
        'tool.completed',
        { turnId: T1, callId: ids.call('c1'), output: 'boom', isError: true, durationMs: 10 },
        1110,
      ),
      ev('turn.completed', { turnId: T1, finish: 'error' }, 1120),
      ev('turn.started', { turnId: T2, delivery: 'now', userEventId: ids.event('evt_u6') }, 2000),
      ev('tool.started', { turnId: T2, callId: ids.call('c2'), name: 'bash', input: {} }, 2100),
      ev(
        'tool.completed',
        { turnId: T2, callId: ids.call('c2'), output: 'ok', isError: false, durationMs: 12 },
        2112,
      ),
      ev('turn.completed', { turnId: T2, finish: 'stop' }, 2120),
    ])
    expect(trace.turns.length).toBe(2)
    expect(trace.turns[0]?.tools[0]?.retry).toBe(false)
    expect(trace.turns[1]?.tools[0]?.retry).toBe(false)
    expect(trace.totals.turns).toBe(2)
  })

  test('悬挂调用（有 started 无 completed）→ durationMs null 且 isError false', () => {
    const trace = buildTrace(SID, [
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u7') }, 1000),
      ev('tool.started', { turnId: T1, callId: ids.call('c1'), name: 'bash', input: {} }, 1100),
    ])
    expect(trace.turns[0]?.tools[0]).toMatchObject({ durationMs: null, isError: false })
  })
})

describe('错误与标记归属', () => {
  test('回合内 error 归回合；回合外 error 进 looseErrors（不冒充归属）', () => {
    const trace = buildTrace(SID, [
      ev('error', { scope: 'engine', message: '启动期错' }, 900),
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u8') }, 1000),
      ev('error', { scope: 'llm', message: 'E_LLM: 上游 5xx', fatal: false }, 1100),
      ev('turn.completed', { turnId: T1, finish: 'error' }, 1200),
      ev('error', { scope: 'io', message: '磁盘满' }, 1300),
    ])
    expect(trace.turns[0]?.errors).toEqual([
      { at: 1100, scope: 'llm', message: 'E_LLM: 上游 5xx', fatal: false },
    ])
    expect(trace.looseErrors.map((e) => e.message)).toEqual(['启动期错', '磁盘满'])
    expect(trace.totals.errors).toBe(3)
  })

  test('记忆注入先于 turn.started → 缓冲后挂到所属回合；标记按 at 升序', () => {
    const trace = buildTrace(SID, [
      ev('memory.injected', {
        turnId: T1,
        query: '查一下',
        memories: [{ id: 1, content: '偏好', createdAt: 1 }],
      }, 950),
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u9') }, 1000),
      ev('checkpoint.created', {
        checkpointId: ids.checkpoint('ckp_c1'),
        files: ['a.ts', 'b.ts'],
        turnId: T1,
      }, 1500),
      ev('turn.completed', { turnId: T1, finish: 'stop' }, 1600),
    ])
    expect(trace.turns[0]?.marks.map((m) => [m.kind, m.at, m.label])).toEqual([
      ['memory', 950, '注入 1 条记忆'],
      ['checkpoint', 1500, '快照 2 个文件'],
    ])
  })

  test('手动压缩发生在回合之间 → 挂最近回合', () => {
    const trace = buildTrace(SID, [
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u10') }, 1000),
      ev('turn.completed', { turnId: T1, finish: 'stop' }, 1200),
      ev('compaction.started', {}, 1300),
      ev('compaction.completed', {
        summary: '摘要',
        keptFromEventId: ids.event('evt_k1'),
        tokensBefore: 12345,
      }, 1400),
    ])
    expect(trace.turns[0]?.marks).toEqual([
      { at: 1400, kind: 'compaction', label: '压缩：12345 tokens 前文 → 摘要' },
    ])
  })
})

describe('未闭合回合与空会话', () => {
  test('无 turn.completed → finish null、时长到最后一条内容为止（不填 0 假值）', () => {
    const trace = buildTrace(SID, [
      ev('turn.started', { turnId: T1, delivery: 'now', userEventId: ids.event('evt_u11') }, 1000),
      msg(T1, 1500),
      ev('tool.started', { turnId: T1, callId: ids.call('c1'), name: 'read', input: {} }, 1800),
    ])
    const turn = trace.turns[0]
    expect(turn?.finish).toBeNull()
    expect(turn?.durationMs).toBe(800)
    // 末步以回合结束时刻（最后一条内容 1800）为界
    expect(turn?.steps[0]?.durationMs).toBe(300)
  })

  test('空事件流 → 零合计、零回合（不造数据）', () => {
    const trace = buildTrace(SID, [])
    expect(trace.turns).toEqual([])
    expect(trace.looseErrors).toEqual([])
    expect(trace.totals).toEqual({
      turns: 0,
      steps: 0,
      toolCalls: 0,
      toolErrors: 0,
      errors: 0,
      durationMs: 0,
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 },
    })
  })
})

describe('性能（验收：千事件聚合 <200ms）', () => {
  test('1100 条 durable 事件（100 回合×11）单遍聚合远低于阈值', () => {
    const events: SparkEventEnvelope[] = []
    let t = 0
    for (let i = 0; i < 100; i += 1) {
      const turnId = ids.turn(`trn_perf${i}`)
      t += 100
      events.push(
        ev('turn.started', { turnId, delivery: 'now', userEventId: ids.event(`evt_p${i}`) }, t),
      )
      for (let s = 0; s < 3; s += 1) {
        t += 200
        events.push(msg(turnId, t, { inputTokens: 500, outputTokens: 80, costUsd: 0.001 }))
        t += 50
        events.push(
          ev('tool.started', { turnId, callId: ids.call(`c${i}_${s}`), name: 'read', input: {} }, t),
        )
        t += 30
        events.push(
          ev(
            'tool.completed',
            {
              turnId,
              callId: ids.call(`c${i}_${s}`),
              output: 'ok',
              isError: false,
              durationMs: 30,
            },
            t,
          ),
        )
      }
      t += 100
      events.push(ev('turn.completed', { turnId, finish: 'stop' }, t))
    }
    expect(events.length).toBe(1100)
    const startedAt = Date.now()
    const trace = buildTrace(SID, events)
    const elapsed = Date.now() - startedAt
    expect(trace.turns.length).toBe(100)
    expect(trace.totals.toolCalls).toBe(300)
    expect(trace.totals.steps).toBe(300)
    expect(elapsed).toBeLessThan(200)
  })
})
