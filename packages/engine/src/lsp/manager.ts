/**
 * LSP 连接管理 + 诊断缓存（工单 16.9 产出①）：
 * - 惰性连接：首次对该语言的查询才 spawn（缺省零开销——不起 server 不占端口）；
 * - 每次调用重读 ~/.spark/lsp.json 并比对 per-server config hash：hash 不变且进程存活
 *   即复用（不重启）；hash 变化 / 进程退出才重建（必抄安全细节之二，qwen 同语义）；
 * - initialize 握手（10s 上限，qwen 同值）→ didOpen 拉起诊断：文档从会话 cwd 允许根内
 *   读取（绝对路径由工具层过 resolveInRoot 硬边界后才进来）；
 * - publishDiagnostics → 缓存（全量替换语义）+ bus.emit('lsp.diagnostics') durable 落盘
 *   （诊断进模型上下文即模型可见必被记录——surface 纪律；发射失败记日志不断流）；
 * - 失败闭合：spawn/握手失败如实 E_LSP_CONNECT（status 面保留失败人话）；单次请求失败
 *   E_LSP_CALL；超时 E_LSP_TIMEOUT（qwen 15s 同值）——都不悬空不假降级。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type { LspServerStatusDto, SessionId, SparkEventMap } from '@spark/protocol'
import type { EventBus } from '../bus.js'
import { asError, errText } from '../errs.js'
import type { SparkLogger } from '../logger.js'
import { loadLspConfig, lspServerConfigHash } from './config.js'
import type { LspServerEntry } from './config.js'
import { sanitizedLspEnv, stdioConnectionFactory } from './connection.js'
import type { ConnectionFactory, LspConnection } from './connection.js'

/** initialize 握手上限（qwen DEFAULT_LSP_STARTUP_TIMEOUT_MS 同值） */
const STARTUP_TIMEOUT_MS = 10_000
/** 请求超时（qwen DEFAULT_LSP_REQUEST_TIMEOUT_MS 同值） */
const REQUEST_TIMEOUT_MS = 15_000
/** didOpen 后给 server 的首帧诊断宽限（qwen didOpen 延时口径的保守取值） */
const DIAGNOSTICS_GRACE_MS = 500
/** didOpen 文档字节上限（同 read 工具量级——超大文件拒绝，防一次性读爆内存） */
const MAX_DOC_BYTES = 4 * 1024 * 1024
/** workspaceDiagnostics 聚合文件数上限（输出限界在管线侧还有一道，这里防巨表） */
const WORKSPACE_DIAGNOSTICS_MAX_FILES = 100

/** 12 操作统一枚举（qwen-code tools/lsp.ts 同名设计照抄） */
export type LspOperation =
  | 'goToDefinition'
  | 'findReferences'
  | 'hover'
  | 'documentSymbol'
  | 'workspaceSymbol'
  | 'goToImplementation'
  | 'prepareCallHierarchy'
  | 'incomingCalls'
  | 'outgoingCalls'
  | 'diagnostics'
  | 'workspaceDiagnostics'
  | 'codeActions'

/** 请求参数（line/character 已由工具层从 1-based 转 LSP 0-based；abs 已过允许根校验） */
export interface LspQueryParams {
  language: string
  abs?: string | undefined
  line?: number | undefined
  character?: number | undefined
  endLine?: number | undefined
  endCharacter?: number | undefined
  includeDeclaration?: boolean | undefined
  query?: string | undefined
  limit?: number | undefined
  /** callHierarchy 条目回传（incomingCalls/outgoingCalls 必带） */
  item?: unknown
}

export interface LspQueryContext {
  sessionId: SessionId
  cwd: string
  signal: AbortSignal
}

/** 工具执行端口（ToolContext.lsp；LspManager 实现——测试注入假体） */
export interface LspExecutor {
  request(op: LspOperation, params: LspQueryParams, ctx: LspQueryContext): Promise<unknown>
}

