/** 推理档位解析（/effort 参数；工单 10.18） */
import type { ReasoningEffort } from '@spark/protocol'

export function parseEffort(arg: string | undefined): ReasoningEffort | null {
  if (arg === 'low' || arg === 'medium' || arg === 'high') return arg
  return null
}
