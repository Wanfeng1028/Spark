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
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'
import type { SparkLogger } from '../logger.js'
import type { ToolDefinition } from '../tools/definition.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { McpConfig, McpServerConfig } from './config.js'

/** 单 server 连接（spawn + initialize + listTools）的墙钟上限；超时关进程跳过 */
const CONNECT_TIMEOUT_MS = 10_000

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
export function makeMcpToolDef(
  server: string,
  tool: McpToolInfo,
  client: Client,
  toolTimeoutMs: number,
): ToolDefinition<Record<string, unknown>> {
  return {
    name: mcpToolName(server, tool.name),
    description: `[mcp:${server}] ${tool.description ?? tool.name}`,
    inputSchema: z.fromJSONSchema(tool.inputSchema) as unknown as z.ZodType<
      Record<string, unknown>
    >,
    permission: {
      action: 'mcp.call',
      resourceOf: () => `${server}/${tool.name}`,
    },
    parallelizable: false,
    async execute(ctx, input) {
      try {
        const result = (await client.callTool(
          { name: tool.name, arguments: input },
          undefined,
          { signal: ctx.signal, timeout: toolTimeoutMs },
        )) as McpCallResult
        return { output: serializeMcpContent(result), isError: result.isError === true }
      } catch (err) {
        if (ctx.signal.aborted) {
          return { output: { code: 'E_ABORTED' }, isError: true }
        }
        throw new Error(`E_MCP_CALL: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
  }
}

export interface McpManagerDeps {
  config: McpConfig
  /** 缺省不记日志（引擎传入 Logger；单测可省） */
  logger?: SparkLogger
  /** spark.json toolTimeoutMs：callTool 请求级超时 */
  toolTimeoutMs: number
  /** 测试注入 transport 工厂（缺省 stdio spawn） */
  transportFactory?: (server: McpServerConfig) => Transport
}

export class McpManager {
  private readonly clients: Client[] = []
  private closed = false

  constructor(private readonly deps: McpManagerDeps) {}

  /** 逐 server 连接并把工具注册进 registry；单 server 失败 warn 跳过（失败闭合） */
  async connect(registry: ToolRegistry): Promise<void> {
    for (const [name, cfg] of Object.entries(this.deps.config.servers)) {
      const client = new Client({ name: 'spark', version: '0.1.0' })
      try {
        const transport =
          this.deps.transportFactory !== undefined
            ? this.deps.transportFactory(cfg)
            : new StdioClientTransport({
                command: cfg.command,
                ...(cfg.args !== undefined ? { args: cfg.args } : {}),
                ...(cfg.env !== undefined ? { env: cfg.env } : {}),
              })
        await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, name)
        const listed = await client.listTools()
        for (const tool of listed.tools as McpToolInfo[]) {
          registry.register(makeMcpToolDef(name, tool, client, this.deps.toolTimeoutMs))
        }
        this.clients.push(client)
        this.deps.logger?.info('mcp.server.connected', {
          server: name,
          tools: listed.tools.length,
        })
      } catch (err) {
        // 超时/启动失败：关闭半连接（杀掉子进程），该 server 工具不注册
        void client.close().catch(() => {})
        this.deps.logger?.warn('mcp.server.connect.error', { server: name, err })
      }
    }
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
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}