export interface LspManagerDeps {
  /** 数据根（~/.spark）——lsp.json 读取锚点 */
  dataRoot: string
  bus: EventBus
  /** 缺省不记日志（引擎传入 Logger；单测可省） */
  logger?: SparkLogger
  /** 测试注入 spawn（缺省真实 stdio spawn；窄化 node spawn 重载面——双向可赋值） */
  spawnFn?: LspSpawnFn
  /** 测试注入连接工厂（缺省 vscode-jsonrpc stdio 连接） */
  connectionFactory?: ConnectionFactory
  /** initialize 超时（缺省 10s；测试注入小值） */
  startupTimeoutMs?: number
  /** 请求超时（缺省 15s；测试注入小值） */
  requestTimeoutMs?: number
  /** didOpen 后诊断宽限（缺省 500ms；测试注入 0） */
  diagnosticsGraceMs?: number
}

/** spawn 端口（窄化 node spawn 的重载返回——ChildProcess 即可，管道由调用方空值守卫） */
export type LspSpawnFn = (
  command: string,
  args: readonly string[],
  opts: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined; stdio?: Array<'pipe'> },
) => ChildProcess

interface ConnectionEntry {
  hash: string
  command: string
  child: ChildProcess
  conn: LspConnection
  /** 诊断缓存 uri → 最新一批（publish 全量替换语义） */
  diagnostics: Map<string, SparkEventMap['lsp.diagnostics']['diagnostics']>
  /** 已 didOpen 的文档 uri（重连后新条目，重新拉起） */
  opened: Set<string>
  /** initialize 完成 Promise（并发 ensure 复用同一握手） */
  ready: Promise<void>
  /** 进程退出/错误置位——下次 ensure 重建 */
  dead: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** LSP Diagnostic → wire 形状（strictObject 只认白名单字段——tags/relatedInformation 等剥除） */
function wireDiagnosticsOf(raw: unknown): SparkEventMap['lsp.diagnostics']['diagnostics'] {
  if (!Array.isArray(raw)) return []
  const out: SparkEventMap['lsp.diagnostics']['diagnostics'] = []
  for (const d of raw) {
    if (d === null || typeof d !== 'object') continue
    const obj = d as Record<string, unknown>
    const message = obj.message
    const range = obj.range as Record<string, unknown> | undefined
    const start = range?.start as Record<string, unknown> | undefined
    const end = range?.end as Record<string, unknown> | undefined
    if (typeof message !== 'string' || message === '' || start === undefined || end === undefined) continue
    const severityRaw = typeof obj.severity === 'number' ? obj.severity : 1 // LSP 缺省 1=Error
    const diag: SparkEventMap['lsp.diagnostics']['diagnostics'][number] = {
      severity: Math.min(4, Math.max(1, Math.round(severityRaw))),
      range: {
        start: {
          line: typeof start.line === 'number' ? Math.max(0, start.line) : 0,
          character: typeof start.character === 'number' ? Math.max(0, start.character) : 0,
        },
        end: {
          line: typeof end.line === 'number' ? Math.max(0, end.line) : 0,
          character: typeof end.character === 'number' ? Math.max(0, end.character) : 0,
        },
      },
      message,
      ...(typeof obj.source === 'string' ? { source: obj.source } : {}),
      ...(typeof obj.code === 'string' || typeof obj.code === 'number' ? { code: obj.code } : {}),
    }
    out.push(diag)
  }
  return out
}

export class LspManager implements LspExecutor {
  private readonly connections = new Map<string, ConnectionEntry>()
  /** 最近一次连接失败人话（status 面如实展示——同 /api/mcp "失败也列出"口径） */
  private readonly lastError = new Map<string, string>()
  /** uri → 最近打开它的会话（诊断事件归属；v1 取最后打开者） */
  private readonly uriSessions = new Map<string, SessionId>()

  constructor(private readonly deps: LspManagerDeps) {}

