/**
 * 成本熔断计量（阶段七工单 7.7 / H07）：usage.costUsd 的进程级聚合 + 持久化。
 *
 * - 累计来源：run-loop 每步 stream 结果的 usage（含 error/aborted 步——调用量
 *   本身就是成本）；压缩/标题的 generateOnce usage 不计（OnceRequest 不回传
 *   usage，§5.8.5 v1 口径——辅助通道短输出，量级可忽略）；
 * - 持久化：~/.spark/usage.json（原子写，同 secrets store 纪律）——引擎重启
 *   后累计延续（跨会话/跨进程的预算闸语义）；
 * - 坏 JSON / 形状不符 → ConfigError（E_CONFIG，与 loadConfig 同纪律）；
 * - exceeded(limit)：limit undefined = 不限；累计 ≥ limit 即熔断（≥ 而非 >——
 *   阈值语义"花到这个数就停"）。
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { Usage } from '@spark/protocol'
import { ConfigError } from './config.js'

export interface UsageTotal {
  costUsd: number
  inputTokens: number
  outputTokens: number
}

const ZERO_TOTAL: UsageTotal = { costUsd: 0, inputTokens: 0, outputTokens: 0 }

export class CostTracker {
  private readonly path: string
  private total: UsageTotal = { ...ZERO_TOTAL }

  constructor(path: string) {
    this.path = path
    if (!existsSync(path)) return
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    } catch (err) {
      throw new ConfigError(
        `usage.json 不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      )
    }
    const doc = raw as Partial<Record<keyof UsageTotal, unknown>>
    if (
      typeof doc.costUsd !== 'number' ||
      typeof doc.inputTokens !== 'number' ||
      typeof doc.outputTokens !== 'number' ||
      doc.costUsd < 0 ||
      doc.inputTokens < 0 ||
      doc.outputTokens < 0
    ) {
      throw new ConfigError('usage.json 校验失败：须含非负的 costUsd/inputTokens/outputTokens')
    }
    this.total = {
      costUsd: doc.costUsd,
      inputTokens: doc.inputTokens,
      outputTokens: doc.outputTokens,
    }
  }

  /** 累加一步用量并持久化（每步一次原子写——量级为每 turn 数次，可接受） */
  add(usage: Usage): void {
    this.total = {
      costUsd: this.total.costUsd + (usage.costUsd ?? 0),
      inputTokens: this.total.inputTokens + usage.inputTokens,
      outputTokens: this.total.outputTokens + usage.outputTokens,
    }
    this.persist()
  }

  /** 当前累计（DTO 数据源） */
  spend(): UsageTotal {
    return { ...this.total }
  }

  /** 熔断判定（limit undefined = 未配置上限，永不熔断） */
  exceeded(limitUsd: number | undefined): boolean {
    if (limitUsd === undefined) return false
    return this.total.costUsd >= limitUsd
  }

  /** 清零（DELETE /api/routing/usage；持久化同步） */
  reset(): void {
    this.total = { ...ZERO_TOTAL }
    this.persist()
  }

  private persist(): void {
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, `${JSON.stringify(this.total, null, 2)}\n`, { mode: 0o600 })
    renameSync(tmp, this.path)
  }
}
