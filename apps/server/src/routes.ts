/**
 * REST 路由（doc/02 §7.2）：zod 解析 → engine 调用 → DTO 序列化；错误经 errors.ts 映射。
 * 端点清单 = §4.5 表（tree/fork 工单 4.5、checkpoints/rollback 工单 4.6、
 * permission rules 工单 4.7 注册）；并发安全由引擎单写者保证，路由层无锁。
 */
import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import type { FastifyPluginCallback } from 'fastify'
import { z } from 'zod'
import {
  AutomationCreateSchema,
  CheckpointIdSchema,
  DeliverySchema,
  EventIdSchema,
  ExecuteCommandBodySchema,
  FsQuerySchema,
  PermissionPresetSchema,
  PermissionReplySchema,
  PermissionRuleDtoSchema,
  ReasoningEffortSchema,
  RequestIdSchema,
  RoutingUpdateSchema,
  SessionIdSchema,
  SettingsUpdateSchema,
  TurnIdSchema,
} from '@spark/protocol'
import type { CheckpointDto, SessionId, SparkEventEnvelope, TreeNodeDto } from '@spark/protocol'
import type {
  Engine,
  SessionHandle,
  SessionMeta,
  SessionTreeInfo,
  SessionTreeNode,
} from '@spark/engine'
import { resolveInRoot } from '@spark/engine'
import type { SessionMetaDto } from '@spark/protocol'
import { notFound, parseOr400, replyOutcomeError, sendError } from './errors.js'

export interface RoutesOptions {
  engine: Engine
}

/** 引擎 SessionMeta + 实时状态 → 线上 DTO（§4.5.1） */
function toDto(engine: Engine, meta: SessionMeta): SessionMetaDto {
  return {
    id: meta.id,
    title: meta.title,
    model: meta.model,
    cwd: meta.cwd,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    lastSeq: meta.lastSeq,
    status: engine.statusOf(meta.id),
    // 工单 10.6：分支/档位真值透传（缺省不携带——前端禁假状态不渲染）
    ...(meta.branch !== undefined ? { branch: meta.branch } : {}),
    ...(meta.effort !== undefined ? { effort: meta.effort } : {}),
  }
}

/** :id 路由通用入口：已加载直接用，未加载先 resumeSession（§7.2 GET 规格） */
async function requireHandle(engine: Engine, id: SessionId): Promise<SessionHandle> {
  return engine.getSession(id) ?? engine.resumeSession(id)
}

const CreateSessionBody = z.strictObject({
  title: z.string().optional(),
  model: z.string().optional(),
  cwd: z.string().optional(),
})

const ListSessionsQuery = z.object({
  limit: z.coerce.number().int().positive().default(50),
  cursor: SessionIdSchema.optional(),
})

/**
 * GET /api/sessions/:id 事件分页查询（工单 9.3）：全可选——缺省 = 全量回放（向后兼容红线）。
 * limit 升序尾部切片（上限 200）；before = seq 游标（只返回 seq < before）。
 */
const SessionDetailQuery = z.strictObject({
  limit: z.coerce.number().int().positive().max(200).optional(),
  before: z.coerce.number().int().positive().optional(),
})

const SendMessageBody = z.strictObject({
  text: z.string().min(1),
  delivery: DeliverySchema.default('now'),
  expectedTurnId: TurnIdSchema.optional(),
})

const ReplyBody = z.strictObject({
  reply: PermissionReplySchema,
  feedback: z.string().optional(),
})

const IdParams = z.strictObject({ id: SessionIdSchema })
/** @ 文件路径补全目录列举上限（工单 10.53）：防大目录（node_modules 根）巨响应；目录优先字典序后截断 */
const FS_LIST_LIMIT = 200
const RequestIdParams = z.strictObject({ requestId: RequestIdSchema })
const RollbackParams = z.strictObject({ id: SessionIdSchema, cid: CheckpointIdSchema })

const ForkBody = z.strictObject({ fromEventId: EventIdSchema })

