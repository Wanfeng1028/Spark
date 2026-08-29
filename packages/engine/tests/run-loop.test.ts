/**
 * RunLoop 单测（doc/02 §5.5 / §8.6 engine 行）：
 * 事件序列（对照 mock normal.jsonl 基线）、工具一轮、steering 注入、
 * interrupt 前缀定稿、LLM error、截断保护（E_TRUNCATED 回喂）、maxSteps、
 * usage 累计、compaction 触发、失败闭合、常驻循环唤醒合并与 shutdown、
 * 成本熔断（工单 7.7：新 turn 拒绝 + 步间中断）。
 */
import { describe, expect, test, vi } from 'vitest'
import {
  ids,
  type ContentItem,
  type SparkEventEnvelope,
  type SparkEventType,
  type Usage,
} from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import { runSessionLoop, runTurn, type RunLoopDeps } from '../src/run-loop.js'
import { SessionRuntime } from '../src/session/runtime.js'
import { newIds } from '../src/ulid.js'

/** 事件类型守卫：收窄 e.data（SparkEventEnvelope 默认泛型是联合，type 判别不自动收窄） */
function isEvent<K extends SparkEventType>(
  e: SparkEventEnvelope,
  type: K,
): e is SparkEventEnvelope<K> {
  return e.type === type
}

// ---- 测试基建 ----

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  failNext = false

  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    if (this.failNext) {
      this.failNext = false
      return Promise.reject(new Error('E_IO_DISK_FULL: 测试注入的落盘失败'))
    }
    this.events.push(e)
    return Promise.resolve(e)
  }
}

/** mini 投影：sink 收集的 surface 事件 → messages（模拟 §5.8.3 真实 Projector） */
class StubProjector {
  tokens = 0

  constructor(private readonly sink: MemSink) {}

  modelContext(): { messages: Array<{ role: 'user' | 'assistant'; content: ContentItem[] }>; tokens: number } {
    const messages: Array<{ role: 'user' | 'assistant'; content: ContentItem[] }> = []
    for (const e of this.sink.events) {
      if (isEvent(e, 'user.message')) {
        messages.push({ role: 'user', content: [{ type: 'text', text: e.data.text }] })
      } else if (isEvent(e, 'assistant.message')) {
        messages.push({ role: 'assistant', content: e.data.content })
      }
    }
    return { messages, tokens: this.tokens }
  }
}

class StubCompactor {
  calls = 0

  compact(): Promise<void> {
    this.calls += 1
    return Promise.resolve()
  }
}

/** 工单 7.7：成本熔断 stub——exceeded 随累计与 limit 现算，added 记录每步 costUsd */
class StubBudget {
  limit = 1
  total = 0
  readonly added: number[] = []

  limitUsd(): number | undefined {
    return this.limit
  }

  add(usage: Usage): void {
    const cost = usage.costUsd ?? 0
    this.added.push(cost)
    this.total += cost
  }

  exceeded(): boolean {
    return this.total >= this.limit
  }

  spendUsd(): number {
    return this.total
  }
}

class StubTools {
  readonly batches: Array<{ turnId: string; calls: Array<{ callId: string; name: string }> }> = []
  nextResults: Array<Array<{ callId: ReturnType<typeof ids.call>; output: unknown; isError: boolean }>> = []

  materialize(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return [{ name: 'read', description: 'stub', parameters: { type: 'object' } }]
  }

  runAll(
    turn: { turnId: unknown },
    calls: ReadonlyArray<{ callId: string; name: string }>,
  ): Promise<Array<{ callId: ReturnType<typeof ids.call>; output: unknown; isError: boolean }>> {
    this.batches.push({ turnId: String(turn.turnId), calls: [...calls] })
    return Promise.resolve(this.nextResults.shift() ?? [])
  }
}

interface Fixture {
  rt: SessionRuntime
  deps: RunLoopDeps
  sink: MemSink
  gateway: ScriptedLlm
  tools: StubTools
  projector: StubProjector
  compactor: StubCompactor
  events: SparkEventEnvelope[]
  unsubscribe: () => void
}

const SID = ids.session('ses_runloop_test')

