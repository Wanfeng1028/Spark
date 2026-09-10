/**
 * 持续目标单测（工单 16.7）：GoalRunner 直测（stub bus + ScriptedLlm 当 gateway）+
 * Engine 全链路一条（/goal set → 自动续跑 → judge 判定完成）。
 * 覆盖：judge 未满足→合成续跑、满足→completed、三护栏（上限/预算/超时）、
 * interrupt/turnError 即停、set/clear/status 命令语义、rebuild 回放重建。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionId, SparkEventEnvelope } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { Engine } from '../src/engine.js'
import {
  GoalRunner,
  GOAL_BUDGET_TOKENS,
  JUDGE_TIMEOUT_MS,
  MAX_GOAL_ITERATIONS,
} from '../src/goals.js'
import type { GoalEvidenceReader, GoalState, GoalStatus } from '../src/goals.js'
import type { EngineConfig } from '../src/config.js'
import type { EventBus } from '../src/bus.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'

const SID = ids.session('ses_goal000001')
const MODEL = { provider: 'scripted', model: 'scripted', contextWindow: 100_000 }

interface Emitted {
  type: string
  data: unknown
}

/** 最小 bus 替身：只记录 emit（GoalRunner 不消费 emit 返回值） */
function fakeBus(): { bus: EventBus; emitted: Emitted[] } {
  const emitted: Emitted[] = []
  const bus = {
    emit: async (_sid: SessionId, type: string, data: unknown) => {
      emitted.push({ type, data })
      return {} as SparkEventEnvelope
    },
  } as unknown as EventBus
  return { bus, emitted }
}

function usageOf(inputTokens: number, outputTokens: number) {
  return { ...ZERO_USAGE, inputTokens, outputTokens }
}

function makeRunner(
  gateway: ScriptedLlm,
  opts?: { budgetTokens?: number; judgeTimeoutMs?: number },
): { runner: GoalRunner; emitted: Emitted[] } {
  const { bus, emitted } = fakeBus()
  const evidence: GoalEvidenceReader = () => '#1 tool.completed {"ok":true}'
  const runner = new GoalRunner({
    sessionId: SID,
    bus,
    gateway,
    model: () => MODEL,
    evidence,
    ...(opts?.budgetTokens !== undefined ? { budgetTokens: opts.budgetTokens } : {}),
    ...(opts?.judgeTimeoutMs !== undefined ? { judgeTimeoutMs: opts.judgeTimeoutMs } : {}),
  })
  return { runner, emitted }
}

