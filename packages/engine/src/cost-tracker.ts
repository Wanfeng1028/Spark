/**
 * 成本计量与看板数据源（阶段七工单 7.7 / H07；阶段十三工单 13.6 扩展明细桶）：
 * `~/.spark/usage.json` 持久化——**总账**（权威，熔断判据）+ 按 {day, provider, model}
 * 聚合的**明细桶**（看板数据源）。
 *
 * - 累计来源：run-loop 每步 stream 结果的 usage（含 error/aborted 步——调用量本身就是
 *   成本）；压缩/标题的 generateOnce usage 不计（OnceRequest 不回传 usage，§5.8.5 v1 口径）；
 * - **向后兼容旧平铺格式**：`{costUsd, inputTokens, outputTokens}` 直接读入（version /
 *   buckets / cache 分量均可选）——旧账留在总账里但**没有明细**，summary() 以 `unbucketed`
 *   如实呈现差额（总账 − 明细合计），**不伪造明细**；下一次 add 即写回 v2 形状；
 * - 坏 JSON / 形状不符 → ConfigError（E_CONFIG，与 loadConfig 同纪律，不带病运行）；
 * - 归因口径：桶的 provider/model = 会话当前档（fallback 切换的那一步仍记在会话档名下——
 *   StreamResult 不回传实际服务方，如实标注局限）；day = **本地日历日**（时钟可注入，测试确定）；
 * - exceeded(limit)：limit undefined = 不限；总账 costUsd ≥ limit 即熔断（≥ 而非 >——
 *   阈值语义"花到这个数就停"）；
 * - reset()：总账与明细一并归零（DELETE /api/routing/usage 是解除熔断的唯一入口）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Usage } from '@spark/protocol'
import { ConfigError } from './config.js'
import { errText } from './errs.js'
import { atomicWriteJson } from './fsutil.js'

/** 总账（含 cache 两分量——opencode 契约：nonCachedInput + cacheRead + cacheWrite = inputTokens） */
export interface UsageTotal {
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
}

/** 明细桶：一日 × 一 provider × 一 model */
export interface UsageBucket {
  /** 本地日历日 YYYY-MM-DD */
  day: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
}

/** add() 的归因维度（day 由 tracker 自己的时钟派生） */
export interface UsageDims {
  provider: string
  model: string
}

const ZERO_TOTAL: UsageTotal = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const BucketSchema = z.strictObject({
  day: z.string().regex(DAY_RE),
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
})

/**
 * usage.json 形状：version/buckets/cache 分量可选 = **旧平铺格式天然可读**（迁移即读入，
 * 无需分支）；写出一律带 version:2 与 buckets。
 */
const FileSchema = z.strictObject({
  version: z.literal(2).optional(),
  costUsd: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative().optional(),
  cacheWrite: z.number().int().nonnegative().optional(),
  buckets: z.array(BucketSchema).optional(),
})

