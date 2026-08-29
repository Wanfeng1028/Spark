/**
 * 事件词表（doc/02 §4.3）：schema registry 是唯一来源——SparkEventMap 由 infer 派生。
 * 词表当前 21 种（19 + io.warning 阶段七工单 7.2 + memory.injected 工单 7.5）；扩展走 declaration merging（dsh 手法，阶段五插件用）。
 */
import { z } from 'zod'
import type { EventId, SessionId } from './ids.js'
import {
  CallIdSchema,
  CheckpointIdSchema,
  EventIdSchema,
  RequestIdSchema,
  TurnIdSchema,
} from './ids.js'
import {
  ContentItemSchema,
  DeliverySchema,
  PermissionReplySchema,
  TurnFinishSchema,
  UsageSchema,
} from './primitives.js'

export const EventSchemas = {
  // 会话
  'session.created': z.strictObject({
    title: z.string().optional(),
    cwd: z.string(),
    model: z.string(),
  }),
  'session.resumed': z.strictObject({ fromSeq: z.number().int().nonnegative() }),
  'session.title': z.strictObject({ title: z.string() }),
  // turn
  'turn.started': z.strictObject({
    turnId: TurnIdSchema,
    delivery: DeliverySchema,
    userEventId: EventIdSchema,
  }),
  'turn.completed': z.strictObject({
    turnId: TurnIdSchema,
    finish: TurnFinishSchema,
    usage: UsageSchema.optional(),
  }),
  // 输入/输出（surface = 进模型历史）
  'user.message': z.strictObject({
    text: z.string().min(1),
    attachments: z.array(z.string()).optional(),
  }),
  'assistant.delta': z.strictObject({ turnId: TurnIdSchema, text: z.string() }), // live-only
  'assistant.message': z.strictObject({
    turnId: TurnIdSchema,
    content: z.array(ContentItemSchema),
    usage: UsageSchema.optional(),
  }),
  'reasoning.delta': z.strictObject({ turnId: TurnIdSchema, text: z.string() }), // live-only
  'reasoning.ended': z.strictObject({ turnId: TurnIdSchema, text: z.string() }),
  // 工具（状态机 started → [progress] → completed）
  'tool.started': z.strictObject({
    turnId: TurnIdSchema,
    callId: CallIdSchema,
    name: z.string(),
    input: z.unknown(),
  }),
  'tool.progress': z.strictObject({
    turnId: TurnIdSchema,
    callId: CallIdSchema,
    chunk: z.string(),
  }), // live-only
  'tool.completed': z.strictObject({
    turnId: TurnIdSchema,
    callId: CallIdSchema,
    output: z.unknown(),
    isError: z.boolean(),
    durationMs: z.number().int().nonnegative(),
  }),
  // 审批（log-only，永不进模型历史——dsh 纪律）
  'permission.asked': z.strictObject({
    requestId: RequestIdSchema,
    callId: CallIdSchema,
    action: z.string(),
    resource: z.string(),
    reason: z.string(),
    detail: z.unknown().optional(),
    // §5.7 补强 1/3：一次调用可声明多个 resource pattern；
    // alwaysPatterns 与展示用 patterns 解耦——决定"总是允许"固化哪几条规则
    patterns: z.array(z.string()).optional(),
    alwaysPatterns: z.array(z.string()).optional(),
  }),
  'permission.resolved': z.strictObject({
    requestId: RequestIdSchema,
    reply: PermissionReplySchema,
    feedback: z.string().optional(),
  }),
  // 上下文管理
  'compaction.started': z.strictObject({ turnId: TurnIdSchema.optional() }),
  'compaction.completed': z.strictObject({
    summary: z.string(),
    // §5.8.5：锚定事件 id（fork 后路径序≠文件行序，seq 比较会保留错误条目）
    keptFromEventId: EventIdSchema,
    tokensBefore: z.number().int().nonnegative(),
  }),
  'checkpoint.created': z.strictObject({
    checkpointId: CheckpointIdSchema,
    files: z.array(z.string()),
    turnId: TurnIdSchema,
  }),
  // 系统
  error: z.strictObject({
    scope: z.enum(['engine', 'llm', 'tool', 'io']),
    message: z.string(),
    fatal: z.boolean().optional(),
  }),
  // I/O 护栏（阶段七工单 7.2 / H02，log-only——告警本身不进模型历史）
  'io.warning': z.strictObject({
    turnId: TurnIdSchema,
    callId: CallIdSchema,
    tool: z.string(),
    kind: z.enum(['injection', 'secret']),
    // 命中规则名（结构化；不回传原文——防注入内容/密钥片段经告警二次广播）
    rules: z.array(z.string()).min(1),
    // kind=secret：敏感片段替换处数（进模型上下文前的过滤计数）
    redacted: z.number().int().nonnegative().optional(),
  }),
  // 长期记忆（阶段七工单 7.5 / H05，ADR D25：surface 纪律——注入即落盘，模型可见必被记录）
  'memory.injected': z.strictObject({
    turnId: TurnIdSchema,
    // 检索词（会话首条 user.message 文本）
    query: z.string(),
    // top-k 命中（Projector 投影为模型上下文首条前缀消息）
    memories: z
      .array(
        z.strictObject({
          id: z.number().int().positive(),
          content: z.string(),
          createdAt: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  }),
} as const satisfies Record<string, z.ZodType>

export type SparkEventType = keyof typeof EventSchemas
export type SparkEventMap = { [K in SparkEventType]: z.infer<(typeof EventSchemas)[K]> }

export type LiveOnlyEventType = 'assistant.delta' | 'reasoning.delta' | 'tool.progress'
export type SurfaceEventType = 'user.message' | 'assistant.message'
export type DurableEventType = Exclude<SparkEventType, LiveOnlyEventType>

/** 信封公共字段（doc/02 §4.4；磁盘行与 wire 同构） */
interface BaseEnvelope {
  id: EventId
  sessionId: SessionId
  seq?: number // durable 单调序号（== 会话日志行号）；live 无
  parentId?: EventId | null // 树父事件（store 落盘时填 tree.leafId）；首事件 JSONL 里为 null
  version?: 1 // 协议演进预留：写入时恒为当前大版本
  ignorable?: boolean // 读端遇未知 type：true 跳过；缺省 false 拒绝加载（fail-closed）
  time: number // epoch ms
}

export interface SparkEventEnvelope<
  T extends SparkEventType = SparkEventType,
> extends BaseEnvelope {
  type: T
  data: SparkEventMap[T]
}

/** surface 事件强制带 surface:true（dsh 编译期纪律） */
export type SurfaceEnvelope<T extends SurfaceEventType> = SparkEventEnvelope<T> & { surface: true }
