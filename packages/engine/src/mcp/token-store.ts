/**
 * MCP OAuth 令牌仓（CK-5 批 2）：~/.spark/mcp-tokens.json 的 server → token set。
 * - 0o600 + 原子写，与 secrets.json 同口径（accessToken/refreshToken 是明文凭据，
 *   文件权限收紧）；值不进事件/DTO/日志（refreshToken 只在刷新请求中出现）；
 * - 坏 JSON / 形状不符 → ConfigError（E_CONFIG，不带病运行——同 secrets 纪律）；
 * - 判据与装配分离：本仓只管存取，OAuth 流程在 oauth.ts 与 manager 装配层。
 */
import { basename, dirname } from 'node:path'
import { z } from 'zod'
import { ConfigError, parseOrThrow, readJsonFile } from '../config.js'
import { atomicWriteJson } from '../fsutil.js'

export const storedTokenSetSchema = z.strictObject({
  /** 静态 client_id（mcp.json 配置）或动态注册所得 */
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  /** 绝对到期毫秒；server 未给 expires_in 时缺省（每次调用前 401 再重授权） */
  expiresAt: z.number().int().positive().optional(),
  scope: z.string().optional(),
})

const tokensFileSchema = z.strictObject({
  version: z.literal(1),
  tokens: z.record(z.string().min(1), storedTokenSetSchema),
})

export type StoredTokenSet = z.infer<typeof storedTokenSetSchema>

export class McpTokenStore {
  private readonly path: string
  private readonly tokens = new Map<string, StoredTokenSet>()

  constructor(path: string) {
    this.path = path
    const raw = readJsonFile(dirname(path), basename(path))
    if (raw === undefined) return
    const parsed = parseOrThrow(tokensFileSchema, raw, 'mcp-tokens.json')
    for (const [server, set] of Object.entries(parsed.tokens)) {
      this.tokens.set(server, set)
    }
  }

  get(server: string): StoredTokenSet | undefined {
    return this.tokens.get(server)
  }

  /** 新增/覆盖（整组替换——刷新后旧 refreshToken 作废是 server 侧语义） */
  set(server: string, set: StoredTokenSet): void {
    if (server.trim() === '') throw new ConfigError('mcp-tokens: server 名不可为空')
    const parsed = storedTokenSetSchema.parse(set)
    this.tokens.set(server, parsed)
    this.persist()
  }

  /** 删除（重授权/卸载 server 时清场；不存在返回 false） */
  delete(server: string): boolean {
    if (!this.tokens.delete(server)) return false
    this.persist()
    return true
  }

  /** 已存 server 名（不含任何凭据值） */
  names(): string[] {
    return [...this.tokens.keys()]
  }

  private persist(): void {
    atomicWriteJson(
      this.path,
      { version: 1, tokens: Object.fromEntries(this.tokens) },
      { mode: 0o600 },
    )
  }
}