/** 本地日历日（YYYY-MM-DD）——看板"按日"用本地日符合用户直觉；注入固定时钟即确定 */
export function dayOf(ts: number): string {
  const d = new Date(ts)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/**
 * 金额归一：消掉 IEEE754 累加/相减噪声（如 1.4 − 0.4 = 0.9999999999999999）。
 * 保留 12 位小数——远低于任何模型计价粒度，不改变账目含义；token 是整数无需归一。
 */
function roundUsd(n: number): number {
  return Math.round(n * 1e12) / 1e12
}

/** 明细合计（unbucketed 差额用；空数组 = 全零） */
function sumBuckets(buckets: readonly UsageBucket[]): UsageTotal {
  return buckets.reduce<UsageTotal>(
    (acc, b) => ({
      costUsd: acc.costUsd + b.costUsd,
      inputTokens: acc.inputTokens + b.inputTokens,
      outputTokens: acc.outputTokens + b.outputTokens,
      cacheRead: acc.cacheRead + b.cacheRead,
      cacheWrite: acc.cacheWrite + b.cacheWrite,
    }),
    { ...ZERO_TOTAL },
  )
}

/** 差额（总账 − 明细），逐项下限 0——浮点累加不产生负数明细 */
function subtractTotals(a: UsageTotal, b: UsageTotal): UsageTotal {
  return {
    costUsd: Math.max(0, roundUsd(a.costUsd - b.costUsd)),
    inputTokens: Math.max(0, a.inputTokens - b.inputTokens),
    outputTokens: Math.max(0, a.outputTokens - b.outputTokens),
    cacheRead: Math.max(0, a.cacheRead - b.cacheRead),
    cacheWrite: Math.max(0, a.cacheWrite - b.cacheWrite),
  }
}

export interface UsageSummary {
  total: UsageTotal
  /** 明细桶（day 升序、同日内 provider/model 字典序——报告与看板顺序稳定） */
  buckets: UsageBucket[]
  /** 无明细可归因的部分（旧平铺格式时期的累计）——如实呈现，不摊进桶里 */
  unbucketed: UsageTotal
}

export class CostTracker {
  private readonly path: string
  private readonly now: () => number
  private total: UsageTotal = { ...ZERO_TOTAL }
  private buckets: UsageBucket[] = []

  constructor(path: string, now: () => number = Date.now) {
    this.path = path
    this.now = now
    if (!existsSync(path)) return
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    } catch (err) {
      throw new ConfigError(`usage.json 不是合法 JSON：${errText(err)}`)
    }
    const parsed = FileSchema.safeParse(raw)
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')
      throw new ConfigError(`usage.json 校验失败：${issues}`)
    }
    const doc = parsed.data
    this.total = {
      costUsd: doc.costUsd,
      inputTokens: doc.inputTokens,
      outputTokens: doc.outputTokens,
      cacheRead: doc.cacheRead ?? 0,
      cacheWrite: doc.cacheWrite ?? 0,
    }
    this.buckets = doc.buckets !== undefined ? [...doc.buckets] : []
  }

  /** 累加一步用量（总账 + 明细桶）并持久化——每步一次原子写，量级为每 turn 数次 */
  add(usage: Usage, dims: UsageDims): void {
    const costUsd = usage.costUsd ?? 0
    const cacheRead = usage.cacheRead ?? 0
    const cacheWrite = usage.cacheWrite ?? 0
    this.total = {
      costUsd: roundUsd(this.total.costUsd + costUsd),
      inputTokens: this.total.inputTokens + usage.inputTokens,
      outputTokens: this.total.outputTokens + usage.outputTokens,
      cacheRead: this.total.cacheRead + cacheRead,
      cacheWrite: this.total.cacheWrite + cacheWrite,
    }
    const day = dayOf(this.now())
    const bucket = this.buckets.find(
      (b) => b.day === day && b.provider === dims.provider && b.model === dims.model,
    )
    if (bucket === undefined) {
      this.buckets.push({
        day,
        provider: dims.provider,
        model: dims.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheRead,
        cacheWrite,
        costUsd,
      })
    } else {
      bucket.inputTokens += usage.inputTokens
      bucket.outputTokens += usage.outputTokens
      bucket.cacheRead += cacheRead
      bucket.cacheWrite += cacheWrite
      bucket.costUsd = roundUsd(bucket.costUsd + costUsd)
    }
    this.persist()
  }

  /** 当前总账（RoutingDto.usage 与熔断判定的数据源） */
  spend(): UsageTotal {
    return { ...this.total }
  }

  /**
   * 看板查询：`since` 为 YYYY-MM-DD（含当日）——ISO 日字符串字典序即时间序，直接比较。
   * 明细桶按 day 升序、同日内 provider/model 字典序返回（顺序稳定，前端不必再排）。
   */
  summary(since?: string): UsageSummary {
    const buckets = this.buckets
      .filter((b) => since === undefined || b.day >= since)
      .slice()
      .sort((a, b) =>
        a.day === b.day
          ? a.provider === b.provider
            ? a.model.localeCompare(b.model)
            : a.provider.localeCompare(b.provider)
          : a.day.localeCompare(b.day),
      )
    return {
      total: { ...this.total },
      buckets,
      unbucketed: subtractTotals(this.total, sumBuckets(this.buckets)),
    }
  }

  /** 熔断判定（limit undefined = 未配置上限，永不熔断） */
  exceeded(limitUsd: number | undefined): boolean {
    if (limitUsd === undefined) return false
    return this.total.costUsd >= limitUsd
  }

  /** 清零（DELETE /api/routing/usage）：总账与明细一并归零，持久化同步 */
  reset(): void {
    this.total = { ...ZERO_TOTAL }
    this.buckets = []
    this.persist()
  }

  private persist(): void {
    atomicWriteJson(
      this.path,
      { version: 2, ...this.total, buckets: this.buckets },
      { mode: 0o600 },
    )
  }
}
