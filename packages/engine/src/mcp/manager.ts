/**
 * MCP client（阶段五工单 5.3 / ADR D16）：外部 MCP server 的工具注册进
 * ToolRegistry，与内置四工具同一六要素、同一管线——审批（mcp.call/`<server>/<tool>`，
 * 默认 ask）、限界溢写、事件纪律全部免费复用。
 *
 * - 命名 `mcp__<server>__<tool>`（register 重复名抛错兜底与内置冲突）；
 * - parallelizable=false：外部进程副作用不透明，串行 barrier（dsh exclusive 语义）；
 * - 失败闭合：单 server 连接失败只 warn 跳过（该 server 工具不注册，引擎照常启动）；
 *   工具调用失败 → E_MCP_CALL；turn 中断 → E_ABORTED；
 * - 输出：text content 拼接为字符串（无文本回落 structuredContent/占位），
 *   限界与溢写文件由管线 bound 统一处理。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'
import { asError, errText } from '../errs.js'
import { sanitizeUnicodeDeep } from '../tools/unicode-sanitize.js'
import type { SparkLogger } from '../logger.js'
import type { ToolDefinition } from '../tools/definition.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { McpConfig, McpServerConfig } from './config.js'

/** 单 server 连接（spawn + initialize + listTools）的墙钟上限；超时关进程跳过。
 * RT3-04：10s → 30s 缺省——npx 冷启动（首次拉包）普遍超 10s；个别 server 可经
 * mcp.json `connectTimeoutMs` 覆盖（上限 600s，zod 校验） */
const CONNECT_TIMEOUT_MS = 30_000

/** listTools 条目中引擎消费的字段（SDK 类型宽，收敛成窄形状） */
interface McpToolInfo {
  name: string
  description?: string
  inputSchema: { type: 'object' } & Record<string, unknown>
}

/** callTool 结果中引擎消费的最小形状 */
interface McpCallResult {
  content?: Array<{ type: string; text?: string }>
  structuredContent?: unknown
  isError?: boolean
}

