/**
 * 事件词表运行时扩展（doc/02 §4.3 merge-extensible，阶段五工单 5.5 / ADR D18）：
 * 插件经 registerEventType 注册新事件类型（zod schema），EventBus/parseEnvelope/
 * SessionStore 读端统一走 eventSchemaOf——扩展事件与内置 20 种同一校验路径。
 * 编译期扩展走 declaration merging（SparkEventMap）；本注册表是 JS 插件的运行时对位。
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

/** 测试隔离：清空扩展注册表 */
export function clearExtendedEvents(): void {
  extended.clear()
}
