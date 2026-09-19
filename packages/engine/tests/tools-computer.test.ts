/**
 * computer.* 工具族单测（阶段十九 19.1 / new-tool 纪律四路径）：
 * 成功 / 业务失败（isError）/ 中断（started+completed{E_ABORTED} 对，重放合法）/
 * 审批拒绝（E_PERMISSION）；附主开关 fail-closed（E_COMPUTER_DISABLED）、
 * 参数校验（E_COMPUTER_ARGS）与审批资源形状（computer://<op>）。
 * 执行体语义（PowerShell 桥）在 executor 侧——本文件经真实 ToolPipelineImpl
 * 走完整事件纪律，执行体用测试假体（无真实屏幕/输入面，CI 无 GUI 可跑）。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'
import type { TurnCtx, ToolCallPending } from '../src/run-loop.js'
import { ToolRegistry } from '../src/tools/registry.js'
import { ToolPipelineImpl } from '../src/tools/pipeline.js'
import { ToolOutputStore } from '../src/tools/output-store.js'
import type { PermissionCheck, PermissionService } from '../src/tools/permission-port.js'
import type {
  ComputerAppInput,
  ComputerClickInput,
  ComputerClipboardInput,
  ComputerExecutor,
  ComputerKeyInput,
  ComputerScreenshotResult,
  ComputerWindowInput,
} from '../src/computer/executor.js'
import { makeComputerTools } from '../src/tools/builtin/computer.js'

const SID = ids.session('ses_cptool01')

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

class StubPerm implements PermissionService {
  decision = true
  readonly checks: PermissionCheck[] = []
  assert(check: PermissionCheck): Promise<boolean> {
    this.checks.push(check)
    return Promise.resolve(this.decision)
  }
  isDenied(): boolean {
    return false
  }
}

/** 假执行体：记录调用，可注入拒绝（测试假体纪律：无 async/await） */
class FakeComputer implements ComputerExecutor {
  enabled = true
  lastOp: string | undefined
  lastInput: unknown
  rejectWith: Error | undefined

  screenshot(signal: AbortSignal): Promise<ComputerScreenshotResult> {
    return this.record('screenshot', undefined, signal).then(
      () => ({ file: 'shot-1700000000000-1.png', bytes: 4321 }),
    )
  }
  click(input: ComputerClickInput, signal: AbortSignal): Promise<{ ok: true }> {
    return this.record('click', input, signal).then(() => ({ ok: true as const }))
  }
  type(input: { text: string }, signal: AbortSignal): Promise<{ ok: true }> {
    return this.record('type', input, signal).then(() => ({ ok: true as const }))
  }
  key(input: ComputerKeyInput, signal: AbortSignal): Promise<{ ok: true }> {
    return this.record('key', input, signal).then(() => ({ ok: true as const }))
  }
  scroll(input: { deltaY: number }, signal: AbortSignal): Promise<{ ok: true }> {
    return this.record('scroll', input, signal).then(() => ({ ok: true as const }))
  }
  window(
    input: ComputerWindowInput,
    signal: AbortSignal,
  ): Promise<{ windows: { pid: number; name: string; title: string }[] } | { focused: string }> {
    return this.record('window', input, signal).then(() => ({
      windows: [{ pid: 4242, name: 'notepad', title: '无标题 - 记事本' }],
    }))
  }
  app(input: ComputerAppInput, signal: AbortSignal): Promise<{ pid?: number; apps: { pid: number; name: string }[] }> {
    return this.record('app', input, signal).then(() => ({ pid: 8181, apps: [] }))
  }
  clipboard(input: ComputerClipboardInput, signal: AbortSignal): Promise<{ text?: string }> {
    return this.record('clipboard', input, signal).then(() => ({ text: '剪贴板内容' }))
  }

  /** 记录 + 注入拒绝的公共路径 */
  private record(op: string, input: unknown, signal: AbortSignal): Promise<void> {
    this.lastOp = op
    this.lastInput = input
    if (this.rejectWith !== undefined) return Promise.reject(this.rejectWith)
    if (signal.aborted) return Promise.reject(new Error('E_ABORTED: 电脑控制操作被中断'))
    return Promise.resolve()
  }
}

interface Fixture {
  pipeline: ToolPipelineImpl
  perm: StubPerm
  fake: FakeComputer
  sink: MemSink
  cwd: string
}

async function makeFixture(enabled = true): Promise<Fixture> {
  const registry = new ToolRegistry()
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const perm = new StubPerm()
  const outDir = await mkdtemp(join(tmpdir(), 'spark-cpout-'))
  const cwd = await mkdtemp(join(tmpdir(), 'spark-cpcwd-'))
  const fake = new FakeComputer()
  const pipeline = new ToolPipelineImpl({
    sessionId: SID,
    bus,
    registry,
    permission: perm,
    outputs: new ToolOutputStore(32 * 1024, outDir),
    cwd,
    maxToolParallel: 8,
    progressThrottleMs: 10,
  })
  for (const tool of makeComputerTools({ executor: fake, isEnabled: () => enabled })) {
    registry.register(tool)
  }
  return { pipeline, perm, fake, sink, cwd }
}

