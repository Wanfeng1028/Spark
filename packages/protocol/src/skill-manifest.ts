/**
 * skill.json 清单 schema（阶段十五工单 15.3 / ADR D18 声明式边界）——**单一来源**。
 *
 * 消费方：引擎 loader（packages/engine/src/skills/loader.ts）与创作套件
 * @spark/skill-kit 的 lint 走同一份 schema（消双源漂移）；schema 形状与
 * loader 5.5 落地版逐字一致（本文件是其下沉，不改语义）。
 *
 * 注意：本 schema 不入 14.2 契约套件（gen-contract 只枚举 api/primitives/events
 * 模块——z.record + 正则约束的字符串样例超出其合成器范围，纳入即红；清单是
 * 文件载入面而非 wire DTO，不在契约套件的合同语义内）。
 */
import { z } from 'zod'

/** 事件类型命名空间纪律：插件事件必须 plugin. 前缀（防占位内置词表） */
export const PLUGIN_EVENT_RE = /^plugin\.[a-z0-9][a-z0-9.-]*$/

/** 声明式钩子（ADR D18）：on = 触发源（内置词表事件），emit = 本 skill 事件 */
export const SkillHookDefSchema = z.strictObject({ on: z.string(), emit: z.string() })

/** <root>/skills/<name>/skill.json 的唯一合法形状 */
export const SkillManifestSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  events: z.record(
    z.string().regex(PLUGIN_EVENT_RE),
    z.strictObject({
      description: z.string().optional(),
      liveOnly: z.boolean().optional(),
      /** data 的 JSON Schema（z.fromJSONSchema 转换失败 = 清单坏） */
      data: z.unknown(),
    }),
  ),
  hooks: z.array(SkillHookDefSchema).optional(),
})

export type SkillHookDef = z.infer<typeof SkillHookDefSchema>
export type SkillManifest = z.infer<typeof SkillManifestSchema>
