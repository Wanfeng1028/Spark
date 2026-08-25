/**
 * 子代理单测（阶段五工单 5.4 / ADR D17 / doc/02 §8.6）：
 * Task 工具派生独立子会话（header.parentSession）全链路——
 * 成功返回最终 assistant 文本 / 深度限制 E_SUBAGENT_DEPTH / 父中断级联 E_ABORTED /
 * 审批拒绝 E_PERMISSION；另含 steer expectedTurnId 的 engine 层接线断言。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import type { SubscribeHandle } from '../src/bus.js'
import { Engine } from '../src/engine.js'
import type { SessionHandle } from '../src/engine.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import { makeTaskTool } from '../src/tools/builtin/task.js'

function makeConfig(rules: EngineConfig['permissions']['rules']): EngineConfig {
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
    models: {
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
    },
    permissions: { version: 1, rules },
  }
}

interface Fixture {
  root: string
  engine: Engine
  gateway: ScriptedLlm
  events: SparkEventEnvelope[]
  sub: SubscribeHandle
}

let fixtures: Fixture[] = []

async function makeEngine(
  rules: EngineConfig['permissions']['rules'] = [
    { action: 'agent.task', resource: 'task', effect: 'allow' },
  ],
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'spark-subagent-'))
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeConfig(rules) })
  const events: SparkEventEnvelope[] = []
  const sub = engine.subscribe((e) => {
    events.push(e)
  })
  const f: Fixture = { root, engine, gateway, events, sub }
  fixtures.push(f)
  return f
}

async function waitFor(pred: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000
  for (;;) {
    if (pred()) return
    if (Date.now() > deadline) throw new Error(`等待 ${what} 超时`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

function toolCompleted(f: Fixture, callId: string): SparkEventEnvelope | undefined {
  return f.events.find(
    (e) => e.type === 'tool.completed' && (e.data as { callId?: string }).callId === callId,
  )
}

beforeEach(() => {
  fixtures = []
})

afterEach(async () => {
  for (const f of fixtures) {
    f.sub.unsubscribe()
    await f.engine.shutdown()
  }
})

describe('Task 工具（makeTaskTool 六要素）', () => {
  test('name/permission/parallelizable/执行体委托', async () => {
    const calls: string[] = []
    const tool = makeTaskTool((input) => {
      calls.push(input.prompt)
      return Promise.resolve({ output: `ran:${input.prompt}`, isError: false })
    })
    expect(tool.name).toBe('task')
    expect(tool.permission.action).toBe('agent.task')
    expect(tool.permission.resourceOf({ prompt: 'x' }, { cwd: '/tmp' })).toBe('task')
    expect(tool.parallelizable).toBe(false)
    const r = await tool.execute(
      {
        sessionId: ids.session('ses_task_unit_000000000'),
        turnId: ids.turn('trn_task_unit_000000000'),
        callId: ids.call('cal_Taskunit000000000000'),
        signal: new AbortController().signal,
        onProgress: () => {},
        cwd: '/tmp',
      },
      { prompt: '调研' },
    )
    expect(r).toEqual({ output: 'ran:调研', isError: false })
    expect(calls).toEqual(['调研'])
  })
})

describe('子代理全链路（ScriptedLlm 共享脚本序列）', () => {
  test('成功：父派生 → 子会话独立跑一轮 → tool.completed 带最终文本', async () => {
    const f = await makeEngine()
    const parent = await f.engine.createSession({ title: '父会话' })
    // 父 step1 派生；子 turn 应答；父 step2 收尾（ScriptedLlm 跨会话共享 FIFO）
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_Taskok00000000000000'),
          name: 'task',
          input: { prompt: '调研 X', title: 'X 调研' },
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '子代理完成：X 是 1' }] })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '父总结完成' }] })

    await parent.send('开始')
    await waitFor(
      () => f.events.some((e) => e.type === 'assistant.message' && JSON.stringify(e.data).includes('父总结完成')),
      '父会话最终消息',
    )

    // 父会话：task 工具事件对闭合，输出 = 子代理最终文本
    const done = toolCompleted(f, 'cal_Taskok00000000000000')
    expect(done).toBeDefined()
    expect((done?.data as { output: unknown }).output).toBe('子代理完成：X 是 1')
    expect((done?.data as { isError: boolean }).isError).toBe(false)

    // 子会话：独立事件流（user.message 原样 + assistant 文本 + turn 闭合）
    const childCreated = f.events.find(
      (e) => e.type === 'session.created' && e.sessionId !== parent.id,
    )
    expect(childCreated).toBeDefined()
    const childEvents = f.events.filter((e) => e.sessionId === childCreated?.sessionId)
    expect(childEvents.some((e) => e.type === 'user.message' && (e.data as { text: string }).text === '调研 X')).toBe(true)
    expect(childEvents.some((e) => e.type === 'turn.completed')).toBe(true)
    // 子会话可从引擎再取（parentSession 留痕在 header，resume 不受影响）
    const childHandle = await f.engine.resumeSession(childCreated!.sessionId)
    expect(childHandle.meta.title).toBe('X 调研')
  })

  test('深度限制：子会话内再派生 → E_SUBAGENT_DEPTH，两级各自闭合', async () => {
    const f = await makeEngine()
    const parent = await f.engine.createSession({ title: '父会话' })
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_Taskouter00000000000'),
          name: 'task',
          input: { prompt: '外层任务' },
        },
      ],
    })
    // 子会话 step1：尝试再派生（应被拒）
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_Taskinner00000000000'),
          name: 'task',
          input: { prompt: '内层任务' },
        },
      ],
    })
    // 子会话 step2：汇报被拒
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '内层被拒' }] })
    // 父 step2
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '父完成' }] })

    await parent.send('开始')
    await waitFor(
      () => f.events.some((e) => e.type === 'assistant.message' && JSON.stringify(e.data).includes('父完成')),
      '父会话最终消息',
    )

    const inner = toolCompleted(f, 'cal_Taskinner00000000000')
    expect(inner).toBeDefined()
    expect((inner?.data as { output: { code?: string } }).output).toMatchObject({
      code: 'E_SUBAGENT_DEPTH',
    })
    expect((inner?.data as { isError: boolean }).isError).toBe(true)
    // 外层 task 正常完成（子会话把被拒结果作为上下文继续）
    const outer = toolCompleted(f, 'cal_Taskouter00000000000')
    expect((outer?.data as { isError: boolean }).isError).toBe(false)
  })

  test('父中断级联：子会话 interrupt → task E_ABORTED → 父 turn aborted', async () => {
    const f = await makeEngine()
    const parent = await f.engine.createSession({ title: '父会话' })
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_Taskabort00000000000'),
          name: 'task',
          input: { prompt: '长任务' },
        },
      ],
    })
    // 子会话挂起（interrupt 级联测点）
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '慢' }], hangMs: 10_000 })

    await parent.send('开始')
    await waitFor(
      () => f.events.some((e) => e.type === 'tool.started' && (e.data as { name: string }).name === 'task'),
      'task 工具启动',
    )

    // steer expectedTurnId 接线：turn 运行中，错误目标 → E_TURN_MISMATCH（§5.4 工单 5.4）
    await expect(
      parent.send('插话', 'steer', ids.turn('trnWrongtarget00000000000')),
    ).rejects.toThrow(/E_TURN_MISMATCH/)

    await parent.interrupt()
    await waitFor(
      () =>
        f.events.some(
          (e) =>
            e.type === 'turn.completed' &&
            e.sessionId === parent.id &&
            (e.data as { finish: string }).finish === 'aborted',
        ),
      '父 turn aborted 收尾',
    )
    const done = toolCompleted(f, 'cal_Taskabort00000000000')
    expect(done).toBeDefined()
    expect((done?.data as { output: { code?: string } }).output).toMatchObject({
      code: 'E_ABORTED',
    })
    expect((done?.data as { isError: boolean }).isError).toBe(true)
  })

  test('审批拒绝：deny 规则 → E_PERMISSION，不派生子会话', async () => {
    const f = await makeEngine([
      { action: 'agent.task', resource: 'task', effect: 'deny' },
    ])
    const parent = await f.engine.createSession({ title: '父会话' })
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_Taskdeny00000000000'),
          name: 'task',
          input: { prompt: '被拒任务' },
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '父收到拒绝' }] })

    await parent.send('开始')
    await waitFor(
      () => f.events.some((e) => e.type === 'assistant.message' && JSON.stringify(e.data).includes('父收到拒绝')),
      '父会话最终消息',
    )
    const done = toolCompleted(f, 'cal_Taskdeny00000000000')
    expect((done?.data as { output: { code?: string } }).output).toMatchObject({
      code: 'E_PERMISSION',
    })
    // 无子会话被创建（session.created 只有父一条）
    expect(f.events.filter((e) => e.type === 'session.created')).toHaveLength(1)
  })
})

/** SessionHandle 显式类型引用（避免 unused import lint 误报） */
export type _Handle = SessionHandle