describe('GoalRunner 单元（工单 16.7）', () => {
  it('ADR D33 三护栏数值锁定（迷你 ADR 定档不静默漂移）', () => {
    expect(MAX_GOAL_ITERATIONS).toBe(50)
    expect(GOAL_BUDGET_TOKENS).toBe(200_000)
    expect(JUDGE_TIMEOUT_MS).toBe(25_000)
  })

  it('未满足 → 合成续跑输入（如实标注 [goal]）+ goal.updated 进度', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'NOT_SATISFIED' }] })
    const { runner, emitted } = makeRunner(gateway)
    await runner.set('修好所有失败的测试')
    const text = await runner.afterTurn({ finish: 'stop', usage: usageOf(100, 20) })
    expect(text).toContain('[goal 合成输入·第 1 轮续跑]')
    expect(text).toContain('修好所有失败的测试')
    expect(emitted.map((e) => e.type)).toEqual(['goal.set', 'goal.updated'])
    expect(runner.snapshot).toMatchObject({ iterations: 1, status: 'active' })
  })

  it('满足 → goal.completed，无续跑', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'SATISFIED' }] })
    const { runner, emitted } = makeRunner(gateway)
    await runner.set('g')
    const text = await runner.afterTurn({ finish: 'stop', usage: usageOf(10, 5) })
    expect(text).toBeUndefined()
    expect(emitted).toHaveLength(2)
    expect(emitted[1]?.type).toBe('goal.completed')
    expect(runner.snapshot).toMatchObject({ status: 'completed' })
  })

  it('judge 输出解析不出 → 暂停保留目标（fail-closed 不裸转）', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '我觉得差不多了吧' }] })
    const { runner, emitted } = makeRunner(gateway)
    await runner.set('g')
    const text = await runner.afterTurn({ finish: 'stop', usage: ZERO_USAGE })
    expect(text).toBeUndefined()
    expect(emitted[1]?.type).toBe('goal.paused')
    expect(emitted[1]?.data).toMatchObject({ reason: 'judgeTimeout' })
  })

  it('judge 超时 → unavailable → paused{judgeTimeout}（可注入小超时）', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'x' }], hangMs: 500 })
    const { runner, emitted } = makeRunner(gateway, { judgeTimeoutMs: 10 })
    await runner.set('g')
    const text = await runner.afterTurn({ finish: 'stop', usage: ZERO_USAGE })
    expect(text).toBeUndefined()
    expect(emitted[1]?.data).toMatchObject({ reason: 'judgeTimeout' })
  })

  it('迭代硬上限：第 MAX 轮不再询问 judge，paused{maxIterations} 不清目标', async () => {
    const gateway = new ScriptedLlm()
    for (let i = 0; i < MAX_GOAL_ITERATIONS - 1; i++) {
      gateway.scriptStep({ deltas: [{ kind: 'text', text: 'NOT_SATISFIED' }] })
    }
    const { runner, emitted } = makeRunner(gateway)
    await runner.set('g')
    for (let i = 0; i < MAX_GOAL_ITERATIONS - 1; i++) {
      const t = await runner.afterTurn({ finish: 'stop', usage: ZERO_USAGE })
      expect(t).toBeDefined()
    }
    // 第 50 次：护栏先于 judge（steps 已耗尽——再消费即测试编程错误）
    const text = await runner.afterTurn({ finish: 'stop', usage: ZERO_USAGE })
    expect(text).toBeUndefined()
    expect(emitted.at(-1)?.data).toMatchObject({ reason: 'maxIterations', iterations: MAX_GOAL_ITERATIONS })
    expect(runner.snapshot).toMatchObject({ status: 'paused', goal: 'g' })
  })

  it('token 预算耗尽 → paused{budgetExhausted}（judge 用量一并计入）', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'NOT_SATISFIED' }], usage: usageOf(500, 0) })
    const { runner, emitted } = makeRunner(gateway, { budgetTokens: 1000 })
    await runner.set('g')
    // turn 用量 400 + judge 500 = 900 < 1000 → 续跑
    const t1 = await runner.afterTurn({ finish: 'stop', usage: usageOf(300, 100) })
    expect(t1).toBeDefined()
    // turn 用量 200 + judge 500 = 700 → 900+700=1600 ≥ 1000 → 暂停
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'NOT_SATISFIED' }], usage: usageOf(500, 0) })
    const t2 = await runner.afterTurn({ finish: 'stop', usage: usageOf(150, 50) })
    expect(t2).toBeUndefined()
    expect(emitted.at(-1)?.data).toMatchObject({ reason: 'budgetExhausted' })
  })

  it('interrupt（finish=aborted）→ paused{interrupt}，不消耗 judge', async () => {
    const gateway = new ScriptedLlm()
    const { runner, emitted } = makeRunner(gateway)
    await runner.set('g')
    const text = await runner.afterTurn({ finish: 'aborted', usage: ZERO_USAGE })
    expect(text).toBeUndefined()
    expect(emitted[1]?.data).toMatchObject({ reason: 'interrupt' })
    expect(gateway.calls).toHaveLength(0)
  })

  it('turn 错误收尾 → paused{turnError}', async () => {
    const gateway = new ScriptedLlm()
    const { runner, emitted } = makeRunner(gateway)
    await runner.set('g')
    await runner.afterTurn({ finish: 'error', usage: ZERO_USAGE })
    expect(emitted[1]?.data).toMatchObject({ reason: 'turnError' })
  })

  it('无目标 / 非 active 时 afterTurn 直接返回（不 emit）', async () => {
    const gateway = new ScriptedLlm()
    const { runner, emitted } = makeRunner(gateway)
    await expect(runner.afterTurn({ finish: 'stop', usage: ZERO_USAGE })).resolves.toBeUndefined()
    expect(emitted).toHaveLength(0)
    // 已暂停：afterTurn no-op
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'SATISFIED' }] })
    await runner.set('g')
    await runner.clear()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'SATISFIED' }] })
    await expect(runner.afterTurn({ finish: 'stop', usage: ZERO_USAGE })).resolves.toBeUndefined()
  })

  it('clear/status 命令语义：clear → paused{cleared}；status → goal.updated 回显；无目标报错', async () => {
    const gateway = new ScriptedLlm()
    const { runner, emitted } = makeRunner(gateway)
    await expect(runner.clear()).rejects.toThrow(/E_NO_GOAL/)
    await expect(runner.status()).rejects.toThrow(/E_NO_GOAL/)
    await runner.set('g')
    await runner.status()
    const st: GoalStatus | undefined = runner.snapshot?.status
    expect(st).toBe('active')
    expect(emitted.at(-1)?.type).toBe('goal.updated')
    await runner.clear()
    expect(emitted.at(-1)?.data).toMatchObject({ reason: 'cleared' })
  })

  it('rebuild：从 durable 事件流重建状态（进程重启不丢目标）', () => {
    const gateway = new ScriptedLlm()
    const { runner } = makeRunner(gateway)
    runner.rebuild([
      { type: 'goal.set', data: { goal: 'g' } },
      { type: 'goal.updated', data: { goal: 'g', iterations: 3, usedTokens: 777, status: 'active' } },
    ] as unknown as SparkEventEnvelope[])
    const snap: GoalState | null = runner.snapshot
    expect(snap).toMatchObject({ goal: 'g', iterations: 3, usedTokens: 777, status: 'active' })
    // paused 事件重建
    runner.rebuild([
      { type: 'goal.set', data: { goal: 'g' } },
      { type: 'goal.paused', data: { reason: 'interrupt', iterations: 2, usedTokens: 5 } },
    ] as unknown as SparkEventEnvelope[])
    expect(runner.snapshot).toMatchObject({ status: 'paused', iterations: 2 })
  })
})