export function mcpToolName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`
}

/** 缺省 transport 工厂（工单 19.4 / ADR D46）：transport = 'streamable-http' →
 * StreamableHTTPClientTransport（url 连接，headers 经 requestInit 注入——鉴权头不出
 * 配置文件即达服务端）；其余（缺省 'stdio'）→ StdioClientTransport 原语义。
 * schema（config.ts superRefine）已按 transport 分支校验必填；此处判空兜底抛错，
 * 由 connect() 的失败闭合（warn 跳过）承接，不带病运行。 */
export function defaultTransport(name: string, cfg: McpServerConfig, proxyEnv?: () => Record<string, string> | undefined): Transport {
  if (cfg.transport === 'streamable-http') {
    if (cfg.url === undefined) {
      throw new Error(`MCP server ${name} 配置缺 url（streamable-http transport 必填）`)
    }
    const opts: ConstructorParameters<typeof StreamableHTTPClientTransport>[1] = {
      requestInit: {
        ...(cfg.headers !== undefined ? { headers: cfg.headers } : {}),
      },
    }
    // SDK 1.30 d.ts 在 exactOptionalPropertyTypes 下类与 Transport 接口可选成员失配——
    // 运行时同源实现，显式断言收口（错配仅为类型层，无行为差异）
    return new StreamableHTTPClientTransport(new URL(cfg.url), opts) as Transport
  }
  if (cfg.command === undefined) {
    throw new Error(`MCP server ${name} 配置缺 command（stdio transport 必填）`)
  }
  // 全局出网代理（阶段十九 19.13，翻案 12.9"仅 LLM 面"）：spark.json network.proxy/noProxy
  // 以 env 注入子进程（MCP server 自己发起的请求才走代理——尊重环境变量的客户端才生效）。
  // 用户显式写的 cfg.env 优先（同键不覆盖——用户配置是更具体的意图）。
  const injected = proxyEnv?.()
  const merged =
    injected !== undefined && cfg.env !== undefined
      ? { ...injected, ...cfg.env }
      : (injected ?? cfg.env)
  return new StdioClientTransport({
    command: cfg.command,
    ...(cfg.args !== undefined ? { args: cfg.args } : {}),
    ...(merged !== undefined ? { env: merged } : {}),
  })
}

/** MCP content → 模型可读字符串：text 拼接 → structuredContent JSON → 占位 */
export function serializeMcpContent(result: McpCallResult): string {
  const texts = (result.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
  if (texts.length > 0) return texts.join('\n')
  if (result.structuredContent !== undefined) {
    return JSON.stringify(result.structuredContent)
  }
  return '(MCP 工具无文本输出)'
}

/** 单个 MCP 工具 → ToolDefinition（六要素与内置工具同构） */
/** 工具描述截断上限（CK-5 批 1 ①；Claude Code MAX_MCP_DESCRIPTION_LENGTH 同值——防 OpenAPI 型 server 挤爆上下文） */
export const MAX_MCP_DESCRIPTION_LENGTH = 2048
/** needs-auth 缓存窗口（CK-5 批 1 ②；Claude Code mcp-needs-auth-cache 同值 15min——防并发刷认证雪崩） */
export const MCP_AUTH_CACHE_MS = 15 * 60 * 1000

/** needs-auth 特征（进缓存短路表的错误形态） */
const NEEDS_AUTH_RE = /(\b401\b|\b403\b|unauthorized|forbidden|needs?[ _-]?auth|not[ _-]authenticated|authentication required)/i
/** 会话过期特征（可重连形态；Claude Code isMcpSessionExpiredError 同集：HTTP 404 / JSON-RPC -32001） */
const SESSION_EXPIRED_RE = /(\b404\b|session.{0,20}expired|expired.{0,20}session|-32001)/i

/** 认证/重连闸（manager 闭包注入；工具定义无状态） */
export interface McpAuthGate {
  /** ② 短路期内 → true（调用直接拒，不发请求） */
  isAuthCached(server: string): boolean
  /** ② 标记进入 15min 短路 */
  markNeedsAuth(server: string): void
  /** ③ 会话过期重连（true = 连接已重建——本次调用如实报 E_MCP_RECONNECTED，模型下一步用新绑定） */
  reconnect(server: string): Promise<boolean>
}

export function makeMcpToolDef(
  server: string,
  tool: McpToolInfo,
  client: Client,
  toolTimeoutMs: number,
  gate?: McpAuthGate,
): ToolDefinition<Record<string, unknown>> {
  const rawDescription = `[mcp:${server}] ${tool.description ?? tool.name}`
  const description =
    rawDescription.length > MAX_MCP_DESCRIPTION_LENGTH
      ? `${rawDescription.slice(0, MAX_MCP_DESCRIPTION_LENGTH)}…[截断]`
      : rawDescription
  const handleFailure = async (kind: 'auth' | 'expired', msg: string): Promise<ToolOutput> => {
    if (kind === 'auth') {
      gate?.markNeedsAuth(server)
      return {
        output: { code: 'E_MCP_NEEDS_AUTH', message: `server ${server} 需要认证：${msg}` },
        isError: true,
      }
    }
    // ③ 会话过期 → 重建连接（本次调用如实报已重连；模型下一步经新绑定自然重试——
    // 当前闭包仍持旧 client，就地重试必然再次失败，不做假成功）
    const reconnected = (await gate?.reconnect(server)) ?? false
    if (reconnected) {
      return {
        output: {
          code: 'E_MCP_RECONNECTED',
          message: `server ${server} 会话已过期，连接已重建——请重试本工具`,
        },
        isError: true,
      }
    }
    return { output: { code: 'E_MCP_CALL', message: msg }, isError: true }
  }

  return {
    name: mcpToolName(server, tool.name),
    description,
    inputSchema: z.fromJSONSchema(tool.inputSchema) as unknown as z.ZodType<
      Record<string, unknown>
    >,
    permission: {
      action: 'mcp.call',
      resourceOf: () => `${server}/${tool.name}`,
    },
    parallelizable: false,
    async execute(ctx, input) {
      // ② needs-auth 缓存短路：15min 内同 server 全部工具直接拒（防百级并发同时刷认证雪崩）
      if (gate?.isAuthCached(server) === true) {
        return {
          output: {
            code: 'E_MCP_AUTH_CACHED',
            message: `server ${server} 认证失败被缓存（15 分钟内跳过调用）——请修复认证配置后重试或联系用户`,
          },
          isError: true,
        }
      }
      // ②③ 失败分类双通道：传输层异常走 catch，协议层 isError result（server 工具
      // handler 异常被 SDK 包装、文本含错误、不进 catch）同走 classify/handleFailure
      const classify = (text: string): 'auth' | 'expired' | undefined => {
        if (NEEDS_AUTH_RE.test(text)) return 'auth'
        if (SESSION_EXPIRED_RE.test(text)) return 'expired'
        return undefined
      }
      try {
        const result = (await client.callTool(
          // CK-9：入参消毒（模型 → 外部 server 方向；出参方向由管线 IoGuard 覆盖）
          { name: tool.name, arguments: sanitizeUnicodeDeep(input).value },
          undefined,
          { signal: ctx.signal, timeout: toolTimeoutMs },
        )) as McpCallResult
        const text = serializeMcpContent(result)
        if (result.isError === true) {
          const text2 = typeof text === 'string' ? text : JSON.stringify(text)
          const kind = classify(text2)
          if (kind !== undefined) return await handleFailure(kind, text2)
          return { output: text, isError: true }
        }
        return { output: text, isError: false }
      } catch (err) {
        if (ctx.signal.aborted) {
          return { output: { code: 'E_ABORTED' }, isError: true }
        }
        const msg = errText(err)
        const kind = classify(msg)
        if (kind !== undefined) return await handleFailure(kind, msg)
        // 未分类失败：如实闭合（不穿透 execute）
        return { output: { code: 'E_MCP_CALL', message: msg }, isError: true }
      }
    },
  }
}

export interface McpManagerDeps {
  config: McpConfig
  /** CK-5：时钟（测试注入；缺省 Date.now） */
  now?: () => number
  /** 缺省不记日志（引擎传入 Logger；单测可省） */
  logger?: SparkLogger
  /** spark.json toolTimeoutMs：callTool 请求级超时 */
  toolTimeoutMs: number
  /** 测试注入 transport 工厂（缺省 stdio spawn） */
  transportFactory?: (server: McpServerConfig) => Transport
  /** 全局出网代理 env（阶段十九 19.13）：getter 现读 spark.json network；undefined = 不注入 */
  proxyEnv?: () => Record<string, string> | undefined
}

export class McpManager {
  private readonly clients: Client[] = []
  /** 各 server 连接结果快照（工单 7.4：GET /api/mcp 只读数据源；失败也列出） */
  private readonly serverStatuses: { name: string; connected: boolean; tools: number; command: string }[] = []
  /** CK-5 ②：needs-auth 短路表（server → 截至 ms；15min 窗口） */
  private readonly authCachedUntil = new Map<string, number>()
  private closed = false

  constructor(private readonly deps: McpManagerDeps) {
    // LA-23：server env/headers 的明文值纳入日志脱敏（与 secrets 仓同口径——
    // 这些值会经 spawn env / HTTP headers 出引擎，出错回显不能落日志明文）
    const secretValues: string[] = []
    for (const cfg of Object.values(this.deps.config.servers)) {
      for (const v of Object.values(cfg.env ?? {})) {
        if (v.length >= 6) secretValues.push(v)
      }
      for (const v of Object.values(cfg.headers ?? {})) {
        if (v.length >= 6) secretValues.push(v)
      }
    }
    if (secretValues.length > 0) this.deps.logger?.registerSecrets?.(secretValues)
  }

  /** 逐 server 连接并把工具注册进 registry；单 server 失败 warn 跳过（失败闭合） */
  async connect(registry: ToolRegistry): Promise<void> {
    for (const [name, cfg] of Object.entries(this.deps.config.servers)) {
      await this.connectOne(name, cfg, registry, 'push')
    }
  }

  /** CK-5 ③：单 server 会话过期重连（registry.replace 换绑工具到新 client） */
  private async reconnectServer(name: string, registry: ToolRegistry): Promise<boolean> {
    const cfg = this.deps.config.servers[name]
    if (cfg === undefined) return false
    // 旧 client 先关（clients 与 statuses 同序 push——按名定位）
    const idx = this.serverStatuses.findIndex((s) => s.name === name)
    if (idx >= 0 && idx < this.clients.length) {
      const oldClient = this.clients[idx]
      if (oldClient !== undefined) void oldClient.close().catch(() => {})
      this.clients.splice(idx, 1)
    }
    return this.connectOne(name, cfg, registry, 'replace')
  }

  /**
   * 连接单 server：push 模式 = 首次 connect（append 状态/clients）；
   * replace 模式 = 会话过期重连（关旧 client、状态与 client 按名替换、工具
   * registry.replace 换绑——工具定义闭包从旧 client 换到新 client）。
   */
  private async connectOne(
    name: string,
    cfg: McpServerConfig,
    registry: ToolRegistry,
    mode: 'push' | 'replace',
  ): Promise<boolean> {
    const client = new Client({ name: 'spark', version: '0.1.0' })
    const gate: McpAuthGate = {
      isAuthCached: (server) => {
        const until = this.authCachedUntil.get(server)
        return until !== undefined && until > (this.deps.now ?? Date.now)()
      },
      markNeedsAuth: (server) => {
        this.authCachedUntil.set(server, (this.deps.now ?? Date.now)() + MCP_AUTH_CACHE_MS)
      },
      reconnect: (server) => this.reconnectServer(server, registry),
    }
    try {
      const transport =
        this.deps.transportFactory !== undefined
          ? this.deps.transportFactory(cfg)
          : defaultTransport(name, cfg, this.deps.proxyEnv)
      await withTimeout(client.connect(transport), cfg.connectTimeoutMs ?? CONNECT_TIMEOUT_MS, name)
      const listed = await client.listTools()
      for (const tool of listed.tools as McpToolInfo[]) {
        const def = makeMcpToolDef(name, tool, client, this.deps.toolTimeoutMs, gate)
        if (mode === 'push') registry.register(def)
        else registry.replace(mcpToolName(name, tool.name), def)
      }
      const status = {
        name,
        connected: true,
        tools: listed.tools.length,
        command: cfg.command ?? cfg.url ?? '',
      }
      if (mode === 'push') {
        this.clients.push(client)
        this.serverStatuses.push(status)
      } else {
        // replace：statuses 按名替换；clients 由 reconnectServer 已 splice 旧条目，push 新句柄
        const idx = this.serverStatuses.findIndex((s) => s.name === name)
        if (idx >= 0) this.serverStatuses[idx] = status
        this.clients.push(client)
      }
      this.deps.logger?.info('mcp.server.connected', {
        server: name,
        tools: listed.tools.length,
        ...(mode === 'replace' ? { reconnected: true } : {}),
      })
      return true
    } catch (err) {
      // 超时/启动失败：关闭半连接（杀掉子进程），push 模式不注册；replace 模式保留旧绑定失效现状
      void client.close().catch(() => {})
      if (mode === 'push') {
        this.serverStatuses.push({ name, connected: false, tools: 0, command: cfg.command ?? cfg.url ?? '' })
      }
      this.deps.logger?.warn('mcp.server.connect.error', { server: name, err })
      return false
    }
  }

  /** 各 server 连接状态（connect 前为空；失败 server 也列出 connected:false） */
  status(): readonly { name: string; connected: boolean; tools: number; command: string }[] {
    return this.serverStatuses
  }

  /** 优雅退出：关闭全部 client（stdio 即终止子进程）；幂等 */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await Promise.allSettled(this.clients.map((c) => c.close()))
  }
}

function withTimeout(p: Promise<unknown>, ms: number, server: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`MCP server ${server} 连接超时（${ms}ms）`)),
      ms,
    )
    p.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(asError(err))
      },
    )
  })
}
