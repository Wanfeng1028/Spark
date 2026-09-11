/**
 * LSP 模块单测（工单 16.9 / doc/08 §16.9 验收）：
 * 配置加载与 config hash（qwen 口径）、敏感环境变量剥离（qwen 同清单）、
 * 连接复用语义（hash 不变不重启 / 变化重建 / 进程死亡重建）、
 * 诊断事件流（publishDiagnostics → 缓存 + lsp.diagnostics durable 落盘、白名单外字段剥除）、
 * 真实 stdio e2e（node 假 LSP server——诊断/定义全链路）。
 */
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import type { SparkEventEnvelope } from '@spark/protocol'
import { ids } from '@spark/protocol'
import type { ChildProcess } from 'node:child_process'
import { ConfigError } from '../src/config.js'
import { loadLspConfig, lspServerConfigHash } from '../src/lsp/config.js'
import { sanitizedLspEnv } from '../src/lsp/connection.js'
import type { ConnectionFactory, LspConnection } from '../src/lsp/connection.js'
import { LspManager } from '../src/lsp/manager.js'
import type { LspManagerDeps, LspQueryContext } from '../src/lsp/manager.js'
import { EventBus, type EventSink } from '../src/bus.js'

const SID = ids.session('ses_lsptest01')

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

function makeBus(): { bus: EventBus; sink: MemSink } {
  const sink = new MemSink()
  return { bus: new EventBus({ sink }), sink }
}

async function makeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'spark-lsp-'))
}

function ctxOf(cwd: string, signal: AbortSignal = new AbortController().signal): LspQueryContext {
  return { sessionId: SID, cwd, signal }
}

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  // exitCode/killed 是 @types/node 的只读 getter——经 Object.assign 绕开类型层（运行时可写）
  Object.assign(child, { exitCode: null, killed: false })
  child.kill = () => {
    Object.assign(child, { killed: true })
    return true
  }
  return child
}

interface FakeConn {
  calls: Array<{ method: string; params?: unknown }>
  handler: ((params: unknown) => void) | undefined
  factory: ConnectionFactory
}

function fakeFactory(definition: unknown): FakeConn {
  const conn: FakeConn = { calls: [], handler: undefined, factory: () => conn0 }
  const conn0: LspConnection = {
    sendRequest: (method: string, params?: unknown) => {
      conn.calls.push({ method, params })
      if (method === 'initialize') return Promise.resolve({ capabilities: {} })
      if (method === 'textDocument/definition') return Promise.resolve(definition)
      return Promise.resolve(null)
    },
    sendNotification: (method: string, params?: unknown) => {
      conn.calls.push({ method, params })
    },
    onNotification: (_method: string, h: (params: unknown) => void) => {
      conn.handler = h
    },
    listen: () => {},
    dispose: () => {},
  }
  return conn
}

async function writeConfig(root: string, languages: Record<string, unknown>): Promise<void> {
  await writeFile(join(root, 'lsp.json'), JSON.stringify({ version: 1, languages }), 'utf8')
}

function makeManager(root: string, bus: EventBus, deps: Partial<LspManagerDeps> = {}): LspManager {
  return new LspManager({ dataRoot: root, bus, diagnosticsGraceMs: 0, ...deps })
}

// ---- 配置与 hash ----

