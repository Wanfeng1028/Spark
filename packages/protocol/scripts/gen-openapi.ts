/**
 * OpenAPI 导出器（阶段十五工单 15.2 / doc/08 §15.2）。
 *
 * 跑法：`pnpm --filter @spark/protocol gen:openapi`（tsx 直跑，同 gen:contract 模式）。
 * 生成物：`openapi.json`（OpenAPI 3.1，入库）；CI 同步门禁：重跑本生成器 +
 * `git diff --exit-code packages/protocol/openapi.json`——改了路由或 schema 却不
 * 重生成即红（同 14.2 契约同步口径）。
 *
 * 组成：
 * 1. **路由元数据**（src/openapi-routes.ts 手工维护，逐条反推自 apps/server routes）；
 * 2. **组件 schema**：protocol 的 zod schema（api.ts/primitives.ts）经 z.toJSONSchema
 *    合成——DTO 单一来源；SessionDto（SessionMetaDto + events）与 SparkEventEnvelope
 *    （信封）在生成器内组装；
 * 3. **生成期结构自检**（"swagger 校验"的内置实现）：openapi 版本字段 / 每个操作必有
 *    responses / 全部 $ref 可解析 / 路径模板参数必有 parameter 声明 / 路由无重复——
 *    任何一条不过即退出码 1（不写半成品文件）。
 *
 * 已登记限制：Python 客户端生成（openapi-generator 需 Java 工具链）与文档站 Python 页
 * 不做，待外部需求触发（doc/08 §15.2 v1 范围收口）。
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import * as api from '../src/api.js'
import { ReasoningEffortSchema } from '../src/primitives.js'
import { jsonSchemas } from '../src/schema.js'
import { OPENAPI_ROUTES, type OpenApiMethod, type OpenApiSchemaNode } from '../src/openapi-routes.js'

// ---------- 组件清单（名 → zod schema；zod 单一来源，禁手写 DTO 形状） ----------

const COMPONENTS: Record<string, z.ZodType> = {
  SessionMetaDto: api.SessionMetaDtoSchema,
  TreeNodeDto: api.TreeNodeDtoSchema,
  CheckpointDto: api.CheckpointDtoSchema,
  PermissionRuleDto: api.PermissionRuleDtoSchema,
  SecretStatusDto: api.SecretStatusDtoSchema,
  PermissionPreset: api.PermissionPresetSchema,
  ModelsDto: api.ModelsDtoSchema,
  ModelTestResultDto: api.ModelTestResultDtoSchema,
  RoutingDto: api.RoutingDtoSchema,
  RoutingUpdate: api.RoutingUpdateSchema,
  UsageSummaryDto: api.UsageSummaryDtoSchema,
  TraceDto: api.TraceDtoSchema,
  SettingsDto: api.SettingsDtoSchema,
  SettingsUpdate: api.SettingsUpdateSchema,
  TrustStatusDto: api.TrustStatusDtoSchema,
  ExtensionDto: api.ExtensionDtoSchema,
  AgentPresetDto: api.AgentPresetDtoSchema,
  CommandDto: api.CommandDtoSchema,
  ExecuteCommandBody: api.ExecuteCommandBodySchema,
  McpServerDto: api.McpServerDtoSchema,
  SkillDto: api.SkillDtoSchema,
  MemoryDto: api.MemoryDtoSchema,
  AutomationTriggerDto: api.AutomationTriggerDtoSchema,
  AutomationCreate: api.AutomationCreateSchema,
  AutomationRunDto: api.AutomationRunDtoSchema,
  AuditEntryDto: api.AuditEntryDtoSchema,
  SearchHitDto: api.SearchHitDtoSchema,
  PairStatusDto: api.PairStatusDtoSchema,
  PairCodeDto: api.PairCodeDtoSchema,
  PairRedeemBody: api.PairRedeemBodySchema,
  PairTokenDto: api.PairTokenDtoSchema,
  FsEntryDto: api.FsEntryDtoSchema,
  FsListDto: api.FsListDtoSchema,
  FsTreeDto: api.FsTreeDtoSchema,
  AttachmentDto: api.AttachmentDtoSchema,
  TranscribeRequest: api.TranscribeRequestSchema,
  TranscribeResultDto: api.TranscribeResultDtoSchema,
  LspServerStatusDto: api.LspServerStatusDtoSchema,
  ReasoningEffort: ReasoningEffortSchema,
}

/** SessionDto = SessionMetaDto + events（api.ts 的 interface 组合在生成器内落地） */
const SESSION_DTO_SCHEMA: OpenApiSchemaNode = {
  allOf: [
    { $ref: '#/components/schemas/SessionMetaDto' },
    {
      type: 'object',
      properties: {
        events: { type: 'array', items: { $ref: '#/components/schemas/SparkEventEnvelope' } },
      },
    },
  ],
}

// ---------- 组装 ----------

function buildComponents(): Record<string, OpenApiSchemaNode> {
  const schemas: Record<string, OpenApiSchemaNode> = {}
  for (const [name, schema] of Object.entries(COMPONENTS).sort(([a], [b]) => a.localeCompare(b))) {
    schemas[name] = z.toJSONSchema(schema) as OpenApiSchemaNode
  }
  schemas.SessionDto = SESSION_DTO_SCHEMA
  // wire 信封（jsonSchemas 单一来源——schema.ts 既有导出转生产用，见其头注）
  schemas.SparkEventEnvelope = jsonSchemas.envelope as OpenApiSchemaNode
  return schemas
}