  /** 12 操作统一入口（工具层只做参数校验与格式化，连接/缓存语义都在这里） */
  async request(op: LspOperation, params: LspQueryParams, ctx: LspQueryContext): Promise<unknown> {
    const entry = await this.ensure(params.language, ctx)
    const abs = params.abs
    const uri = abs !== undefined ? pathToFileURL(abs).href : undefined
    if (abs !== undefined && uri !== undefined) {
      // 归属先于打开——publishDiagnostics 在 didOpen 宽限窗口内就可能到达（早到不丢）
      this.uriSessions.set(uri, ctx.sessionId)
      await this.openDocument(entry, params.language, abs, uri, ctx)
    }

    const doc = { textDocument: { uri: uri ?? '' } }
    const pos = { line: params.line ?? 0, character: params.character ?? 0 }
    switch (op) {
      case 'goToDefinition':
        return this.call(entry, ctx, 'textDocument/definition', { ...doc, position: pos })
      case 'goToImplementation':
        return this.call(entry, ctx, 'textDocument/implementation', { ...doc, position: pos })
      case 'hover':
        return this.call(entry, ctx, 'textDocument/hover', { ...doc, position: pos })
      case 'findReferences':
        return this.call(entry, ctx, 'textDocument/references', {
          ...doc,
          position: pos,
          context: { includeDeclaration: params.includeDeclaration ?? false },
        })
      case 'documentSymbol':
        return this.call(entry, ctx, 'textDocument/documentSymbol', doc)
      case 'prepareCallHierarchy':
        return this.call(entry, ctx, 'textDocument/prepareCallHierarchy', { ...doc, position: pos })
      case 'incomingCalls':
        return this.call(entry, ctx, 'callHierarchy/incomingCalls', { item: params.item })
      case 'outgoingCalls':
        return this.call(entry, ctx, 'callHierarchy/outgoingCalls', { item: params.item })
      case 'codeActions':
        return this.call(entry, ctx, 'textDocument/codeAction', {
          ...doc,
          range: {
            start: { line: params.line ?? 0, character: params.character ?? 0 },
            end: { line: params.endLine ?? params.line ?? 0, character: params.endCharacter ?? params.character ?? 0 },
          },
          // 上下文诊断取引擎缓存（该文件最新一批）——不让模型手工搬运诊断数组
          context: { diagnostics: uri !== undefined ? (entry.diagnostics.get(uri) ?? []) : [] },
        })
      case 'diagnostics':
        return { uri: uri ?? '', diagnostics: uri !== undefined ? (entry.diagnostics.get(uri) ?? []) : [] }
      case 'workspaceDiagnostics':
        return this.workspaceDiagnosticsOf(entry)
      case 'workspaceSymbol':
        return this.call(entry, ctx, 'workspace/symbol', { query: params.query ?? '' })
      default:
        // 词表穷尽不可达（LspOperation 封闭枚举）——保险丝保持失败闭合
        throw new Error(`E_LSP_ARGS: 未知操作 ${String(op)}`)
    }
  }

  /** /lsp 面板状态快照：逐语言列出连接状态 + 诊断缓存摘要（未配置 → 空数组）；同步读（重读配置是同步 fs） */
  status(): LspServerStatusDto[] {
    const config = loadLspConfig(this.deps.dataRoot)
    if (config === null) return []
    const rows: LspServerStatusDto[] = []
    for (const [language, entryCfg] of Object.entries(config.languages)) {
      const live = this.connections.get(language)
      const alive = live !== undefined && !live.dead && live.hash === lspServerConfigHash(entryCfg)
      let files = 0
      let errors = 0
      let warnings = 0
      if (alive && live !== undefined) {
        files = live.diagnostics.size
        for (const diags of live.diagnostics.values()) {
          errors += diags.filter((d) => d.severity === 1).length
          warnings += diags.filter((d) => d.severity === 2).length
        }
      }
      const failure = this.lastError.get(language)
      rows.push({
        language,
        command: entryCfg.command,
        connected: alive,
        ...(alive ? {} : failure !== undefined ? { error: failure } : {}),
        files,
        errors,
        warnings,
      })
    }
    return rows
  }

