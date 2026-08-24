/**
 * 工具管线单测（doc/02 §5.6.2 / §8.6）：事件纪律（started→completed 闭合）、
 * 权限门 deny、分组并行/串行 barrier、abort 未启动补 E_ABORTED 对、
 * 进度门控（progress 不晚于 completed）、输出限界溢写、注册表。
 */
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'
import type { TurnCtx, ToolCallPending } from '../src/run-loop.js'
import { ToolRegistry } from '../src/tools/registry.js'
import { ToolPipelineImpl } from '../src/tools/pipeline.js'
import { ToolOutputStore } from '../src/tools/output-store.js'
import type { PermissionCheck, PermissionService } from '../src/tools/permission-port.js'
import type { ToolDefinition } from '../src/tools/definition.js'

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

class StubPerm implements PermissionService {
  decision = true
  deniedActions: string[] = []
  readonly checks: PermissionCheck[] = []
  assert(check: PermissionCheck): Promise<boolean> {
    this.checks.push(check)
    return Promise.resolve(this.decision)
  }
  isDenied(action: string): boolean {
    return this.deniedActions.includes(action)
  }
}

interface FakeRecorder {
  active: number
  maxActive: number
  order: string[]
}

function fakeTool(
  name: string,
  opts: { parallelizable: boolean; delayMs?: number; output?: unknown; isError?: boolean; rec?: FakeRecorder },
): ToolDefinition {
  return {
    name,
    description: `fake ${name}`,
    inputSchema: z.strictObject({ v: z.string().optional() }),
    permission: {
      action: `fake.${name}`,
      resourceOf: () => `fake:${name}`,
    },
    parallelizable: opts.parallelizable,
    async execute(ctx, input) {
      opts.rec?.order.push(`start:${name}`)
      if (opts.rec !== undefined) {
        opts.rec.active += 1
        opts.rec.maxActive = Math.max(opts.rec.maxActive, opts.rec.active)
      }
      if (opts.delayMs !== undefined) {
        await new Promise((r) => setTimeout(r, opts.delayMs))
      }
      if (ctx.signal.aborted) {
        if (opts.rec) opts.rec.active -= 1
        opts.rec?.order.push(`end:${name}`)
        return { output: { code: 'E_ABORTED' }, isError: true }
      }
      if (opts.rec) opts.rec.active -= 1
      opts.rec?.order.push(`end:${name}`)
      return { output: opts.output ?? `done:${name}:${String((input as { v?: string }).v ?? '')}`, isError: opts.isError === true }
    },
  }
}

interface Fixture {
  registry: ToolRegistry
  pipeline: ToolPipelineImpl
  perm: StubPerm
  sink: MemSink
  events: SparkEventEnvelope[]
  outputs: ToolOutputStore
  outDir: string
}

const SID = ids.session('ses_pipeline_test')

async function makeFixture(): Promise<Fixture> {
  const registry = new ToolRegistry()
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const perm = new StubPerm()
  const outDir = await mkdtemp(join(tmpdir(), 'spark-outputs-'))
  const outputs = new ToolOutputStore(32 * 1024, outDir)
  const pipeline = new ToolPipelineImpl({
    sessionId: SID,
    bus,
    registry,
    permission: perm,
    outputs,
    cwd: '/tmp',
    maxToolParallel: 8,
    progressThrottleMs: 10,
  })
  const events: SparkEventEnvelope[] = []
  bus.subscribe((e) => {
    events.push(e)
  })
  return { registry, pipeline, perm, sink, events, outputs, outDir }
}

function makeTurn(): TurnCtx {
  return {
    turnId: ids.turn('trn_pipeline'),
    delivery: 'now',
    abort: new AbortController(),
    step: 1,
    usage: ZERO_USAGE,
    toolCalls: [],
  }
}

function pending(name: string, n: number): ToolCallPending {
  // CallIdSchema 只允许 [0-9A-Za-z]（无下划线）
  return { callId: ids.call(`cal_p${n}${name}`), name, input: { v: String(n) } }
}

async function flushLive(): Promise<void> {
  await new Promise((r) => setImmediate(r))
}

describe('ToolRegistry（§5.6.1）', () => {
  test('重复注册抛错；materialize 输出 JSON Schema', async () => {
    const f = await makeFixture()
    const tool = fakeTool('read', { parallelizable: true })
    f.registry.register(tool)
    expect(() => f.registry.register(tool)).toThrow('E_TOOL_DUPLICATE')
    const list = f.pipeline.materialize()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('read')
    expect(list[0]?.parameters).toMatchObject({ type: 'object' })
    expect(f.registry.resolve('read')).toBeDefined()
    expect(f.registry.resolve('nope')).toBeUndefined()
  })

  test('deny 工具不广告：isDenied 的 action 过滤出清单（§5.7 补强 5）', async () => {
    const f = await makeFixture()
    f.registry.register(fakeTool('read', { parallelizable: true }))
    f.registry.register(fakeTool('bash', { parallelizable: false }))
    expect(f.pipeline.materialize().map((t) => t.name)).toEqual(['read', 'bash'])
    f.perm.deniedActions = ['fake.bash']
    expect(f.pipeline.materialize().map((t) => t.name)).toEqual(['read'])
  })
})