function makeFixture(opts?: { maxStepsPerTurn?: number }): Fixture {
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const gateway = new ScriptedLlm()
  const projector = new StubProjector(sink)
  const compactor = new StubCompactor()
  const tools = new StubTools()
  const rt = new SessionRuntime(SID)
  const deps: RunLoopDeps = {
    sessionId: SID,
    bus,
    gateway,
    projector,
    compactor,
    tools,
    model: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 1000 },
    system: 'test system prompt',
    maxStepsPerTurn: opts?.maxStepsPerTurn ?? 40,
    compactionThreshold: 0.8,
  }
  const events: SparkEventEnvelope[] = []
  const handle = bus.subscribe((e) => {
    events.push(e)
  })
  return {
    rt,
    deps,
    sink,
    gateway,
    tools,
    projector,
    compactor,
    events,
    unsubscribe: () => handle.unsubscribe(),
  }
}

/** subscribe 派发走微任务链：await 一拍 flush 后再断言 live 事件 */
async function flushLive(): Promise<void> {
  await new Promise((r) => setImmediate(r))
}

function sinkTypes(f: Fixture): string[] {
  return f.sink.events.map((e) => e.type)
}

function lastOf<T extends SparkEventEnvelope>(f: Fixture, type: T['type']): SparkEventEnvelope | undefined {
  return [...f.sink.events].reverse().find((e) => e.type === type)
}

async function takeSubmitted(rt: SessionRuntime, text: string): Promise<void> {
  rt.submit(text)
  await rt.takeInput()
}

// ---- runTurn ----

