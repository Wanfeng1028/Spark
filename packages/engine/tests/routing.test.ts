/**
 * 模型路由单测（阶段七工单 7.7 / doc/02 §8.6）：
 * - FallbackGateway：主模型成功不切换 / 错误无交付切换 / 链尽汇总 /
 *   空链短路 / aborted 与部分交付不切换 / 热更新链下请求生效 /
 *   generateOnce 主抛错切换；
 * - CostTracker：零起点累计 / 持久化往返 / exceeded 判定 / reset /
 *   坏 JSON 与形状不符 fail-closed（E_CONFIG）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  ConfigError,
  CostTracker,
  Engine,
  FallbackGateway,
  type EngineConfig,
  type ResolvedModel,
  type StreamRequest,
} from '../src/index.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

let dirs: string[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-routing-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

const PRIMARY: ResolvedModel = { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 1000 }
const FB_A: ResolvedModel = { provider: 'groq', model: 'llama-x', contextWindow: 8000 }
const FB_B: ResolvedModel = { provider: 'openai', model: 'gpt-x', contextWindow: 8000 }

function makeReq(model: ResolvedModel, signal?: AbortSignal): StreamRequest {
  return {
    model,
    system: 'test',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    tools: [],
    signal: signal ?? new AbortController().signal,
    onDelta: () => {},
    onThinking: () => {},
  }
}

describe('FallbackGateway.stream', () => {
  test('主模型成功：不触发 fallback，结果原样返回', async () => {
    const inner = new ScriptedLlm()
    inner.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    const gw = new FallbackGateway({ inner, chain: () => [FB_A] })
    const result = await gw.stream(makeReq(PRIMARY))
    expect(result.stopReason).toBe('stop')
    expect(inner.calls.length).toBe(1)
    expect(inner.calls[0]?.model).toBe('deepseek/deepseek-chat')
  })

  test('主模型 error 且无交付：切换到链首个可用模型', async () => {
    const inner = new ScriptedLlm()
    inner.scriptStep({ stopReason: 'error', error: 'E_LLM_PROVIDER: 连接超时' })
    inner.scriptStep({ deltas: [{ kind: 'text', text: 'from fallback' }] })
    const warnings: Array<Record<string, unknown>> = []
    const gw = new FallbackGateway({
      inner,
      chain: () => [FB_A, FB_B],
      logger: { warn: (_m, d) => warnings.push(d ?? {}) },
    })
    const result = await gw.stream(makeReq(PRIMARY))
    expect(result.stopReason).toBe('stop')
    expect(result.content).toEqual([{ type: 'text', text: 'from fallback' }])
    expect(inner.calls.map((c) => c.model)).toEqual([
      'deepseek/deepseek-chat',
      'groq/llama-x',
    ])
    expect(warnings).toEqual([
      { from: 'deepseek/deepseek-chat', to: 'groq/llama-x' },
    ])
  })

  test('主模型与链全部失败：返回 E_LLM_FALLBACK 汇总（每个模型原因可见）', async () => {
    const inner = new ScriptedLlm()
    inner.scriptStep({ stopReason: 'error', error: '超时' })
    inner.scriptStep({ stopReason: 'error', error: '限流' })
    inner.scriptStep({ stopReason: 'error', error: '欠费' })
    const gw = new FallbackGateway({ inner, chain: () => [FB_A, FB_B] })
    const result = await gw.stream(makeReq(PRIMARY))
    expect(result.stopReason).toBe('error')
    expect(result.content).toEqual([])
    expect(result.error).toBe(
      'E_LLM_FALLBACK: 主模型与 fallback 链均不可用——' +
        'deepseek/deepseek-chat（超时）；groq/llama-x（限流）；openai/gpt-x（欠费）',
    )
  })

  test('空 fallback 链：不切换，主模型错误原样返回', async () => {
    const inner = new ScriptedLlm()
    inner.scriptStep({ stopReason: 'error', error: 'E_LLM_PROVIDER: 502' })
    const gw = new FallbackGateway({ inner, chain: () => [] })
    const result = await gw.stream(makeReq(PRIMARY))
    expect(result.stopReason).toBe('error')
    expect(result.error).toBe('E_LLM_PROVIDER: 502')
    expect(inner.calls.length).toBe(1)
  })

  test('aborted 不切换（用户主动中断不是故障）', async () => {
    const inner = new ScriptedLlm()
    const ac = new AbortController()
    ac.abort()
    const gw = new FallbackGateway({ inner, chain: () => [FB_A] })
    const result = await gw.stream(makeReq(PRIMARY, ac.signal))
    expect(result.stopReason).toBe('aborted')
    // aborted 入口不消耗预录步骤；且只调了一次（无 fallback 尝试）
    expect(inner.calls.length).toBe(1)
  })

  test('部分交付不切换（error 但 content 非空——避免重复输出）', async () => {
    const inner = new ScriptedLlm()
    inner.scriptStep({
      content: [{ type: 'text', text: '已交付前缀' }],
      stopReason: 'error',
      error: 'E_LLM_PROVIDER: 流中断',
    })
    const gw = new FallbackGateway({ inner, chain: () => [FB_A] })
    const result = await gw.stream(makeReq(PRIMARY))
    expect(result.stopReason).toBe('error')
    expect(result.content).toEqual([{ type: 'text', text: '已交付前缀' }])
    expect(inner.calls.length).toBe(1)
  })

  test('热更新：链经函数每请求现读（空链失败后加链，下一请求生效）', async () => {
    const inner = new ScriptedLlm()
    inner.scriptStep({ stopReason: 'error', error: '挂了' })
    inner.scriptStep({ stopReason: 'error', error: '又挂了' })
    inner.scriptStep({ deltas: [{ kind: 'text', text: 'recovered' }] })
    let chain: ResolvedModel[] = []
    const gw = new FallbackGateway({ inner, chain: () => chain })

    const r1 = await gw.stream(makeReq(PRIMARY))
    expect(r1.stopReason).toBe('error')
    expect(r1.error).toBe('挂了') // 空链短路：原错误原样返回

    chain = [FB_A]
    const r2 = await gw.stream(makeReq(PRIMARY))
    expect(r2.stopReason).toBe('stop')
    expect(inner.calls.map((c) => c.model)).toEqual([
      'deepseek/deepseek-chat',
      'deepseek/deepseek-chat',
      'groq/llama-x',
    ])
  })
})

describe('FallbackGateway.generateOnce', () => {
  test('主模型成功：不触发 fallback', async () => {
    const inner = new ScriptedLlm()
    inner.scriptOnce('ok')
    const gw = new FallbackGateway({ inner, chain: () => [FB_A] })
    await expect(gw.generateOnce({ model: PRIMARY, prompt: 'p' })).resolves.toBe('ok')
    expect(inner.onceCalls.length).toBe(1)
  })

  test('主模型抛错：切换到链上模型成功', async () => {
    const inner = new ScriptedLlm()
    // 第一次 generateOnce 无预录应答 → 抛 E_SCRIPTED_EXHAUSTED（充当主模型故障）
    inner.scriptOnce('fallback reply')
    const gw = new FallbackGateway({ inner, chain: () => [FB_A] })
    await expect(gw.generateOnce({ model: PRIMARY, prompt: 'p' })).resolves.toBe(
      'fallback reply',
    )
  })

  test('链尽：抛 E_LLM_FALLBACK 汇总错误', async () => {
    const inner = new ScriptedLlm()
    // 无任何预录应答：主模型与 fallback 全部抛错
    const gw = new FallbackGateway({ inner, chain: () => [FB_A] })
    await expect(gw.generateOnce({ model: PRIMARY, prompt: 'p' })).rejects.toThrow(
      /E_LLM_FALLBACK: 主模型与 fallback 链均不可用——deepseek\/deepseek-chat（.*）；groq\/llama-x（.*）/,
    )
  })
})

describe('CostTracker', () => {
  test('无 usage.json：零起点累计', () => {
    const dir = tempDir()
    const t = new CostTracker(join(dir, 'usage.json'))
    expect(t.spend()).toEqual({ costUsd: 0, inputTokens: 0, outputTokens: 0 })
    expect(existsSync(join(dir, 'usage.json'))).toBe(false)
  })

  test('add 累计 + 持久化往返（新实例读回延续）', () => {
    const dir = tempDir()
    const path = join(dir, 'usage.json')
    const t = new CostTracker(path)
    t.add({ inputTokens: 100, outputTokens: 50, costUsd: 0.01 })
    t.add({ inputTokens: 30, outputTokens: 20 }) // costUsd 缺省计 0
    expect(t.spend()).toEqual({ costUsd: 0.01, inputTokens: 130, outputTokens: 70 })

    const t2 = new CostTracker(path)
    expect(t2.spend()).toEqual({ costUsd: 0.01, inputTokens: 130, outputTokens: 70 })
  })

  test('exceeded：limit undefined 永不熔断；累计 ≥ limit 熔断', () => {
    const dir = tempDir()
    const t = new CostTracker(join(dir, 'usage.json'))
    t.add({ inputTokens: 1, outputTokens: 1, costUsd: 0.5 })
    expect(t.exceeded(undefined)).toBe(false)
    expect(t.exceeded(0.6)).toBe(false)
    expect(t.exceeded(0.5)).toBe(true) // ≥ 而非 >（花到阈值即停）
    expect(t.exceeded(0.4)).toBe(true)
  })

  test('reset 清零并持久化', () => {
    const dir = tempDir()
    const path = join(dir, 'usage.json')
    const t = new CostTracker(path)
    t.add({ inputTokens: 10, outputTokens: 10, costUsd: 1 })
    t.reset()
    expect(t.spend()).toEqual({ costUsd: 0, inputTokens: 0, outputTokens: 0 })
    const t2 = new CostTracker(path)
    expect(t2.spend()).toEqual({ costUsd: 0, inputTokens: 0, outputTokens: 0 })
    expect(t2.exceeded(0.01)).toBe(false)
  })

  test('坏 JSON fail-closed（E_CONFIG）', () => {
    const dir = tempDir()
    const path = join(dir, 'usage.json')
    writeFileSync(path, '{not json', 'utf8')
    expect(() => new CostTracker(path)).toThrow(ConfigError)
  })

  test('形状不符 fail-closed：缺字段/非数字/负数', () => {
    const dir = tempDir()
    const badDocs = [
      '{"costUsd": 1}',
      '{"costUsd": "1", "inputTokens": 0, "outputTokens": 0}',
      '{"costUsd": -1, "inputTokens": 0, "outputTokens": 0}',
    ]
    for (const [i, doc] of badDocs.entries()) {
      const path = join(dir, `usage-${i}.json`)
      writeFileSync(path, doc, 'utf8')
      expect(() => new CostTracker(path), doc).toThrow(ConfigError)
    }
  })

  test('持久化文件为紧凑可读 JSON（人可核对账目）', () => {
    const dir = tempDir()
    const path = join(dir, 'usage.json')
    const t = new CostTracker(path)
    t.add({ inputTokens: 7, outputTokens: 3, costUsd: 0.0025 })
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>
    expect(raw).toEqual({ costUsd: 0.0025, inputTokens: 7, outputTokens: 3 })
  })
})

// ---- Engine 路由集成（工单 7.7：热生效 / 持久化 / 熔断闭环） ----

interface EngineFixture {
  root: string
  engine: Engine
  gateway: ScriptedLlm
  events: Array<{ type: string; data: Record<string, unknown> }>
}

let engineFixtures: EngineFixture[] = []

/** models.json 落盘内容（updateRouting 写回目标；persistRouting 读它而非注入的 config） */
const MODELS_JSON = {
  providers: { fake: { apiKeyEnv: null } },
  defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
  compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
  titleModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
  subagentModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
  fallbacks: [],
  models: [
    { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
    { provider: 'fake', model: 'fake-backup', contextWindow: 100_000 },
  ],
}

function makeEngineConfig(): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 40,
        maxToolParallel: 8,
        toolTimeoutMs: 120_000,
        permissionTimeoutMs: 300_000,
        progressThrottleMs: 200,
        toolOutputLimitKB: 32,
        compactionThreshold: 0.8,
        checkpoints: false,
        bashSandbox: 'off',
      },
    },
    models: JSON.parse(JSON.stringify(MODELS_JSON)) as EngineConfig['models'],
    permissions: { version: 1, rules: [] },
  }
}

