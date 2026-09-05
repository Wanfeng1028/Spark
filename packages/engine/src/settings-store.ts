/**
 * 设置与路由持久化（工单 R-D 第④刀：自 engine.ts 拆出）。
 * - SettingsStore：模型路由状态的所有权（fallback 链 + 任务路由档 + 成本上限，
 *   就地可变——已装接线闭包持同一引用热生效）与 models.json 写回（重启延续）；
 * - persistSparkPatch：spark.json 部分字段更新（D28 写纪律，fail-closed）——
 *   合并 raw → 启动同款 schema 再校验 → 原子写盘 → 重载 config。
 *   校验/写盘失败 → 内存与磁盘都不动（调用方捕获，EngineConfig 不换）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RoutingDto, RoutingUpdate, SettingsUpdate } from '@spark/protocol'
import { loadConfig, validateSparkWrite, type EngineConfig, type ModelRef } from './config.js'
import type { ResolvedModel } from './llm-gateway.js'
import { atomicWriteJson } from './fsutil.js'
import { errText } from './errs.js'
import type { CostTracker } from './cost-tracker.js'
import type { SparkLogger } from './logger.js'

/** 模型路由状态（ResolvedModel 化；updateRouting 就地改属性不换对象） */
export interface RoutingState {
  fallbacks: ResolvedModel[]
  compactionModel: ResolvedModel
  titleModel: ResolvedModel
  subagentModel: ResolvedModel
  costLimitUsd: number | undefined
}

/** 引擎侧模型解析链（resolveModelRef：字符串 → ModelRef；resolveModel：ModelRef → 解析结果） */
export interface ModelResolvers {
  resolveModelRef: (model: string) => ModelRef
  resolveModel: (ref: ModelRef) => ResolvedModel
}

export class SettingsStore {
  readonly routing: RoutingState

  constructor(
    private readonly root: string,
    private readonly logger: SparkLogger,
    private readonly costTracker: CostTracker,
    private readonly resolvers: ModelResolvers,
    config: EngineConfig,
  ) {
    this.routing = {
      fallbacks: config.models.fallbacks.map((r) => resolvers.resolveModel(r)),
      compactionModel: resolvers.resolveModel(config.models.compactionModel),
      titleModel: resolvers.resolveModel(config.models.titleModel),
      subagentModel: resolvers.resolveModel(config.models.subagentModel),
      costLimitUsd: config.models.costLimitUsd,
    }
  }

  /** GET /api/routing：路由状态 + 成本累计（apiKey 永不进 DTO） */
  getRouting(): RoutingDto {
    const spend = this.costTracker.spend()
    const id = (m: ResolvedModel): string => `${m.provider}/${m.model}`
    return {
      fallbacks: this.routing.fallbacks.map(id),
      compactionModel: id(this.routing.compactionModel),
      titleModel: id(this.routing.titleModel),
      subagentModel: id(this.routing.subagentModel),
      costLimitUsd: this.routing.costLimitUsd ?? null,
      usage: {
        costUsd: spend.costUsd,
        inputTokens: spend.inputTokens,
        outputTokens: spend.outputTokens,
        exceeded: this.costTracker.exceeded(this.routing.costLimitUsd),
      },
    }
  }

  /**
   * PUT /api/routing 的路由面：热更新（就地改 routing 属性——已装接线闭包下一请求生效）。
   * 形状/provider 未配置 → E_CONFIG（400）；通过后写回 models.json（重启延续）。
   */
  updateRouting(patch: RoutingUpdate): RoutingDto {
    if (patch.fallbacks !== undefined) {
      this.routing.fallbacks = patch.fallbacks.map((m) => this.resolvers.resolveModel(this.resolvers.resolveModelRef(m)))
    }
    if (patch.compactionModel !== undefined) {
      this.routing.compactionModel = this.resolvers.resolveModel(this.resolvers.resolveModelRef(patch.compactionModel))
    }
    if (patch.titleModel !== undefined) {
      this.routing.titleModel = this.resolvers.resolveModel(this.resolvers.resolveModelRef(patch.titleModel))
    }
    if (patch.subagentModel !== undefined) {
      this.routing.subagentModel = this.resolvers.resolveModel(this.resolvers.resolveModelRef(patch.subagentModel))
    }
    if (patch.costLimitUsd !== undefined) {
      this.routing.costLimitUsd = patch.costLimitUsd ?? undefined
    }
    this.persistRouting()
    this.logger.info('routing.update', {
      fallbacks: this.routing.fallbacks.length,
      costLimitUsd: this.routing.costLimitUsd ?? null,
    })
    return this.getRouting()
  }

  /** DELETE /api/routing/usage：清零成本累计（解除熔断的唯一入口） */
  resetUsage(): RoutingDto {
    this.costTracker.reset()
    this.logger.info('routing.usage.reset')
    return this.getRouting()
  }

  /** 路由字段写回 models.json（原子写；其余字段原样保留） */
  private persistRouting(): void {
    const path = join(this.root, 'models.json')
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    } catch (err) {
      // 不兜底重写空文档——那会抹掉 providers/defaultModel；内存已更新，持久化显式失败
      throw new Error(
        `E_CONFIG: models.json 读取失败，路由配置仅内存生效未持久化：${errText(err)}`,
      )
    }
    const doc = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const toRef = (m: ResolvedModel): { provider: string; model: string; contextWindow: number } => ({
      provider: m.provider,
      model: m.model,
      contextWindow: m.contextWindow,
    })
    doc.fallbacks = this.routing.fallbacks.map(toRef)
    doc.compactionModel = toRef(this.routing.compactionModel)
    doc.titleModel = toRef(this.routing.titleModel)
    doc.subagentModel = toRef(this.routing.subagentModel)
    if (this.routing.costLimitUsd === undefined) delete doc.costLimitUsd
    else doc.costLimitUsd = this.routing.costLimitUsd
    atomicWriteJson(path, doc)
  }
}

/**
 * PUT /api/settings 的写盘面（D28 fail-closed）：spark.json 不存在按空文档起底，
 * 三域（server/engine/hooks）逐域合并，hooks 的 null 语义 = 删除该域。
 * 成功返回重载后的 config（热档字段下一 turn 生效；重启档构造期注入不受影响）。
 */
export function persistSparkPatch(root: string, patch: SettingsUpdate): EngineConfig {
  const sparkPath = join(root, 'spark.json')
  let raw: Record<string, unknown> = {}
  if (existsSync(sparkPath)) {
    try {
      raw = JSON.parse(readFileSync(sparkPath, 'utf8')) as Record<string, unknown>
    } catch (err) {
      throw new Error(`E_CONFIG: spark.json 不是合法 JSON：${errText(err)}`)
    }
  }
  if (patch.server !== undefined) {
    const cur = (raw['server'] as Record<string, unknown> | undefined) ?? {}
    raw['server'] = { ...cur, ...patch.server }
  }
  if (patch.engine !== undefined) {
    const cur = (raw['engine'] as Record<string, unknown> | undefined) ?? {}
    raw['engine'] = { ...cur, ...patch.engine }
  }
  if (patch.hooks !== undefined) {
    if (patch.hooks === null) delete raw['hooks']
    else raw['hooks'] = patch.hooks
  }
  validateSparkWrite(raw)
  atomicWriteJson(sparkPath, raw)
  return loadConfig(root)
}
