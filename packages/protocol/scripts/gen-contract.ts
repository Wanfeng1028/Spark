/**
 * 契约用例生成器（工单 14.2 / doc/06 §1 L1.5 契约层）。
 *
 * 跑法：`pnpm --filter @spark/protocol gen:contract`（tsx 直跑，同 examples/evals 模式）。
 * 生成物：`tests/contract/*.contract.test.ts`（头部标注"自动生成，勿手改"，入库）。
 * CI 同步校验：ci.yml 在 test 步之前重跑本生成器，再 `git diff --exit-code packages/protocol/tests/contract`
 * ——改了 schema 却不重生成即红（工单验收第 2 条）。
 *
 * 三条设计纪律：
 * 1. **事实源唯一**：样例值全部由 zod schema 经 `z.toJSONSchema` 推导，脚本里不写任何业务样例
 *    （唯一的手工表是 PATTERN_SAMPLES：受约束字符串的正则→样例映射，见下）。
 * 2. **禁随机**（提示词第 2 条）：合成器对每个节点取确定值（枚举取首项、数字取下界、字符串取固定词），
 *    同一 schema 永远生成同一份文件——否则 CI 的 diff 门禁无法成立。
 * 3. **不猜**：遇到合成器不支持的 JSON Schema 构造就抛错并指明 schema 名与路径，
 *    由人决定是补支持还是进 EXEMPT（带理由）——宁可生成失败，不产出貌似合理的假样例。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import * as api from '../src/api.js'
import * as ids from '../src/ids.js'
import * as primitives from '../src/primitives.js'
import { EnvelopeSchema } from '../src/schema.js'
import { EventSchemas } from '../src/events.js'

// ---------- 目标清单（自动枚举，不手写名单） ----------

interface Target {
  /** describe 名（也是生成用例的稳定标识） */
  name: string
  /** 生成代码里引用该 schema 的表达式 */
  ref: string
  schema: z.ZodType
}

function isZodType(value: unknown): value is z.ZodType {
  return typeof value === 'object' && value !== null && '_zod' in value
}

/** 模块里所有 `*Schema` 导出（新增 DTO 自动纳入——这就是"合同面不许悄悄胀大"的棘轮） */
function schemasOf(mod: Record<string, unknown>, prefix: string): Target[] {
  return Object.entries(mod)
    .filter(([key, value]) => key.endsWith('Schema') && isZodType(value))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ name: `${prefix}${key}`, ref: `${moduleNameOf(prefix)}.${key}`, schema: value as z.ZodType }))
}

function moduleNameOf(prefix: string): string {
  if (prefix.startsWith('api.')) return 'api'
  if (prefix.startsWith('primitives.')) return 'primitives'
  return 'ids'
}

const TARGETS: Target[] = [
  // wire 信封（doc/02 §4.4：磁盘行与 SSE 帧同构）
  { name: 'EnvelopeSchema', ref: 'EnvelopeSchema', schema: EnvelopeSchema },
  // 事件词表（21 种；EventSchemas 是唯一来源）
  ...Object.entries(EventSchemas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, schema]) => ({
      name: `event '${type}'`,
      ref: `EventSchemas['${type}']`,
      schema: schema as z.ZodType,
    })),
  ...schemasOf(ids as unknown as Record<string, unknown>, 'ids.'),
  ...schemasOf(primitives as unknown as Record<string, unknown>, 'primitives.'),
  ...schemasOf(api as unknown as Record<string, unknown>, 'api.'),
]

/**
 * 豁免表：合成器覆盖不了或没有契约意义的 schema（每条必须写理由）。
 * 目标是让本表**保持为空**——新增豁免等于承认合同面有一处没被机器验证。
 */
const EXEMPT: Record<string, string> = {}

// ---------- 样例合成（走 JSON Schema，不碰 zod 内部结构） ----------