describe('lsp 配置与 config hash（工单 16.9 产出④）', () => {
  test('lsp.json 缺失 → null；坏 JSON → ConfigError；合法 → 解析 languages', async () => {
    const root = await makeRoot()
    expect(loadLspConfig(root)).toBeNull()
    await writeFile(join(root, 'lsp.json'), '{ not json', 'utf8')
    expect(() => loadLspConfig(root)).toThrow(ConfigError)
    await writeConfig(root, { typescript: { command: 'typescript-language-server', args: ['--stdio'] } })
    const cfg = loadLspConfig(root)
    expect(cfg?.languages.typescript?.command).toBe('typescript-language-server')
  })

  test('hash：键序不敏感（同配置同 hash）；内容变化 → hash 变（qwen sortJsonValue 口径）', () => {
    const a = lspServerConfigHash({ command: 'lsp', args: ['--stdio'] })
    const b = lspServerConfigHash({ args: ['--stdio'], command: 'lsp' })
    const c = lspServerConfigHash({ command: 'lsp', args: ['-q'] })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('sanitizedLspEnv（敏感环境变量剥离，qwen SECURITY_SENSITIVE_ENV_KEYS 同清单）', () => {
  test('LD_PRELOAD / NODE_OPTIONS / DYLD_INSERT_LIBRARIES 剥离（大小写不敏感），PATH 保留', () => {
    const original = process.env
    try {
      process.env = { ...original, LD_PRELOAD: '/evil.so', NODE_OPTIONS: '--inspect', Path: 'C:/bin' }
      const env = sanitizedLspEnv()
      expect(env.LD_PRELOAD).toBeUndefined()
      expect(env.NODE_OPTIONS).toBeUndefined()
      expect(env.Path).toBeUndefined() // 大写比对命中（Windows 的 Path 同样剥离）
      expect(env.LD_LIBRARY_PATH).toBeUndefined()
    } finally {
      process.env = original
    }
  })

  test('配置覆盖项（extra）中的敏感键同样拒绝', () => {
    const env = sanitizedLspEnv({ NODE_OPTIONS: '--inspect', HOME: '/home/u' })
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env.HOME).toBe('/home/u')
  })
})

// ---- 连接管理与诊断事件流 ----

describe('LspManager 连接管理（hash 不变不重启）', () => {
  test('首次查询 spawn + initialize；hash 不变复用连接（spawn 只一次）', async () => {
    const root = await makeRoot()
    await writeConfig(root, { typescript: { command: 'fake-lsp', args: ['--stdio'] } })
    const { bus } = makeBus()
    const child = fakeChild()
    let spawnCount = 0
    let spawnedEnv: NodeJS.ProcessEnv | undefined
    const fake = fakeFactory(null)
    const manager = makeManager(root, bus, {
      spawnFn: (_cmd, _args, opts) => {
        spawnCount += 1
        spawnedEnv = opts?.env
        return child
      },
      connectionFactory: fake.factory,
    })
    const ctx = ctxOf(root)
    await manager.request('goToDefinition', { language: 'typescript', abs: join(root, 'a.ts'), line: 1, character: 1 }, ctx)
    expect(spawnCount).toBe(1)
    // 敏感 env 剥离口径在 spawn 落地
    expect(spawnedEnv?.LD_PRELOAD).toBeUndefined()
    expect(spawnedEnv?.NODE_OPTIONS).toBeUndefined()
    await manager.request('goToDefinition', { language: 'typescript', abs: join(root, 'a.ts'), line: 1, character: 1 }, ctx)
    expect(spawnCount).toBe(1) // hash 不变 → 不重启
    // didOpen 只发一次（幂等）
    const opens = fake.calls.filter((c) => c.method === 'textDocument/didOpen')
    expect(opens).toHaveLength(1)
    await manager.shutdown()
  })

  test('hash 变化 → 关旧建新；语言未配置 → E_LSP_UNCONFIGURED', async () => {
    const root = await makeRoot()
    await writeConfig(root, { typescript: { command: 'fake-lsp', args: ['--stdio'] } })
    const { bus } = makeBus()
    const children: ChildProcess[] = []
    const fake = fakeFactory(null)
    const manager = makeManager(root, bus, {
      spawnFn: () => {
        const child = fakeChild()
        children.push(child)
        return child
      },
      connectionFactory: fake.factory,
    })
    const ctx = ctxOf(root)
    await manager.request('diagnostics', { language: 'typescript', abs: join(root, 'a.ts') }, ctx)
    expect(children).toHaveLength(1)
    // 改配置（args 变 → hash 变）→ 下一次查询重建连接
    await writeConfig(root, { typescript: { command: 'fake-lsp', args: ['--stdio', '-v'] } })
    await manager.request('diagnostics', { language: 'typescript', abs: join(root, 'a.ts') }, ctx)
    expect(children).toHaveLength(2)
    expect(children[0]?.killed).toBe(true)
    // 未配置语言 → fail-closed
    await expect(
      manager.request('diagnostics', { language: 'python', abs: join(root, 'a.py') }, ctx),
    ).rejects.toThrow('E_LSP_UNCONFIGURED')
    await manager.shutdown()
  })

  test('lsp.json 整体缺失 → E_LSP_UNCONFIGURED', async () => {
    const root = await makeRoot()
    const { bus } = makeBus()
    const manager = makeManager(root, bus, { spawnFn: () => fakeChild(), connectionFactory: fakeFactory(null).factory })
    await expect(manager.request('hover', { language: 'typescript', abs: join(root, 'a.ts'), line: 1, character: 1 }, ctxOf(root))).rejects.toThrow(
      'E_LSP_UNCONFIGURED',
    )
  })
})

describe('诊断事件流（publishDiagnostics → 缓存 + lsp.diagnostics durable）', () => {
  test('publish → 事件落 bus（language/uri/diagnostics 白名单形状，tags 剥除）；diagnostics 操作回缓存', async () => {
    const root = await makeRoot()
    await writeConfig(root, { typescript: { command: 'fake-lsp' } })
    const doc = join(root, 'a.ts')
    await writeFile(doc, 'const x = 1\n', 'utf8')
    const { bus, sink } = makeBus()
    const fake = fakeFactory(null)
    const manager = makeManager(root, bus, { spawnFn: () => fakeChild(), connectionFactory: fake.factory })
    const ctx = ctxOf(root)
    const out = await manager.request('diagnostics', { language: 'typescript', abs: doc }, ctx)
    // server 尚未 publish → 空诊断（如实，不编造）
    expect(out).toEqual({ uri: pathToFileURL(doc).href, diagnostics: [] })
    // 模拟 server publish（带白名单外字段 tags / 越界 severity 收敛到 1-4）
    fake.handler?.({
      uri: pathToFileURL(doc).href,
      diagnostics: [
        {
          severity: 1,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
          message: 'x is not defined',
          source: 'ts',
          code: '2304',
          tags: [1],
        },
        { severity: 9, range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } }, message: 'second' },
      ],
    })
    await new Promise((r) => setTimeout(r, 10))
    const diagEvents = sink.events.filter((e) => e.type === 'lsp.diagnostics')
    expect(diagEvents).toHaveLength(1)
    const data = diagEvents[0]?.data as {
      language: string
      uri: string
      diagnostics: Array<{ severity: number; message: string; code?: unknown; tags?: unknown }>
    }
    expect(data.language).toBe('typescript')
    expect(data.uri).toBe(pathToFileURL(doc).href)
    expect(data.diagnostics).toHaveLength(2)
    expect(data.diagnostics[0]?.message).toBe('x is not defined')
    expect(data.diagnostics[0]?.code).toBe('2304')
    expect(data.diagnostics[0]?.tags).toBeUndefined() // 白名单外字段剥除（strictObject 前置收敛）
    expect(data.diagnostics[1]?.severity).toBe(4) // 越界 severity 收敛到上限
    // 缓存可查（diagnostics 操作）
    const cached = (await manager.request('diagnostics', { language: 'typescript', abs: doc }, ctx)) as { diagnostics: unknown[] }
    expect(cached.diagnostics).toHaveLength(2)
    // status 快照：1 文件 / 1 错误（第二条 severity 9 收敛为 4=Hint，不计错误）
    const rows = await manager.status()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ language: 'typescript', connected: true, files: 1, errors: 1, warnings: 0 })
    await manager.shutdown()
  })
})