  /** 引擎 shutdown：shutdown 请求（500ms 内不答不等）→ exit 通知 → 杀进程——关闭路径不悬空 */
  async shutdown(): Promise<void> {
    for (const [language, entry] of this.connections) {
      try {
        await Promise.race([
          entry.conn.sendRequest('shutdown'),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ])
      } catch {
        // 语言服务器已死/不答——下面的 exit + kill 兜底，不阻塞引擎关闭
      }
      try {
        entry.conn.sendNotification('exit')
      } catch {
        // 同上——kill 兜底
      }
      this.kill(language, entry)
    }
  }

  // ---- 内部 ----

  private async ensure(language: string, ctx: LspQueryContext): Promise<ConnectionEntry> {
    // 每次重读配置（config hash 语义的前提——改文件即时生效，无重启）
    const config = loadLspConfig(this.deps.dataRoot)
    if (config === null) {
      throw new Error('E_LSP_UNCONFIGURED: 未配置语言服务器（~/.spark/lsp.json）')
    }
    const entryCfg = config.languages[language]
    if (entryCfg === undefined) {
      throw new Error(`E_LSP_UNCONFIGURED: 语言 ${language} 未配置（~/.spark/lsp.json languages）`)
    }
    const hash = lspServerConfigHash(entryCfg)
    const existing = this.connections.get(language)
    if (existing !== undefined && !existing.dead && existing.hash === hash) return existing
    if (existing !== undefined) {
      // hash 变化才走到这里（进程已死同路）——关旧建新；hash 不变则上方已复用
      this.kill(language, existing)
    }
    return this.connect(language, entryCfg, hash, ctx)
  }

