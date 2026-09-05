/**
 * MCP 配置（doc/02 §5.1，阶段五工单 5.3 / ADR D16）：~/.spark/mcp.json 可选——
 * 声明外部 MCP server（stdio transport）。缺省无文件 = 无外部工具；坏 JSON 或
 * 校验失败 → ConfigError（与三配置文件同纪律：不带病运行）。
 */
import { z } from 'zod'
import { parseOrThrow, readJsonFile } from '../config.js'

export interface McpServerConfig {
  command: string
  args?: string[] | undefined
  env?: Record<string, string> | undefined
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
