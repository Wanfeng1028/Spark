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
  // 工单 12.2b：图片内容块（仅 LlmMessage 表面——事件流不携带字节，user.message
  // 只存 attachments 文件名，投影时由引擎读盘转 base64）
  z.strictObject({ type: z.literal('image'), mime: z.string(), dataBase64: z.string() }),
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

/**
 * 会话模式（工单 16.3 /plan 计划模式）：default = 常态；plan = 只读规划（写类工具全 DENY，
 * 退出须用户批准）。与 `PermissionPreset` 的 `'plan'` 档是**同一件事的两个面**：
 * mode 是会话可见/可回放的 durable 状态（事件驱动、四端显示指示），preset 是审批规则引擎的
 * enforcement 层（findLast 优先级）——引擎切 mode 时同步设 preset，**不另造第二套规则路径**。
 */
export const SessionModeSchema = z.enum(['default', 'plan'])
export type SessionMode = z.infer<typeof SessionModeSchema>

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
