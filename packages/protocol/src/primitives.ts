/**
 * 基础类型（doc/02 §4.2）：schema-first——TS 类型由 zod infer 派生，杜绝双源漂移。
 */
import { z } from 'zod'
import { CallIdSchema } from './ids.js'

/** token 用量；不变式（opencode 契约）：nonCachedInput + cacheRead + cacheWrite = inputTokens */
export const UsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  cacheRead: z.number().int().nonnegative().optional(),
  cacheWrite: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
})
export type Usage = z.infer<typeof UsageSchema>

export const ContentItemSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string() }),
  z.strictObject({ type: z.literal('reasoning'), text: z.string() }),
  z.strictObject({
    type: z.literal('toolCall'),
    callId: CallIdSchema,
    name: z.string(),
    input: z.unknown(),
  }),
  z.strictObject({
    type: z.literal('toolResult'),
    callId: CallIdSchema,
    output: z.unknown(),
    isError: z.boolean(),
  }),
])
export type ContentItem = z.infer<typeof ContentItemSchema>

/** 输入递交通道：now（立即）/ steer（插话，下一 step 前注入）/ queue（排队下一 turn） */
export const DeliverySchema = z.enum(['now', 'steer', 'queue'])
export type Delivery = z.infer<typeof DeliverySchema>

export const TurnFinishSchema = z.enum([
  'stop',
  'length',
  'aborted',
  'permission-rejected',
  'error',
])
export type TurnFinish = z.infer<typeof TurnFinishSchema>

export const PermissionReplySchema = z.enum(['once', 'always', 'reject'])
export type PermissionReply = z.infer<typeof PermissionReplySchema>

/** 推理档位（工单 10.6）：OpenAI reasoning_effort 映射；pi-ai ThinkingLevel 子集透传 */
export const ReasoningEffortSchema = z.enum(['low', 'medium', 'high'])
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>