// ---- Engine 全链路（ScriptedLlm：turn → judge → 续跑 turn → judge → completed） ----

const fixtures: { root: string; engine: Engine }[] = []

async function makeEngine(): Promise<{
  engine: Engine
  sid: SessionId
  events: SparkEventEnvelope[]
  gateway: ScriptedLlm
}> {
  const root = await mkdtemp(join(tmpdir(), 'spark-goal-'))
  const config: EngineConfig = {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 8,
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
    models: {
      providers: { scripted: { apiKeyEnv: null } },
      defaultModel: { provider: 'scripted', model: 'scripted', contextWindow: 100_000 },
      compactionModel: { provider: 'scripted', model: 'scripted', contextWindow: 100_000 },
      fallbacks: [],
      titleModel: { provider: 'scripted', model: 'scripted', contextWindow: 100_000 },
      subagentModel: { provider: 'scripted', model: 'scripted', contextWindow: 100_000 },
      costLimitUsd: undefined,
      defaultEffort: undefined,
      models: [{ provider: 'scripted', model: 'scripted', contextWindow: 100_000 }],
    },
    permissions: { version: 1, rules: [] },
  }
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config })
  const handle = await engine.createSession({ cwd: root })
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    if (e.sessionId === handle.id) events.push(e)
  })
  fixtures.push({ root, engine })
  return { engine, sid: handle.id, events, gateway }
}

beforeEach(() => {
  fixtures.length = 0
})

afterEach(async () => {
  for (const f of fixtures) {
    await f.engine.shutdown()
    await rm(f.root, { recursive: true, force: true })
  }
})

describe('/goal 全链路（工单 16.7）', () => {
  it('小目标 2 轮完成：set → 续跑 → judge 判定满足 → goal.completed', async () => {
    const { engine, sid, events, gateway } = await makeEngine()
    await engine.executeCommand(sid, 'goal', 'set 修好两处错别字')
    // turn1（用户输入）→ judge1（未满足）→ turn2（合成续跑）→ judge2（满足）
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '第一轮：改了一处' }] })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'NOT_SATISFIED' }] })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '第二轮：改完并验证' }] })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'SATISFIED' }] })
    const handle = engine.getSession(sid)
    if (handle === undefined) throw new Error('会话句柄缺失')
    await handle.send('开始干活')
    const deadline = Date.now() + 3000
    for (;;) {
      if (events.some((e) => e.type === 'goal.completed')) break
      if (Date.now() > deadline) throw new Error(`等待 goal.completed 超时（events=${events.map((e) => e.type).join(',')})`)
      await new Promise((r) => setTimeout(r, 10))
    }
    const types = events.filter((e) => e.seq !== undefined).map((e) => e.type)
    expect(types).toContain('goal.set')
    expect(types).toContain('goal.updated')
    expect(types).toContain('goal.completed')
    // 合成续跑如实标注，且走正常 user.message 通道（surface）
    const cont = events.find((e) => e.type === 'user.message' && String((e.data as { text: string }).text).includes('[goal 合成输入'))
    expect(cont).toBeDefined()
    // 完成后不再有新一轮（goal 循环终止）
    const completedIdx = types.indexOf('goal.completed')
    expect(types.slice(completedIdx + 1)).not.toContain('turn.started')
  })

  it('/goal 参数面：无目标 status/clear → E_NO_GOAL；坏子命令/空 set → 用法错误（fail-closed）', async () => {
    const { engine, sid } = await makeEngine()
    await expect(engine.executeCommand(sid, 'goal', 'status')).rejects.toThrow(/E_NO_GOAL/)
    await expect(engine.executeCommand(sid, 'goal', 'clear')).rejects.toThrow(/E_NO_GOAL/)
    await expect(engine.executeCommand(sid, 'goal', 'rm -rf')).rejects.toThrow(/E_GOAL_ARGS/)
    await expect(engine.executeCommand(sid, 'goal', 'set   ')).rejects.toThrow(/E_GOAL_EMPTY/)
  })
})
