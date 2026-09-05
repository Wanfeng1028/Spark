/**
 * 配置体系（doc/02 §5.1）：加载 ~/.spark/{spark.json, models.json, permissions.json}。
 * 加载即 zod 校验；失败 = E_CONFIG 启动即败——配置错误不带病运行。
 * 默认值来源 §5.1 jsonc 示例；permissions.json 缺省 = 空规则表（全部落默认 ask）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { EngineSettingsShape, SettingsHooksSchema } from '@spark/protocol'
import type { EngineSettings, ReasoningEffort, SettingsHooks } from '@spark/protocol'
import { errText } from './errs.js'

/** E_CONFIG（§5.10）：进程退出 + stderr 的载体由启动方（server）负责 */
export class ConfigError extends Error {
  readonly code = 'E_CONFIG' as const

  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

// ---- spark.json ----

/**
 * spark.json 顶层。engine 段与 hooks 段的字段定义单一来源 = @spark/protocol（工单 R-B.4：
 * 原两处在此逐字重抄 api.ts，共三份定义漂移风险）。
 * 口径刻意保留现状：`server`/`engine` 用宽松 z.object（未知键剥离 → 该字段落默认值），
 * API 边界另走 protocol 的 strict 版，分档理由见 EngineSettingsShape 注释；
 * `hooks` 复用 protocol SettingsHooksSchema（strictObject，未知挂点名 = E_CONFIG）。
 */
const sparkSchema = z.object({
  version: z.literal(1).optional(),
  server: z
    .object({
      port: z.number().int().min(1).max(65535),
      host: z.string().min(1),
    })
    .partial()
    .optional(),
  engine: EngineSettingsShape.partial().optional(),
  /** 用户侧 hooks（阶段七工单 7.3 / H03）：四挂点 → 外部命令或 skill 触发 */
  hooks: SettingsHooksSchema.optional(),
})

export interface SparkConfig {
  server: { port: number; host: string }
  /** 引擎行为设置九项（字段定义见 protocol EngineSettingsShape；默认值见 SPARK_DEFAULTS） */
  engine: EngineSettings
  /** 用户侧 hooks（工单 7.3；可选——直注入配置的测试夹具可省，引擎侧 `?? {}`） */
  hooks?: SettingsHooks | undefined
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
    checkpoints: true,
    bashSandbox: 'off',
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

/** 工单 7.7：路由档/fallback 链条目（contextWindow 缺省取 defaultModel 的值） */
const routingModelSchema = compactionModelSchema

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
  /** 工单 7.7 / H07：provider fallback 链（主模型不可用且无已交付内容时逐个切换） */
  fallbacks: z.array(routingModelSchema).optional(),
  /** 工单 7.7：标题生成路由档（缺省 compactionModel——§5.11 辅助通道同一模型） */
  titleModel: routingModelSchema.optional(),
  /** 工单 7.7：子代理路由档（缺省 defaultModel） */
  subagentModel: routingModelSchema.optional(),
  /** 工单 7.7：成本上限美元值（usage.costUsd 聚合到阈值即熔断；缺省不限） */
  costLimitUsd: z.number().positive().optional(),
  /** 工单 10.6：推理档位缺省（会话未显式选档时生效；缺省 = 不设置，按 provider 默认） */
  defaultEffort: z.enum(['low', 'medium', 'high']).optional(),
  /** 可选模型清单（工单 6.5）：选择器级联与设置页模型列表的数据源；defaultModel/compactionModel 自动并入 */
  models: z
    .array(
      z.object({
        provider: z.string().min(1),
        model: z.string().min(1),
        contextWindow: z.number().int().positive(),
      }),
    )
    .optional(),
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
  /** 工单 7.7：fallback 链（主模型失败且无已交付内容时逐个切换；空链 = 不切换） */
  fallbacks: ModelRef[]
  /** 工单 7.7：标题生成路由档（缺省 compactionModel） */
  titleModel: ModelRef
  /** 工单 7.7：子代理路由档（缺省 defaultModel） */
  subagentModel: ModelRef
  /** 工单 7.7：成本上限美元值（undefined = 不限） */
  costLimitUsd: number | undefined
  /** 工单 10.6：推理档位缺省（undefined = 不设置，按 provider 默认） */
  defaultEffort: ReasoningEffort | undefined
  /** 显式 models[] + defaultModel/compactionModel 合并去重（provider/model 键） */
  models: ModelRef[]
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

/** 读单个 JSON 文件：不存在 → undefined；坏 JSON / 读失败 → ConfigError（secrets/mcp 等仓复用） */
export function readJsonFile(dir: string, name: string): unknown {
  const path = join(dir, name)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (err) {
    throw new ConfigError(`${name} 不是合法 JSON：${errText(err)}`)
  }
}

/** zod 校验：失败 → ConfigError（带字段路径，便于定位；secrets/mcp 等仓复用） */
export function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, name: string): T {
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
            // 字段级覆盖。逐行 `??` 而不写 `{ ...SPARK_DEFAULTS.engine, ...p.engine }`：
            // 后者运行时等价但 TS 把 spread 里的可选属性推成 `T | undefined`，不得不用 as 兜底。
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
              checkpoints: p.engine?.checkpoints ?? SPARK_DEFAULTS.engine.checkpoints,
              bashSandbox: p.engine?.bashSandbox ?? SPARK_DEFAULTS.engine.bashSandbox,
            },
            hooks: p.hooks, // 工单 7.3：原样透传（undefined = 无挂点）
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
  // 工单 7.7 路由规范化：titleModel 缺省 compactionModel；subagentModel 缺省 defaultModel；
  // fallback 链条目 contextWindow 缺省补 defaultModel 的值
  const withWindow = (m: { provider: string; model: string; contextWindow?: number | undefined }): ModelRef => ({
    provider: m.provider,
    model: m.model,
    contextWindow: m.contextWindow ?? defaultModel.contextWindow,
  })
  const titleModel = modelsParsed.titleModel
    ? withWindow(modelsParsed.titleModel)
    : compactionModel
  const subagentModel = modelsParsed.subagentModel
    ? withWindow(modelsParsed.subagentModel)
    : defaultModel
  const fallbacks = (modelsParsed.fallbacks ?? []).map(withWindow)
  // models[] + defaultModel/compactionModel 合并去重（先显式后自动，首个 contextWindow 生效）
  const merged: ModelRef[] = []
  const seen = new Set<string>()
  const push = (m: ModelRef): void => {
    const key = `${m.provider}/${m.model}`
    if (seen.has(key)) return
    seen.add(key)
    merged.push(m)
  }
  for (const m of modelsParsed.models ?? []) push(m)
  push(defaultModel)
  push(compactionModel)
  push(titleModel)
  push(subagentModel)
  for (const m of fallbacks) push(m)
  const models: ModelsConfig = {
    providers: modelsParsed.providers,
    defaultModel,
    compactionModel,
    fallbacks,
    titleModel,
    subagentModel,
    costLimitUsd: modelsParsed.costLimitUsd,
    defaultEffort: modelsParsed.defaultEffort,
    models: merged,
  }

  // permissions.json：缺省 = 空规则表
  const permRaw = readJsonFile(dir, 'permissions.json')
  const permissions: PermissionsConfig =
    permRaw === undefined
      ? { version: 1, rules: [] }
      : parseOrThrow(permissionsSchema, permRaw, 'permissions.json')

  return { spark, models, permissions }
}

/** 项目级规则文件 <cwd>/.spark/permissions.json（§5.7.1）：不存在 → 空表 */
export function loadProjectRules(cwd: string): PermissionRule[] {
  const raw = readJsonFile(join(cwd, '.spark'), 'permissions.json')
  if (raw === undefined) return []
  return parseOrThrow(permissionsSchema, raw, 'permissions.json').rules
}

/**
 * spark.json 写侧校验（工单 10.20 B / D28）：合并后的 raw 整体过启动同款 schema——
 * 非法补丁在写盘前即拒（fail-closed），磁盘永不落坏配置。
 */
export function validateSparkWrite(raw: unknown): void {
  parseOrThrow(sparkSchema, raw, 'spark.json')
}