describe('runTurn（§5.5）', () => {
  test('正常单 step：事件序列完整（对照 normal.jsonl 基线）', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({
      deltas: [
        { kind: 'thinking', text: '先想一下。' },
        { kind: 'text', text: '你好，' },
        { kind: 'text', text: '世界。' },
      ],
      usage: { inputTokens: 10, outputTokens: 5 },
    })
    await takeSubmitted(f.rt, '打个招呼')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: '打个招呼',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    await flushLive()

    // live 流：reasoning.delta → assistant.delta（顺序即回调顺序）
    const live = f.events.filter((e) => e.type === 'reasoning.delta' || e.type === 'assistant.delta')
    expect(live.map((e) => e.type)).toEqual(['reasoning.delta', 'assistant.delta', 'assistant.delta'])
    // durable 序列：user.message → turn.started → reasoning.ended → assistant.message → turn.completed
    expect(sinkTypes(f)).toEqual([
      'user.message',
      'turn.started',
      'reasoning.ended',
      'assistant.message',
      'turn.completed',
    ])
    const finish = lastOf(f, 'turn.completed')
    expect(finish?.data).toMatchObject({ finish: 'stop', usage: { inputTokens: 10, outputTokens: 5 } })
    expect(f.rt.state).toBe('idle')
  })

  test('turn.started.userEventId 引用 user.message 信封 id', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    const user = f.sink.events.find((e) => e.type === 'user.message')
    const started = f.sink.events.find((e) => e.type === 'turn.started')
    expect(started?.data).toMatchObject({ userEventId: user?.id })
  })

  test('工具一轮：runAll 收到 pending → toolResult assistant.message → 下一 step stop', async () => {
    const f = makeFixture()
    const callId = ids.call('cal_tooltest1')
    f.gateway.scriptStep({
      deltas: [{ kind: 'text', text: '我读一下。' }],
      content: [
        { type: 'text', text: '我读一下。' },
        { type: 'toolCall', callId, name: 'read', input: { path: 'src/index.ts' } },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '读完了。' }] })
    f.tools.nextResults.push([{ callId, output: 'file content', isError: false }])

    await takeSubmitted(f.rt, '读文件')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: '读文件',
      delivery: 'now',
      admittedAt: Date.now(),
    })

    expect(f.tools.batches).toHaveLength(1)
    expect(f.tools.batches[0]?.calls).toEqual([
      { callId, name: 'read', input: { path: 'src/index.ts' } },
    ])
    // 第二次 stream 的上下文含工具结果回喂
    const secondCall = f.gateway.calls[1]
    expect(secondCall?.messages.at(-1)?.content).toEqual([
      { type: 'toolResult', callId, output: 'file content', isError: false },
    ])
    const types = sinkTypes(f)
    expect(types.filter((t) => t === 'assistant.message')).toHaveLength(3) // toolCall 定稿 + toolResult 回喂 + 最终文本
    expect(types.at(-1)).toBe('turn.completed')
  })

  test('steering 注入：stream 挂起期间 steer → 下一 step 前注入 user.message', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '开始' }], hangMs: 60 })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '收到插话' }] })

    const p = runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: '原始问题',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    await vi.waitFor(() => expect(f.gateway.calls).toHaveLength(1))
    f.rt.submit('等一下，补充一点', 'steer')
    await p

    expect(sinkTypes(f).filter((t) => t === 'user.message')).toHaveLength(2)
    const secondCall = f.gateway.calls[1]
    const texts = secondCall?.messages
      .flatMap((m) => m.content)
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
    // 上下文 = [user 原始问题, assistant 第一步定稿, user steer 注入]（注入发生在 ② 组装前）
    expect(texts).toEqual(['原始问题', '开始', '等一下，补充一点'])
  })

  test('interrupt：挂起中 abort → 已交付前缀定稿 + finish=aborted', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '前缀' }], hangMs: 5000 })

    const p = runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: '长任务',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    await vi.waitFor(() => expect(f.gateway.calls).toHaveLength(1))
    f.rt.interrupt()
    await p

    const types = sinkTypes(f)
    expect(types).toEqual([
      'user.message',
      'turn.started',
      'assistant.message', // 截断定稿（前缀）
      'turn.completed',
    ])
    const msg = f.sink.events.find((e) => e.type === 'assistant.message')
    expect(msg?.data).toMatchObject({ content: [{ type: 'text', text: '前缀' }] })
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({ finish: 'aborted' })
    expect(f.rt.state).toBe('idle')
  })

  test('abort 且零前缀：不 emit assistant.message', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [], hangMs: 5000 })
    const p = runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    await vi.waitFor(() => expect(f.gateway.calls).toHaveLength(1))
    f.rt.interrupt()
    await p
    expect(sinkTypes(f)).toEqual(['user.message', 'turn.started', 'turn.completed'])
  })

  test('LLM error：error 事件 scope=llm + finish=error', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ stopReason: 'error', error: 'E_LLM_RATELIMIT: 429' })
    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    expect(sinkTypes(f)).toEqual(['user.message', 'turn.started', 'error', 'turn.completed'])
    const err = f.sink.events.find((e) => e.type === 'error')
    expect(err?.data).toMatchObject({ scope: 'llm', message: 'E_LLM_RATELIMIT: 429' })
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({ finish: 'error' })
  })

  test('截断保护：length + toolCall → E_TRUNCATED 事件对 + 回喂 + 下一 step 重发', async () => {
    const f = makeFixture()
    const callId = ids.call('cal_trunc1')
    f.gateway.scriptStep({
      content: [
        { type: 'text', text: '被截断的调用' },
        { type: 'toolCall', callId, name: 'bash', input: { command: 'ls' } },
      ],
      stopReason: 'length',
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '重发成功' }] })

    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })

    const types = sinkTypes(f)
    // 截断的调用不执行（runAll 未收到），但补 started/completed 事件对
    expect(f.tools.batches).toHaveLength(0)
    expect(types).toContain('tool.started')
    expect(types).toContain('tool.completed')
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    expect(completed?.data).toMatchObject({ callId, isError: true, output: { code: 'E_TRUNCATED' } })
    // E_TRUNCATED toolResult 回喂：第二次调用上下文含该结果
    const second = f.gateway.calls[1]?.messages.at(-1)?.content
    expect(second).toEqual([
      { type: 'toolResult', callId, output: { code: 'E_TRUNCATED' }, isError: true },
    ])
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({ finish: 'stop' })
  })

  test('maxSteps 到上限：不执行工具，finish=length', async () => {
    const f = makeFixture({ maxStepsPerTurn: 1 })
    f.gateway.scriptStep({
      content: [{ type: 'toolCall', callId: ids.call('cal_ms1'), name: 'read', input: { path: 'x' } }],
    })
    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    expect(f.tools.batches).toHaveLength(0)
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({ finish: 'length' })
  })

  test('usage 累计：两 step 求和进 turn.completed', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({
      content: [{ type: 'toolCall', callId: ids.call('cal_u1'), name: 'read', input: { path: 'x' } }],
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.01 },
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'done' }], usage: { inputTokens: 20, outputTokens: 7 } })
    f.tools.nextResults.push([{ callId: ids.call('cal_u1'), output: 'y', isError: false }])
    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({
      usage: { inputTokens: 30, outputTokens: 12, costUsd: 0.01 },
    })
  })

  test('compaction 触发：tokens 超阈值 → compact + 重投影', async () => {
    const f = makeFixture()
    f.projector.tokens = 900 // > 0.8 * 1000
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    expect(f.compactor.calls).toBe(1)
  })

  test('失败闭合：gateway 抛错 → error 事件 + turn.completed{error}，不留悬挂', async () => {
    const f = makeFixture()
    // 不 script 任何步骤：stream 抛 E_SCRIPTED_EXHAUSTED
    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    expect(sinkTypes(f)).toEqual(['user.message', 'turn.started', 'error', 'turn.completed'])
    const err = f.sink.events.find((e) => e.type === 'error')
    expect(err?.data).toMatchObject({ scope: 'engine' })
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({ finish: 'error' })
    expect(f.rt.state).toBe('idle')
  })

  test('成本熔断：turn 开始前已超限 → 拒绝新 turn（不调 LLM，人话 error + finish=error）', async () => {
    const f = makeFixture()
    const budget = new StubBudget()
    budget.total = 1.5 // 已超 limit=1
    f.deps.budget = budget
    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    // 失败闭合：user.message/turn.started 已落，error 人话闭合，turn.completed{error}
    expect(sinkTypes(f)).toEqual(['user.message', 'turn.started', 'error', 'turn.completed'])
    const err = f.sink.events.find((e) => e.type === 'error')
    expect(err?.data).toMatchObject({ scope: 'engine' })
    const msg = err !== undefined && 'message' in err.data ? err.data.message : ''
    expect(msg).toContain('E_BUDGET_EXCEEDED')
    expect(msg).toContain('$1')
    expect(msg).toContain('$1.5000')
    expect(msg).toContain('DELETE /api/routing/usage')
    expect(f.gateway.calls).toHaveLength(0) // 未调 LLM
    expect(budget.added).toEqual([]) // 未记账（本 turn 零调用）
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({ finish: 'error' })
    expect(f.rt.state).toBe('idle')
  })

  test('成本熔断：本步 usage 超限 → 产出定稿后中断（工具不执行、不续步）', async () => {
    const f = makeFixture()
    const budget = new StubBudget() // limit=1
    f.deps.budget = budget
    f.gateway.scriptStep({
      content: [
        { type: 'text', text: '部分产出' },
        { type: 'toolCall', callId: ids.call('cal_budget1'), name: 'read', input: { path: 'x' } },
      ],
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 2 },
    })
    await takeSubmitted(f.rt, 'x')
    await runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: 'x',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    // assistant.message 已 emit（产出保留）→ error 熔断 → 闭合
    expect(sinkTypes(f)).toEqual([
      'user.message',
      'turn.started',
      'assistant.message',
      'error',
      'turn.completed',
    ])
    expect(f.gateway.calls).toHaveLength(1) // 不续步
    expect(f.tools.batches).toHaveLength(0) // toolCall 未执行
    expect(budget.added).toEqual([2]) // 本步已记账
    const err = f.sink.events.find((e) => e.type === 'error')
    expect(err?.data).toMatchObject({ scope: 'engine' })
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({ finish: 'error' })
    expect(f.rt.state).toBe('idle')
  })
})