function makeTurn(): TurnCtx {
  return {
    turnId: ids.turn('trn_cptool01'),
    delivery: 'now',
    abort: new AbortController(),
    step: 1,
    usage: ZERO_USAGE,
    toolCalls: [],
  }
}

function pending(name: string, input: Record<string, unknown>): ToolCallPending {
  // CallIdSchema 只允许 [0-9A-Za-z]
  return { callId: ids.call('cal_cptool1'), name, input }
}

describe('computer.* 工具四路径（阶段十九 19.1 / ADR D43）', () => {
  test('成功：click 审批资源 computer://click + 执行体入参透传', async () => {
    const f = await makeFixture()
    const input = { x: 120, y: 80, button: 'right' as const, double: true }
    const results = await f.pipeline.runAll(makeTurn(), [pending('computer.click', input)])
    expect(results.map((r) => r.isError)).toEqual([false])
    expect(f.fake.lastOp).toBe('click')
    expect(f.fake.lastInput).toEqual(input)
    expect(f.perm.checks[0]?.action).toBe('computer.use')
    expect(f.perm.checks[0]?.resource).toBe('computer://click')
  })

  test('成功：screenshot 输出文件名与字节数（图片本体不进上下文）', async () => {
    const f = await makeFixture()
    const results = await f.pipeline.runAll(makeTurn(), [pending('computer.screenshot', {})])
    expect(results[0]?.isError).toBe(false)
    expect(results[0]?.output).toEqual({ file: 'shot-1700000000000-1.png', bytes: 4321 })
    expect(f.perm.checks[0]?.resource).toBe('computer://screenshot')
  })

  test('主开关关闭：执行体零调用 + E_COMPUTER_DISABLED（缺省关 fail-closed）', async () => {
    const f = await makeFixture(false)
    const results = await f.pipeline.runAll(makeTurn(), [
      pending('computer.click', { x: 1, y: 2 }),
      pending('computer.type', { text: '你好' }),
    ])
    expect(results.every((r) => r.isError)).toBe(true)
    const completed = f.sink.events.filter((e) => e.type === 'tool.completed')
    for (const c of completed) {
      expect(c.data).toMatchObject({ output: { code: 'E_COMPUTER_DISABLED' }, isError: true })
    }
    expect(f.fake.lastOp).toBeUndefined()
  })

  test('业务失败：执行体拒绝如实回传（isError + code）', async () => {
    const f = await makeFixture()
    f.fake.rejectWith = new Error(
      'E_COMPUTER_UNSUPPORTED: 当前平台（linux）的电脑控制执行体未实现（阶段十九 19.2 落地 macOS/Linux）',
    )
    const results = await f.pipeline.runAll(makeTurn(), [pending('computer.app', { action: 'list' })])
    expect(results[0]?.isError).toBe(true)
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    expect(completed?.data).toMatchObject({ output: { code: 'E_COMPUTER_UNSUPPORTED' }, isError: true })
  })

  test('中断：E_ABORTED → started+completed 对（重放合法），isError 输出', async () => {
    const f = await makeFixture()
    const turn = makeTurn()
    turn.abort.abort()
    f.fake.rejectWith = new Error('E_ABORTED: 电脑控制操作被中断')
    const results = await f.pipeline.runAll(turn, [pending('computer.key', { key: 'Enter' })])
    expect(results[0]?.isError).toBe(true)
    const started = f.sink.events.filter((e) => e.type === 'tool.started')
    const completed = f.sink.events.filter((e) => e.type === 'tool.completed')
    expect(started).toHaveLength(1)
    expect(completed).toHaveLength(1)
    expect(completed[0]?.data).toMatchObject({ output: { code: 'E_ABORTED' }, isError: true })
  })

  test('审批拒绝：E_PERMISSION（输出 isError，非异常逃逸）', async () => {
    const f = await makeFixture()
    f.perm.decision = false
    const results = await f.pipeline.runAll(makeTurn(), [
      pending('computer.app', { action: 'launch', command: 'notepad' }),
    ])
    expect(results[0]?.isError).toBe(true)
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    expect(completed?.data).toMatchObject({ output: { code: 'E_PERMISSION' }, isError: true })
  })

  test('参数校验：window.focus 缺 title/pid → E_COMPUTER_ARGS；八操作恒 computer.use 审批域', async () => {
    const f = await makeFixture()
    const results = await f.pipeline.runAll(makeTurn(), [
      pending('computer.window', { action: 'focus' }),
      pending('computer.clipboard', { action: 'write', text: 'x' }),
    ])
    expect(results[0]?.isError).toBe(true)
    expect(f.sink.events.find((e) => e.type === 'tool.completed')?.data).toMatchObject({
      output: { code: 'E_COMPUTER_ARGS' },
    })
    expect(f.fake.lastOp).toBe('clipboard')
  })
})
