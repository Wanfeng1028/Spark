/**
 * MCP 配置（doc/02 §5.1，阶段五工单 5.3 / ADR D16）：~/.spark/mcp.json 可选——
 * 声明外部 MCP server（stdio transport）。缺省无文件 = 无外部工具；坏 JSON 或
 * 校验失败 → ConfigError（与三配置文件同纪律：不带病运行）。
 */
import { z } from 'zod'
import { ConfigError, parseOrThrow, readJsonFile } from '../config.js'
import { join } from 'node:path'
import { atomicWriteJson } from '../fsutil.js'
import { MCP_ENV_MASK, type McpConfigInput } from '@spark/protocol'

export interface McpServerConfig {
  command: string
  args?: string[] | undefined
  env?: Record<string, string> | undefined
  /** 单 server 连接超时毫秒（RT3-04）：npx 冷启动可超缺省 30s，按 server 覆盖 */
  connectTimeoutMs?: number | undefined
}

export interface McpConfig {
  servers: Record<string, McpServerConfig>
}

const mcpSchema = z.object({
  version: z.literal(1),
  servers: z.record(
    z.string().min(1),
    z.object({
      command: z.string().min(1),
      args: z.array(z.string()).optional(),
      env: z.record(z.string().min(1), z.string()).optional(),
      connectTimeoutMs: z.number().int().positive().max(600_000).optional(),
    }),
  ),
})

/** mcp.json 不存在 → 空表（引擎零外部工具照常启动） */
export function loadMcpConfig(dir: string): McpConfig {
  const raw = readJsonFile(dir, 'mcp.json')
  if (raw === undefined) return { servers: {} }
  const parsed = parseOrThrow(mcpSchema, raw, 'mcp.json')
  return { servers: parsed.servers }
}

/** 写回 mcp.json（工单 12.6）：zod 校验后原子写——校验失败抛 ConfigError 不落盘。
 * 运行中改动需重启引擎重连生效（调用方如实提示，禁假状态）。 */
export function writeMcpConfig(dir: string, config: McpConfig): void {
  parseOrThrow(mcpSchema, { version: 1, servers: config.servers }, 'mcp.json')
  atomicWriteJson(join(dir, 'mcp.json'), { version: 1, servers: config.servers })
}

/** 读回掩码（RT3-07 / WO-088）：mcp.json → 客户端形状，env 值一律替换为 MCP_ENV_MASK
 * 占位——12.6 的"值只进不回显"纪律在读回通道上延续：key 结构可见供编辑，明文不出引擎。 */
export function maskMcpConfigForClient(config: McpConfig): McpConfigInput {
  return {
    version: 1,
    servers: Object.fromEntries(
      Object.entries(config.servers).map(([name, s]) => [
        name,
        {
          command: s.command,
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

/** PUT 合并（RT3-07 / WO-088）：incoming env 值 === MCP_ENV_MASK → 取 existing 同 server
 * 同 key 的盘上真值（客户端从未见过明文，落盘前替换回来）；无既有真值（新 server/新 key）
 * → ConfigError 拒写（掩码不是值，禁假状态）。其余字段以 incoming 为准——整文件写语义不变。 */
export function mergeMaskedMcpConfig(existing: McpConfig, incoming: McpConfigInput): McpConfig {
  const servers: Record<string, McpServerConfig> = {}
  for (const [name, s] of Object.entries(incoming.servers)) {
    if (s.env === undefined) {
      servers[name] = s
      continue
    }
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(s.env)) {
      if (v !== MCP_ENV_MASK) {
        env[k] = v
        continue
      }
      const prev = existing.servers[name]?.env?.[k]
      if (prev === undefined) {
        throw new ConfigError(`mcp.json：${name} 的 env.${k} 是掩码占位但没有既有值可保留——新值请明文填写`)
      }
      env[k] = prev
    }
    servers[name] = { ...s, env }
  }
  return { servers }
}
