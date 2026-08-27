/**
 * 上下文用量纯逻辑单测（工单 6.6）：token 口径、窗口匹配回退、比值边界与 warn 阈值。
 */
import { describe, expect, it } from 'vitest'
import type { ModelsDto, Usage } from '@spark/protocol'
import {
  CONTEXT_WARN_RATIO,
  contextRatio,
  contextTokensOf,
  contextWindowOf,
} from '../src/features/chat/context-usage'

function usage(over: Partial<Usage> = {}): Usage {
  return {
    inputTokens: 1000,
    outputTokens: 200,
    reasoningTokens: 50,
    cacheRead: 30,
    cacheWrite: 20,
    costUsd: 0,
    ...over,
  }
}

const DTO: ModelsDto = {
  providers: [],
  models: [
    { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
    { provider: 'deepseek', model: 'deepseek-reasoner', contextWindow: 131072 },
  ],
  defaultModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
}

describe('contextTokensOf', () => {
  it('全量口径：input+output+reasoning+cacheRead+cacheWrite', () => {
    expect(contextTokensOf(usage())).toBe(1000 + 200 + 50 + 30 + 20)
  })

  it('缺省字段按 0 计', () => {
    expect(contextTokensOf({ inputTokens: 10, outputTokens: 5, costUsd: 0 })).toBe(15)
  })
})

describe('contextWindowOf', () => {
  it('模型精确命中取该窗口；未命中回 defaultModel；无目录 null', () => {
    expect(contextWindowOf(DTO, 'deepseek/deepseek-reasoner')).toBe(131072)
    expect(contextWindowOf(DTO, 'deepseek/other-model')).toBe(65536)
    expect(contextWindowOf(null, 'deepseek/deepseek-chat')).toBeNull()
    expect(contextWindowOf(DTO, '')).toBeNull()
  })
})

describe('contextRatio', () => {
  it('usage 缺失或窗口未知 → null（不渲染）', () => {
    expect(contextRatio(null, 65536)).toBeNull()
    expect(contextRatio(usage(), null)).toBeNull()
    expect(contextRatio(usage(), 0)).toBeNull()
  })

  it('正常比值与 warn 边界（>0.8）', () => {
    // 1300 / 65536 ≈ 0.0198
    expect(contextRatio(usage(), 65536)).toBeCloseTo(1300 / 65536, 6)
    const only = (n: number): Usage => ({
      inputTokens: n,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
      costUsd: 0,
    })
    // 恰好 80%：不告警（>0.8 严格大于）
    expect(contextRatio(only(8000), 10_000)).toBe(0.8)
    expect((contextRatio(only(8000), 10_000) ?? 0) > CONTEXT_WARN_RATIO).toBe(false)
    // 81%：告警
    expect((contextRatio(only(8100), 10_000) ?? 0) > CONTEXT_WARN_RATIO).toBe(true)
  })

  it('超过 100% 封顶由展示层处理（比值本身可 >1）', () => {
    expect(contextRatio(usage({ inputTokens: 100_000 }), 65536)).toBeGreaterThan(1)
  })
})
