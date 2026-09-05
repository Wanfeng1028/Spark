/**
 * 自动化触发器域（清单/创建/删除/启停/运行史/webhook/手动触发）（工单 R-F③ 域拆分：自 routes.ts 机械搬移，路由与行为零变化）。
 */
import type { FastifyPluginCallback } from 'fastify'
import { AutomationCreateSchema } from '@spark/protocol'
import type { RoutesOptions } from './shared.js'
import { parseOr400 } from '../errors.js'
import { AutomationIdParams, AutomationEnabledBody, AutomationRunsQuery } from './shared.js'

export const registerAutomationRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

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
}
