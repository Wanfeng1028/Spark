/**
 * MCP 配置（doc/02 §5.1，阶段五工单 5.3 / ADR D16；阶段十九工单 19.4 / ADR D46 扩
 * streamable-http）：~/.spark/mcp.json 可选——声明外部 MCP server（transport 缺省
 * stdio；'streamable-http' 走远程 HTTP）。缺省无文件 = 无外部工具；坏 JSON 或
 * 校验失败 → ConfigError（与三配置文件同纪律：不带病运行）。
 */
import { z } from 'zod'
import { ConfigError, parseOrThrow, readJsonFile } from '../config.js'
import { atomicWriteJson } from '../fsutil.js'
import { MCP_ENV_MASK, type McpConfigInput, type McpTransportKind } from '@spark/protocol'
import { SPARK_FILE, sparkFile } from '../storage/paths.js'

export interface McpServerConfig {
  /** stdio 启动命令（transport 缺省 = 'stdio' 时必填；streamable-http 下不得出现） */
  command?: string | undefined
  /** transport 类型（工单 19.4 / ADR D46）：缺省 stdio（既有配置零变化红线） */
  transport?: McpTransportKind | undefined
  /** streamable-http 远程地址（该 transport 下必填） */
  url?: string | undefined
  /** streamable-http 请求头（鉴权等敏感值；读回按 MCP_ENV_MASK 掩码，同 env 纪律） */
  headers?: Record<string, string> | undefined
  args?: string[] | undefined
  env?: Record<string, string> | undefined
  /** 单 server 连接超时毫秒（RT3-04）：npx 冷启动可超缺省 30s，按 server 覆盖 */
  connectTimeoutMs?: number | undefined
}

export interface McpConfig {
  servers: Record<string, McpServerConfig>
}

/** server 条目按 transport 分支校验（19.4）：stdio（缺省）command 必填；streamable-http
 * url 必填且 command/args/env 不得混写——混写 = 配置错误，拒载不带病运行 */
const serverSchema = z
  .object({
    command: z.string().min(1).optional(),
    transport: z.enum(['stdio', 'streamable-http']).optional(),
    url: z.string().url().optional(),
    headers: z.record(z.string().min(1), z.string()).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string().min(1), z.string()).optional(),
    connectTimeoutMs: z.number().int().positive().max(600_000).optional(),
  })
  .superRefine((s, ctx) => {
    if (s.transport === 'streamable-http') {
      if (s.url === undefined) {
        ctx.addIssue({ code: 'custom', message: 'streamable-http transport 须提供 url（远程 server 地址）' })
      }
      if (s.command !== undefined || s.args !== undefined || s.env !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'streamable-http transport 不接受 command/args/env（stdio 专用字段，混写 = 配置错误）',
        })
      }
      return
    }
    if (s.command === undefined) {
      ctx.addIssue({ code: 'custom', message: 'stdio transport（缺省）须提供 command（启动命令）' })
    }
  })

const mcpSchema = z.object({
  version: z.literal(1),
  servers: z.record(z.string().min(1), serverSchema),
})

/** mcp.json 不存在 → 空表（引擎零外部工具照常启动） */
export function loadMcpConfig(dir: string): McpConfig {
  const raw = readJsonFile(dir, SPARK_FILE.mcp)
  if (raw === undefined) return { servers: {} }
  const parsed = parseOrThrow(mcpSchema, raw, 'mcp.json')
  return { servers: parsed.servers }
}

/** 写回 mcp.json（工单 12.6）：zod 校验后原子写——校验失败抛 ConfigError 不落盘。
 * 运行中改动需重启引擎重连生效（调用方如实提示，禁假状态）。 */
export function writeMcpConfig(dir: string, config: McpConfig): void {
  parseOrThrow(mcpSchema, { version: 1, servers: config.servers }, 'mcp.json')
  atomicWriteJson(sparkFile(dir, 'mcp'), { version: 1, servers: config.servers })
}

/** 读回掩码（RT3-07 / WO-088）：mcp.json → 客户端形状，env/headers 值一律替换为
 * MCP_ENV_MASK 占位（19.4：headers 是新的敏感面，与 env 同纪律）——12.6 的"值只进
 * 不回显"纪律在读回通道上延续：key 结构可见供编辑，明文不出引擎。 */
export function maskMcpConfigForClient(config: McpConfig): McpConfigInput {
  return {
    version: 1,
    servers: Object.fromEntries(
      Object.entries(config.servers).map(([name, s]) => [
        name,
        {
          ...(s.command !== undefined ? { command: s.command } : {}),
          ...(s.transport !== undefined ? { transport: s.transport } : {}),
          ...(s.url !== undefined ? { url: s.url } : {}),
          ...(s.headers !== undefined
            ? { headers: Object.fromEntries(Object.keys(s.headers).map((k) => [k, MCP_ENV_MASK])) }
            : {}),
          ...(s.args !== undefined ? { args: s.args } : {}),
          ...(s.env !== undefined
            ? { env: Object.fromEntries(Object.keys(s.env).map((k) => [k, MCP_ENV_MASK])) }
            : {}),
          ...(s.connectTimeoutMs !== undefined ? { connectTimeoutMs: s.connectTimeoutMs } : {}),
        },
      ]),
    ),
  }
}

/** 掩码值合并（env 与 headers 共用，19.4）：incoming 值 === MCP_ENV_MASK → 取盘上
 * 同 server 同 key 真值（客户端从未见过明文，落盘前替换回来）；无既有真值（新
 * server/新 key）→ ConfigError 拒写（掩码不是值，禁假状态）。明文 → 原样。 */
function resolveMaskedMap(
  incoming: Record<string, string> | undefined,
  prev: Record<string, string> | undefined,
  describe: (key: string) => string,
): Record<string, string> | undefined {
  if (incoming === undefined) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== MCP_ENV_MASK) {
      out[k] = v
      continue
    }
    const real = prev?.[k]
    if (real === undefined) {
      throw new ConfigError(describe(k))
    }
    out[k] = real
  }
  return out
}

/** PUT 合并（RT3-07 / WO-088）：env/headers 掩码占位经 resolveMaskedMap 合并盘上真值；
 * 其余字段以 incoming 为准——整文件写语义不变。 */
export function mergeMaskedMcpConfig(existing: McpConfig, incoming: McpConfigInput): McpConfig {
  const servers: Record<string, McpServerConfig> = {}
  for (const [name, s] of Object.entries(incoming.servers)) {
    const env = resolveMaskedMap(s.env, existing.servers[name]?.env, (k) =>
      `mcp.json：${name} 的 env.${k} 是掩码占位但没有既有值可保留——新值请明文填写`)
    const headers = resolveMaskedMap(s.headers, existing.servers[name]?.headers, (k) =>
      `mcp.json：${name} 的 headers.${k} 是掩码占位但没有既有值可保留——新值请明文填写`)
    servers[name] = {
      ...s,
      ...(env !== undefined ? { env } : {}),
      ...(headers !== undefined ? { headers } : {}),
    }
  }
  return { servers }
}
