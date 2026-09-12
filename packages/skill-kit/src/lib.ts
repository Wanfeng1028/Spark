/**
 * @spark/skill-kit 核心逻辑（阶段十五工单 15.3）：init 的骨架生成与 lint 的清单校验
 * 都住在 lib——scripts 只做 argv/文件读写/退出码，单测直接打 lib。
 *
 * 校验单一来源：schema 是 @spark/protocol 的 SkillManifestSchema（引擎 loader 同源）；
 * 钩子 on 的词表合法性查 protocol 的 EventSchemas（内置 27 种）；data 的 JSON Schema
 * 用 z.fromJSONSchema 试转换（loader 装载时的同一条规则——转换失败即清单坏）。
 */
import { z } from 'zod'
import { EventSchemas, SkillManifestSchema } from '@spark/protocol'
import type { SkillManifest, SparkEventType } from '@spark/protocol'

/** skill 名与目录名共用同一条规则（schema 的 name 字段） */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

export interface LintResult {
  ok: boolean
  /** 人话错误行（ok=false 时非空；形如 `E_SKILL_*: 说明`） */
  errors: string[]
  /** 校验通过的清单（ok=true 时携带） */
  manifest?: SkillManifest
}

/** lint 一份 skill.json 的原始内容（JSON.parse 之前的 unknown）——loader 语义的离线复刻 */
export function lintManifest(raw: unknown): LintResult {
  const parsed = SkillManifestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `E_SKILL_MANIFEST: ${i.path.join('.') || '(根)'} ${i.message}`,
      ),
    }
  }
  const manifest = parsed.data
  const errors: string[] = []

  for (const h of manifest.hooks ?? []) {
    // 触发源必须是内置词表事件（防插件事件自触发循环——loader 同款拒绝）
    if (EventSchemas[h.on as SparkEventType] === undefined) {
      errors.push(`E_SKILL_HOOK_TARGET: hook.on "${h.on}" 非内置事件类型`)
    }
    if (!(h.emit in manifest.events)) {
      errors.push(`E_SKILL_HOOK_EMIT: hook.emit "${h.emit}" 未在本 skill 事件表中声明`)
    }
  }

  for (const [type, def] of Object.entries(manifest.events)) {
    try {
      // 与 loader 一致：转换失败 = 清单坏（z.unknown() 收窄为 fromJSONSchema 入参）
      z.fromJSONSchema(def.data as Parameters<typeof z.fromJSONSchema>[0])
    } catch (err) {
      errors.push(
        `E_SKILL_DATA_SCHEMA: 事件 "${type}" 的 data 不是可转换的 JSON Schema（${
          err instanceof Error ? err.message : String(err)
        }）`,
      )
    }
  }

  return errors.length === 0 ? { ok: true, errors, manifest } : { ok: false, errors }
}

/** init 骨架：最小可用清单（声明一个 ping 事件 + session.created 钩子，demo-ping 同形） */
export function skeletonManifest(name: string): SkillManifest {
  return {
    version: 1,
    name,
    events: {
      [`plugin.${name}.ping`]: {
        description: `示例事件：会话创建后广播 ${name} 的 ping（hooks data 固定形状 skill/sourceEventId/sourceType）`,
        data: {
          type: 'object',
          properties: {
            skill: { type: 'string' },
            sourceEventId: { type: 'string' },
            sourceType: { type: 'string' },
          },
          required: ['skill', 'sourceEventId', 'sourceType'],
          additionalProperties: false,
        },
      },
    },
    hooks: [{ on: 'session.created', emit: `plugin.${name}.ping` }],
  }
}

/** init 产出的文件表（skill.json 内容 + README 模板）；init 脚本负责落盘与防覆盖 */
export function skeletonFiles(name: string): Record<string, string> {
  return {
    'skill.json': `${JSON.stringify(skeletonManifest(name), null, 2)}\n`,
    'README.md': readmeTemplate(name),
  }
}

function readmeTemplate(name: string): string {
  return `# ${name}（Spark skill）

由 \`@spark/skill-kit init\` 生成的骨架。**skill 是数据声明，不是程序**（ARCHITECTURE.md D18）。

## 这个骨架做了什么

声明一个 \`plugin.${name}.ping\` 事件，并挂一个声明式钩子：每次内置事件 \`session.created\`
触发时，引擎自动发射一条 ping（data 固定形状：skill / sourceEventId / sourceType）。

## 你能做什么（声明式边界内）

- **声明事件**：events 表里加 \`plugin.*\` 事件，data 写 JSON Schema（引擎据此注册词表与校验）；
- **声明钩子**：hooks 里 on 必须是内置词表事件（\`lint\` 会查），emit 必须是本清单已声明的事件；
- **liveOnly**：纯展示类事件标 \`liveOnly: true\`（不落盘，live 直播）。

## 你不能做什么

- 不能执行代码或引入脚本（没有可编程入口——受限可编程的边界判决见 doc/08 §15.4 / Q-1）；
- 不能自定义 data 之外的构造器/通道；不能占用内置词表名（\`plugin.\` 前缀强制）；
- **要真实工具能力去 MCP**（\`~/.spark/mcp.json\`，D16）：skills 管事件语义，MCP 管工具面。

## 下一步

1. \`pnpm --filter @spark/skill-kit lint <本目录>\` 确认清单合法；
2. 把本目录放到引擎数据根的 \`skills/\` 下（缺省 \`~/.spark/skills/${name}/\`）；
3. 重启引擎，\`GET /api/skills\`（或设置页技能清单）应出现 ${name}。
`
}
