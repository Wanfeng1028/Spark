/**
 * PiGateway 单测（doc/02 §5.9 / §8.6 工单 8）：类型双向映射、事件回调、
 * 错误内化、指数退避重试（429/5xx/网络）、已交付不重试、abort 前缀保留、
 * generateOnce 透传。全部用注入的 fake pi streamFn，不依赖真实 API key。
 */
import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  Context as PiContext,
  Model,
  StreamOptions,
  Usage as PiUsage,
} from '@earendil-works/pi-ai'
import { ids, type ContentItem } from '@spark/protocol'
import { describe, expect, test } from 'vitest'
import type { LlmMessage, ResolvedModel, ToolSpec } from '../src/llm-gateway.js'
import {
  backoffDelayMs,
  classifyLlmError,
  PiGateway,
  toPiMessages,
  toSparkContent,
  toSparkUsage,
  type PiStreamFn,
} from '../src/pi-gateway.js'

// ---- fake 基础设施 ----

const MODEL: ResolvedModel = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  contextWindow: 65536,
  apiKey: 'sk-test',
  baseUrl: 'https://api.deepseek.com/v1',
}

function zeroPiUsage(): PiUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function partial(over: Partial<AssistantMessage>): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'openai-completions',
    provider: 'deepseek',
    model: 'deepseek-chat',
    usage: zeroPiUsage(),
    stopReason: 'pending',
    timestamp: 0,
    ...over,
  }
}

const textDelta = (delta: string): AssistantMessageEvent => ({
  type: 'text_delta',
  contentIndex: 0,
  delta,
  partial: partial({}),
})

const thinkingDelta = (delta: string): AssistantMessageEvent => ({
  type: 'thinking_delta',
  contentIndex: 0,
  delta,
  partial: partial({}),
})

const doneEvent = (message: AssistantMessage): AssistantMessageEvent => ({
  type: 'done',
  reason: 'stop',
  message,
})

const errorEvent = (errorMessage: string, content: AssistantMessage['content'] = []): AssistantMessageEvent => ({
  type: 'error',
  reason: 'error',
  error: partial({ stopReason: 'error', errorMessage, content }),
})

const abortedEvent = (content: AssistantMessage['content']): AssistantMessageEvent => ({
  type: 'error',
  reason: 'aborted',
  error: partial({ stopReason: 'aborted', content }),
})

/** 同步事件数组 → 手写 AsyncIterable（避开 async-generator lint 约束） */
function eventsIterable(events: readonly AssistantMessageEvent[]): AsyncIterable<AssistantMessageEvent> {
  return {
    [Symbol.asyncIterator]: () => {
      let i = 0
      return {
        next: (): Promise<IteratorResult<AssistantMessageEvent>> =>
          i < events.length
            ? Promise.resolve({ value: events[i++] as AssistantMessageEvent, done: false })
            : Promise.resolve({ value: undefined, done: true }),
      }
    },
  }
}

/** 脚本化 fake：每次调用 shift 一个事件序列；记录全部入参 */
class FakePi {
  readonly calls: Array<{
    model: Model<Api>
    context: PiContext
    options?: StreamOptions | undefined
  }> = []
  readonly sleeps: number[] = []

  constructor(private readonly script: AssistantMessageEvent[][]) {}

  readonly streamFn: PiStreamFn = (model, context, options) => {
    this.calls.push({ model, context, options })
    const events = this.script.shift() ?? []
    return eventsIterable(events)
  }

  /** 默认 sleep：记录并立即兑现 */
  readonly sleep = (ms: number): Promise<void> => {
    this.sleeps.push(ms)
    return Promise.resolve()
  }
}

function makeGateway(fake: FakePi): PiGateway {
  return new PiGateway({ streamFn: fake.streamFn, sleep: fake.sleep, baseDelayMs: 1000 })
}

function baseRequest(over: {
  onDelta?: (t: string) => void
  onThinking?: (t: string) => void
  signal?: AbortSignal
  tools?: ToolSpec[]
  messages?: LlmMessage[]
  system?: string
  maxTokens?: number
}) {
  return {
    model: MODEL,
    system: over.system ?? '',
    messages: over.messages ?? [{ role: 'user' as const, content: [{ type: 'text' as const, text: '你好' }] }],
    tools: over.tools ?? [],
    signal: over.signal ?? new AbortController().signal,
    onDelta: over.onDelta ?? (() => {}),
    onThinking: over.onThinking ?? (() => {}),
    ...(over.maxTokens !== undefined ? { maxTokens: over.maxTokens } : {}),
  }
}

