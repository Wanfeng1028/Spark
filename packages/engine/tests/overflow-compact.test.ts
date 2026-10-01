/**
 * CK-7 溢出即压缩单测：
 * A. classifyLlmError 的 E_LLM_OVERFLOW 桶（opencode 正则语料采样 + 置于 FATAL
 *    之前的次序断言——provider 常把超窗包在 invalid_request_error 里）。
 * B. 直调 runTurn 闭环：溢出 → 反应式压缩 → 同 turn 重试成功（无 error 事件）；
 *    二次溢出仍 fatal（每 turn 限一次）；压缩失败 fatal；非溢出错误不触发压缩。
 */
import { describe, expect, test, vi } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { classifyLlmError } from '../src/pi-gateway.js'
import { runTurn } from '../src/run-loop.js'
import { SessionRuntime } from '../src/session/runtime.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'
import type { StreamResult } from '../src/llm-gateway.js'
import type { ResolvedModel } from '../src/llm-gateway.js'

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

const SID = ids.session('ses_overflowtest000000000000')
const MODEL: ResolvedModel = { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }

const OVERFLOW_ERR =
  "invalid_request_error: This model's maximum context length is 16384 tokens. However, your messages resulted in 20480 tokens. Please reduce the length of the messages."

describe('classifyLlmError：E_LLM_OVERFLOW 桶（CK-7）', () => {
  test('opencode 语料采样：归一化命中', () => {
    const corpus = [
      'prompt is too long: 20480 tokens > 16384 maximum',
      "This model's maximum context length is 16384 tokens",
      'invalid_request_error: context_length_exceeded', // 包在 FATAL 触发词里——次序证明
      'request_too_large: 413 payload too large',
      'The message you submitted was too long, please reduce the length and try again',
      'context window exceeded by 1200 tokens',
      'input length and max_tokens exceed context limit',
    ]
    for (const msg of corpus) {
      const cls = classifyLlmError(msg)
      expect(cls.kind, msg).toBe('E_LLM_OVERFLOW')
      expect(cls.retryable).toBe(false) // 同 payload 重试无意义——压缩才是出路
    }
  })

  test('非溢出错误不误吞：限流/配额/参数保持原分类', () => {
    expect(classifyLlmError('rate limit: too many requests').kind).toBe('E_LLM_RATELIMIT')
    expect(classifyLlmError('insufficient_quota: out of budget').kind).toBe('E_LLM_PROVIDER')
    expect(classifyLlmError('invalid_request_error: model fake-chat does not exist').kind).toBe(
      'E_LLM_PROVIDER',
    )
  })
})

// ---------- B. runTurn 闭环（stub deps） ----------

interface Fixture {
  sink: MemSink
  streamResults: StreamResult[]
  compact: ReturnType<typeof vi.fn<() => Promise<boolean>>>
  runTurn: () => Promise<{ finish: string; usage: { inputTokens: number } } | undefined>
}

function makeFixture(streamResults: StreamResult[], compactResult: boolean): Fixture {
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  let call = 0
  const gateway = {
    stream: (): Promise<StreamResult> => {
      const r = streamResults[call]
      call += 1
      if (r === undefined) return Promise.resolve({ content: [], stopReason: 'aborted', usage: ZERO_USAGE })
      return Promise.resolve(r)
    },
    generateOnce: () => Promise.resolve(''),
  }
  const compact = vi.fn((): Promise<boolean> => Promise.resolve(compactResult))
  const deps = {
    sessionId: SID,
    bus,
    gateway,
    projector: { modelContext: () => ({ messages: [], tokens: 10 }) },
    compactor: { compact },
    tools: { materialize: () => [], runAll: () => Promise.resolve([]) },
    model: MODEL,
    system: '',
    maxStepsPerTurn: 40,
    compactionThreshold: 0.8,
  }
  const rt = new SessionRuntime(SID)
  const input = {
    id: ids.event('evt_overflow000000000000000001'),
    turnId: ids.turn('trn_overflow0000000000000001'),
    text: 'hi',
    delivery: 'now' as const,
    admittedAt: Date.now(),
  }
  return {
    sink,
    streamResults,
    compact,
    runTurn: () => runTurn(rt, deps, input),
  }
}

const textStep = (text: string): StreamResult => ({
  content: [{ type: 'text', text }],
  stopReason: 'stop',
  usage: ZERO_USAGE,
})

const overflowStep = (): StreamResult => ({
  content: [],
  stopReason: 'error',
  usage: ZERO_USAGE,
  error: OVERFLOW_ERR,
})

describe('runTurn 溢出即压缩闭环（CK-7）', () => {
  test('溢出 → 压缩 → 同 turn 重试成功：无 error 事件，finish=stop', async () => {
    const f = makeFixture([overflowStep(), textStep('压缩后成功')], true)
    const result = await f.runTurn()
    expect(result?.finish).toBe('stop')
    expect(f.compact).toHaveBeenCalledTimes(1)
    expect(f.sink.events.some((e) => e.type === 'error')).toBe(false)
    // findLast 需 es2023 lib（未开）——逆序 find；data 收窄走谓词（信封缺省实例化 data 为全集）
    const final = [...f.sink.events]
      .reverse()
      .find((e): e is SparkEventEnvelope<'assistant.message'> => e.type === 'assistant.message')
    if (final === undefined) throw new Error('缺失')
    expect(final.data.content).toEqual([{ type: 'text', text: '压缩后成功' }])
  })

  test('二次溢出仍 fatal：压缩限一次，error 事件只发第二枚', async () => {
    const f = makeFixture([overflowStep(), overflowStep()], true)
    const result = await f.runTurn()
    expect(result?.finish).toBe('error')
    expect(f.compact).toHaveBeenCalledTimes(1)
    const errors = f.sink.events.filter((e) => e.type === 'error')
    expect(errors).toHaveLength(1) // 第一次溢出被吸收（不发事件），第二次 fatal 如实闭合
  })

  test('压缩失败 → 直接 fatal（不重试）', async () => {
    const f = makeFixture([overflowStep()], false)
    const result = await f.runTurn()
    expect(result?.finish).toBe('error')
    expect(f.compact).toHaveBeenCalledTimes(1)
    expect(f.sink.events.some((e) => e.type === 'error')).toBe(true)
  })

  test('非溢出 fatal 错误：不触发压缩', async () => {
    const f = makeFixture(
      [{ content: [], stopReason: 'error', usage: ZERO_USAGE, error: 'insufficient_quota' }],
      true,
    )
    const result = await f.runTurn()
    expect(result?.finish).toBe('error')
    expect(f.compact).not.toHaveBeenCalled()
    expect(f.sink.events.some((e) => e.type === 'error')).toBe(true)
  })
})
