/**
 * LSP 配置（工单 16.9 / doc/02 §5.1）：~/.spark/lsp.json 可选——声明语言 → stdio 语言服务器。
 * v1 手写配置无自动发现（同 mcp.json 纪律）：缺省无文件 = 未配置（工具执行期 E_LSP_UNCONFIGURED
 * fail-closed）；坏 JSON 或校验失败 → ConfigError（不带病运行）。
 * 每次连接前重读配置并比对 per-server config hash（qwen configHash 同口径：键排序 JSON 的
 * sha256）——hash 不变且进程存活即复用连接，**不重启进程**（必抄安全细节之二）。
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { parseOrThrow, readJsonFile } from '../config.js'

export interface LspServerEntry {
  command: string
  args?: string[] | undefined
}

export interface LspConfig {
  languages: Record<string, LspServerEntry>
}

const lspSchema = z.object({
  version: z.literal(1),
  languages: z.record(
    z.string().min(1),
    z.strictObject({
      command: z.string().min(1),
      args: z.array(z.string()).optional(),
    }),
  ),
})

/** lsp.json 不存在 → null（未配置）；存在但坏 → ConfigError（同 mcp.json 纪律） */
export function loadLspConfig(dir: string): LspConfig | null {
  const raw = readJsonFile(dir, 'lsp.json')
  if (raw === undefined) return null
  const parsed = parseOrThrow(lspSchema, raw, 'lsp.json')
  return { languages: parsed.languages }
}

/** 排序 JSON → 稳定序列化（qwen sortJsonValue 同款；Object.create(null) 防 __proto__ 污染） */
function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (value !== null && typeof value === 'object') {
    const sorted = Object.create(null) as Record<string, unknown>
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJsonValue((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

/** per-server 配置 hash（qwen lspServerConfigHash 同口径）：排序 JSON 的 sha256 */
export function lspServerConfigHash(entry: LspServerEntry): string {
  return createHash('sha256').update(JSON.stringify(sortJsonValue(entry))).digest('hex')
}
