/**
 * 事件词表运行时扩展（doc/02 §4.3 merge-extensible，阶段五工单 5.5 / ADR D18）：
 * 插件经 registerEventType 注册新事件类型（zod schema），EventBus/parseEnvelope/
 * SessionStore 读端统一走 eventSchemaOf——扩展事件与内置 35 种同一校验路径。
 * 编译期扩展走 declaration merging（SparkEventMap）；本注册表是 JS 插件的运行时对位。
 *
 * 测试责任边界（审计 doc/13 G-4 显式登记）：扩展事件**不进**静态词表，因此不在
 * §2.8「逐一单测」/ 契约生成物 / web event-coverage 守卫的覆盖面内——其 schema
 * 与 reducer 行为的单测责任归扩展作者；本仓对扩展事件只保证校验与持久化路径同一。
 */
import type { z } from 'zod'
import { EventSchemas } from './events.js'
import type { SparkEventType } from './events.js'

export interface ExtendedEventDef {
  /** data 严校验 schema（与内置词表同纪律） */
  schema: z.ZodType
  /** true = live-only（不落盘，与词表 LiveOnly 同语义）；缺省 durable */
  liveOnly?: boolean
}

const extended = new Map<string, ExtendedEventDef>()

/** 注册扩展事件类型；与内置词表或已注册类型冲突 → E_EVENT_TYPE_CLASH */
export function registerEventType(type: string, def: ExtendedEventDef): void {
  if (EventSchemas[type as SparkEventType] !== undefined) {
    throw new Error(`E_EVENT_TYPE_CLASH: 事件类型 ${type} 与内置词表冲突`)
  }
  if (extended.has(type)) {
    throw new Error(`E_EVENT_TYPE_CLASH: 事件类型 ${type} 已注册`)
  }
  extended.set(type, def)
}

/** 内置 ?? 扩展——全部校验点的唯一查表入口 */
export function eventSchemaOf(type: string): z.ZodType | undefined {
  const builtin = EventSchemas[type as SparkEventType]
  if (builtin !== undefined) return builtin
  return extended.get(type)?.schema
}

/** 扩展事件是否 live-only（内置 LiveOnly 由编译期类型保证，此处运行时对位） */
export function isExtendedLiveOnly(type: string): boolean {
  return extended.get(type)?.liveOnly === true
}

/** 内置 live-only 词表（events.ts LiveOnlyEventType 的运行时对位） */
// CK-1 批 2：task.progress 加入运行时对位（与 events.ts 的 LiveOnlyEventType 编译期联合同改）
const LIVE_ONLY_TYPES: ReadonlySet<string> = new Set([
  'assistant.delta',
  'reasoning.delta',
  'tool.progress',
  'task.progress',
])

/**
 * 运行时 live-only 判定：内置 LiveOnly 词表 ?? 扩展注册表 liveOnly 标记。
 * 消费方：EventBus 背压分级（AUD-11——缓冲溢出优先丢 live、durable 不可静默丢）等。
 */
export function isLiveOnlyType(type: string): boolean {
  return LIVE_ONLY_TYPES.has(type) || isExtendedLiveOnly(type)
}

/** 测试隔离：清空扩展注册表 */
export function clearExtendedEvents(): void {
  extended.clear()
}
