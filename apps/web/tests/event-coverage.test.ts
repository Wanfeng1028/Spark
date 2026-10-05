/**
 * 词表↔reducer 机器守卫（审计 doc/13 G-1；AGENTS §2.8「新增事件必须同步单测」的机制化）：
 * MIN_SAMPLE 是 `SparkEventType` 全键穷举的映射类型——词表新增一种而样本表未补 = 编译期
 * TS2739 即红（typecheck 先于 test 挡下）；运行时再把每种样本过一遍 `applyEvent`：
 * reducer 不认得也不抛（投影层无未知类型死区），durable 恒推进 lastSeq、live-only 恒不动。
 * 样本只求过 zod 校验的最小合法形态，不追求语义完整（逐事件行为断言见 applyEvent.test.ts）。
 */
import { describe, expect, it } from 'vitest'
import type { ProjectionState, SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import { applyEvent, ids, isLiveOnlyType } from '@spark/protocol'

const SID = ids.session('ses_cov0001')
const TURN = ids.turn('trn_cov0001')
const CALL = ids.call('cal_cov0001')
const REQ = ids.request('req_cov0001')
const EVT = ids.event('evt_cov0001')
const TSK = ids.task('tsk_cov0001')
const CHK = ids.checkpoint('chk_cov0001')

/** SparkEventType 全键穷举——新增词表条目必须在此补最小样本（编译期闸） */
const MIN_SAMPLE: { [K in SparkEventType]: SparkEventEnvelope<K>['data'] } = {
  'session.created': { cwd: '/w', model: 'm' },
  'session.resumed': { fromSeq: 0 },
  'session.title': { title: 't' },
  'session.mode.changed': { mode: 'plan', previous: 'default' },
  'turn.started': { turnId: TURN, delivery: 'now', userEventId: EVT },
  'turn.completed': { turnId: TURN, finish: 'stop' },
  'user.message': { text: 'hi' },
  'assistant.delta': { turnId: TURN, text: 'x' },
  'assistant.message': { turnId: TURN, content: [{ type: 'text', text: 'x' }] },
  'reasoning.delta': { turnId: TURN, text: 'x' },
  'reasoning.ended': { turnId: TURN, text: 'x' },
  'tool.started': { turnId: TURN, callId: CALL, name: 'bash', input: {} },
  'tool.progress': { turnId: TURN, callId: CALL, chunk: 'x' },
  'tool.completed': { turnId: TURN, callId: CALL, output: '', isError: false, durationMs: 1 },
  'permission.asked': { requestId: REQ, callId: CALL, action: 'bash', resource: 'ls', reason: 'r' },
  'permission.resolved': { requestId: REQ, reply: 'once' },
  'compaction.started': {},
  'compaction.completed': { summary: 's', keptFromEventId: EVT, tokensBefore: 1 },
  'todo.updated': { todos: [{ id: 't1', content: 'c', status: 'pending' }] },
  'question.asked': {
    requestId: REQ,
    questions: [{ question: 'q?', options: [{ label: 'a' }, { label: 'b' }] }],
  },
  'question.resolved': { requestId: REQ, answers: [{ selected: ['a'] }] },
  'deliverables.presented': { files: ['a.txt'] },
  'task.started': { taskId: TSK, kind: 'bash', command: 'ls' },
  'task.completed': {
    taskId: TSK,
    exitCode: 0,
    aborted: false,
    timedOut: false,
    durationMs: 1,
    outputChars: 0,
    notified: false,
  },
  'task.progress': { taskId: TSK, text: 'x' },
  'microcompact_boundary': { keptFromEventId: EVT, clearedCount: 0, savedTokens: 256 },
  'checkpoint.created': { checkpointId: CHK, files: [], turnId: TURN },
  error: { scope: 'engine', message: 'm' },
  'io.warning': { turnId: TURN, callId: CALL, tool: 'bash', kind: 'secret', rules: ['r1'] },
  'memory.injected': { turnId: TURN, query: 'q', memories: [{ id: 1, content: 'c', createdAt: 1 }] },
  'goal.set': { goal: 'g' },
  'goal.updated': { goal: 'g', iterations: 1, usedTokens: 1, status: 'active' },
  'goal.completed': { iterations: 1, usedTokens: 1 },
  'goal.paused': { reason: 'cleared', iterations: 0, usedTokens: 0 },
  'lsp.diagnostics': { language: 'ts', uri: 'file:///a.ts', diagnostics: [] },
}

function fresh(): ProjectionState {
  return { byId: {}, activeId: null }
}

/** 构造信封：live-only 不带 seq（§4.4 live 三类不落盘，与引擎 emit 口径一致） */
function envelope(type: SparkEventType, data: unknown, seq?: number): SparkEventEnvelope<SparkEventType> {
  const e: SparkEventEnvelope<SparkEventType> = {
    id: ids.event(`evt_cov${String(seq ?? 0).padStart(4, '0')}`),
    sessionId: SID,
    time: seq ?? 0,
    type,
    data,
  }
  if (seq !== undefined) e.seq = seq
  return e
}

describe('词表↔reducer 机器守卫（审计 G-1）', () => {
  it('样本表键数 = 词表实数（35）——样本表漂移首道哨', () => {
    expect(Object.keys(MIN_SAMPLE).length).toBe(35)
  })

  it('每种词表类型过 applyEvent：durable 推进 lastSeq / live-only 不动，reducer 全程不抛', () => {
    let seq = 0
    for (const type of Object.keys(MIN_SAMPLE) as SparkEventType[]) {
      const live = isLiveOnlyType(type)
      seq += 1
      // live-only 先落一个 durable 基线（delta 族的 reducer 分支假定已有 slice 存在）
      const before: ProjectionState = live
        ? applyEvent(fresh(), envelope('session.created', { cwd: '/w', model: 'm' }, seq))
        : fresh()
      const lastSeqBefore = before.byId[SID]?.lastSeq ?? -1
      let out: ProjectionState
      try {
        out = applyEvent(before, envelope(type, MIN_SAMPLE[type], live ? undefined : seq))
      } catch (err) {
        throw new Error(`reducer 对词表类型 ${type} 抛异常（G-1 死区）：${String(err)}`)
      }
      const slice = out.byId[SID]
      expect(slice, type).toBeDefined()
      if (live) {
        expect(slice?.lastSeq, type).toBe(lastSeqBefore)
      } else {
        expect(slice?.lastSeq, type).toBe(seq)
      }
    }
  })
})