// ---- 测试 ----

describe('流式回调与结果映射（§5.9 事件映射 v2.4）', () => {
  test('text_delta → onDelta 顺序回调；done → content/stopReason/usage 映射', async () => {
    const fake = new FakePi([
      [
        textDelta('你'),
        textDelta('好'),
        doneEvent(
          partial({
            content: [{ type: 'text', text: '你好' }],
            stopReason: 'stop',
            usage: { ...zeroPiUsage(), input: 12, output: 5, totalTokens: 17 },
          }),
        ),
      ],
    ])
    const deltas: string[] = []
    const result = await makeGateway(fake).stream(baseRequest({ onDelta: (t) => deltas.push(t) }))
    expect(deltas).toEqual(['你', '好'])
    expect(result.stopReason).toBe('stop')
    expect(result.content).toEqual([{ type: 'text', text: '你好' }])
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5 })
  })

  test('thinking_delta → onThinking；定稿 thinking 内容 → reasoning 项', async () => {
    const fake = new FakePi([
      [
        thinkingDelta('思考'),
        doneEvent(
          partial({
            content: [
              { type: 'thinking', thinking: '思考' },
              { type: 'text', text: '答' },
            ],
            stopReason: 'stop',
          }),
        ),
      ],
    ])
    const thinks: string[] = []
    const result = await makeGateway(fake).stream(baseRequest({ onThinking: (t) => thinks.push(t) }))
    expect(thinks).toEqual(['思考'])
    expect(result.content).toEqual([
      { type: 'reasoning', text: '思考' },
      { type: 'text', text: '答' },
    ])
  })

  test('toolCall 定稿：pi ToolCall → Spark toolCall（id→callId、arguments→input）；toolUse→stop', async () => {
    const fake = new FakePi([
      [
        doneEvent(
          partial({
            content: [
              { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'src/a.ts' } },
            ],
            stopReason: 'toolUse',
          }),
        ),
      ],
    ])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('stop')
    expect(result.content).toEqual([
      { type: 'toolCall', callId: 'call_1', name: 'read', input: { path: 'src/a.ts' } },
    ])
  })

  test('text_start/end、toolcall_start/delta/end 事件忽略不崩溃', async () => {
    const fake = new FakePi([
      [
        { type: 'text_start', contentIndex: 0, partial: partial({}) },
        textDelta('x'),
        { type: 'text_end', contentIndex: 0, content: 'x', partial: partial({}) },
        { type: 'toolcall_start', contentIndex: 1, partial: partial({}) },
        { type: 'toolcall_delta', contentIndex: 1, delta: '{"a"', partial: partial({}) },
        {
          type: 'toolcall_end',
          contentIndex: 1,
          toolCall: { type: 'toolCall', id: 'c', name: 'bash', arguments: { cmd: 'ls' } },
          partial: partial({}),
        },
        doneEvent(partial({ content: [{ type: 'text', text: 'x' }], stopReason: 'stop' })),
      ],
    ])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('stop')
    expect(result.content).toEqual([{ type: 'text', text: 'x' }])
  })

  test('usage 全字段映射：reasoning/cacheRead/cacheWrite/cost 非零保留、零省略', async () => {
    const usage: PiUsage = {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 0,
      reasoning: 20,
      totalTokens: 150,
      cost: { input: 0.1, output: 0.05, cacheRead: 0.01, cacheWrite: 0, total: 0.16 },
    }
    const fake = new FakePi([[doneEvent(partial({ stopReason: 'stop', usage }))]])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 20,
      cacheRead: 10,
      costUsd: 0.16,
    })
  })

  test('stopReason length 直通', async () => {
    const fake = new FakePi([[doneEvent(partial({ stopReason: 'length' }))]])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('length')
  })
})

