/**
 * 只读与配置域（settings/commands/mcp/skills/memories/audit/search/artifacts/metrics）（工单 R-F③ 域拆分：自 routes.ts 机械搬移，路由与行为零变化）。
 */
import type { FastifyPluginCallback } from 'fastify'
import { ExecuteCommandBodySchema } from '@spark/protocol'
import { SettingsUpdateSchema } from '@spark/protocol'
import type { RoutesOptions } from './shared.js'
import { notFound, parseOr400 } from '../errors.js'
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

  app.get('/api/metrics', async (_req, reply) => {
    return reply
      .code(200)
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(engine.renderMetrics())
  })
}
