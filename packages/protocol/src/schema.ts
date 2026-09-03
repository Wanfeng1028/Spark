/**
 * 信封 schema 与解析入口（doc/02 §4.3.1 / §4.4）。
 * parseEnvelope = 两步校验（fail-closed）：先信封结构，再按 type 查 EventSchemas 严校验 data。
 */
import { z } from 'zod'
import { EventIdSchema, SessionIdSchema } from './ids.js'
import { eventSchemaOf } from './extend.js'
import type { SparkEventEnvelope } from './events.js'

export const EnvelopeSchema = z.strictObject({
  id: EventIdSchema,
  type: z.string(),
  sessionId: SessionIdSchema,
  seq: z.number().int().positive().optional(),
  parentId: EventIdSchema.nullable().optional(),
  version: z.literal(1).optional(),
  ignorable: z.boolean().optional(),
  surface: z.literal(true).optional(),
  time: z.number().int().nonnegative(),
  data: z.unknown(),
})

/** 两步校验：信封结构 + 按词表（内置 ?? 扩展注册表）严校验 data；未知 type 一律抛错（fail-closed，§4.4） */
export function parseEnvelope(raw: unknown): SparkEventEnvelope {
  const env = EnvelopeSchema.parse(raw)
  const schema: z.ZodType | undefined = eventSchemaOf(env.type)
  if (!schema) {
    throw new Error(
      `E_PROTOCOL_UNKNOWN_EVENT: 未知事件 type "${env.type}"（fail-closed，doc/02 §4.4）`,
    )
  }
  const data = schema.parse(env.data)
  return { ...env, data } as SparkEventEnvelope
}

/**
 * jsonSchema 导出（给模型工具清单与 DTO 文档化用；zod 4 内建）。
 * 现状：仅 tests/events.test.ts 消费（序列化冒烟），生产零调用；14.2 契约生成 /
 * 15.2 OpenAPI 落地后转生产用——R-A 复核后保留（非死导出）。
 */
export const jsonSchemas = {
  envelope: z.toJSONSchema(EnvelopeSchema),
} as const
