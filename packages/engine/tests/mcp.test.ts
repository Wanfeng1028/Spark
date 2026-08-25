/**
 * MCP client 单测（阶段五工单 5.3 / ADR D16 / doc/02 §8.6）：
 * - config：缺失 → 空表；坏 JSON / 非法字段 → ConfigError；
 * - 工具包装（in-memory transport）：命名前缀、审批 action/resource、execute 成功与
 *   isError 传播、materialize 出 JSON Schema；
 * - stdio e2e + 审批管线三态：allow / deny / ask（reject 与 once-allow 各一次）——
 *   外部 MCP 工具与内置工具同一管线（事件对闭合 + E_PERMISSION fail-closed）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { ConfigError } from '../src/config.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'
import { loadMcpConfig } from '../src/mcp/config.js'
import { McpManager, mcpToolName } from '../src/mcp/manager.js'
import { PermissionServiceImpl } from '../src/permission/service.js'
import { UserRuleStore } from '../src/permission/store.js'
import type { PermissionRule } from '../src/config.js'
import type { TurnCtx, ToolCallPending } from '../src/run-loop.js'
import { ToolRegistry } from '../src/tools/registry.js'
import { ToolPipelineImpl } from '../src/tools/pipeline.js'
import { ToolOutputStore } from '../src/tools/output-store.js'

const FIXTURE_SERVER = fileURLToPath(new URL('./fixtures/mcp-echo-server.mjs', import.meta.url))

const dirs: string[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-mcp-'))
  dirs.push(d)
  return d
}

// ---- config ----

describe('loadMcpConfig', () => {
  test('文件缺失 → 空表', () => {
    expect(loadMcpConfig(tempDir())).toEqual({ servers: {} })
  })

  test('合法：servers 逐字段解析', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'mcp.json'),
      JSON.stringify({
        version: 1,
        servers: {
          fs: { command: 'npx', args: ['-y', 'x'], env: { K: 'v' } },
        },
      }),
      'utf8',
    )
    const cfg = loadMcpConfig(dir)
    expect(cfg.servers['fs']).toEqual({ command: 'npx', args: ['-y', 'x'], env: { K: 'v' } })
  })

  test('坏 JSON / 缺 command → ConfigError', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'mcp.json'), '{oops', 'utf8')
    expect(() => loadMcpConfig(dir)).toThrow(ConfigError)
    const dir2 = tempDir()
    writeFileSync(
      join(dir2, 'mcp.json'),
      JSON.stringify({ version: 1, servers: { bad: { args: [] } } }),
      'utf8',
    )
    expect(() => loadMcpConfig(dir2)).toThrow(ConfigError)
  })
})

// ---- 工具包装（in-memory transport，不起子进程） ----

async function inMemoryFixture(): Promise<{
  registry: ToolRegistry
  manager: McpManager
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = new McpServer({ name: 't', version: '1.0.0' })
  server.tool('echo', '原样返回', { message: z.string() }, ({ message }) => ({
    content: [{ type: 'text', text: `echo: ${message}` }],
  }))
  server.tool('fail', '总是失败', {}, () => ({
    content: [{ type: 'text', text: 'boom' }],
    isError: true,
  }))
  await server.connect(serverTransport)
  const registry = new ToolRegistry()
  const manager = new McpManager({
    config: { servers: { t: { command: 'unused' } } },
    toolTimeoutMs: 5_000,
    transportFactory: () => clientTransport,
  })
  await manager.connect(registry)
  return { registry, manager }
}

describe('MCP 工具包装（ADR D16）', () => {
  test('注册命名 + materialize JSON Schema + 审批 action/resource', async () => {
    const { registry } = await inMemoryFixture()
    expect(registry.size).toBe(2)
    const echo = registry.resolve(mcpToolName('t', 'echo'))
    expect(echo).toBeDefined()
    expect(echo?.permission.action).toBe('mcp.call')
    expect(echo?.permission.resourceOf({}, { cwd: '/tmp' })).toBe('t/echo')
    expect(echo?.parallelizable).toBe(false)
    const advertised = new ToolRegistry()
    advertised.register(echo!)
    const spec = advertised.materialize()[0]!
    expect(spec.name).toBe('mcp__t__echo')
    expect(spec.description).toContain('[mcp:t]')
    expect(spec.parameters).toMatchObject({ type: 'object', required: ['message'] })
  })

  test('execute 成功 / isError 传播', async () => {
    const { registry } = await inMemoryFixture()
    const echo = registry.resolve(mcpToolName('t', 'echo'))!
    const r = await echo.execute(makeCtx(), { message: 'hi' })
    expect(r).toEqual({ output: 'echo: hi', isError: false })
    const fail = registry.resolve(mcpToolName('t', 'fail'))!
    const r2 = await fail.execute(makeCtx(), {})
    expect(r2.isError).toBe(true)
    expect(r2.output).toBe('boom')
  })
})

// ---- stdio e2e + 审批管线三态 ----

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

interface PipelineFixture {
  registry: ToolRegistry
  pipeline: ToolPipelineImpl
  perm: PermissionServiceImpl
  events: SparkEventEnvelope[]
  manager: McpManager
}

async function makePipelineFixture(rules: PermissionRule[]): Promise<PipelineFixture> {
  const registry = new ToolRegistry()
  const manager = new McpManager({
    config: {
      servers: { echo: { command: process.execPath, args: [FIXTURE_SERVER] } },
    },
    toolTimeoutMs: 5_000,
  })
  await manager.connect(registry)
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const ruleStore = new UserRuleStore(join(tempDir(), 'permissions.json'), rules)
  const perm = new PermissionServiceImpl({
    bus,
    ruleStore,
    projectRules: [],
    timeoutMs: 5_000,
  })
  const outputs = new ToolOutputStore(32 * 1024, join(tempDir(), 'tool-outputs'))
  const pipeline = new ToolPipelineImpl({
    sessionId: ids.session('ses_mcp_test'),
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
  return { registry, pipeline, perm, events, manager }
}

function makeTurn(): TurnCtx {
  return {
    turnId: ids.turn('trn_mcp'),
    delivery: 'now',
    abort: new AbortController(),
    step: 1,
    usage: ZERO_USAGE,
    toolCalls: [],
  }
}

function makeCtx() {
  return {
    sessionId: ids.session('ses_mcp_test'),
    turnId: ids.turn('trn_mcp'),
    callId: ids.call('cal_mcp_test'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd: '/tmp',
  }
}

function mcpPending(): ToolCallPending {
  return {
    callId: ids.call('cal_mcpe2e'),
    name: mcpToolName('echo', 'echo'),
    input: { message: 'hello' },
  }
}

function completedOf(events: SparkEventEnvelope[]): SparkEventEnvelope | undefined {
  return events.find((e) => e.type === 'tool.completed')
}

describe('stdio e2e + 审批管线三态（验收：allow/ask/deny 各演示一次）', () => {
  test('stdio spawn：注册 2 工具且 execute 走真实子进程', async () => {
    const f = await makePipelineFixture([])
    expect(f.registry.resolve(mcpToolName('echo', 'echo'))).toBeDefined()
    expect(f.registry.resolve(mcpToolName('echo', 'fail'))).toBeDefined()
    await f.manager.close()
  })

  test('allow 规则：直接执行，事件对闭合无审批', async () => {
    const f = await makePipelineFixture([
      { action: 'mcp.call', resource: 'echo/echo', effect: 'allow' },
    ])
    const [result] = await f.pipeline.runAll(makeTurn(), [mcpPending()])
    expect(result?.isError).toBe(false)
    expect(result?.output).toBe('echo: hello')
    const types = f.events.map((e) => e.type)
    expect(types).toContain('tool.started')
    expect(types).toContain('tool.completed')
    expect(types).not.toContain('permission.asked')
    await f.manager.close()
  })

  test('deny 规则：E_PERMISSION 且不执行', async () => {
    const f = await makePipelineFixture([
      { action: 'mcp.call', resource: 'echo/echo', effect: 'deny' },
    ])
    const [result] = await f.pipeline.runAll(makeTurn(), [mcpPending()])
    expect(result?.isError).toBe(true)
    expect(result?.output).toEqual({ code: 'E_PERMISSION' })
    expect(f.events.map((e) => e.type)).not.toContain('permission.asked')
    await f.manager.close()
  })

  test('ask（无规则）→ 用户 reject：E_PERMISSION；asked/resolved 事件成对', async () => {
    const f = await makePipelineFixture([])
    const runPromise = f.pipeline.runAll(makeTurn(), [mcpPending()])
    // 等待 permission.asked 入流再答复（模拟前端 ApprovalCard reject）
    await waitFor(() => f.events.some((e) => e.type === 'permission.asked'))
    const asked = f.events.find((e) => e.type === 'permission.asked')
    const requestId = ids.request((asked?.data as { requestId: string }).requestId)
    expect(await f.perm.reply(requestId, 'reject')).toBe(true)
    const [result] = await runPromise
    expect(result?.isError).toBe(true)
    expect(result?.output).toEqual({ code: 'E_PERMISSION' })
    const resolved = f.events.find((e) => e.type === 'permission.resolved')
    expect((resolved?.data as { reply: string }).reply).toBe('reject')
    const completed = completedOf(f.events)
    expect(completed).toBeDefined() // 失败闭合：started/completed 成对
    await f.manager.close()
  })

  test('ask（无规则）→ 用户 once 放行：执行成功', async () => {
    const f = await makePipelineFixture([])
    const runPromise = f.pipeline.runAll(makeTurn(), [mcpPending()])
    await waitFor(() => f.events.some((e) => e.type === 'permission.asked'))
    const asked = f.events.find((e) => e.type === 'permission.asked')
    const requestId = ids.request((asked?.data as { requestId: string }).requestId)
    expect(await f.perm.reply(requestId, 'once')).toBe(true)
    const [result] = await runPromise
    expect(result?.isError).toBe(false)
    expect(result?.output).toBe('echo: hello')
    await f.manager.close()
  })
})

async function waitFor(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('waitFor 超时')
}

process.on('exit', () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})