/** 受约束字符串：正则 → 确定样例。新正则进来若没登记，生成器抛错（不猜）。 */
const PATTERN_SAMPLES: Record<string, string> = {
  '^ses_[0-9A-Za-z]+$': 'ses_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '^trn_[0-9A-Za-z]+$': 'trn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '^evt_[0-9A-Za-z]+$': 'evt_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '^req_[0-9A-Za-z]+$': 'req_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '^ckp_[0-9A-Za-z]+$': 'ckp_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '^[A-Za-z0-9_-]{1,128}$': 'call_contract_sample_1',
  '^\\d{4}-\\d{2}-\\d{2}$': '2026-09-09',
  '^\\d{6}$': '123456',
}

/** format → 确定样例 */
const FORMAT_SAMPLES: Record<string, string> = {
  uri: 'https://example.com/spark',
  'date-time': '2026-09-09T08:00:00.000Z',
  email: 'contract@example.com',
}

type Json = Record<string, unknown>

function fail(schemaName: string, path: string, why: string): never {
  throw new Error(
    `[gen-contract] ${schemaName} 的 ${path || '<root>'} 无法合成样例：${why}\n` +
      '  → 补合成器支持，或在 PATTERN_SAMPLES/EXEMPT 里登记（EXEMPT 必须写理由）。',
  )
}

function resolveRef(node: Json, root: Json, schemaName: string, path: string): Json {
  const ref = node['$ref']
  if (typeof ref !== 'string') return node
  if (!ref.startsWith('#/')) fail(schemaName, path, `不支持的 $ref 形式 ${ref}`)
  let cur: unknown = root
  for (const seg of ref.slice(2).split('/')) {
    if (typeof cur !== 'object' || cur === null) fail(schemaName, path, `$ref ${ref} 解析失败`)
    cur = (cur as Json)[seg]
  }
  if (typeof cur !== 'object' || cur === null) fail(schemaName, path, `$ref ${ref} 指向空`)
  return cur as Json
}

