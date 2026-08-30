/**
 * 上下文用量纯逻辑（工单 6.6 建于 web / 工单 8.2 下沉至此——四端 StatusBar 水位同口径）：
 * assistant.message/turn.completed 的 usage → 下一轮上下文规模代理
 * （input+reasoning+cache+output 全量）÷ 模型 contextWindow。
 * Projector 精确估算在引擎侧（H23 前置）；前端以最近一轮 usage 为代理，
 * 阈值 0.8 与引擎 compactionThreshold 默认值同源。
 */
import type { Usage } from './primitives.js'
import type { ModelsDto } from './api.js'

/** 水位告警阈值（>0.8 变 warn——DESIGN §13.A StatusBar 与 Composer 用量条共用） */
export const CONTEXT_WARN_RATIO = 0.8

/** 最近一轮 usage → 上下文 token 规模代理（全量口径：输入+思考+缓存读写+输出） */
export function contextTokensOf(u: Usage): number {
  return (
    u.inputTokens +
    u.outputTokens +
    (u.reasoningTokens ?? 0) +
    (u.cacheRead ?? 0) +
    (u.cacheWrite ?? 0)
  )
}

/** 模型目录 → 会话模型的 contextWindow（"provider/model" 精确匹配；未命中回 defaultModel；无目录 null） */
export function contextWindowOf(dto: ModelsDto | null, model: string): number | null {
  if (dto === null || model === '') return null
  const hit = dto.models.find((m) => `${m.provider}/${m.model}` === model)
  if (hit !== undefined) return hit.contextWindow
  return dto.defaultModel.contextWindow
}

/** 用量条比值（0~1）；usage 缺失或窗口未知 → null（不渲染，禁假状态） */
export function contextRatio(usage: Usage | null, window: number | null): number | null {
  if (usage === null || window === null || window <= 0) return null
  return contextTokensOf(usage) / window
}