/** 路径模板参数名收集（/{id} → ['id']） */
function pathParamsOf(path: string): string[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '')
}

function parametersOf(route: (typeof OPENAPI_ROUTES)[number]): OpenApiSchemaNode[] {
  const params: OpenApiSchemaNode[] = []
  for (const name of pathParamsOf(route.path)) {
    const schema = route.paramSchemas?.[name] ?? { type: 'string' }
    params.push({ name, in: 'path', required: true, schema })
  }
  for (const [name, schema] of Object.entries(route.query ?? {})) {
    params.push({ name, in: 'query', schema })
  }
  return params
}

function buildOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const route of OPENAPI_ROUTES) {
    const item = (paths[route.path] ??= {})
    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: route.summary,
      responses: {
        ...(route.rawResponse !== undefined
          ? {
              [String(route.status ?? 200)]: {
                description: route.rawResponse.description,
                content: { [route.rawResponse.contentType]: { schema: { type: 'string' } } },
              },
            }
          : route.response !== undefined
            ? {
                [String(route.status ?? 200)]: {
                  description: '成功',
                  content: { 'application/json': { schema: route.response } },
                },
              }
            : { [String(route.status ?? 204)]: { description: '成功（无响应体）' } }),
      },
    }
    const parameters = parametersOf(route)
    if (parameters.length > 0) operation.parameters = parameters
    if (route.rawBody !== undefined) {
      operation.requestBody = {
        required: true,
        content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        description: route.rawBody.description,
      }
    } else if (route.body !== undefined) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: route.body } },
      }
    }
    item[route.method] = operation
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Spark HTTP API',
      version: '0.1.0',
      description:
        'Spark Agent 工作台的 REST+SSE API（本文件由 scripts/gen-openapi.ts 生成，勿手改；' +
        '事实源 apps/server/src/routes/* 与 packages/protocol schema）。',
      license: { name: 'MIT' },
    },
    servers: [{ url: 'http://127.0.0.1:4318', description: '本地缺省（127.0.0.1 是刻意的，ADR 红线）' }],
    tags: [...new Set(OPENAPI_ROUTES.map((r) => r.tag))].sort().map((t) => ({ name: t })),
    paths,
    components: { schemas: buildComponents() },
  }
}

// ---------- 生成期结构自检（"swagger 校验"的内置实现） ----------

function collectRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRefs(child, out)
    return
  }
  if (typeof node === 'object' && node !== null) {
    const rec = node as Record<string, unknown>
    const r = rec.$ref
    if (typeof r === 'string') out.add(r)
    for (const child of Object.values(rec)) collectRefs(child, out)
  }
}

function selfCheck(doc: Record<string, unknown>): void {
  const problems: string[] = []
  if (doc.openapi !== '3.1.0') problems.push('openapi 版本字段缺失或非 3.1.0')

  const paths = doc.paths as Record<string, Record<string, OpenApiSchemaNode>>
  if (paths === undefined || Object.keys(paths).length === 0) problems.push('paths 为空')
  const METHODS = new Set<OpenApiMethod>(['get', 'post', 'put', 'delete'])

  // 路由无重复（同一 method+path 出现两次 = 元数据表错误）
  const seen = new Set<string>()
  for (const route of OPENAPI_ROUTES) {
    const key = `${route.method} ${route.path}`
    if (seen.has(key)) problems.push(`路由重复：${key}`)
    seen.add(key)
    if (!METHODS.has(route.method)) problems.push(`非法 method：${key}`)
  }

  // 每个操作必有 responses；路径模板参数必有 parameter 声明
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(item)) {
      const operation = op as { responses?: unknown; parameters?: OpenApiSchemaNode[] }
      if (operation.responses === undefined || Object.keys(operation.responses).length === 0) {
        problems.push(`${method.toUpperCase()} ${path} 缺 responses`)
      }
      const declared = new Set(
        (operation.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name),
      )
      for (const name of pathParamsOf(path)) {
        if (!declared.has(name)) problems.push(`${method.toUpperCase()} ${path} 路径参数 {${name}} 无声明`)
      }
    }
  }

  // 全部 $ref 可解析到 components.schemas
  const refs = new Set<string>()
  collectRefs(doc, refs)
  const schemas = (doc.components as { schemas: Record<string, unknown> }).schemas
  for (const r of refs) {
    const name = r.replace('#/components/schemas/', '')
    if (!r.startsWith('#/components/schemas/') || schemas[name] === undefined) {
      problems.push(`$ref 不可解析：${r}`)
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`E_OPENAPI_CHECK: openapi.json 结构自检未过：\n${problems.map((p) => `  - ${p}`).join('\n')}\n`)
    process.exit(1)
  }
}

// ---------- main ----------

const doc = buildOpenApiDocument()
selfCheck(doc)
const outFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json')
writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`)
process.stdout.write(`openapi.json 已生成：${Object.keys((doc.paths as object)).length} 路径 / ${Object.keys((doc.components as { schemas: object }).schemas).length} 组件（结构自检通过）\n`)