/** 取一个确定样例值 */
function sampleOf(node: Json, root: Json, schemaName: string, path: string): unknown {
  const resolved = resolveRef(node, root, schemaName, path)

  if ('const' in resolved) return resolved['const']
  if ('enum' in resolved) {
    const options: unknown = resolved['enum']
    if (!Array.isArray(options) || options.length === 0) fail(schemaName, path, 'enum 为空')
    const list = options as unknown[]
    // 优先取非 null 项（nullable 枚举的语义主体在前）
    return list.find((o) => o !== null) ?? list[0]
  }
  for (const key of ['oneOf', 'anyOf'] as const) {
    const variants: unknown = resolved[key]
    if (Array.isArray(variants) && variants.length > 0) {
      const list = variants as Json[]
      const picked =
        list.find((v) => v['type'] !== 'null' && !('const' in v && v['const'] === null)) ?? list[0]
      if (picked === undefined) fail(schemaName, path, `${key} 无可用分支`)
      return sampleOf(picked, root, schemaName, `${path}/${key}[0]`)
    }
  }
  if (Array.isArray(resolved['allOf'])) {
    // 只支持对象型 allOf（浅合并）；本仓当前没有别的用法，出现新用法就抛错
    const merged: Json = { type: 'object', properties: {}, required: [] }
    for (const part of resolved['allOf'] as Json[]) {
      const sub = resolveRef(part, root, schemaName, `${path}/allOf`)
      if (sub['type'] !== 'object') fail(schemaName, path, 'allOf 里出现非对象分支')
      Object.assign(merged['properties'] as Json, sub['properties'] ?? {})
      ;(merged['required'] as string[]).push(...((sub['required'] as string[] | undefined) ?? []))
      if (sub['additionalProperties'] !== undefined) {
        merged['additionalProperties'] = sub['additionalProperties']
      }
    }
    return sampleOf(merged, root, schemaName, `${path}/allOf`)
  }

  const type = resolved['type']
  const types = Array.isArray(type) ? (type as string[]) : type === undefined ? [] : [type as string]
  const main = types.find((t) => t !== 'null')

  // 无 type 无约束 = z.unknown()：任意值合法，取一个确定字符串
  if (main === undefined) {
    if (Object.keys(resolved).filter((k) => k !== '$schema').length === 0) return 'contract-sample'
    fail(schemaName, path, `无法从 ${JSON.stringify(resolved)} 判定类型`)
  }

  switch (main) {
    case 'string': {
      const pattern = resolved['pattern']
      if (typeof pattern === 'string') {
        const hit = PATTERN_SAMPLES[pattern]
        if (hit === undefined) fail(schemaName, path, `未登记的字符串正则 ${pattern}`)
        return hit
      }
      const format = resolved['format']
      if (typeof format === 'string') {
        const hit = FORMAT_SAMPLES[format]
        if (hit === undefined) fail(schemaName, path, `未登记的 format ${format}`)
        return hit
      }
      const min = typeof resolved['minLength'] === 'number' ? resolved['minLength'] : 0
      const max = typeof resolved['maxLength'] === 'number' ? resolved['maxLength'] : undefined
      let out = 'contract-sample'
      if (out.length < min) out = out + 'a'.repeat(min - out.length)
      if (max !== undefined && out.length > max) out = out.slice(0, max)
      if (max !== undefined && min > max) fail(schemaName, path, `minLength ${min} > maxLength ${max}`)
      if (out.length < min) fail(schemaName, path, `无法合成满足 minLength=${min} 的样例`)
      return out
    }
    case 'integer':
    case 'number': {
      const exclusiveMin = resolved['exclusiveMinimum']
      const min = resolved['minimum']
      const max = resolved['maximum']
      let value: number
      if (typeof exclusiveMin === 'number') value = exclusiveMin + 1
      else if (typeof min === 'number') value = Math.max(min, min === 0 ? 1 : min)
      else value = 1
      if (main === 'integer') value = Math.ceil(value)
      if (typeof max === 'number' && value > max) value = max
      return value
    }
    case 'boolean':
      return false
    case 'null':
      return null
    case 'array': {
      const items = resolved['items']
      const minItems = typeof resolved['minItems'] === 'number' ? resolved['minItems'] : 1
      const count = Math.max(minItems, 1)
      if (items === undefined) fail(schemaName, path, 'array 无 items')
      if (Array.isArray(items)) fail(schemaName, path, '不支持 tuple 形式的 items')
      return Array.from({ length: count }, (_, i) =>
        sampleOf(items as Json, root, schemaName, `${path}/items[${i}]`),
      )
    }
    case 'object': {
      const properties = resolved['properties'] as Json | undefined
      const propertyNames = resolved['propertyNames'] as Json | undefined
      const additional = resolved['additionalProperties']
      // z.record(k, v)：无 properties，靠 propertyNames + additionalProperties
      if (properties === undefined && propertyNames !== undefined && isSchemaNode(additional)) {
        const key = String(sampleOf(propertyNames, root, schemaName, `${path}/propertyNames`))
        return { [key]: sampleOf(additional, root, schemaName, `${path}/additionalProperties`) }
      }
      if (properties === undefined) {
        // 无 properties 也无 record 形状：空对象（z.unknown()/z.object({}) 的合法值）
        return {}
      }
      const out: Json = {}
      for (const [key, sub] of Object.entries(properties)) {
        out[key] = sampleOf(sub as Json, root, schemaName, `${path}/${key}`)
      }
      return out
    }
    default:
      fail(schemaName, path, `不支持的 type ${main}`)
  }
}