  private async connect(
    language: string,
    entryCfg: LspServerEntry,
    hash: string,
    ctx: LspQueryContext,
  ): Promise<ConnectionEntry> {
    const spawnFn = this.deps.spawnFn ?? spawn
    const factory = this.deps.connectionFactory ?? stdioConnectionFactory()
    let child: ChildProcess
    try {
      child = spawnFn(entryCfg.command, entryCfg.args ?? [], {
        cwd: ctx.cwd,
        env: sanitizedLspEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      const message = `E_LSP_CONNECT: 语言服务器 ${entryCfg.command} 启动失败：${errText(err)}`
      this.lastError.set(language, message)
      throw new Error(message)
    }
    if (child.stdin === null || child.stdout === null) {
      child.kill()
      const message = `E_LSP_CONNECT: 语言服务器 ${entryCfg.command} stdio 管道不可用`
      this.lastError.set(language, message)
      throw new Error(message)
    }
    const conn = factory({ stdin: child.stdin, stdout: child.stdout })
    const entry: ConnectionEntry = {
      hash,
      command: entryCfg.command,
      child,
      conn,
      diagnostics: new Map(),
      opened: new Set(),
      ready: Promise.resolve(),
      dead: false,
    }
    child.once('error', () => {
      entry.dead = true
      this.lastError.set(language, `E_LSP_CONNECT: 语言服务器 ${entryCfg.command} 进程错误`)
    })
    child.once('exit', (code) => {
      entry.dead = true
      this.lastError.set(language, `E_LSP_CONNECT: 语言服务器 ${entryCfg.command} 已退出（code=${String(code)}）`)
    })
    conn.onNotification('textDocument/publishDiagnostics', (raw) => {
      this.onPublish(language, entry, raw)
    })
    conn.listen()
    entry.ready = this.initialize(conn, ctx)
    try {
      await entry.ready
    } catch (err) {
      entry.dead = true
      conn.dispose()
      child.kill()
      this.lastError.set(language, errText(err))
      throw asError(err)
    }
    this.lastError.delete(language)
    this.connections.set(language, entry)
    return entry
  }

  /** initialize 握手（listen 后再发——响应才会被读取）；initialized 通知收尾 */
  private initialize(conn: LspConnection, ctx: LspQueryContext): Promise<void> {
    const timeoutMs = this.deps.startupTimeoutMs ?? STARTUP_TIMEOUT_MS
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`E_LSP_CONNECT: 语言服务器 initialize 超时（${timeoutMs}ms）`))
      }, timeoutMs)
      void conn.sendRequest('initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(ctx.cwd).href,
        capabilities: {},
      }).then(
        () => {
          clearTimeout(timer)
          conn.sendNotification('initialized', {})
          resolve()
        },
        (err: unknown) => {
          clearTimeout(timer)
          reject(new Error(`E_LSP_CONNECT: initialize 失败：${errText(err)}`))
        },
      )
    })
  }

  /** publishDiagnostics：更新缓存 + durable 落盘（归属最近打开该文档的会话） */
  private onPublish(language: string, entry: ConnectionEntry, raw: unknown): void {
    if (raw === null || typeof raw !== 'object') return
    const obj = raw as Record<string, unknown>
    if (typeof obj.uri !== 'string' || obj.uri === '') return
    const diagnostics = wireDiagnosticsOf(obj.diagnostics)
    entry.diagnostics.set(obj.uri, diagnostics)
    const sid = this.uriSessions.get(obj.uri)
    if (sid === undefined) return
    void this.deps.bus
      .emit(sid, 'lsp.diagnostics', { language, uri: obj.uri, diagnostics })
      .catch((err: unknown) => {
        // 失败闭合：发射失败记日志不悬空（缓存已在，下次 publish 全量覆盖）
        this.deps.logger?.warn('lsp.emit.failed', { err: errText(err) })
      })
  }

  /** didOpen（幂等）：允许根内读文件 → 通知 → 诊断宽限等待（仅首开） */
  private async openDocument(
    entry: ConnectionEntry,
    language: string,
    abs: string,
    uri: string,
    ctx: LspQueryContext,
  ): Promise<void> {
    if (entry.opened.has(uri)) return
    const text = await readFile(abs, 'utf8').catch((err: unknown) => {
      throw new Error(`E_NOT_FOUND: 文档读取失败 ${abs}：${errText(err)}`)
    })
    if (Buffer.byteLength(text, 'utf8') > MAX_DOC_BYTES) {
      throw new Error(`E_LSP_DOC_TOO_LARGE: 文档超过 ${MAX_DOC_BYTES} 字节上限，不送语言服务器 ${abs}`)
    }
    entry.conn.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: language, version: 1, text },
    })
    entry.opened.add(uri)
    if (ctx.signal.aborted) return
    const grace = this.deps.diagnosticsGraceMs ?? DIAGNOSTICS_GRACE_MS
    if (grace > 0) await sleep(grace)
  }

  private workspaceDiagnosticsOf(entry: ConnectionEntry): Array<{
    uri: string
    diagnostics: SparkEventMap['lsp.diagnostics']['diagnostics']
  }> {
    const out: Array<{ uri: string; diagnostics: SparkEventMap['lsp.diagnostics']['diagnostics'] }> = []
    for (const [uri, diagnostics] of entry.diagnostics) {
      if (out.length >= WORKSPACE_DIAGNOSTICS_MAX_FILES) break
      out.push({ uri, diagnostics })
    }
    return out
  }

  /** 单请求：超时 + 中断级联；server 错误 → E_LSP_CALL（E_ 开头的人话原样透传） */
  private async call(
    entry: ConnectionEntry,
    ctx: LspQueryContext,
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const timeoutMs = this.deps.requestTimeoutMs ?? REQUEST_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`E_LSP_TIMEOUT: ${method} 超时（${timeoutMs}ms）`)), timeoutMs)
      })
      const abort = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error('E_ABORTED: 查询被中断'))
        ctx.signal.addEventListener('abort', onAbort, { once: true })
      })
      return await Promise.race([entry.conn.sendRequest(method, params), timeout, abort])
    } catch (err) {
      const message = errText(err)
      if (message.startsWith('E_')) throw asError(err)
      throw new Error(`E_LSP_CALL: ${method} 失败：${message}`)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      if (onAbort !== undefined) ctx.signal.removeEventListener('abort', onAbort)
    }
  }

  private kill(language: string, entry: ConnectionEntry): void {
    entry.dead = true
    entry.conn.dispose()
    entry.child.kill()
    this.connections.delete(language)
  }
}