const RemoveRuleBody = z.strictObject({ action: z.string().min(1), resource: z.string().min(1) })

/** 密钥仓（阶段七工单 7.1 / H01） */
const SecretProviderParams = z.strictObject({ provider: z.string().min(1) })

const SetSecretBody = z.strictObject({ value: z.string().min(1) })

/** 权限档位（DESIGN §13.E 四档 / D7 补记预设层，工单 6.3） */
const PresetBody = z.strictObject({ preset: PermissionPresetSchema })

/** 模型管理（工单 6.5）：供应商连通测试参数 + 会话级换模型 body */
const ProviderIdParams = z.strictObject({ providerId: z.string().min(1).max(64) })
const SetModelBody = z.strictObject({ model: z.string().min(1) })

/** 推理档位（工单 10.6）：会话级换档 body */
const SetEffortBody = z.strictObject({ effort: ReasoningEffortSchema })

/** 命令注册表（阶段七工单 7.4 / H04）：命令名与执行 body */
const CommandNameParams = z.strictObject({
  id: SessionIdSchema,
  name: z.string().min(1).max(64),
})

/** 长期记忆（工单 7.5）：删除参数 */
const MemoryIdParams = z.strictObject({ id: z.coerce.number().int().positive() })

/** 自动化触发器（工单 7.6）：触发器 id 路径 / 启停 body / 运行历史 limit */
const AutomationIdParams = z.strictObject({ id: z.string().min(1) })
const AutomationEnabledBody = z.strictObject({ enabled: z.boolean() })
const AutomationRunsQuery = z.strictObject({
  limit: z.coerce.number().int().positive().max(500).optional(),
})

/** 审计日志（工单 7.12 / H11）：明细流查询（时间/决策/工具过滤器数据源） */
const AuditQuery = z.strictObject({
  limit: z.coerce.number().int().positive().max(500).optional(),
  kind: z.enum(['permission.decision', 'permission.rule', 'session.rollback']).optional(),
  result: z.enum(['allow', 'deny', 'applied', 'ok']).optional(),
  tool: z.string().optional(),
  since: z.coerce.number().int().nonnegative().optional(),
})