describe('请求侧映射（model/context/options）', () => {
  test('deepseek → openai-completions api、baseUrl 覆盖、system 非空直传、apiKey/signal 透传', async () => {
    const fake = new FakePi([[doneEvent(partial({ stopReason: 'stop' }))]])
    const signal = new AbortController().signal
    await makeGateway(fake).stream(baseRequest({ system: '你是 Spark', signal }))
    const call = fake.calls[0]
    expect(call).toBeDefined()
    expect(call?.model.api).toBe('openai-completions')
    expect(call?.model.provider).toBe('deepseek')
    expect(call?.model.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(call?.model.contextWindow).toBe(65536)
    expect(call?.context.systemPrompt).toBe('你是 Spark')
    expect(call?.options?.apiKey).toBe('sk-test')
    expect(call?.options?.signal).toBe(signal)
  })

  test('baseUrl 缺省取 provider 默认；system 空串不传 systemPrompt；无工具不传 tools', async () => {
    const fake = new FakePi([[doneEvent(partial({ stopReason: 'stop' }))]])
    await makeGateway(fake).stream({
      ...baseRequest({}),
      model: { provider: 'openai', model: 'gpt-4o', contextWindow: 128000, apiKey: 'k' },
    })
    const call = fake.calls[0]
    expect(call?.model.baseUrl).toBe('https://api.openai.com/v1')
    expect(call?.context.systemPrompt).toBeUndefined()
    expect(call?.context.tools).toBeUndefined()
  })

  test('工具薄桥（v2.7）：JSON Schema 经 Type.Unsafe 透传内容', async () => {
    const fake = new FakePi([[doneEvent(partial({ stopReason: 'stop' }))]])
    const tools: ToolSpec[] = [
      {
        name: 'read',
        description: '读文件',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
          additionalProperties: false,
        },
      },
    ]
    await makeGateway(fake).stream(baseRequest({ tools }))
    const got = fake.calls[0]?.context.tools?.[0]
    expect(got?.name).toBe('read')
    expect(got?.description).toBe('读文件')
    expect(got?.parameters).toMatchObject({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    })
  })

  test('未知 provider / 缺 apiKey：错误结果不抛、不发起流', async () => {
    const fake = new FakePi([])
    const gw = makeGateway(fake)
    const r1 = await gw.stream({
      ...baseRequest({}),
      model: { provider: 'nope', model: 'x', contextWindow: 1, apiKey: 'k' },
    })
    expect(r1.stopReason).toBe('error')
    expect(r1.error).toContain('E_LLM_PROVIDER')
    expect(r1.error).toContain('nope')
    const r2 = await gw.stream({
      ...baseRequest({}),
      model: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 1 },
    })
    expect(r2.stopReason).toBe('error')
    expect(r2.error).toContain('未配置 apiKey')
    expect(fake.calls).toHaveLength(0)
  })
})

