/**
 * trace DTO schema 单测（工单 13.7）：TraceDtoSchema 往返 · 可空字段（未闭合回合 finish=null、
 * 悬挂调用 durationMs=null、无 usage 的步 usage=null）· strictObject 拒未知键 ·
 * totals.usage 非空（合计恒有值，缺则为零而不是 null）。
 */
import { describe, expect, test } from 'vitest'
import { ids } from '../src/ids.js'
import { TraceDtoSchema, type TraceDto } from '../src/api.js'

const SID = ids.session('ses_traceschema1')
const T1 = ids.turn('trn_traceschema1')

function sample(): TraceDto {
  return {
    sessionId: SID,
    totals: {
      turns: 1,
      steps: 2,
      toolCalls: 2,
      toolErrors: 1,
      errors: 1,
      durationMs: 1400,
      usage: { costUsd: 0.03, inputTokens: 300, outputTokens: 60, cacheRead: 120, cacheWrite: 0 },
    },
    turns: [
      {
        turnId: T1,
        delivery: 'now',
        startedAt: 1000,
        durationMs: 1400,
        finish: 'stop',
        steps: [
          {
            index: 0,
            at: 1500,
            durationMs: 700,
            toolCalls: 2,
            usage: { costUsd: 0.01, inputTokens: 100, outputTokens: 20, cacheRead: 40, cacheWrite: 0 },
          },
          { index: 1, at: 2200, durationMs: 200, toolCalls: 0, usage: null },
        ],
        tools: [
          {
            callId: ids.call('call_a'),
            name: 'write',
            startedAt: 1600,
            durationMs: 30,
            isError: true,
            retry: false,
            approvalAsked: true,
            warnings: [],
          },
          {
            callId: ids.call('call_b'),
            name: 'write',
            startedAt: 1700,
            durationMs: null,
            isError: false,
            retry: true,
            approvalAsked: false,
            warnings: ['secret'],
          },
        ],
        marks: [{ at: 950, kind: 'memory', label: '注入 1 条记忆' }],
        errors: [{ at: 1650, scope: 'tool', message: 'E_IO: 只读', fatal: false }],
        usage: { costUsd: 0.03, inputTokens: 300, outputTokens: 60, cacheRead: 120, cacheWrite: 0 },
      },
    ],
    looseErrors: [],
  }
}

describe('TraceDtoSchema（工单 13.7）', () => {
  test('合法样本往返一致（含 JSON 序列化）', () => {
    const dto = sample()
    expect(TraceDtoSchema.parse(dto)).toEqual(dto)
    expect(TraceDtoSchema.parse(JSON.parse(JSON.stringify(dto)) as unknown)).toEqual(dto)
  })

  test('未闭合回合：finish=null 合法；finish 字符串必须在词表内', () => {
    const dto = sample()
    const open = { ...dto, turns: [{ ...dto.turns[0]!, finish: null }] }
    expect(TraceDtoSchema.parse(open).turns[0]?.finish).toBeNull()
    const bogus = { ...dto, turns: [{ ...dto.turns[0]!, finish: 'maybe' }] }
    expect(TraceDtoSchema.safeParse(bogus).success).toBe(false)
  })

  test('strictObject 拒未知键（协议面不许夹带）', () => {
    const dto = sample() as unknown as Record<string, unknown>
    const withExtra = { ...dto, nope: 1 }
    expect(TraceDtoSchema.safeParse(withExtra).success).toBe(false)
    const turnExtra = {
      ...sample(),
      turns: [{ ...sample().turns[0]!, extra: 'x' }],
    }
    expect(TraceDtoSchema.safeParse(turnExtra).success).toBe(false)
  })

  test('标记种类封闭（compaction/checkpoint/memory；session.resumed 不进 trace）', () => {
    const dto = sample()
    const bogus = {
      ...dto,
      turns: [{ ...dto.turns[0]!, marks: [{ at: 1, kind: 'resume', label: 'x' }] }],
    }
    expect(TraceDtoSchema.safeParse(bogus).success).toBe(false)
  })

  test('护栏告警种类封闭（injection/secret）', () => {
    const dto = sample()
    const bogus = {
      ...dto,
      turns: [{ ...dto.turns[0]!, tools: [{ ...dto.turns[0]!.tools[0]!, warnings: ['pii'] }] }],
    }
    expect(TraceDtoSchema.safeParse(bogus).success).toBe(false)
  })

  test('负时长/负 token 拒收（非负约束）', () => {
    const dto = sample()
    expect(
      TraceDtoSchema.safeParse({ ...dto, totals: { ...dto.totals, durationMs: -1 } }).success,
    ).toBe(false)
    expect(
      TraceDtoSchema.safeParse({
        ...dto,
        turns: [{ ...dto.turns[0]!, steps: [{ index: 0, at: 1, durationMs: -5, toolCalls: 0, usage: null }] }],
      }).success,
    ).toBe(false)
  })
})