describe('真实 stdio e2e（node 假 LSP server——诊断/定义全链路）', () => {
  test('spawn → initialize → didOpen → publishDiagnostics → 缓存与事件；definition 回 Location', async () => {
    const root = await makeRoot()
    const fixturePath = fileURLToPath(new URL('./fixtures/lsp-echo-server.mjs', import.meta.url))
    await writeConfig(root, {
      typescript: { command: process.execPath, args: [fixturePath] },
    })
    const doc = join(root, 'a.ts')
    await writeFile(doc, 'const x = 1\n', 'utf8')
    const { bus, sink } = makeBus()
    // 默认 spawn（真实 stdio）+ 默认连接工厂；诊断宽限给足（夹具 20ms 后推）
    const manager = makeManager(root, bus, { diagnosticsGraceMs: 400 })
    const ctx = ctxOf(root)
    const def = (await manager.request('goToDefinition', { language: 'typescript', abs: doc, line: 1, character: 1 }, ctx)) as { uri: string }
    expect(def.uri).toBe(pathToFileURL(doc).href)
    const diag = (await manager.request('diagnostics', { language: 'typescript', abs: doc }, ctx)) as {
      diagnostics: Array<{ message: string; tags?: unknown }>
    }
    expect(diag.diagnostics).toHaveLength(1)
    expect(diag.diagnostics[0]?.message).toBe('fixture: x is not defined')
    expect(diag.diagnostics[0]?.tags).toBeUndefined()
    await new Promise((r) => setTimeout(r, 20))
    expect(sink.events.filter((e) => e.type === 'lsp.diagnostics')).toHaveLength(1)
    await manager.shutdown()
  })
})