describe('toPiMessages / toSparkContent / toSparkUsage 纯映射', () => {
  test('user + assistant(text/reasoning/toolCall) + assistant(toolResult) 的完整转换', () => {
    const messages: LlmMessage[] = [
      { role: 'user', content: [{ type: 'text', text: '读文件' }] },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '想一下' },
          { type: 'text', text: '调用工具' },
          { type: 'toolCall', callId: ids.call('cal_c1'), name: 'read', input: { path: 'a.ts' } },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'toolResult', callId: ids.call('cal_c1'), output: { lines: 3 }, isError: false }],
      },
    ]
    const pi = toPiMessages(messages)
    expect(pi).toHaveLength(3)
    expect(pi[0]).toMatchObject({ role: 'user', content: [{ type: 'text', text: '读文件' }] })
    expect(pi[1]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '想一下' },
        { type: 'text', text: '调用工具' },
        { type: 'toolCall', id: 'cal_c1', name: 'read', arguments: { path: 'a.ts' } },
      ],
    })
    expect(pi[2]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'cal_c1',
      toolName: 'read',
      content: [{ type: 'text', text: '{"lines":3}' }],
      isError: false,
    })
  })

  test('toolResult 回溯不到 toolCall 时 toolName 空串；output 字符串直通', () => {
    const pi = toPiMessages([
      {
        role: 'assistant',
        content: [{ type: 'toolResult', callId: ids.call('cal_c9'), output: '纯文本输出', isError: true }],
      },
    ])
    expect(pi[0]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'cal_c9',
      toolName: '',
      content: [{ type: 'text', text: '纯文本输出' }],
      isError: true,
    })
  })

  test('toolCall.input 非对象时 arguments 兜底空对象；toolCall 项与 text 混排保持顺序', () => {
    const pi = toPiMessages([
      {
        role: 'assistant',
        content: [
          { type: 'toolCall', callId: ids.call('cal_c1'), name: 'bash', input: '不是对象' },
          { type: 'text', text: '尾注' },
        ],
      },
    ])
    const only = pi[0]
    expect(only).toBeDefined()
    if (only?.role === 'assistant') {
      expect(only.content[0]).toMatchObject({ type: 'toolCall', arguments: {} })
      expect(only.content[1]).toEqual({ type: 'text', text: '尾注' })
    } else {
      expect.unreachable('首条应为 assistant')
    }
  })

  test('toSparkContent：thinking → reasoning；toSparkUsage undefined → 零用量', () => {
    expect(
      toSparkContent([{ type: 'thinking', thinking: 't' }, { type: 'text', text: 'a' }]),
    ).toEqual([
      { type: 'reasoning', text: 't' },
      { type: 'text', text: 'a' },
    ])
    expect(toSparkUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

describe('abort 与错误内化（pi 契约：错误进结果不抛）', () => {
  test('pi aborted 事件：已交付前缀保留在 content，stopReason=aborted', async () => {
    const fake = new FakePi([
      [textDelta('前缀'), abortedEvent([{ type: 'text', text: '前缀' }])],
    ])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('aborted')
    expect(result.content).toEqual([{ type: 'text', text: '前缀' }])
  })

  test('signal 已 aborted 时即使收到 done 也判 aborted', async () => {
    const fake = new FakePi([[doneEvent(partial({ stopReason: 'stop' }))]])
    const controller = new AbortController()
    controller.abort()
    const result = await makeGateway(fake).stream(baseRequest({ signal: controller.signal }))
    expect(result.stopReason).toBe('aborted')
  })

  test('流未闭合（无 done/error 终止事件）→ E_LLM_PROVIDER 错误结果', async () => {
    const fake = new FakePi([[textDelta('半截')]])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('error')
    expect(result.error).toContain('E_LLM_PROVIDER')
    expect(result.error).toContain('流未闭合')
  })

  test('迭代器抛出异常 → 空内容错误结果（失败闭合）', async () => {
    const throwing: PiStreamFn = () => {
      throw new Error('SDK 崩了')
    }
    const gw = new PiGateway({ streamFn: throwing, sleep: () => Promise.resolve() })
    const result = await gw.stream(baseRequest({}))
    expect(result.stopReason).toBe('error')
    expect(result.error).toContain('E_LLM_PROVIDER')
    expect(result.error).toContain('SDK 崩了')
  })
})

describe('重试（§5.9：429/5xx/网络 → 1s/2s/4s ±20% jitter，3 次）', () => {
  test('429 失败一次后成功：重试一轮，退避在 1s±20% 区间', async () => {
    const fake = new FakePi([
      [errorEvent('429 Too Many Requests')],
      [doneEvent(partial({ content: [{ type: 'text', text: 'ok' }], stopReason: 'stop' }))],
    ])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('stop')
    expect(fake.calls).toHaveLength(2)
    expect(fake.sleeps).toHaveLength(1)
    expect(fake.sleeps[0]).toBeGreaterThanOrEqual(800)
    expect(fake.sleeps[0]).toBeLessThanOrEqual(1200)
  })

  test('指数退避序列：429 → 500 → 成功，两次 sleep 分别落在 1s/2s ±20%', async () => {
    const fake = new FakePi([
      [errorEvent('rate limit exceeded')],
      [errorEvent('500 Internal Server Error')],
      [doneEvent(partial({ stopReason: 'stop' }))],
    ])
    await makeGateway(fake).stream(baseRequest({}))
    expect(fake.sleeps).toHaveLength(2)
    expect(fake.sleeps[0]).toBeGreaterThanOrEqual(800)
    expect(fake.sleeps[0]).toBeLessThanOrEqual(1200)
    expect(fake.sleeps[1]).toBeGreaterThanOrEqual(1600)
    expect(fake.sleeps[1]).toBeLessThanOrEqual(2400)
  })

  test('网络错误可重试（E_LLM_NETWORK 分类）', async () => {
    const fake = new FakePi([
      [errorEvent('fetch failed: getaddrinfo ENOTFOUND')],
      [doneEvent(partial({ stopReason: 'stop' }))],
    ])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('stop')
    expect(fake.sleeps).toHaveLength(1)
  })

  test('重试穷尽（连续 429）：错误结果带 E_LLM_RATELIMIT，共 1+3 次调用 3 次 sleep', async () => {
    const fake = new FakePi([
      [errorEvent('429')],
      [errorEvent('429')],
      [errorEvent('429')],
      [errorEvent('429')],
    ])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('error')
    expect(result.error).toContain('E_LLM_RATELIMIT')
    expect(fake.calls).toHaveLength(4)
    expect(fake.sleeps).toHaveLength(3)
  })

  test('不可重试错误（配额/鉴权）：立即失败无 sleep', async () => {
    const fake = new FakePi([[errorEvent('401 invalid_api_key: Unauthorized')]])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('error')
    expect(result.error).toContain('E_LLM_PROVIDER')
    expect(fake.sleeps).toHaveLength(0)
    expect(fake.calls).toHaveLength(1)
  })

  test('已交付 delta 后出错：不重试，错误结果保留 error 事件携带的前缀', async () => {
    const fake = new FakePi([
      [textDelta('半路'), errorEvent('429 Too Many Requests', [{ type: 'text', text: '半路' }])],
    ])
    const result = await makeGateway(fake).stream(baseRequest({}))
    expect(result.stopReason).toBe('error')
    expect(result.content).toEqual([{ type: 'text', text: '半路' }])
    expect(fake.calls).toHaveLength(1)
    expect(fake.sleeps).toHaveLength(0)
  })

  test('退避 sleep 中被 abort：返回 aborted 空前缀', async () => {
    const fake = new FakePi([[errorEvent('429')]])
    const gw = new PiGateway({
      streamFn: fake.streamFn,
      sleep: () => Promise.reject(new Error('aborted')),
      baseDelayMs: 1000,
    })
    const result = await gw.stream(baseRequest({}))
    expect(result.stopReason).toBe('aborted')
    expect(result.content).toEqual([])
  })
})

describe('generateOnce（压缩/起标题路径）', () => {
  test('prompt → user 消息；system/maxTokens 透传；返回拼接 text', async () => {
    const fake = new FakePi([
      [
        textDelta('摘要'),
        doneEvent(partial({ content: [{ type: 'text', text: '摘要' }], stopReason: 'stop' })),
      ],
    ])
    const gw = makeGateway(fake)
    const out = await gw.generateOnce({
      model: MODEL,
      system: '压缩提示词',
      prompt: '请总结',
      maxTokens: 2000,
    })
    expect(out).toBe('摘要')
    const call = fake.calls[0]
    expect(call?.context.systemPrompt).toBe('压缩提示词')
    const msgs = call?.context.messages ?? []
    expect(msgs).toHaveLength(1)
    const first = msgs[0]
    if (first?.role === 'user') {
      expect(first.content).toEqual([{ type: 'text', text: '请总结' }])
      expect(first.timestamp).toBeGreaterThan(0)
    } else {
      expect.unreachable('应为 user 消息')
    }
    expect(call?.options?.maxTokens).toBe(2000)
  })

  test('错误结果 → 抛出（compaction 捕获后发 error 事件）', async () => {
    const fake = new FakePi([[errorEvent('402 quota exceeded')]])
    const gw = makeGateway(fake)
    await expect(gw.generateOnce({ model: MODEL, prompt: 'x' })).rejects.toThrow('E_LLM_PROVIDER')
  })

  test('signal 已 aborted → E_ABORTED', async () => {
    const fake = new FakePi([[doneEvent(partial({ stopReason: 'stop' }))]])
    const controller = new AbortController()
    controller.abort()
    const gw = makeGateway(fake)
    await expect(
      gw.generateOnce({ model: MODEL, prompt: 'x', signal: controller.signal }),
    ).rejects.toThrow('E_ABORTED')
  })
})

describe('classifyLlmError / backoffDelayMs 纯函数', () => {
  test('分类正反例', () => {
    expect(classifyLlmError('429 Too Many Requests')).toEqual({ kind: 'E_LLM_RATELIMIT', retryable: true })
    expect(classifyLlmError('Rate limit reached')).toEqual({ kind: 'E_LLM_RATELIMIT', retryable: true })
    expect(classifyLlmError('fetch failed')).toEqual({ kind: 'E_LLM_NETWORK', retryable: true })
    expect(classifyLlmError('socket hang up')).toEqual({ kind: 'E_LLM_NETWORK', retryable: true })
    expect(classifyLlmError('503 Service Unavailable')).toEqual({ kind: 'E_LLM_PROVIDER', retryable: true })
    expect(classifyLlmError('provider overloaded')).toEqual({ kind: 'E_LLM_PROVIDER', retryable: true })
    expect(classifyLlmError('insufficient_quota')).toEqual({ kind: 'E_LLM_PROVIDER', retryable: false })
    expect(classifyLlmError('401 Unauthorized')).toEqual({ kind: 'E_LLM_PROVIDER', retryable: false })
    expect(classifyLlmError('400 bad request')).toEqual({ kind: 'E_LLM_PROVIDER', retryable: false })
  })

  test('退避：attempt 1/2/3 分别落在 1s/2s/4s 的 ±20%', () => {
    for (const [attempt, base, lo, hi] of [
      [1, 1000, 800, 1200],
      [2, 1000, 1600, 2400],
      [3, 1000, 3200, 4800],
    ] as const) {
      for (let i = 0; i < 50; i++) {
        const d = backoffDelayMs(base, attempt)
        expect(d).toBeGreaterThanOrEqual(lo)
        expect(d).toBeLessThanOrEqual(hi)
      }
    }
  })
})

describe('与 run-loop 的端到端契约（ScriptedLlm 同形断言）', () => {
  test('PiGateway 结果形状满足 run-loop 消费：toolUse → stop + toolCall 项', async () => {
    const fake = new FakePi([
      // step 1：发起工具调用
      [
        textDelta('我看下文件'),
        doneEvent(
          partial({
            content: [
              { type: 'text', text: '我看下文件' },
              { type: 'toolCall', id: 'call_x', name: 'read', arguments: { path: 'a.ts' } },
            ],
            stopReason: 'toolUse',
            usage: { ...zeroPiUsage(), input: 10, output: 8, totalTokens: 18 },
          }),
        ),
      ],
      // step 2：工具结果回喂后正常收尾
      [
        doneEvent(
          partial({
            content: [{ type: 'text', text: '文件有 3 行' }],
            stopReason: 'stop',
            usage: { ...zeroPiUsage(), input: 30, output: 6, totalTokens: 36 },
          }),
        ),
      ],
    ])
    const gw = makeGateway(fake)
    const r1 = await gw.stream(baseRequest({}))
    expect(r1.stopReason).toBe('stop')
    const call = r1.content.find((c): c is Extract<ContentItem, { type: 'toolCall' }> => c.type === 'toolCall')
    expect(call).toMatchObject({ callId: 'call_x', name: 'read' })

    // step 2 请求侧：含 toolCall 定稿与 toolResult 回喂的完整消息序列
    const r2 = await gw.stream(
      baseRequest({
        messages: [
          { role: 'user', content: [{ type: 'text', text: '读 a.ts' }] },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: '我看下文件' },
              { type: 'toolCall', callId: ids.call('cal_call_x'), name: 'read', input: { path: 'a.ts' } },
            ],
          },
          {
            role: 'assistant',
            content: [
              { type: 'toolResult', callId: ids.call('cal_call_x'), output: { lines: 3 }, isError: false },
            ],
          },
        ],
      }),
    )
    expect(r2.stopReason).toBe('stop')
    expect(r2.content).toEqual([{ type: 'text', text: '文件有 3 行' }])
    // 第二次调用的 pi 消息：user / assistant(toolCall) / toolResult 三段
    const piMsgs = fake.calls[1]?.context.messages ?? []
    expect(piMsgs.map((m) => m.role)).toEqual(['user', 'assistant', 'toolResult'])
  })
})
