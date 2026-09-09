/**
 * 事件词表参考页生成器（工单 14.6 要求 2）：`@spark/protocol` 的 zod schema → `apps/docs/events.md`。
 *
 * 与契约用例生成器（packages/protocol/scripts/gen-contract.ts）同一套纪律：
 * - **事实源唯一**：字段名/类型/必填全部从 schema 推导，脚本里不写死任何事件字段；
 * - **确定性**：事件按名排序、字段按 schema 声明序，同一 schema 永远生成同一份文件
 *   （CI 的 `git diff --exit-code` 同步门禁正依赖这个性质）；
 * - **不猜**：拿不到形状的 JSON Schema 节点如实渲染为 `object`，不编字段说明。
 *
 * 跑法：`pnpm --filter @spark/docs gen:events`（改过 protocol 的事件 schema 后必跑）。
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { EnvelopeSchema, EventSchemas } from '@spark/protocol'
import type { LiveOnlyEventType, SparkEventType, SurfaceEventType } from '@spark/protocol'

/**
 * 分类表用 `Record<…, true>` 而不是字符串数组：**穷尽性由编译器把关**——
 * protocol 若新增一个 live-only 或 surface 类型而这里没跟上，typecheck 立刻红。
 */
const LIVE_ONLY: Record<LiveOnlyEventType, true> = {
  'assistant.delta': true,
  'reasoning.delta': true,
  'tool.progress': true,
}
const SURFACE: Record<SurfaceEventType, true> = {
  'user.message': true,
  'assistant.message': true,
}

const liveOnly = new Set<string>(Object.keys(LIVE_ONLY))
const surface = new Set<string>(Object.keys(SURFACE))

type Json = Record<string, unknown>

function asJson(node: unknown): Json {
  return typeof node === 'object' && node !== null ? (node as Json) : {}
}

/** JSON Schema 节点 → 一行类型文本（枚举列出字面量；$ref 取定义名；数组加 []） */
function typeOf(node: unknown): string {
  const n = asJson(node)
  if (Array.isArray(n['enum'])) {
    return (n['enum'] as unknown[]).map((v) => '`' + String(JSON.stringify(v)) + '`').join(' \\| ')
  }
  if (Array.isArray(n['anyOf'])) return (n['anyOf'] as unknown[]).map(typeOf).join(' \\| ')
  if (Array.isArray(n['oneOf'])) return (n['oneOf'] as unknown[]).map(typeOf).join(' \\| ')
  if (typeof n['$ref'] === 'string') return n['$ref'].split('/').pop() ?? 'object'
  const t = n['type']
  if (t === 'array') return `${typeOf(n['items'])}[]`
  if (typeof t === 'string') return t
  if (Array.isArray(t)) return (t as unknown[]).map(String).join(' \\| ')
  return 'object'
}

/** 一个 schema 的字段表（顶层 properties；嵌套结构交给类型列，不递归展开） */
function fieldsTable(schema: z.ZodType): string {
  const json = asJson(z.toJSONSchema(schema))
  const props = asJson(json['properties'])
  const required = new Set(Array.isArray(json['required']) ? (json['required'] as unknown[]).map(String) : [])
  const names = Object.keys(props)
  if (names.length === 0) return '_（无字段）_\n'
  // "说明"列只在真有描述时才出：schema 未用 .describe() 时不留一整列空白（噪声）
  const hasDesc = names.some((name) => typeof asJson(props[name])['description'] === 'string')
  const head = hasDesc
    ? ['| 字段 | 类型 | 必填 | 说明 |', '| ---- | ---- | ---- | ---- |']
    : ['| 字段 | 类型 | 必填 |', '| ---- | ---- | ---- |']
  const rows = names.map((name) => {
    const node = props[name]
    const base = `| \`${name}\` | ${typeOf(node)} | ${required.has(name) ? '是' : '否'}`
    if (!hasDesc) return `${base} |`
    const desc = asJson(node)['description']
    return `${base} | ${typeof desc === 'string' ? desc : ''} |`
  })
  return [...head, ...rows, ''].join('\n')
}

const types = Object.keys(EventSchemas).sort((a, b) => a.localeCompare(b)) as SparkEventType[]
const durableCount = types.filter((t) => !liveOnly.has(t)).length

const parts: string[] = [
  '# 事件词表参考',
  '',
  '> **本文件由 `apps/docs/scripts/gen-events.ts` 自动生成——勿手改。**',
  '> 事实源是 `@spark/protocol` 的 zod schema；改过 schema 后跑 `pnpm --filter @spark/docs gen:events`，',
  '> CI 会重跑并 `git diff --exit-code apps/docs/events.md` 校同步（与契约用例生成物同一套门禁思路）。',
  '',
  `词表共 **${types.length} 种**事件：durable ${durableCount} 种（落 JSONL、可回放、可审计）、`,
  `live-only ${liveOnly.size} 种（不落盘，重连后不重现）；其中 surface ${surface.size} 种`,
  '（模型可见面，引擎铁律"模型可见必被记录"的对象）。',
  '',
  '三条纪律（详见仓库 `ARCHITECTURE.md` 与 `doc/02-development-plan.md` §4.3）：',
  '',
  '- **durable / live 二分**：只有 delta 类是 live；其余一律落盘，回放即可重建界面。',
  '- **surface 纪律**：模型看得到的内容必有对应 durable 事件，禁止只存在于提示词里。',
  '- **失败闭合**：事件流永不悬空——回合必有 `turn.completed`（含 error/aborted 收尾）。',
  '',
  '## 信封（所有事件共用）',
  '',
  fieldsTable(EnvelopeSchema),
  '## 事件',
  '',
]

for (const type of types) {
  const kind = liveOnly.has(type) ? 'live-only（不落盘）' : 'durable（落盘可回放）'
  parts.push(`### \`${type}\``, '')
  parts.push(`- 分类：${kind}${surface.has(type) ? ' · **surface**（模型可见面）' : ''}`)
  parts.push('')
  parts.push(fieldsTable(EventSchemas[type]))
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'events.md')
writeFileSync(out, `${parts.join('\n')}\n`, 'utf8')
process.stdout.write(
  `[gen-events] ${out}：${types.length} 种事件（durable ${durableCount} / live ${liveOnly.size} / surface ${surface.size}）\n`,
)
