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
import { MCP_ENV_MASK } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { ConfigError } from '../src/config.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'
import {
  loadMcpConfig,
  maskMcpConfigForClient,
  mergeMaskedMcpConfig,
  type McpConfig,
} from '../src/mcp/config.js'
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

  test('RT3-04：connectTimeoutMs 合法值透传，越界/非整数 → ConfigError', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'mcp.json'),
      JSON.stringify({
        version: 1,
        servers: { slow: { command: 'npx', connectTimeoutMs: 60_000 } },
      }),
      'utf8',
    )
    expect(loadMcpConfig(dir).servers['slow']?.connectTimeoutMs).toBe(60_000)
    const dir2 = tempDir()
    writeFileSync(
      join(dir2, 'mcp.json'),
      JSON.stringify({
        version: 1,
        servers: { bad: { command: 'npx', connectTimeoutMs: 600_001 } },
      }),
      'utf8',
    )
    expect(() => loadMcpConfig(dir2)).toThrow(ConfigError)
    const dir3 = tempDir()
    writeFileSync(
      join(dir3, 'mcp.json'),
      JSON.stringify({
        version: 1,
        servers: { bad2: { command: 'npx', connectTimeoutMs: 1.5 } },
      }),
      'utf8',
    )
    expect(() => loadMcpConfig(dir3)).toThrow(ConfigError)
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

// ---- RT3-07：配置读回掩码与 PUT 合并（server 路由与 sdk inprocess 共用装配） ----

describe('maskMcpConfigForClient / mergeMaskedMcpConfig（RT3-07）', () => {
  const withEnv: McpConfig = {
    servers: {
      fs: {
        command: 'npx',
        args: ['-y', 'x'],
        env: { GITHUB_TOKEN: 'ghp_real_secret', K: 'v' },
        connectTimeoutMs: 45_000,
      },
      bare: { command: 'node' },
    },
  }

  test('读回掩码：env 值一律占位（明文不出引擎），args/超时原样，无 env 不出 env 键', () => {
    const masked = maskMcpConfigForClient(withEnv)
    expect(masked.version).toBe(1)
    expect(masked.servers['fs']).toEqual({
      command: 'npx',
      args: ['-y', 'x'],
      env: { GITHUB_TOKEN: MCP_ENV_MASK, K: MCP_ENV_MASK },
      connectTimeoutMs: 45_000,
    })
    expect(masked.servers['bare']).toEqual({ command: 'node' })
    expect(JSON.stringify(masked)).not.toContain('ghp_real_secret')
  })

  test('合并：掩码 → 盘上真值，明文 → 原样，其余字段以 incoming 为准', () => {
    const merged = mergeMaskedMcpConfig(withEnv, {
      version: 1,
      servers: {
        fs: {
          command: 'npx',
          args: ['-y', 'x'],
          env: { GITHUB_TOKEN: MCP_ENV_MASK, K: 'new-v' },
          connectTimeoutMs: 45_000,
        },
      },
    })
    expect(merged.servers['fs']).toEqual({
      command: 'npx',
      args: ['-y', 'x'],
      env: { GITHUB_TOKEN: 'ghp_real_secret', K: 'new-v' },
      connectTimeoutMs: 45_000,
    })
  })

  test('合并：掩码占位无既有真值（新 server/新 key）→ ConfigError 拒写', () => {
    expect(() =>
      mergeMaskedMcpConfig(withEnv, {
        version: 1,
        servers: { fresh: { command: 'node', env: { N: MCP_ENV_MASK } } },
      }),
    ).toThrow(ConfigError)
    expect(() =>
      mergeMaskedMcpConfig(withEnv, {
        version: 1,
        servers: { fs: { command: 'npx', env: { NEW_KEY: MCP_ENV_MASK } } },
      }),
    ).toThrow(ConfigError)
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

// ---- 19.4 / ADR D46：streamable-http transport ----

describe('MCP streamable-http（阶段十九 19.4 / ADR D46）', () => {
  test('loadMcpConfig：http 合法（url+transport）；缺 url 拒；http 带 command 拒；stdio 缺 command 拒', () => {
    const dir = tempDir()
    write(dir, 'mcp.json', JSON.stringify({
      version: 1,
      servers: { remote: { transport: 'streamable-http', url: 'https://mcp.example.com/mcp' } },
    }))
    const cfg = loadMcpConfig(dir)
    expect(cfg.servers['remote']).toMatchObject({
      transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
    })

    const d2 = tempDir()
    write(d2, 'mcp.json', JSON.stringify({ version: 1, servers: { r: { transport: 'streamable-http' } } }))
    expect(() => loadMcpConfig(d2)).toThrow(ConfigError)

    const d3 = tempDir()
    write(d3, 'mcp.json', JSON.stringify({
      version: 1,
      servers: { r: { transport: 'streamable-http', url: 'https://x.example.com', command: 'nope' } },
    }))
    expect(() => loadMcpConfig(d3)).toThrow(ConfigError)

    const d4 = tempDir()
    write(d4, 'mcp.json', JSON.stringify({ version: 1, servers: { r: {} } }))
    expect(() => loadMcpConfig(d4)).toThrow(ConfigError)
  })

  test('headers 掩码/合并：读回全占位，PUT 时盘上真值回填，新 key 掩码拒写', () => {
    const withHeaders = {
      version: 1 as const,
      servers: {
        remote: {
          transport: 'streamable-http' as const,
          url: 'https://mcp.example.com/mcp',
          headers: { Authorization: 'Bearer secret' },
        },
      },
    }
    const masked = maskMcpConfigForClient(withHeaders)
    expect(masked.servers['remote']?.headers).toEqual({ Authorization: '__SPARK_KEEP__' })
    // 占位 → 盘上真值回填
    const merged = mergeMaskedMcpConfig(withHeaders.servers, masked)
    expect(merged.servers['remote']?.headers).toEqual({ Authorization: 'Bearer secret' })
    // 新 key 掩码 → ConfigError（掩码不是值）
    const bad = maskMcpConfigForClient(withHeaders)
    bad.servers['remote']!.headers!['X-New'] = '__SPARK_KEEP__'
    expect(() => mergeMaskedMcpConfig(withHeaders.servers, bad)).toThrow(ConfigError)
  })

  test('缺省工厂 + http 配置：连接失败 warn 跳过，状态显示 url（不真连——127.0.0.1:9 立即拒绝）', async () => {
    const registry = new ToolRegistry()
    const manager = new McpManager({
      config: {
        servers: { remote: { transport: 'streamable-http', url: 'http://127.0.0.1:9/mcp' } },
      },
      toolTimeoutMs: 1_000,
    })
    await manager.connect(registry)
    expect(registry.size).toBe(0)
    const status = manager.status()[0]!
    expect(status.connected).toBe(false)
    expect(status.command).toBe('http://127.0.0.1:9/mcp')
  })
})