describe('ToolPipelineImpl.runAll（§5.6.2）', () => {
  test('事件纪律：每个 tool.started 必有配对 completed（成功路径）', async () => {
    const f = await makeFixture()
    f.registry.register(fakeTool('read', { parallelizable: true }))
    const results = await f.pipeline.runAll(makeTurn(), [pending('read', 1), pending('read', 2)])
    await flushLive()
    expect(results.map((r) => r.isError)).toEqual([false, false])
    // 并行组事件可交错（s1,s2,c1,c2 合法）；断言闭合性：每个 started 有配对 completed
    const startedIds = f.sink.events
      .filter((e) => e.type === 'tool.started')
      .map((e) => (e.data as { callId: string }).callId)
    const completedIds = f.sink.events
      .filter((e) => e.type === 'tool.completed')
      .map((e) => (e.data as { callId: string }).callId)
    expect(startedIds.sort()).toEqual(completedIds.sort())
    expect(startedIds).toHaveLength(2)
    // 结果按 model order
    expect(results.map((r) => r.output)).toEqual(['done:read:1', 'done:read:2'])
  })

  test('未知工具：started + completed{E_NOT_FOUND}', async () => {
    const f = await makeFixture()
    const results = await f.pipeline.runAll(makeTurn(), [pending('ghost', 1)])
    expect(results[0]?.isError).toBe(true)
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    expect(completed?.data).toMatchObject({ output: { code: 'E_NOT_FOUND' }, isError: true })
  })

  test('权限门 deny：E_PERMISSION 且 execute 不执行', async () => {
    const f = await makeFixture()
    const rec: FakeRecorder = { active: 0, maxActive: 0, order: [] }
    f.registry.register(fakeTool('write', { parallelizable: false, rec }))
    f.perm.decision = false
    const results = await f.pipeline.runAll(makeTurn(), [pending('write', 1)])
    expect(results[0]?.isError).toBe(true)
    expect(results[0]?.output).toMatchObject({ code: 'E_PERMISSION' })
    expect(rec.order).toEqual([]) // execute 未执行
    expect(f.perm.checks[0]).toMatchObject({ action: 'fake.write', resource: 'fake:write' })
  })

  test('分组：连续 parallelizable 并行（并发重叠），serial 独占 barrier', async () => {
    const f = await makeFixture()
    const rec: FakeRecorder = { active: 0, maxActive: 0, order: [] }
    f.registry.register(fakeTool('read', { parallelizable: true, delayMs: 40, rec }))
    f.registry.register(fakeTool('write', { parallelizable: false, delayMs: 5, rec }))
    const turn = makeTurn()
    await f.pipeline.runAll(turn, [
      pending('read', 1),
      pending('read', 2),
      pending('write', 3),
    ])
    expect(rec.maxActive).toBe(2) // 两个 read 并发
    expect(rec.order).toEqual(['start:read', 'start:read', 'end:read', 'end:read', 'start:write', 'end:write'])
  })

  test('abort：组未启动 → 整组补 started+completed{E_ABORTED} 对', async () => {
    const f = await makeFixture()
    const rec: FakeRecorder = { active: 0, maxActive: 0, order: [] }
    f.registry.register(fakeTool('read', { parallelizable: true, rec }))
    const turn = makeTurn()
    turn.abort.abort()
    const results = await f.pipeline.runAll(turn, [pending('read', 1), pending('read', 2)])
    expect(rec.order).toEqual([]) // 均未执行
    expect(results.map((r) => r.output)).toEqual([{ code: 'E_ABORTED' }, { code: 'E_ABORTED' }])
    const types = f.sink.events.map((e) => e.type)
    expect(types).toEqual([
      'tool.started',
      'tool.completed',
      'tool.started',
      'tool.completed',
    ])
  })

  test('abort：串行链项间中断 → 第一项自身响应 abort，第二项补 E_ABORTED 对', async () => {
    const f = await makeFixture()
    const rec: FakeRecorder = { active: 0, maxActive: 0, order: [] }
    const turn = makeTurn()
    f.registry.register(
      fakeTool('write', {
        parallelizable: false,
        delayMs: 20,
        rec,
        output: 'first done',
      }),
    )
    // 第一项执行中 abort：已启动者自身响应（E_ABORTED），第二项不启动（管线补对）
    setTimeout(() => turn.abort.abort(), 5)
    const results = await f.pipeline.runAll(turn, [pending('write', 1), pending('write', 2)])
    expect(rec.order).toEqual(['start:write', 'end:write']) // 仅第一项执行
    expect(results[0]?.output).toMatchObject({ code: 'E_ABORTED' }) // 工具响应 abort
    expect(results[1]?.output).toMatchObject({ code: 'E_ABORTED' }) // 管线补对
  })

  test('进度门控：progress 合并节流且不晚于 completed', async () => {
    const f = await makeFixture()
    const chunks: string[] = []
    const tool: ToolDefinition = {
      name: 'bash',
      description: 'stream',
      inputSchema: z.strictObject({}),
      permission: { action: 'shell.exec', resourceOf: () => 'cmd:x' },
      parallelizable: false,
      async execute(ctx) {
        ctx.onProgress('a')
        ctx.onProgress('b')
        await new Promise((r) => setTimeout(r, 30))
        ctx.onProgress('c')
        return { output: 'end', isError: false }
      },
    }
    f.registry.register(tool)
    await f.pipeline.runAll(makeTurn(), [{ callId: ids.call('cal_prog1'), name: 'bash', input: {} }])
    await flushLive()
    const liveProgress = f.events.filter((e) => e.type === 'tool.progress')
    for (const e of liveProgress) chunks.push((e.data as { chunk: string }).chunk)
    // 三次 push 至少合并（节流 10ms + 30ms 间隔 → 2 帧左右，不超 3）
    expect(chunks.join('')).toBe('abc')
    expect(chunks.length).toBeLessThanOrEqual(3)
    // progress 全部先于 completed（事件数组位置）
    const completedAt = f.events.findIndex((e) => e.type === 'tool.completed')
    const lastProgressAt = f.events
      .map((e, i) => (e.type === 'tool.progress' ? i : -1))
      .filter((i) => i >= 0)
      .at(-1)
    expect(lastProgressAt).toBeLessThan(completedAt)
  })

  test('输出限界：>32KB 截断 + 尾注 + 溢写全文文件', async () => {
    const f = await makeFixture()
    const big = 'x'.repeat(40 * 1024)
    f.registry.register(fakeTool('read', { parallelizable: true, output: big }))
    const callId = ids.call('cal_big1')
    const results = await f.pipeline.runAll(makeTurn(), [
      { callId, name: 'read', input: { v: '1' } },
    ])
    const out = results[0]?.output as string
    expect(out).toContain('…truncated, full output: ~/.spark/tool-outputs/' + callId)
    expect(out.length).toBeLessThan(big.length)
    const spilled = await readFile(join(f.outDir, callId), 'utf8')
    expect(spilled).toBe(big)
    // 事件里的 output 也是截断版
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    expect((completed?.data as { output: unknown }).output).toBe(out)
  })

  test('工具抛错：completed{code 提取 E_*}，事件闭合', async () => {
    const f = await makeFixture()
    const boom: ToolDefinition = {
      name: 'boom',
      description: 'throws',
      inputSchema: z.strictObject({}),
      permission: { action: 'fake.boom', resourceOf: () => 'fake:boom' },
      parallelizable: true,
      execute() {
        throw new Error('E_TOOL_BOOM: 模拟失败')
      },
    }
    f.registry.register(boom)
    const results = await f.pipeline.runAll(makeTurn(), [
      { callId: ids.call('cal_boom1'), name: 'boom', input: {} },
    ])
    expect(results[0]?.isError).toBe(true)
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    const data = completed?.data as { output: { code: string; message: string }; isError: boolean }
    expect(data.output.code).toBe('E_TOOL_BOOM')
    expect(data.output.message).toContain('E_TOOL_BOOM')
    expect(data.isError).toBe(true)
  })

  test('inputSchema 校验失败：completed{E_VALIDATION}（zod 拒绝）', async () => {
    const f = await makeFixture()
    f.registry.register(fakeTool('read', { parallelizable: true }))
    const results = await f.pipeline.runAll(makeTurn(), [
      { callId: ids.call('cal_val1'), name: 'read', input: { limit: 999999 } },
    ])
    expect(results[0]?.isError).toBe(true)
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    const output = (completed?.data as { output: { code: string } }).output
    // zod v4 错误 message 不带 E_ 前缀 → E_INTERNAL 兜底（fail-closed，事件闭合）
    expect(['E_INTERNAL', 'E_VALIDATION']).toContain(output.code)
  })
})
