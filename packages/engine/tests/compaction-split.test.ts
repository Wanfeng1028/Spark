/**
 * CK-12② 方案 A 单测（doc/16 §4 设计落地）：
 * ① canSplitAfter 四规则矩阵——user 后不切/带 toolCall 的 assistant 后不切/
 *   tool.started 后不切/交换撕裂（started 在摘要侧 completed 在保留侧）不切；
 * ② 迭代摘要——上次 compaction.completed 的 summary 进本次 prompt 的
 *   previous 段；无历史时 prompt 无 previous 段；
 * ③ 用户消息保全——缺省 COMPACTION_PROMPT 含 verbatim/UPDATE 要求。
 * canSplitAfter 是导出纯函数（切点判定与预算回退解耦，pathToRoot 装配由
 * compaction.test.ts 的既有集成用例覆盖）。
 */
import { describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { canSplitAfter, COMPACTION_PROMPT, CompactorImpl } from '../src/compaction.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'

const SID = ids.session('ses_compasplit0000000001')

let n = 0
/** 最小合法信封（type+data 判定面；id/time 自增） */
function ev(type: SparkEventEnvelope['type'], data: Record<string, unknown>): SparkEventEnvelope {
  n += 1
  return {
    id: ids.event(`evt_cs${String(n).padStart(15, '0')}`),
    sessionId: SID,
    time: n,
    parentId: null,
    type,
    data,
  } as unknown as SparkEventEnvelope
}

const USER = (): SparkEventEnvelope => ev('user.message', { text: 'hi' })
const ASSIST = (): SparkEventEnvelope =>
  ev('assistant.message', { turnId: ids.turn('trn_cs0000000000000001'), content: [{ type: 'text', text: 'ok' }] })
const ASSIST_WITH_CALL = (): SparkEventEnvelope =>
  ev('assistant.message', {
    turnId: ids.turn('trn_cs0000000000000001'),
    content: [{ type: 'toolCall', callId: ids.call('cal_cs0000000000000001'), name: 'bash', input: {} }],
  })
const TOOL_START = (callId: string): SparkEventEnvelope =>
  ev('tool.started', { turnId: ids.turn('trn_cs0000000000000001'), callId: ids.call(callId), name: 'bash', input: {} })
const TOOL_DONE = (callId: string): SparkEventEnvelope =>
  ev('tool.completed', {
    turnId: ids.turn('trn_cs0000000000000001'),
    callId: ids.call(callId),
    output: '',
    isError: false,
    durationMs: 1,
  })

describe('canSplitAfter：四规则矩阵（doc/16 §3 切分点专题）', () => {
  test('规则① user.message 后不切（回答被拦腰斩断）', () => {
    const path = [USER(), ASSIST()]
    expect(canSplitAfter(path, 0)).toBe(false)
  })

  test('规则② 带 toolCall 的 assistant 后不切（调用与结果分离）', () => {
    const path = [USER(), ASSIST_WITH_CALL(), TOOL_DONE('cal_cs0000000000000001'), ASSIST()]
    // i=1：assistant 带 toolCall；交换整体已在摘要侧（保留侧无 started）——②命中
    expect(canSplitAfter(path, 1)).toBe(false)
  })

  test('规则③ tool.started 后不切', () => {
    const path = [USER(), TOOL_START('cal_a'), TOOL_DONE('cal_a'), ASSIST()]
    expect(canSplitAfter(path, 1)).toBe(false)
  })

  test('规则④ 交换撕裂不切：started 在摘要侧、completed 在保留侧', () => {
    const path = [USER(), TOOL_START('cal_a'), TOOL_DONE('cal_a'), TOOL_START('cal_b'), TOOL_DONE('cal_b')]
    // i=3：cal_b 的 started 在摘要侧、completed 在保留侧——撕裂
    expect(canSplitAfter(path, 3)).toBe(false)
  })

  test('完整交换整体在摘要侧可以切；纯 assistant 文本结尾可以切', () => {
    const path = [USER(), ASSIST_WITH_CALL(), TOOL_DONE('cal_cs0000000000000001'), ASSIST()]
    // i=2：tool.completed 后（交换 1 完整在摘要侧、保留侧无开启）——可切
    expect(canSplitAfter(path, 2)).toBe(true)
    // i=3：纯文本 assistant 结尾——可切
    expect(canSplitAfter(path, 3)).toBe(true)
    // i=0：user 后——不可切（①）
    expect(canSplitAfter(path, 0)).toBe(false)
  })

  test('fail-closed：空位/未知事件一律不可切', () => {
    expect(canSplitAfter([], 0)).toBe(false)
    expect(canSplitAfter([ev('error', { scope: 'engine', message: 'm' })], 0)).toBe(false)
  })
})

describe('迭代摘要 + 用户消息保全（doc/16 §4）', () => {
  class MemSink implements EventSink {
    readonly events: SparkEventEnvelope[] = []
    append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
      this.events.push(e)
      return Promise.resolve(e)
    }
  }

  test('无历史：prompt 不含 previous 段；含 COMPACTION_PROMPT 的 UPDATE 与 verbatim 要求', async () => {
    let captured = ''
    const sink = new MemSink()
    const bus = new EventBus({ sink })
    const compactor = new CompactorImpl({
      sessionId: SID,
      bus,
      gateway: {
        stream: () => Promise.resolve({ content: [], stopReason: 'aborted', usage: ZERO_USAGE }),
        generateOnce: (req) => {
          captured = req.prompt
          return Promise.resolve('s')
        },
      },
      projector: { modelContext: () => ({ messages: [], tokens: 0 }) },
      tree: { pathToRoot: () => [USER()] } as never,
      model: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      keepTokens: 1000,
    })
    await compactor.compact()
    expect(captured).not.toContain('Previous summary')
    expect(captured).toContain('UPDATE it rather than rewriting')
    expect(captured).toContain('verbatim in meaning')
  })

  test('有历史：上次 summary 进 previous 段（迭代而非重写）', async () => {
    let captured = ''
    const lastSummary = '旧摘要：用户要求做压缩功能'
    const sink = new MemSink()
    const bus = new EventBus({ sink })
    const compactor = new CompactorImpl({
      sessionId: SID,
      bus,
      gateway: {
        stream: () => Promise.resolve({ content: [], stopReason: 'aborted', usage: ZERO_USAGE }),
        generateOnce: (req) => {
          captured = req.prompt
          return Promise.resolve('s')
        },
      },
      projector: { modelContext: () => ({ messages: [], tokens: 0 }) },
      tree: {
        pathToRoot: () => [
          USER(),
          {
            id: ids.event('evt_cs_prev00000000001'),
            sessionId: SID,
            type: 'compaction.completed',
            time: 2,
            parentId: null,
            data: { summary: lastSummary, keptFromEventId: ids.event('evt_cs_prev00000000000'), tokensBefore: 100 },
          },
          USER(),
        ],
      } as never,
      model: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      keepTokens: 1000,
    })
    await compactor.compact()
    expect(captured).toContain('Previous summary')
    expect(captured).toContain(lastSummary)
  })

  test('缺省模板含用户消息保全句（COMPACTION_PROMPT 常量级断言）', () => {
    expect(COMPACTION_PROMPT).toContain('UPDATE it rather than rewriting')
    expect(COMPACTION_PROMPT).toContain('verbatim in meaning')
  })
})