// ---- runSessionLoop ----

describe('runSessionLoop（§5.5）', () => {
  test('常驻循环：submit → turn 完成 → idle 挂起；shutdown 退出', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'hi' }] })
    const loop = runSessionLoop(f.rt, f.deps)
    f.rt.submit('第一问')
    await vi.waitFor(() => expect(sinkTypes(f)).toContain('turn.completed'))
    expect(f.rt.state).toBe('idle')
    f.rt.shutdown()
    await expect(loop).resolves.toBeUndefined()
  })

  test('唤醒合并：turn1 进行中 queue 提交 → turn2 无空转续跑', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'a' }], hangMs: 50 })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'b' }] })
    const loop = runSessionLoop(f.rt, f.deps)
    f.rt.submit('第一问')
    await vi.waitFor(() => expect(f.gateway.calls).toHaveLength(1))
    f.rt.submit('第二问', 'queue')
    await vi.waitFor(() => {
      expect(sinkTypes(f).filter((t) => t === 'turn.completed')).toHaveLength(2)
    })
    const userTurns = f.sink.events.filter((e) => isEvent(e, 'user.message'))
    expect(userTurns.map((e) => e.data.text)).toEqual(['第一问', '第二问'])
    f.rt.shutdown()
    await expect(loop).resolves.toBeUndefined()
  })

  test('兜底 error：started 前落盘失败 → 循环发 error 事件后继续可退出', async () => {
    const f = makeFixture()
    f.sink.failNext = true // user.message 落盘失败
    const loop = runSessionLoop(f.rt, f.deps)
    f.rt.submit('x')
    await vi.waitFor(() => expect(sinkTypes(f)).toContain('error'))
    // turn.started 未发出 → 无 turn.completed（不造悬挂）
    expect(sinkTypes(f)).not.toContain('turn.completed')
    f.rt.shutdown()
    await expect(loop).resolves.toBeUndefined()
  })
})