function isSchemaNode(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------- 变异（非法样例）----------

/** 与该节点类型相反的值——用于"类型错必须被拒"断言；回 null = 该节点无从变异（z.unknown()） */
function wrongValueFor(node: Json, root: Json, schemaName: string, path: string): unknown {
  const resolved = resolveRef(node, root, schemaName, path)
  if ('const' in resolved || 'enum' in resolved) return '__contract_bogus_enum__'
  const type = resolved['type']
  const types = Array.isArray(type) ? (type as string[]) : type === undefined ? [] : [type as string]
  const main = types.find((t) => t !== 'null')
  if (main === undefined) return null // z.unknown()：任何值都合法，无从变异
  switch (main) {
    case 'string':
      return 12345
    case 'integer':
    case 'number':
      return 'not-a-number'
    case 'boolean':
      return 'not-a-boolean'
    case 'array':
      return 'not-an-array'
    case 'object':
      return []
    default:
      return null
  }
}

interface Mutation {
  title: string
  /** 生成代码里构造非法值的表达式（以 sample 为基） */
  expr: string
}

function mutationsFor(root: Json, schemaName: string): Mutation[] {
  const out: Mutation[] = []
  const type = root['type']
  const main = Array.isArray(type) ? (type as string[]).find((t) => t !== 'null') : type

  if (main === 'object' && isSchemaNode(root['properties'])) {
    const properties = root['properties'] as Json
    const required = (root['required'] as string[] | undefined) ?? []
    for (const key of required) {
      out.push({
        title: `缺必填字段 ${key} → 解析失败`,
        expr: `(() => { const m = structuredClone(sample) as Record<string, unknown>; delete m[${JSON.stringify(key)}]; return m })()`,
      })
    }
    for (const [key, sub] of Object.entries(properties)) {
      const wrong = wrongValueFor(sub as Json, root, schemaName, key)
      if (wrong === null) continue
      out.push({
        title: `字段 ${key} 类型错 → 解析失败`,
        expr: `(() => { const m = structuredClone(sample) as Record<string, unknown>; m[${JSON.stringify(key)}] = ${JSON.stringify(wrong)}; return m })()`,
      })
    }
    if (root['additionalProperties'] === false) {
      out.push({
        title: '未知键 → strictObject 拒收',
        expr: `{ ...sample, __contract_probe__: 1 }`,
      })
    }
    return out
  }

  // 顶层非对象（id/枚举/字符串/数字等基元合同）
  if (main === 'string') {
    out.push({ title: '类型错（数字）→ 解析失败', expr: `12345` })
    if (typeof root['minLength'] === 'number' && root['minLength'] > 0) {
      out.push({ title: '空串 → 解析失败（minLength）', expr: `''` })
    }
    if (typeof root['pattern'] === 'string') {
      out.push({ title: '不合正则 → 解析失败', expr: `'__contract_bogus__'` })
    }
    return out
  }
  if (main === 'integer' || main === 'number') {
    out.push({ title: '类型错（字符串）→ 解析失败', expr: `'not-a-number'` })
    if (root['minimum'] !== undefined || root['exclusiveMinimum'] !== undefined) {
      out.push({ title: '负值 → 解析失败（下界）', expr: `-1` })
    }
    return out
  }
  if ('enum' in root || 'const' in root) {
    out.push({ title: '词表外的值 → 解析失败', expr: `'__contract_bogus_enum__'` })
    return out
  }
  if (main === 'boolean') {
    out.push({ title: '类型错（字符串）→ 解析失败', expr: `'not-a-boolean'` })
    return out
  }
  if (main === 'array') {
    out.push({ title: '类型错（字符串）→ 解析失败', expr: `'not-an-array'` })
    return out
  }
  return out
}

// ---------- 发射 ----------

const HEADER = (source: string) => `// 自动生成，勿手改 —— packages/protocol/scripts/gen-contract.ts（工单 14.2 / doc/06 §1 L1.5 契约层）。
// 重新生成：pnpm --filter @spark/protocol gen:contract
// CI 同步门禁：ci.yml 在 test 步之前重跑生成器并 git diff --exit-code 本目录——改 schema 不重生成即红。
// 事实源：${source}（本文件不含任何手写样例或手写断言）。
`

/** 发射进单引号字符串字面量的文本必须先转义（事件名形如 event 'turn.started'，不转义会截断生成的 describe 标题） */
function sq(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function emitFile(fileName: string, source: string, targets: Target[]): string {
  const lines: string[] = [HEADER(source)]
  lines.push("import { describe, expect, it } from 'vitest'")
  lines.push("import { z } from 'zod'")
  if (targets.some((t) => t.ref.startsWith('api.'))) lines.push("import * as api from '../../src/api.js'")
  if (targets.some((t) => t.ref.startsWith('ids.'))) lines.push("import * as ids from '../../src/ids.js'")
  if (targets.some((t) => t.ref.startsWith('primitives.'))) {
    lines.push("import * as primitives from '../../src/primitives.js'")
  }
  if (targets.some((t) => t.ref === 'EnvelopeSchema')) {
    lines.push("import { EnvelopeSchema } from '../../src/schema.js'")
  }
  if (targets.some((t) => t.ref.startsWith('EventSchemas'))) {
    lines.push("import { EventSchemas } from '../../src/events.js'")
  }
  lines.push('')

  for (const target of targets) {
    const root = z.toJSONSchema(target.schema) as Json
    const sample = sampleOf(root, root, target.name, '')
    const mutations = mutationsFor(root, target.name)
    lines.push(`describe('契约：${sq(target.name)}', () => {`)
    lines.push(`  const sample = ${JSON.stringify(sample, null, 2)
      .split('\n')
      .map((l, i) => (i === 0 ? l : `  ${l}`))
      .join('\n')}`)
    lines.push('')
    lines.push(`  it('合法样例：zod 解析幂等 + JSON 往返一致', () => {`)
    lines.push(`    expect(${target.ref}.parse(sample)).toEqual(sample)`)
    lines.push(`    expect(${target.ref}.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)`)
    lines.push(`  })`)
    lines.push('')
    lines.push(`  it('JSON Schema 可导出（zod → JSON Schema 是 SDK/OpenAPI 的公共出口）', () => {`)
    lines.push(`    expect(z.toJSONSchema(${target.ref})).toBeTypeOf('object')`)
    lines.push(`  })`)
    for (const m of mutations) {
      lines.push('')
      lines.push(`  it('${sq(m.title)}', () => {`)
      lines.push(`    expect(() => ${target.ref}.parse(${m.expr})).toThrow()`)
      lines.push(`  })`)
    }
    lines.push('})')
    lines.push('')
  }
  return lines.join('\n')
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const outDir = join(here, '..', 'tests', 'contract')
  mkdirSync(outDir, { recursive: true })

  const exemptNames = new Set(Object.keys(EXEMPT))
  const active = TARGETS.filter((t) => !exemptNames.has(t.name))
  const skipped = TARGETS.filter((t) => exemptNames.has(t.name))

  // wire 层（信封 + 事件词表）与 DTO 层（ids/primitives/api）分文件，便于定位
  const wire = active.filter((t) => t.ref === 'EnvelopeSchema' || t.ref.startsWith('EventSchemas'))
  const dto = active.filter((t) => !wire.includes(t))

  writeFileSync(join(outDir, 'wire.contract.test.ts'), emitFile('wire.contract.test.ts', 'src/schema.ts + src/events.ts', wire), 'utf8')
  writeFileSync(join(outDir, 'dto.contract.test.ts'), emitFile('dto.contract.test.ts', 'src/ids.ts + src/primitives.ts + src/api.ts', dto), 'utf8')

  process.stdout.write(
    `[gen-contract] 生成 ${wire.length + dto.length} 个契约 describe（wire ${wire.length} / dto ${dto.length}）` +
      (skipped.length > 0
        ? `；豁免 ${skipped.length} 个：${skipped.map((s) => `${s.name}（${EXEMPT[s.name]}）`).join('、')}`
        : '；豁免表为空') +
      '\n',
  )
}

main()