function makeRoutingEngine(): EngineFixture {
  const root = tempDir()
  writeFileSync(join(root, 'models.json'), JSON.stringify(MODELS_JSON, null, 2), 'utf8')
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeEngineConfig() })
  const events: Array<{ type: string; data: Record<string, unknown> }> = []
  engine.subscribe((e) => {
    events.push({ type: e.type, data: e.data })
  })
  const f: EngineFixture = { root, engine, gateway, events }
  engineFixtures.push(f)
  return f
}

async function waitTurns(f: EngineFixture, n: number): Promise<void> {
  const deadline = Date.now() + 2000
  for (;;) {
    if (f.events.filter((e) => e.type === 'turn.completed').length >= n) return
    if (Date.now() > deadline) throw new Error(`等待 ${n} 个 turn.completed 超时`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

afterEach(async () => {
  for (const f of engineFixtures) await f.engine.shutdown()
  engineFixtures = []
})

describe('Engine 路由集成（工单 7.7）', () => {
  test('getRouting 初值来自配置；updateRouting 校验未知 provider 并写回 models.json', () => {
    const f = makeRoutingEngine()
    const initial = f.engine.getRouting()
    expect(initial).toMatchObject({
      fallbacks: [],
      compactionModel: 'fake/fake-chat',
      titleModel: 'fake/fake-chat',
      subagentModel: 'fake/fake-chat',
      costLimitUsd: null,
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, exceeded: false },
    })

    const updated = f.engine.updateRouting({
      fallbacks: ['fake/fake-backup'],
      costLimitUsd: 5,
    })
    expect(updated.fallbacks).toEqual(['fake/fake-backup'])
    expect(updated.costLimitUsd).toBe(5)

    // 写回 models.json：重启延续的持久真相
    const doc = JSON.parse(readFileSync(join(f.root, 'models.json'), 'utf8')) as {
      fallbacks: Array<{ provider: string; model: string }>
      costLimitUsd: number
    }
    expect(doc.fallbacks).toEqual([
      { provider: 'fake', model: 'fake-backup', contextWindow: 100_000 },
    ])
    expect(doc.costLimitUsd).toBe(5)

    // 未知 provider 拒绝（E_CONFIG）
    expect(() => f.engine.updateRouting({ fallbacks: ['nope/x'] })).toThrow('E_CONFIG')
  })

  test('fallback 热生效：主模型失败 → 链上模型接管（同一 turn 内）', async () => {
    const f = makeRoutingEngine()
    const handle = await f.engine.createSession()
    f.engine.updateRouting({ fallbacks: ['fake/fake-backup'] })

    f.gateway.scriptStep({ stopReason: 'error', error: 'E_LLM_PROVIDER: 主模型挂了' })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '备用模型应答' }] })
    await handle.send('问一下')
    await waitTurns(f, 1)

    // 第二次 stream 收到 fallback 模型；turn 正常闭合
    expect(f.gateway.calls.map((c) => c.model)).toEqual(['fake/fake-chat', 'fake/fake-backup'])
    const finish = f.events.find((e) => e.type === 'turn.completed')
    expect(finish?.data).toMatchObject({ finish: 'stop' })
  })

  test('成本熔断闭环：超限中断 turn → 新 turn 拒绝 → resetUsage 解除', async () => {
    const f = makeRoutingEngine()
    const handle = await f.engine.createSession()
    f.engine.updateRouting({ costLimitUsd: 0.01 })

    // 第一步用量 $0.02 > 限额 $0.01：assistant.message 定稿后熔断中断
    f.gateway.scriptStep({
      content: [{ type: 'text', text: '产出' }],
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.02 },
    })
    await handle.send('第一问')
    await waitTurns(f, 1)
    expect(f.gateway.calls).toHaveLength(1)
    const errMsg = f.events.find((e) => e.type === 'error')?.data['message']
    expect(typeof errMsg === 'string' && errMsg.includes('E_BUDGET_EXCEEDED')).toBe(true)
    const finish1 = f.events.find((e) => e.type === 'turn.completed')
    expect(finish1?.data).toMatchObject({ finish: 'error' })

    // DTO：累计已超限
    let dto = f.engine.getRouting()
    expect(dto.usage).toMatchObject({ costUsd: 0.02, exceeded: true })

    // 新 turn 拒绝（不调 LLM）
    const turn1Count = f.gateway.calls.length
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '不应出现' }] })
    await handle.send('第二问')
    await waitTurns(f, 2)
    expect(f.gateway.calls).toHaveLength(turn1Count)
    expect(f.events.filter((e) => e.type === 'turn.completed')[1]?.data).toMatchObject({
      finish: 'error',
    })

    // resetUsage 解除熔断 → 后续 turn 恢复
    dto = f.engine.resetUsage()
    expect(dto.usage).toMatchObject({ costUsd: 0, exceeded: false })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '恢复' }] })
    await handle.send('第三问')
    await waitTurns(f, 3)
    expect(f.gateway.calls).toHaveLength(turn1Count + 1)
    expect(f.events.filter((e) => e.type === 'turn.completed')[2]?.data).toMatchObject({
      finish: 'stop',
    })
  })
})