describe('steer/queue 完整语义（工单 4.2 / §5.4 端到端时序）', () => {
  test('queue 依序消费：running 中多项 queue → turn 完成后 FIFO 依次开 turn', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '一答' }], hangMs: 60 })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'A答' }] })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'B答' }] })
    const loop = runSessionLoop(f.rt, f.deps)

    f.rt.submit('第一问')
    await vi.waitFor(() => expect(f.gateway.calls).toHaveLength(1))
    f.rt.submit('问题A', 'queue')
    f.rt.submit('问题B', 'queue')
    await vi.waitFor(() => {
      expect(sinkTypes(f).filter((t) => t === 'turn.completed')).toHaveLength(3)
    })

    // FIFO：user 消息按提交序各开一个 turn
    const userTexts = f.sink.events
      .filter((e) => isEvent(e, 'user.message'))
      .map((e) => e.data.text)
    expect(userTexts).toEqual(['第一问', '问题A', '问题B'])
    // 三组 turn.started/completed 严格配对交替（依序消费不交错）
    const turnMarks = sinkTypes(f).filter((t) => t === 'turn.started' || t === 'turn.completed')
    expect(turnMarks).toEqual([
      'turn.started',
      'turn.completed',
      'turn.started',
      'turn.completed',
      'turn.started',
      'turn.completed',
    ])
    f.rt.shutdown()
    await expect(loop).resolves.toBeUndefined()
  })

  test('多 steer 依序注入：下一 step 前按提交序全部进上下文', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '开始' }], hangMs: 60 })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '收到两条插话' }] })
    const p = runTurn(f.rt, f.deps, {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: '原始问题',
      delivery: 'now',
      admittedAt: Date.now(),
    })
    await vi.waitFor(() => expect(f.gateway.calls).toHaveLength(1))
    f.rt.submit('插话一', 'steer')
    f.rt.submit('插话二', 'steer')
    await p

    // 两条注入 user.message 均落在 step①，下一 step 的采样上下文按提交序可见
    const texts = f.gateway.calls[1]?.messages
      .flatMap((m) => m.content)
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
    expect(texts).toEqual(['原始问题', '开始', '插话一', '插话二'])
  })

  test('interrupt 后残留转 queue：aborted 收尾 → steer 依序转主队列续跑两个 turn', async () => {
    const f = makeFixture()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '被打断的前缀' }], hangMs: 5000 })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'S1答' }] })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'S2答' }] })
    const loop = runSessionLoop(f.rt, f.deps)

    f.rt.submit('长任务')
    await vi.waitFor(() => expect(f.gateway.calls).toHaveLength(1))
    f.rt.submit('残留S1', 'steer')
    f.rt.submit('残留S2', 'steer')
    f.rt.interrupt()
    await vi.waitFor(() => {
      expect(sinkTypes(f).filter((t) => t === 'turn.completed')).toHaveLength(3)
    })

    // turn1 = aborted；steer 残留不在 turn1 内（其 user.message 均在 turn1.completed 之后）
    const events = f.sink.events
    const firstCompletedIdx = events.findIndex((e) => isEvent(e, 'turn.completed'))
    const steerMsgs = events.filter(
      (e): e is SparkEventEnvelope<'user.message'> =>
        isEvent(e, 'user.message') && e.data.text.startsWith('残留'),
    )
    expect(steerMsgs.map((e) => e.data.text)).toEqual(['残留S1', '残留S2'])
    for (const e of steerMsgs) {
      expect(events.indexOf(e)).toBeGreaterThan(firstCompletedIdx)
    }
    expect(lastOf(f, 'turn.completed')?.data).toMatchObject({ finish: 'stop' })
    // 续跑两 turn 各自采样到对应残留文本（依序 FIFO）
    expect(f.gateway.calls[1]?.messages.at(-1)?.content).toEqual([
      { type: 'text', text: '残留S1' },
    ])
    expect(f.gateway.calls[2]?.messages.at(-1)?.content).toEqual([
      { type: 'text', text: '残留S2' },
    ])
    f.rt.shutdown()
    await expect(loop).resolves.toBeUndefined()
  })
})