/** 会话全文搜索（工单 7.13 / H12）：q 必填非空；limit 缺省 20 上限 100 */
const SearchQuery = z.strictObject({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

/** 浏览器截图供图（工单 7.10 / H09）：文件名白名单形状校验在引擎侧 */
const ArtifactParams = z.strictObject({ file: z.string().min(1) })

/** 事件渲染摘要（树视图 label，§5.8.6）：按类型取关键字段，截 60 字符；无文本事件为空串 */
function labelOf(e: SparkEventEnvelope): string {
  const data = e.data as Record<string, unknown>
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  let text = ''
  if (typeof data.text === 'string') text = data.text // user/assistant/reasoning 的 ended 终值
  else if (typeof data.title === 'string') text = data.title
  else if (typeof data.summary === 'string') text = data.summary
  else if (e.type === 'turn.started') text = 'turn 开始'
  else if (e.type === 'turn.completed') text = `turn 结束（${str(data.finish)}）`
  else if (e.type === 'tool.started') text = `工具 ${str(data.toolId)}`
  else if (e.type === 'permission.asked') text = `审批 ${str(data.requestId)}`
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

/** 引擎树数据 → 线上 DTO（forks 按边界事件归组到节点） */
function treeToDto(tree: SessionTreeInfo): TreeNodeDto[] {
  const forksByEvent = new Map<string, TreeNodeDto['forks']>()
  for (const f of tree.forks) {
    const list = forksByEvent.get(f.fromEventId) ?? []
    list.push({
      sessionId: f.child.sessionId,
      title: f.child.title,
      createdAt: f.child.createdAt,
      status: f.child.status,
    })
    forksByEvent.set(f.fromEventId, list)
  }
  const toDto = (n: SessionTreeNode): TreeNodeDto => ({
    id: n.event.id,
    parentId: n.parentId,
    seq: n.event.seq ?? 0,
    type: n.event.type,
    time: n.event.time,
    label: labelOf(n.event),
    childIds: n.childIds,
    forks: forksByEvent.get(n.event.id) ?? [],
  })
  return tree.nodes.map(toDto)
}

export const registerRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

  // 探活端点（阶段五工单 5.1）：桌面壳 sidecar 就绪轮询用；listen 成功即引擎可用
  app.get('/api/healthz', () => ({ ok: true }))

  app.post('/api/sessions', async (req, reply) => {
    const body = parseOr400(CreateSessionBody, req.body)
    const handle = await engine.createSession({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.model !== undefined ? { model: body.model } : {}),
      ...(body.cwd !== undefined ? { cwd: body.cwd } : {}),
    })
    return reply.code(201).send(toDto(engine, handle.meta))
  })

  app.get('/api/sessions', async (req, reply) => {
    const query = parseOr400(ListSessionsQuery, req.query)
    const all = await engine.listSessions() // 已按 updatedAt 倒序
    let start = 0
    if (query.cursor !== undefined) {
      const idx = all.findIndex((m) => m.id === query.cursor)
      if (idx === -1) {
        return notFound(reply)
      }
      start = idx + 1
    }
    return reply.send(all.slice(start, start + query.limit).map((m) => toDto(engine, m)))
  })

  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const query = parseOr400(SessionDetailQuery, req.query)
    const handle = await requireHandle(engine, id)
    // 事件分页（工单 9.3）：before 游标过滤 + limit 升序尾部切片；
    // 两参缺省 = 现状全量（缺省行为不变红线）
    let events = handle.events()
    if (query.before !== undefined) {
      const before = query.before
      events = events.filter((e) => e.seq !== undefined && e.seq < before)
    }
    if (query.limit !== undefined) {
      events = events.slice(-query.limit)
    }
    return reply.send({ ...toDto(engine, handle.meta), events })
  })

  /**
   * GET /api/sessions/:id/fs?path=（工单 10.53）：@ 文件路径补全的目录列举。
   * path = 相对会话 cwd 的部分路径，末段作前缀过滤，列举其父目录。硬边界经 resolveInRoot：
   * 越出 cwd（如 ../）或目录不存在一律如实空清单（补全 UI 不报错打断输入，且不泄露 cwd 外任何项）。
   */
  app.get('/api/sessions/:id/fs', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const query = parseOr400(FsQuerySchema, req.query)
    const handle = await requireHandle(engine, id)
    const rel = query.path.replace(/\\/g, '/') // Windows 反斜杠归一为 posix（@ token 用 /）
    const slash = rel.lastIndexOf('/')
    const dirRel = slash === -1 ? '' : rel.slice(0, slash)
    const prefix = slash === -1 ? rel : rel.slice(slash + 1)
    const base = dirRel === '' ? '' : `${dirRel}/`
    let dirents: Dirent[]
    try {
      // 硬边界（§6.4）：resolveInRoot 越出 cwd 抛 E_PATH_OUTSIDE → 落 catch 回空清单
      const absDir = resolveInRoot(handle.meta.cwd, dirRel === '' ? '.' : dirRel)
      dirents = await readdir(absDir, { withFileTypes: true })
    } catch {
      return reply.send({ path: dirRel, entries: [] })
    }
    const entries = dirents
      .filter((d) => d.name.startsWith(prefix))
      .map((d) => ({ name: d.name, path: `${base}${d.name}`, isDir: d.isDirectory() }))
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      .slice(0, FS_LIST_LIMIT)
    return reply.send({ path: dirRel, entries })
  })

  app.post('/api/sessions/:id/messages', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(SendMessageBody, req.body)
    const handle = await requireHandle(engine, id)
    // 三态直通：HTTP 只表达"已受理"，不等 turn 结果（§7.2）
    return reply.send(
      await handle.send(body.text, body.delivery, body.expectedTurnId),
    )
  })

  app.post('/api/sessions/:id/interrupt', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const handle = await requireHandle(engine, id)
    await handle.interrupt() // idle 时同样 200（幂等，§7.2）
    return reply.send({ ok: true })
  })

  app.post('/api/sessions/:id/compact', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const handle = await requireHandle(engine, id)
    // 等压缩完成再返回：started/completed 经 SSE 直播（§5.8.5 手动 /compact）
    await handle.compact()
    return reply.send({ ok: true })
  })

  app.get('/api/sessions/:id/tree', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    return reply.send(treeToDto(await engine.treeOf(id)))
  })

  app.post('/api/sessions/:id/fork', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(ForkBody, req.body)
    const handle = await engine.forkSession(id, body.fromEventId)
    return reply.code(201).send(toDto(engine, handle.meta))
  })

  app.get('/api/sessions/:id/checkpoints', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    // commit sha 不上线（CheckpointDto §4.5.1：checkpointId/turnId/createdAt/files）
    const rows: CheckpointDto[] = (await engine.checkpointsOf(id)).map((r) => ({
      checkpointId: r.checkpointId,
      turnId: r.turnId,
      createdAt: r.createdAt,
      files: r.files,
    }))
    return reply.send(rows)
  })

  app.post('/api/sessions/:id/checkpoints/:cid/rollback', async (req, reply) => {
    const { id, cid } = parseOr400(RollbackParams, req.params)
    // 回滚后 seq 回退：响应只回 meta，前端走 GET /:id 全量重放（§4.5 表注）
    const handle = await engine.rollbackToCheckpoint(id, cid)
    return reply.send(toDto(engine, handle.meta))
  })

  app.post('/api/permissions/:requestId', async (req, reply) => {
    const { requestId } = parseOr400(RequestIdParams, req.params)
    const body = parseOr400(ReplyBody, req.body)
    const outcome = await engine.replyPermission(
      requestId,
      body.reply,
      ...(body.feedback !== undefined ? [body.feedback] : []),
    )
    if (outcome !== 'ok') {
      // 409/404 三态映射收敛到 errors.ts replyOutcomeError（R-A：消除路由内联与前缀版重复）
      return sendError(req, reply, replyOutcomeError(outcome))
    }
    return reply.send({ ok: true })
  })

  // 权限规则管理（§5.7 规则表 / 工单 4.7）：用户级 permissions.json 的线上 CRUD
  app.get('/api/permissions/rules', async (req, reply) => {
    return reply.send({ rules: engine.listPermissionRules() })
  })

  app.post('/api/permissions/rules', async (req, reply) => {
    const rule = parseOr400(PermissionRuleDtoSchema, req.body)
    engine.addPermissionRule(rule)
    return reply.code(201).send({ ok: true })
  })

  app.delete('/api/permissions/rules', async (req, reply) => {
    const { action, resource } = parseOr400(RemoveRuleBody, req.body)
    if (!engine.removePermissionRule(action, resource)) {
      return reply.code(404).send({ code: 'E_NOT_FOUND', message: '规则不存在' })
    }
    return reply.send({ ok: true })
  })

  // 密钥管理（阶段七工单 7.1 / H01）：~/.spark/secrets.json 的线上 CRUD——
  // 值只进不回（GET 只报来源，PUT 写入后立即生效于后续 resolveModel）
  app.get('/api/secrets', async (req, reply) => {
    return reply.send({ secrets: engine.listSecrets() })
  })

  app.put('/api/secrets/:provider', async (req, reply) => {
    const { provider } = parseOr400(SecretProviderParams, req.params)
    const body = parseOr400(SetSecretBody, req.body)
    engine.setSecret(provider, body.value)
    return reply.send({ ok: true })
  })

  app.delete('/api/secrets/:provider', async (req, reply) => {
    const { provider } = parseOr400(SecretProviderParams, req.params)
    if (!engine.removeSecret(provider)) {
      return reply.code(404).send({ code: 'E_NOT_FOUND', message: '密钥仓中无此 provider' })
    }
    return reply.send({ ok: true })
  })

  // 权限档位（DESIGN §13.E 四档 / D7 补记：规则引擎之上的预设层，工单 6.3）
  app.get('/api/sessions/:id/permission-preset', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    await requireHandle(engine, id) // 存在性校验（未加载会话先 resume，与其他 :id 端点同纪律）
    return reply.send({ preset: engine.permissionPresetOf(id) })
  })

  app.put('/api/sessions/:id/permission-preset', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(PresetBody, req.body)
    await requireHandle(engine, id)
    engine.setPermissionPreset(id, body.preset)
    return reply.send({ ok: true })
  })

  // 模型管理（DESIGN §13.D③ / 工单 6.5 轻后端例外——本阶段唯一 engine/server 改动）
  app.get('/api/models', () => {
    // 纯读配置合成（无网络请求）：供应商清单（内置/自定义、掩码原则 key 永不上线）+ 模型 + defaultModel
    return engine.listModels()
  })

  app.post('/api/models/:providerId/test', async (req, reply) => {
    const { providerId } = parseOr400(ProviderIdParams, req.params)
    // ok=false 不是传输失败：连通/鉴权问题走 200 + 人话文案（工单 6.5 验收）
    return reply.send(await engine.testModel(providerId))
  })

  app.put('/api/sessions/:id/model', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(SetModelBody, req.body)
    await requireHandle(engine, id) // 存在性校验（未加载会话先 resume，与其他 :id 端点同纪律）
    const model = await engine.setSessionModel(id, body.model)
    return reply.send({ model })
  })

  // 推理档位（工单 10.6）：会话级内存态，下一 turn 生效；重启回 models.json 缺省
  app.put('/api/sessions/:id/effort', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(SetEffortBody, req.body)
    await requireHandle(engine, id) // 存在性校验（同 :id 端点纪律）
    const effort = await engine.setSessionEffort(id, body.effort)
    return reply.send({ effort })
  })

  // 模型路由（阶段七工单 7.7 / H07）：fallback 链 + 任务路由档 + 成本熔断（热生效）
  app.get('/api/routing', () => {
    // 纯内存读（含 usage.json 启动载入的累计）：无网络请求
    return engine.getRouting()
  })

  app.put('/api/routing', async (req, reply) => {
    const patch = parseOr400(RoutingUpdateSchema, req.body)
    return reply.send(engine.updateRouting(patch))
  })

  app.delete('/api/routing/usage', async (req, reply) => {
    return reply.send(engine.resetUsage())
  })

  // 设置读写（工单 10.20 B / 10.21 / ADR D28）：spark.json 脱敏读 + 部分字段写
  app.get('/api/settings', () => {
    return engine.getSettings()
  })

  app.put('/api/settings', async (req, reply) => {
    const patch = parseOr400(SettingsUpdateSchema, req.body)
    return reply.send(engine.updateSettings(patch))
  })

  // 命令注册表（阶段七工单 7.4 / H04）：/命令 解析框架的线上入口
  app.get('/api/commands', () => {
    // 纯内存读（ready() 后为全量；server 入口 listen 前已 await ready）
    return engine.listCommands()
  })

  app.post('/api/sessions/:id/commands/:name', async (req, reply) => {
    const { id, name } = parseOr400(CommandNameParams, req.params)
    // body 可空（无补充参数的命令调用）——ExecuteCommandBody 对 undefined 原样通过
    const body =
      req.body === undefined || req.body === null
        ? undefined
        : parseOr400(ExecuteCommandBodySchema, req.body)
    await engine.executeCommand(id, name, body?.args)
    return reply.send({ ok: true })
  })

  app.get('/api/mcp', () => {
    // 纯内存读：各 server 连接结果快照（失败也列出 connected:false）
    return engine.listMcpServers()
  })

  app.get('/api/skills', () => {
    // 纯内存读：已加载技能清单
    return engine.listSkills()
  })

  // 长期记忆（阶段七工单 7.5 / H05 / ADR D25）：设置页管理的线上入口
  app.get('/api/memories', async (req, reply) => {
    return reply.send(engine.listMemories())
  })

  app.delete('/api/memories/:id', async (req, reply) => {
    const { id } = parseOr400(MemoryIdParams, req.params)
    if (!engine.removeMemory(id)) {
      return reply.code(404).send({ code: 'E_NOT_FOUND', message: `记忆 ${id} 不存在` })
    }
    return reply.send({ ok: true })
  })

  // 自动化触发器（阶段七工单 7.6 / H06 / ADR D26）：cron/watch/webhook → 自动建会话执行 prompt
  app.get('/api/automation', async (req, reply) => {
    return reply.send(engine.listAutomations())
  })

  app.post('/api/automation', async (req, reply) => {
    const input = parseOr400(AutomationCreateSchema, req.body)
    return reply.code(201).send(engine.createAutomation(input))
  })

  app.delete('/api/automation/:id', async (req, reply) => {
    const { id } = parseOr400(AutomationIdParams, req.params)
    if (!engine.removeAutomation(id)) {
      return reply.code(404).send({ code: 'E_NOT_FOUND', message: `触发器 ${id} 不存在` })
    }
    return reply.send({ ok: true })
  })

  app.put('/api/automation/:id/enabled', async (req, reply) => {
    const { id } = parseOr400(AutomationIdParams, req.params)
    const { enabled } = parseOr400(AutomationEnabledBody, req.body)
    if (!engine.setAutomationEnabled(id, enabled)) {
      return reply.code(404).send({ code: 'E_NOT_FOUND', message: `触发器 ${id} 不存在` })
    }
    return reply.send({ ok: true })
  })

  app.get('/api/automation/runs', async (req, reply) => {
    const { limit } = parseOr400(AutomationRunsQuery, req.query)
    return reply.send(engine.listAutomationRuns(limit ?? 100))
  })

  // 审计日志（阶段七工单 7.12 / H11）：permission 决策 / 规则变更 / rollback 明细流
  app.get('/api/audit', async (req, reply) => {
    const q = parseOr400(AuditQuery, req.query)
    return reply.send(
      engine.listAudit({
        limit: q.limit ?? 200,
        ...(q.kind !== undefined ? { kind: q.kind } : {}),
        ...(q.result !== undefined ? { result: q.result } : {}),
        ...(q.tool !== undefined ? { tool: q.tool } : {}),
        ...(q.since !== undefined ? { since: q.since } : {}),
      }),
    )
  })

  // 会话全文搜索（阶段七工单 7.13 / H12）：用户/助手消息 + 会话标题入 FTS5
  app.get('/api/search', async (req, reply) => {
    const q = parseOr400(SearchQuery, req.query)
    return reply.send(engine.searchSessions(q.q, q.limit ?? 20))
  })

  // 浏览器截图供图（阶段七工单 7.10 / H09 / ADR D27）：
  // 文件名白名单（shot-<ts>-<seq>.png）校验在引擎侧，路径逃逸零面
  app.get('/api/artifacts/:file', async (req, reply) => {
    const { file } = parseOr400(ArtifactParams, req.params)
    const buf = engine.readScreenshot(file)
    if (buf === null) {
      return notFound(reply)
    }
    return reply.type('image/png').send(buf)
  })

  app.post('/api/automation/webhook/:id', async (req, reply) => {
    const { id } = parseOr400(AutomationIdParams, req.params)
    await engine.fireAutomationWebhook(id)
    return reply.send({ ok: true })
  })

  app.post('/api/automation/:id/run', async (req, reply) => {
    const { id } = parseOr400(AutomationIdParams, req.params)
    await engine.fireAutomationManual(id)
    return reply.send({ ok: true })
  })

  // 指标端点（§5.10 清单 / 工单 4.8）：Prometheus exposition 文本
  app.get('/api/metrics', async (_req, reply) => {
    return reply
      .code(200)
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(engine.renderMetrics())
  })
}
