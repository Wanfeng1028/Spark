/**
 * 只读与配置域（settings/commands/mcp/skills/agents/usage/memories/audit/search/artifacts/metrics）（工单 R-F③ 域拆分：自 routes.ts 机械搬移，路由与行为零变化）。
 */
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ExecuteCommandBodySchema, findKnownLspServer } from '@spark/protocol'
import { FeedbackInputSchema, FeedbackQuerySchema, LogsQuerySchema, PromptsUpdateSchema, SettingsUpdateSchema, UsageSummaryQuerySchema } from '@spark/protocol'
import type { RoutesOptions } from './shared.js'
import { notFound, parseOr400, validationError } from '../errors.js'

/**
 * 非环回来源判定（doc/11 LA-05）：装/换可执行代码的入口（POST /api/lsp/install、
 * PUT /api/mcp 的 stdio command）在非环回来源时要求显式确认——装可执行代码与
 * 改审批规则同级的敏感面，不能因拿到 API 端口就静默执行。
 * 环回（127.0.0.1/::1，含 IPv4-mapped）缺省行为**不变**（本仓红线）；只有显式
 * SPARK_HOST 开非环回监听时远端客户端才会命中此门。
 */
function isLoopbackRequest(req: FastifyRequest): boolean {
  const ip = req.ip
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

/** npm 全局安装命令的回显形（与 installer 的 spawn 参数逐字对应：npm install -g <pkgs>） */
function npmInstallEcho(packages: readonly string[]): string {
  return `npm install -g ${[...packages].join(' ')}`
}

/** LA-05：非环回且未带 confirm → 403，message 回显将执行的完整命令 */
function confirmGate(req: FastifyRequest, reply: FastifyReply, what: string, willRun: string): boolean {
  if (isLoopbackRequest(req)) return true
  void reply.code(403).send({
    code: 'E_CONFIRM_REQUIRED',
    message: `非环回来源的${what}请求需显式确认。将执行：${willRun}——确认无误后重发请求并附 confirm:true`,
  })
  return false
}
import { loadMcpConfig, maskMcpConfigForClient, mergeMaskedMcpConfig, writeMcpConfig } from '@spark/engine'
import { CommandNameParams, MemoryIdParams, AuditQuery, SearchQuery, ArtifactParams } from './shared.js'

export const registerReadonlyRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

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

  /** PUT /api/mcp：整文件校验后原子写 mcp.json（工单 12.6；重启后生效——响应如实标注）。
   * RT3-07：env 掩码占位经 mergeMaskedMcpConfig 合并盘上真值（掩码不是值，无真值 400） */
  app.put('/api/mcp', async (req, reply) => {
    const body = req.body as
      | { version?: number; confirm?: boolean; servers?: Record<string, { command?: string; args?: string[] }> }
      | undefined
    if (body === undefined || typeof body !== 'object' || body.version !== 1) {
      throw validationError('mcp 配置须为 {version: 1, servers: {...}}', undefined)
    }
    // LA-05：非环回来源改写 mcp.json（可换任意 stdio 可执行程序）需 confirm；回显将写入的命令
    const servers = body.servers ?? {}
    const willRun =
      Object.entries(servers)
        .map(([k, v]) => `${k} = ${v.command ?? '?'} ${(v.args ?? []).join(' ')}`.trimEnd())
        .join('; ') || '(空清单)'
    if (!confirmGate(req, reply, 'mcp 配置写入', willRun)) return reply
    try {
      // 字面量内联在参数位：McpConfigInput.version 是字面量类型，经变量中转会拓宽成 number（CI 修红）
      writeMcpConfig(
        engine.dataRoot,
        mergeMaskedMcpConfig(loadMcpConfig(engine.dataRoot), {
          version: 1,
          servers: body.servers as Record<
            string,
            { command: string; args?: string[]; env?: Record<string, string>; connectTimeoutMs?: number }
          >,
        }),
      )
    } catch (err) {
      // zod 校验失败 / 掩码无既有真值（ConfigError）→ 400 人话（坏配置不落盘——12.6 验收）
      throw validationError(err instanceof Error ? err.message : String(err), undefined)
    }
    return reply.send({ ok: true, restartRequired: true })
  })

  app.get('/api/mcp', () => {
    // 纯内存读：各 server 连接结果快照（失败也列出 connected:false）
    return engine.listMcpServers()
  })

  /** GET /api/mcp/config：mcp.json 读回（RT3-07）——env 值一律掩码占位，不明文出引擎 */
  app.get('/api/mcp/config', () => maskMcpConfigForClient(loadMcpConfig(engine.dataRoot)))

  // 语言服务器只读状态（工单 16.9）：连接状态 + 诊断摘要（未配置空数组；坏配置 E_CONFIG 由全局映射）
  app.get('/api/lsp', () => engine.listLspServers())

  // 浏览器截图产物清理（阶段十九 19.12 / ADR D49）：清 shotsDir 全部 shot-*.png
  app.post('/api/browser/cleanup', () => engine.cleanupBrowserArtifacts())

  // LSP server 安装（阶段十九 19.5 / ADR D47）：内置清单 id → npm 全局装（已装幂等跳过）+ 写 lsp.json
  const LspInstallBody = z.strictObject({ id: z.string().min(1), confirm: z.boolean().optional() })
  app.post('/api/lsp/install', async (req, reply) => {
    const { id, confirm } = parseOr400(LspInstallBody, req.body)
    // LA-05：非环回来源装可执行代码需 confirm；清单在 protocol 单源——回显完整 npm 命令
    const known = findKnownLspServer(id)
    if (confirm !== true) {
      const willRun = known
        ? `${npmInstallEcho(known.npmPackages)}（写入 lsp.json：${known.command} ${known.args.join(' ')}）`
        : `安装 id=${id}（不在内置清单中，将由安装器报 E_LSP_UNKNOWN_SERVER）`
      if (!confirmGate(req, reply, '语言服务器安装', willRun)) return reply
    }
    const result = await engine.installLspServer(id)
    if (!result.ok) {
      if (result.code === 'E_LSP_UNKNOWN_SERVER') {
        return reply.code(404).send({ code: result.code, message: result.message })
      }
      return reply.code(502).send({ code: result.code, message: result.message })
    }
    return reply.send({
      language: result.language,
      command: result.command,
      args: result.args,
      written: result.written,
    })
  })

  // 索引库管理（阶段十九 19.11）：统计 / 全量重建 / 空间回收——管理页「索引库」数据源。
  // 停用开关不做（索引停用涉重启面，v1 范围外——页面明示"索引随引擎启停"）；
  // 打开失败降级时 stats 如实 available:false（禁假数据），重建/回收回 0 值（旁路纪律）。
  app.get('/api/index/stats', () => engine.indexStats())

  app.post('/api/index/rebuild', async () => {
    return engine.rebuildIndex()
  })

  app.post('/api/index/vacuum', () => engine.vacuumIndex())

  // 沙箱网络隔离代理状态（阶段十九 19.7 / ADR D50）：设置页与 CLI 面板数据源——
  // allowlist 档未启动/绑定失败时 ready=false + reason（bash 侧据此 fail-closed 拒跑）
  app.get('/api/sandbox/network', () => engine.sandboxNetworkStatus())

  // 反馈（阶段十九 19.19 / V2-25）：POST 提交/更新、GET 列表、DELETE 撤回。
  // 反馈不进事件流（用户侧评价，不是会话状态机的一部分——回放重建的是模型可见历史）
  app.post('/api/feedback', (req, reply) => {
    const body = parseOr400(FeedbackInputSchema, req.body)
    try {
      return engine.submitFeedback(body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const code = message.startsWith('E_') ? message.split(':')[0] : 'E_FEEDBACK_FAILED'
      return reply.code(503).send({ code, message })
    }
  })

  app.get('/api/feedback', (req) => {
    const q = parseOr400(FeedbackQuerySchema, req.query)
    return engine.listFeedback(q)
  })

  app.delete('/api/feedback', async (req, reply) => {
    const body = parseOr400(FeedbackInputSchema, req.body)
    try {
      const removed = engine.withdrawFeedback(body.sessionId, body.eventId, body.vote)
      return reply.send({ removed })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const code = message.startsWith('E_') ? message.split(':')[0] : 'E_FEEDBACK_FAILED'
      return reply.code(503).send({ code, message })
    }
  })

  // 提示词模板管理（阶段十九 19.18 / V2-16 前端半边收口）：GET 只读快照 +
  // PUT 写文件（占位符白名单校验；重启档——模板构造期装载一次）
  app.get('/api/prompts', () => engine.promptsInfo())
  app.put('/api/prompts', (req, reply) => {
    const body = parseOr400(PromptsUpdateSchema, req.body)
    try {
      return engine.updatePrompt(body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const code = message.startsWith('E_') ? message.split(':')[0] : 'E_CONFIG'
      return reply.code(400).send({ code, message })
    }
  })

  // 向量索引增量补嵌（阶段十九 19.8 / ADR D51）：只嵌缺向量条目（不清表，已嵌零重复计费）。
  // 语义不可用（无提供方/开关关）→ 502 E_EMBEDDING_UNAVAILABLE（fail-closed，不假装成功）
  app.post('/api/index/vectors/rebuild', async (_req, reply) => {
    try {
      return await engine.rebuildVectors()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const code = message.startsWith('E_') ? message.split(':')[0] : 'E_EMBEDDING_FAILED'
      return reply.code(502).send({ code, message })
    }
  })

  app.get('/api/skills', () => {
    // 纯内存读：已加载技能清单
    return engine.listSkills()
  })

  // 子代理预设档（工单 13.5）：只读清单——写入靠用户改 ~/.spark/agents/<name>.json 后重启
  app.get('/api/agents', () => {
    return engine.listAgentPresets()
  })

  // 成本看板（工单 13.6 / V2-07）：总账 + 按日/供应商明细 + 旧账差额 + 熔断阈值状态
  app.get('/api/usage/summary', (req) => {
    const query = parseOr400(UsageSummaryQuerySchema, req.query)
    return engine.usageSummary(query.since)
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

  // 会话全文搜索（阶段七工单 7.13 / H12）：用户/助手消息 + 会话标题入 FTS5。
  // searchSessions 是 async（19.8 语义合流），必须 await 后再 send——Fastify v5 的
  // reply.send 不解包 thenable，直接把 Promise 序列化会落成 `{}`（判例：models.ts 的
  // `reply.send(await engine.testModel(...))`）
  app.get('/api/search', async (req, reply) => {
    const q = parseOr400(SearchQuery, req.query)
    return reply.send(await engine.searchSessions(q.q, q.limit ?? 20))
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

  // 引擎日志尾部（阶段十九 19.38 / V2-14 诊断页）：只读；level 取"该级别及以上"，
  // 非法 level/limit → 400（parseOr400 单源，不在端上自己判）
  app.get('/api/logs', (req) => {
    const query = parseOr400(LogsQuerySchema, req.query ?? {})
    return engine.logs(query)
  })

  app.get('/api/metrics', async (_req, reply) => {
    return reply
      .code(200)
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(engine.renderMetrics())
  })
}
