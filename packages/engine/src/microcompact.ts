/**
 * ZC-1 微压缩（microcompact，参考 ZCode 同名机制）：上下文水位到 0.9×压缩阈值时，
 * 把较早的 toolResult 输出在**投影层**清成占位（最近 5 组保留）——JSONL 原文不动
 * （append-only），边界落 `microcompact_boundary` 事件（durable 非 surface），回放
 * 由 projector 按边界重建同一清理。估算节省 < 256 token 不值得，如实返回 false
 * （调用方冷却，不逐步重试）。
 *
 * 与 §5.8.5 全量压缩的关系：微压缩是轻量前置（纯投影、零 LLM 调用），把全量压缩
 * 的触发点往后推；水位继续涨过压缩阈值仍走 Compactor 正常压缩。
 */
import type { EventBus } from './bus.js'
import type { EventTree } from './session/tree.js'
import type { Projector } from './run-loop.js'
import type { EventId } from '@spark/protocol'

/** 触发比例：水位 = 0.9 × 压缩阈值 × 上下文窗口 */
export const MICROCOMPACT_TRIGGER_RATIO = 0.9

/** 触发门槛：估算节省低于此值不落边界（不值得打断连续性） */
export const MICROCOMPACT_MIN_SAVINGS = 256

/** 保留最近 N 组 toolResult 组（一组 = 一条 assistant.message 的全部 toolResult 项） */
export const MICROCOMPACT_KEEP_GROUPS = 5

export interface MicroCompactorDeps {
  sessionId: import('@spark/protocol').SessionId
  bus: EventBus
  tree: EventTree
  projector: Projector
  /** token 估算口径与 projector 一致（estimateTokens） */
  estimateTokens: (messages: unknown) => number
}

/** 一次微压缩的计划：保留边界 + 统计（run() 内 emit） */
interface MicroCompactPlan {
  keptFromEventId: EventId
  clearedCount: number
  savedTokens: number
}

export class MicroCompactorImpl {
  constructor(private readonly deps: MicroCompactorDeps) {}

  /**
   * 尝试微压缩：true = 已 emit microcompact_boundary（重投影生效）；false = 不值得
   * （组数不足 / 节省低于门槛——调用方冷却，本 turn 不再重试）。
   */
  async run(): Promise<boolean> {
    const plan = this.plan()
    if (plan === null) return false
    await this.deps.bus.emit(this.deps.sessionId, 'microcompact_boundary', {
      keptFromEventId: plan.keptFromEventId,
      clearedCount: plan.clearedCount,
      savedTokens: plan.savedTokens,
    })
    return true
  }

  /**
   * 纯函数计划：沿路径收集 assistant.message 的 toolResult 组，最近
   * MICROCOMPACT_KEEP_GROUPS 组保留，更早的清占位。无更早组（无需清理）→ null。
   */
  private plan(): MicroCompactPlan | null {
    const path = this.deps.tree.pathToRoot()
    // 组 = 一条含 toolResult 的 assistant.message（callId 清单 + 该消息的路径下标）
    const groups: Array<{ eventId: EventId; pos: number; callIds: string[] }> = []
    for (let i = 0; i < path.length; i++) {
      const e = path[i]
      if (e === undefined || e.type !== 'assistant.message') continue
      const callIds = e.data.content
        .filter((c): c is Extract<typeof c, { type: 'toolResult' }> => c.type === 'toolResult')
        .map((c) => c.callId)
      if (callIds.length === 0) continue
      groups.push({ eventId: e.id, pos: i, callIds })
    }
    if (groups.length <= MICROCOMPACT_KEEP_GROUPS) return null

    const cutIdx = groups.length - MICROCOMPACT_KEEP_GROUPS
    const cut = groups[cutIdx]
    if (cut === undefined) return null
    const keptFromEventId = cut.eventId

    // 估算节省：被清条目的 output JSON 长度 − 占位文本长度（字符近似口径 /4）
    const outputsById = new Map<string, unknown>()
    for (const e of path) {
      if (e === undefined || e.type !== 'assistant.message') continue
      for (const c of e.data.content) {
        if (c.type === 'toolResult') outputsById.set(c.callId, c.output)
      }
    }
    const placeholderLen = 80 // 占位文本字符数（与 projector 常量同量级）
    let savedChars = 0
    let clearedCount = 0
    for (const g of groups.slice(0, cutIdx)) {
      for (const callId of g.callIds) {
        const out = outputsById.get(callId)
        if (out === undefined) continue
        savedChars += Math.max(0, JSON.stringify(out ?? null).length - placeholderLen)
        clearedCount += 1
      }
    }
    const savedTokens = Math.floor(savedChars / 4)
    if (savedTokens < MICROCOMPACT_MIN_SAVINGS) return null

    return { keptFromEventId, clearedCount, savedTokens }
  }
}
