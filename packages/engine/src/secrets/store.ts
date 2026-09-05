/**
 * 密钥仓（阶段七工单 7.1 / H01，P0）：~/.spark/secrets.json 的 provider → apiKey 表。
 * - 取用优先级 store > env（resolveApiKey 单点实现；env 配置照常生效 = 迁移兼容）；
 * - 值只经 ResolvedModel 进网关请求——不进事件/日志/DTO（llm-gateway 约定不破）；
 * - 原子写（tmp + rename）+ 0600（Windows 无 chmod 时尽力而为）；
 * - 坏 JSON / 形状不符 → ConfigError（E_CONFIG，与 loadConfig 同纪律：不带病运行）。
 */
import { z } from 'zod'
import { ConfigError, parseOrThrow, readJsonFile } from '../config.js'
import { atomicWriteJson } from '../fsutil.js'
import { basename, dirname } from 'node:path'

const secretsSchema = z.strictObject({
  version: z.literal(1),
  secrets: z.record(z.string().min(1), z.string()),
})

/** 密钥来源（设置页状态展示：store = 密钥仓 / env = 环境变量 / none = 未配置） */
export type SecretSource = 'store' | 'env' | 'none'

export class SecretStore {
  private readonly path: string
  private readonly secrets = new Map<string, string>()

  constructor(path: string) {
    this.path = path
    const raw = readJsonFile(dirname(path), basename(path))
    if (raw === undefined) return
    const parsed = parseOrThrow(secretsSchema, raw, 'secrets.json')
    for (const [k, v] of Object.entries(parsed.secrets)) {
      this.secrets.set(k, v)
    }
  }

  get(provider: string): string | undefined {
    return this.secrets.get(provider)
  }

  has(provider: string): boolean {
    return this.secrets.has(provider)
  }

  /** 新增/覆盖（空值拒绝——"清空"语义走 delete） */
  set(provider: string, value: string): void {
    if (provider.trim() === '') throw new ConfigError('secrets: provider 名不可为空')
    if (value === '') throw new ConfigError('secrets: apiKey 不可为空（清除请用删除）')
    this.secrets.set(provider, value)
    this.persist()
  }

  /** 删除（不存在返回 false——路由层 404） */
  delete(provider: string): boolean {
    if (!this.secrets.delete(provider)) return false
    this.persist()
    return true
  }

  /** 已存 provider 名（不含值——任何 API 都不回传明文） */
  names(): string[] {
    return [...this.secrets.keys()]
  }

  /** 已存密钥值（仅供 Logger 注册脱敏正则；不进任何日志/DTO） */
  values(): string[] {
    return [...this.secrets.values()]
  }

  private persist(): void {
    const doc = {
      version: 1,
      secrets: Object.fromEntries(this.secrets),
    }
    atomicWriteJson(this.path, doc, { mode: 0o600 })
  }
}

/**
 * apiKey 取用单点（工单 7.1 优先级）：store > env > 无。
 * env 参数仅为可测性注入（缺省 process.env）。
 */
export function resolveApiKey(
  secrets: SecretStore,
  provider: string,
  apiKeyEnv: string | null,
  env: Record<string, string | undefined> = process.env,
): { apiKey?: string; source: SecretSource } {
  const fromStore = secrets.get(provider)
  if (fromStore !== undefined && fromStore !== '') {
    return { apiKey: fromStore, source: 'store' }
  }
  if (apiKeyEnv !== null) {
    const v = env[apiKeyEnv]
    if (v !== undefined && v !== '') return { apiKey: v, source: 'env' }
  }
  return { source: 'none' }
}
