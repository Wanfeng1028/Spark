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
      fallbacks: [],
      titleModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      subagentModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      costLimitUsd: undefined,
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
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
    // 工单 7.8：解除单并发——多子代理并行（独立子会话互不串扰）
    expect(tool.parallelizable).toBe(true)
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

describe('工单 7.8：并行子代理 + 树状运行监控', () => {
  test('并行双任务：时序重叠、prompt 隔离、结果映射', async () => {
    const f = await makeEngine()
    const parent = await f.engine.createSession({ title: '父会话' })
    // 父 step1 一次派生两个子代理（task 已 parallelizable，进同一并行批）
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_TaskparaA00000000000'),
          name: 'task',
          input: { prompt: '调研 A' },
        },
        {
          type: 'toolCall',
          callId: ids.call('cal_TaskparaB00000000000'),
          name: 'task',
          input: { prompt: '调研 B' },
        },
      ],
    })
    // 两子会话共享 FIFO 各耗一步：应答同文——谁先消费都不影响断言
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '子代理完成' }], hangMs: 300 })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '子代理完成' }], hangMs: 300 })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '父汇总' }] })

    await parent.send('开始')
    await waitFor(
      () =>
        f.events.some(
          (e) => e.type === 'assistant.message' && JSON.stringify(e.data).includes('父汇总'),
        ),
      '父会话最终消息',
    )

    const childIds = f.events
      .filter((e) => e.type === 'session.created' && e.sessionId !== parent.id)
      .map((e) => e.sessionId)
    expect(childIds).toHaveLength(2)

    // 并行判据：两子的 turn.started 都早于两子的 turn.completed
    //（串行执行必为 started→completed→started→completed 交错）
    const startedIdx = childIds.map((cid) =>
      f.events.findIndex((e) => e.type === 'turn.started' && e.sessionId === cid),
    )
    const completedIdx = childIds.map((cid) =>
      f.events.findIndex((e) => e.type === 'turn.completed' && e.sessionId === cid),
    )
    expect(startedIdx.every((i) => i >= 0)).toBe(true)
    expect(completedIdx.every((i) => i >= 0)).toBe(true)
    expect(Math.max(...startedIdx)).toBeLessThan(Math.min(...completedIdx))

    // prompt 隔离：每个子会话的 user.message 是自己的 prompt（互不串扰）
    const prompts = childIds.map((cid) =>
      f.events
        .filter((e) => e.type === 'user.message' && e.sessionId === cid)
        .map((e) => (e.data as { text: string }).text),
    )
    expect(prompts.sort()).toEqual([['调研 A'], ['调研 B']])

    // 结果映射：两个 callId 各自闭合，输出 = 子代理最终文本
    for (const callId of ['cal_TaskparaA00000000000', 'cal_TaskparaB00000000000']) {
      const done = toolCompleted(f, callId)
      expect(done).toBeDefined()
      expect((done?.data as { output: unknown }).output).toBe('子代理完成')
      expect((done?.data as { isError: boolean }).isError).toBe(false)
    }
  })

  test('树视图：子代理锚定派生它的 tool.started 事件，运行态实时快照', async () => {
    const f = await makeEngine()
    const parent = await f.engine.createSession({ title: '父会话' })
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_Tasktree00000000000'),
          name: 'task',
          input: { prompt: '树监控任务' },
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '子完成' }], hangMs: 500 })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '父收尾' }] })

    await parent.send('开始')
    await waitFor(
      () =>
        f.events.some(
          (e) => e.type === 'tool.started' && (e.data as { name: string }).name === 'task',
        ),
      'task 工具启动',
    )
    // 等子 turn 跑起来再看树——运行态快照才可断言 running
    await waitFor(
      () =>
        f.events.some(
          (e) => e.type === 'turn.started' && e.sessionId !== parent.id,
        ),
      '子会话 turn 启动',
    )
    const startedEvent = f.events.find(
      (e) =>
        e.type === 'tool.started' &&
        (e.data as { name: string; callId: string }).callId === 'cal_Tasktree00000000000',
    )
    expect(startedEvent).toBeDefined()

    const tree = await f.engine.treeOf(parent.id)
    expect(tree.forks).toHaveLength(1)
    const fork = tree.forks[0]
    if (fork === undefined) throw new Error('fork 缺失（上一断言已覆盖，此处仅窄化）')
    // 锚定：fromEventId = 派生它的 tool.started 事件 id
    expect(fork.fromEventId).toBe(startedEvent?.id)
    expect(fork.child.status).toBe('running')

    await waitFor(
      () =>
        f.events.some(
          (e) => e.type === 'assistant.message' && JSON.stringify(e.data).includes('父收尾'),
        ),
      '父会话最终消息',
    )
    const treeAfter = await f.engine.treeOf(parent.id)
    expect(treeAfter.forks).toHaveLength(1)
    // turn 收尾后回落 idle（已加载会话实时状态）
    expect(treeAfter.forks[0]?.child.status).toBe('idle')
  })
})

/** SessionHandle 显式类型引用（避免 unused import lint 误报） */
export type _Handle = SessionHandle
