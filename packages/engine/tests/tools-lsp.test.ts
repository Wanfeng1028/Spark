/**
 * lsp 工具单测（工单 16.9，new-tool skill 四路径单测纪律）：
 * 成功 / 业务失败（isError）/ 中断（started+completed{E_ABORTED} 对，重放合法）/
 * 审批拒绝（E_PERMISSION）；附参数校验（E_LSP_ARGS）与路径硬边界（E_PATH_OUTSIDE）。
 * 连接层语义在 lsp.test.ts；本文件经真实 ToolPipelineImpl 走完整事件纪律。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
import type { LspOperation, LspQueryContext, LspQueryParams } from '../src/lsp/manager.js'
import { lspTool } from '../src/tools/builtin/lsp.js'

const SID = ids.session('ses_lsptool01')

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

/** 假 LspExecutor：记录调用，可注入拒绝（测试假体纪律：无 async/await） */
class FakeLsp {
  calls = 0
  lastOp: LspOperation | undefined
  lastParams: LspQueryParams | undefined
  lastCtx: LspQueryContext | undefined
  rejectWith: Error | undefined

  request(op: LspOperation, params: LspQueryParams, ctx: LspQueryContext): Promise<unknown> {
    this.calls += 1
    this.lastOp = op
    this.lastParams = params
    this.lastCtx = ctx
    if (this.rejectWith !== undefined) return Promise.reject(this.rejectWith)
    return Promise.resolve({
      uri: pathToFileURL(join(ctx.cwd, 'a.ts')).href,
      range: { start: { line: 9, character: 6 }, end: { line: 9, character: 10 } },
    })
  }
}

interface Fixture {
  pipeline: ToolPipelineImpl
  perm: StubPerm
  fake: FakeLsp
  sink: MemSink
  cwd: string
}

async function makeFixture(): Promise<Fixture> {
  const registry = new ToolRegistry()
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const perm = new StubPerm()
  const outDir = await mkdtemp(join(tmpdir(), 'spark-lspout-'))
  const cwd = await mkdtemp(join(tmpdir(), 'spark-lspcwd-'))
  const fake = new FakeLsp()
  const pipeline = new ToolPipelineImpl({
    sessionId: SID,
    bus,
    registry,
    permission: perm,
    outputs: new ToolOutputStore(32 * 1024, outDir),
    cwd,
    maxToolParallel: 8,
    progressThrottleMs: 10,
    lsp: fake,
  })
  registry.register(lspTool)
  return { pipeline, perm, fake, sink, cwd }
}

function makeTurn(): TurnCtx {
  return {
    turnId: ids.turn('trn_lsptool01'),
    delivery: 'now',
    abort: new AbortController(),
    step: 1,
    usage: ZERO_USAGE,
    toolCalls: [],
  }
}

function pending(input: Record<string, unknown>): ToolCallPending {
  // CallIdSchema 只允许 [0-9A-Za-z]
  return { callId: ids.call('cal_lsptool1'), name: 'lsp', input }
}

const DEF_INPUT = { operation: 'goToDefinition', path: 'a.ts', line: 1, character: 1 }

describe('lsp 工具四路径（工单 16.9 / new-tool 纪律）', () => {
  test('成功：fs.read 审批域 + 位置结果归一（uri→路径，0-based→1-based）', async () => {
    const f = await makeFixture()
    const results = await f.pipeline.runAll(makeTurn(), [pending(DEF_INPUT)])
    expect(results.map((r) => r.isError)).toEqual([false])
    expect(results[0]?.output).toEqual({
      locations: [{ path: join(f.cwd, 'a.ts'), line: 10, character: 7 }],
    })
    // 审批域与资源：fs.read / file:<abs>（与 read/grep 同域——plan 档放行的只读面）
    expect(f.perm.checks[0]?.action).toBe('fs.read')
    expect(f.perm.checks[0]?.resource).toBe(`file:${join(f.cwd, 'a.ts')}`)
    // 管理器入参：1-based → 0-based
    expect(f.fake.lastOp).toBe('goToDefinition')
    expect(f.fake.lastParams?.line).toBe(0)
    expect(f.fake.lastParams?.character).toBe(0)
  })

  test('业务失败：E_LSP_UNCONFIGURED → started+completed{isError}', async () => {
    const f = await makeFixture()
    f.fake.rejectWith = new Error('E_LSP_UNCONFIGURED: 语言 typescript 未配置（~/.spark/lsp.json）')
    const results = await f.pipeline.runAll(makeTurn(), [pending(DEF_INPUT)])
    expect(results[0]?.isError).toBe(true)
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    expect(completed?.data).toMatchObject({ output: { code: 'E_LSP_UNCONFIGURED' }, isError: true })
  })

  test('中断：E_ABORTED → started+completed 对（重放合法），isError 输出', async () => {
    const f = await makeFixture()
    const turn = makeTurn()
    turn.abort.abort()
    f.fake.rejectWith = new Error('E_ABORTED: 查询被中断')
    const results = await f.pipeline.runAll(turn, [pending(DEF_INPUT)])
    expect(results[0]?.isError).toBe(true)
    const started = f.sink.events.filter((e) => e.type === 'tool.started')
    const completed = f.sink.events.filter((e) => e.type === 'tool.completed')
    expect(started).toHaveLength(1)
    expect(completed).toHaveLength(1)
    expect(completed[0]?.data).toMatchObject({ output: { code: 'E_ABORTED' }, isError: true })
  })

  test('审批拒绝：E_PERMISSION 且 execute 不执行', async () => {
    const f = await makeFixture()
    f.perm.decision = false
    const results = await f.pipeline.runAll(makeTurn(), [pending(DEF_INPUT)])
    expect(results[0]?.isError).toBe(true)
    expect(f.fake.calls).toBe(0)
    const completed = f.sink.events.find((e) => e.type === 'tool.completed')
    expect(completed?.data).toMatchObject({ output: { code: 'E_PERMISSION' }, isError: true })
  })

  test('参数校验：缺 line → E_LSP_ARGS；越界路径 → E_PATH_OUTSIDE（硬边界先于审批）', async () => {
    const f = await makeFixture()
    const missing = await f.pipeline.runAll(makeTurn(), [
      pending({ operation: 'goToDefinition', path: 'a.ts' }),
    ])
    expect(missing[0]?.isError).toBe(true)
    expect(f.sink.events.find((e) => e.type === 'tool.completed')?.data).toMatchObject({
      output: { code: 'E_LSP_ARGS' },
    })
    f.sink.events.length = 0
    const outside = await f.pipeline.runAll(makeTurn(), [
      pending({ operation: 'diagnostics', path: '../evil.ts' }),
    ])
    expect(outside[0]?.isError).toBe(true)
    expect(f.fake.calls).toBe(0) // 越界拒绝发生在执行器之前
    expect(f.sink.events.find((e) => e.type === 'tool.completed')?.data).toMatchObject({
      output: { code: 'E_PATH_OUTSIDE' },
    })
  })

  test('12 操作词表全覆盖：JSON Schema 枚举与模型广告面', () => {
    const json = JSON.stringify(z.toJSONSchema(lspTool.inputSchema, { io: 'input' }))
    for (const op of [
      'goToDefinition',
      'findReferences',
      'hover',
      'documentSymbol',
      'workspaceSymbol',
      'goToImplementation',
      'prepareCallHierarchy',
      'incomingCalls',
      'outgoingCalls',
      'diagnostics',
      'workspaceDiagnostics',
      'codeActions',
    ]) {
      expect(json).toContain(op)
    }
  })
})
