/**
 * 配置体系（doc/02 §5.1）：加载 ~/.spark/{spark.json, models.json, permissions.json}。
 * 加载即 zod 校验；失败 = E_CONFIG 启动即败——配置错误不带病运行。
 * 默认值来源 §5.1 jsonc 示例；permissions.json 缺省 = 空规则表（全部落默认 ask）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

/** E_CONFIG（§5.10）：进程退出 + stderr 的载体由启动方（server）负责 */
export class ConfigError extends Error {
  readonly code = 'E_CONFIG' as const

  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

// ---- spark.json ----

const sparkSchema = z.object({
  version: z.literal(1).optional(),
  server: z
    .object({
      port: z.number().int().min(1).max(65535),
      host: z.string().min(1),
    })
    .partial()
    .optional(),
  engine: z
    .object({
      maxStepsPerTurn: z.number().int().min(1),
      maxToolParallel: z.number().int().min(1),
      toolTimeoutMs: z.number().int().positive(),
      permissionTimeoutMs: z.number().int().positive(),
      progressThrottleMs: z.number().int().positive(),
      toolOutputLimitKB: z.number().int().positive(),
      compactionThreshold: z.number().gt(0).lt(1),
    })
    .partial()
    .optional(),
})

export interface SparkConfig {
  server: { port: number; host: string }
  engine: {
    maxStepsPerTurn: number
    maxToolParallel: number
    toolTimeoutMs: number
    permissionTimeoutMs: number
    progressThrottleMs: number
    toolOutputLimitKB: number
    compactionThreshold: number
  }
}

const SPARK_DEFAULTS: SparkConfig = {
  server: { port: 4318, host: '127.0.0.1' },
  engine: {
    maxStepsPerTurn: 40,
    maxToolParallel: 8,
    toolTimeoutMs: 120_000,
    permissionTimeoutMs: 300_000,
    progressThrottleMs: 200,
    toolOutputLimitKB: 32,
    compactionThreshold: 0.8,
  },
}

// ---- models.json ----

const modelRefSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
})

const defaultModelSchema = modelRefSchema.extend({
  contextWindow: z.number().int().positive(),
})

const compactionModelSchema = modelRefSchema.extend({
  contextWindow: z.number().int().positive().optional(),
})

const modelsSchema = z.object({
  providers: z.record(
    z.string().min(1),
    z.object({
      apiKeyEnv: z.string().min(1).nullable(),
      baseUrl: z.url().optional(),
    }),
  ),
  defaultModel: defaultModelSchema,
  compactionModel: compactionModelSchema.optional(),
})

export interface ModelRef {
  provider: string
  model: string
  contextWindow: number
}

export interface ModelsConfig {
  providers: Record<string, { apiKeyEnv: string | null; baseUrl?: string | undefined }>
  defaultModel: ModelRef
  compactionModel: ModelRef
}

// ---- permissions.json ----

const permissionsSchema = z.object({
  version: z.literal(1),
  rules: z.array(
    z.object({
      action: z.string().min(1),
      resource: z.string().min(1),
      effect: z.enum(['allow', 'deny', 'ask']),
    }),
  ),
})

export interface PermissionRule {
  action: string
  resource: string
  effect: 'allow' | 'deny' | 'ask'
}

export interface PermissionsConfig {
  version: 1
  rules: PermissionRule[]
}

export interface EngineConfig {
  spark: SparkConfig
  models: ModelsConfig
  permissions: PermissionsConfig
}

/** 读单个 JSON 文件：不存在 → undefined；坏 JSON / 读失败 → ConfigError */
function readJsonFile(dir: string, name: string): unknown {
  const path = join(dir, name)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (err) {
    throw new ConfigError(`${name} 不是合法 JSON：${err instanceof Error ? err.message : String(err)}`)
  }
}

/** zod 校验：失败 → ConfigError（带字段路径，便于定位） */
function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, name: string): T {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ')
    throw new ConfigError(`${name} 校验失败：${issues}`)
  }
  return result.data
}

/**
 * 加载三配置文件。dir 缺省 ~/.spark。
 * - spark.json / permissions.json 可不存在（取默认 / 空规则表）；
 * - models.json 的 defaultModel 必填——文件缺失或校验失败 → ConfigError（E_CONFIG）。
 * - compactionModel 可缺省：fallback 到 defaultModel（文档未明说缺省行为，最小合理实现）。
 */
export function loadConfig(dir: string = join(homedir(), '.spark')): EngineConfig {
  // spark.json：合并默认值（字段级覆盖）
  const sparkRaw = readJsonFile(dir, 'spark.json')
  const spark: SparkConfig =
    sparkRaw === undefined
      ? SPARK_DEFAULTS
      : (() => {
          const p = parseOrThrow(sparkSchema, sparkRaw, 'spark.json')
          return {
            server: {
              port: p.server?.port ?? SPARK_DEFAULTS.server.port,
              host: p.server?.host ?? SPARK_DEFAULTS.server.host,
            },
            engine: {
              maxStepsPerTurn: p.engine?.maxStepsPerTurn ?? SPARK_DEFAULTS.engine.maxStepsPerTurn,
              maxToolParallel: p.engine?.maxToolParallel ?? SPARK_DEFAULTS.engine.maxToolParallel,
              toolTimeoutMs: p.engine?.toolTimeoutMs ?? SPARK_DEFAULTS.engine.toolTimeoutMs,
              permissionTimeoutMs: p.engine?.permissionTimeoutMs ?? SPARK_DEFAULTS.engine.permissionTimeoutMs,
              progressThrottleMs: p.engine?.progressThrottleMs ?? SPARK_DEFAULTS.engine.progressThrottleMs,
              toolOutputLimitKB: p.engine?.toolOutputLimitKB ?? SPARK_DEFAULTS.engine.toolOutputLimitKB,
              compactionThreshold: p.engine?.compactionThreshold ?? SPARK_DEFAULTS.engine.compactionThreshold,
            },
          }
        })()

  // models.json：defaultModel 必填；compactionModel 缺省 fallback
  const modelsRaw = readJsonFile(dir, 'models.json')
  if (modelsRaw === undefined) {
    throw new ConfigError('models.json 缺失：defaultModel 必填（E_CONFIG）')
  }
  const modelsParsed = parseOrThrow(modelsSchema, modelsRaw, 'models.json')
  const defaultModel: ModelRef = modelsParsed.defaultModel
  const compactionModel: ModelRef = modelsParsed.compactionModel
    ? { ...modelsParsed.compactionModel, contextWindow: modelsParsed.compactionModel.contextWindow ?? defaultModel.contextWindow }
    : defaultModel
  const models: ModelsConfig = {
    providers: modelsParsed.providers,
    defaultModel,
    compactionModel,
  }

  // permissions.json：缺省 = 空规则表
  const permRaw = readJsonFile(dir, 'permissions.json')
  const permissions: PermissionsConfig =
    permRaw === undefined
      ? { version: 1, rules: [] }
      : parseOrThrow(permissionsSchema, permRaw, 'permissions.json')

  return { spark, models, permissions }
}
