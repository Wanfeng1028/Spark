/**
 * skills/插件加载器（doc/02 §4.3 merge-extensible，阶段五工单 5.5 / ADR D18）：
 * 扫描 `<root>/skills/<name>/skill.json` 声明式清单——事件词表（JSON Schema → zod）
 * 经 registerEventType 注册进运行时扩展表（EventBus/parseEnvelope/SessionStore
 * 读端统一查 eventSchemaOf，与内置 19 种同一校验路径）；hooks = 声明式触发器
 * （on 内置事件 → emit 插件事件，data 固定形状 {skill, sourceEventId, sourceType}）。
 * 插件 = 数据声明，不是程序——不执行任意代码（与 MCP 子进程路线的分工）。
 * 单个 skill 清单坏/类型冲突/钩子非法 → warn 跳过该 skill（引擎照常启动，
 * 与 MCP 单 server 失败同纪律）；目录不存在 = 零插件。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { EventSchemas, eventSchemaOf, registerEventType } from '@spark/protocol'
import type { ExtendedEventDef, SparkEventType } from '@spark/protocol'

export interface SkillHookDef {
  /** 触发源：必须是内置词表事件类型（防插件事件自触发循环） */
  on: string
  /** 触发后发射的本 skill 事件类型 */
  emit: string
}

export interface LoadedSkill {
  name: string
  dir: string
  /** 本 skill 注册的事件类型全表 */
  events: string[]
  hooks: SkillHookDef[]
}

/** hooks 发射的固定 data 形状（ADR D18：声明式钩子不写自定义数据构造器） */
export interface SkillHookPayload {
  skill: string
  sourceEventId: string
  sourceType: string
}

export interface SkillLogger {
  warn(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
}

/** 事件类型命名空间纪律：插件事件必须 plugin. 前缀（防占位内置词表） */
const PluginEventRe = /^plugin\.[a-z0-9][a-z0-9.-]*$/

const ManifestSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  events: z.record(
    z.string().regex(PluginEventRe),
    z.strictObject({
      description: z.string().optional(),
      liveOnly: z.boolean().optional(),
      /** data 的 JSON Schema（z.fromJSONSchema 转换失败 = 清单坏） */
      data: z.unknown(),
    }),
  ),
  hooks: z.array(z.strictObject({ on: z.string(), emit: z.string() })).optional(),
})

/** 扫描并加载全部 skills；逐 skill 失败闭合（warn 跳过，不阻塞引擎启动） */
export async function loadSkills(
  dir: string,
  logger?: SkillLogger,
): Promise<LoadedSkill[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return [] // 目录不存在 = 零插件（与 mcp.json 缺省同语义）
  }
  const loaded: LoadedSkill[] = []
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const skillDir = join(dir, ent.name)
    try {
      loaded.push(await loadSkill(skillDir))
    } catch (err) {
      logger?.warn('skills.load.skip', { dir: skillDir, err })
    }
  }
  return loaded
}

async function loadSkill(dir: string): Promise<LoadedSkill> {
  const raw: unknown = JSON.parse(await readFile(join(dir, 'skill.json'), 'utf8'))
  const manifest = ManifestSchema.parse(raw)

  // 先全量转换与预检再注册——中途失败不留半注册状态（单线程启动无竞态）
  const registrations: Array<[type: string, def: ExtendedEventDef]> = []
  for (const [type, def] of Object.entries(manifest.events)) {
    // z.unknown() 出参收窄为 fromJSONSchema 入参（转换失败 = 清单坏，per-skill 闭合）
    const schema = z.fromJSONSchema(def.data as Parameters<typeof z.fromJSONSchema>[0])
    registrations.push([type, def.liveOnly === true ? { schema, liveOnly: true } : { schema }])
  }
  for (const type of Object.keys(manifest.events)) {
    if (eventSchemaOf(type) !== undefined) {
      throw new Error(`E_EVENT_TYPE_CLASH: 事件类型 ${type} 已被内置词表或其他 skill 注册`)
    }
  }

  const hooks = manifest.hooks ?? []
  for (const h of hooks) {
    if (EventSchemas[h.on as SparkEventType] === undefined) {
      throw new Error(`E_SKILL_HOOK_TARGET: hook.on "${h.on}" 非内置事件类型`)
    }
    if (!(h.emit in manifest.events)) {
      throw new Error(`E_SKILL_HOOK_EMIT: hook.emit "${h.emit}" 未在本 skill 事件表中声明`)
    }
  }

  for (const [type, def] of registrations) registerEventType(type, def)
  return { name: manifest.name, dir, events: Object.keys(manifest.events), hooks }
}
