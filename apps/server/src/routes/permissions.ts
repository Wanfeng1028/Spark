/**
 * 权限域（审批回复/规则管理/会话档位）（工单 R-F③ 域拆分：自 routes.ts 机械搬移，路由与行为零变化）。
 */
import type { FastifyPluginCallback } from 'fastify'
import type { RoutesOptions } from './shared.js'
import { parseOr400, replyOutcomeError, sendError } from '../errors.js'
import { PermissionRuleDtoSchema } from '@spark/protocol'
import {
  requireHandle,
  IdParams,
  ReplyBody,
  ReplyAllBody,
  ReplyQuestionBody,
  RequestIdParams,
  RemoveRuleBody,
  PresetBody,
  SetTrustBody,
  ExtensionIdParams,
  SetExtensionEnabledBody,
} from './shared.js'

export const registerPermissionRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

  app.post('/api/permissions/:requestId', async (req, reply) => {
    const { requestId } = parseOr400(RequestIdParams, req.params)
    const body = parseOr400(ReplyBody, req.body)
    const outcome = await engine.replyPermission(requestId, body.reply, body.feedback, body.scope)
    if (outcome !== 'ok') {
      // 409/404 三态映射收敛到 errors.ts replyOutcomeError（R-A：消除路由内联与前缀版重复）
      return sendError(req, reply, replyOutcomeError(outcome))
    }
    return reply.send({ ok: true })
  })

  // 结构化提问作答（CK-6）：board 挂起表裁决入口；未知/已结清 → 404（与审批回复同判）
  app.post('/api/questions/:requestId', async (req, reply) => {
    const { requestId } = parseOr400(RequestIdParams, req.params)
    const body = parseOr400(ReplyQuestionBody, req.body)
    const ok = await engine.replyQuestion(requestId, body.answers)
    if (!ok) {
      return reply.code(404).send({ code: 'E_NOT_FOUND', message: '提问不存在或已结清' })
    }
    return reply.send({ ok: true })
  })

  // 批量结清（19.35 审查模式）：该会话全部挂起审批逐条放行/拒绝（feedback 只回喂一条）
  app.post('/api/sessions/:id/permissions/reply-all', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(ReplyAllBody, req.body)
    await requireHandle(engine, id) // 未知会话 404 而非 resolved:0（存在性与其他 :id 端点同纪律）
    return reply.send(await engine.replyAllPermissions(id, body.reply, body.feedback))
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
    const { action, resource, scope } = parseOr400(RemoveRuleBody, req.body)
    if (!engine.removePermissionRule(action, resource, scope)) {
      return reply.code(404).send({ code: 'E_NOT_FOUND', message: '规则不存在' })
    }
    return reply.send({ ok: true })
  })

  // 密钥管理（阶段七工单 7.1 / H01）：~/.spark/secrets.json 的线上 CRUD——
  // 值只进不回（GET 只报来源，PUT 写入后立即生效于后续 resolveModel）
  app.get('/api/sessions/:id/permission-preset', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    await requireHandle(engine, id) // 存在性校验（未加载会话先 resume，与其他 :id 端点同纪律）
    return reply.send({ preset: engine.permissionPresetOf(id) })
  })

  app.put('/api/sessions/:id/permission-preset', async (req, reply) => {
    const { id } = parseOr400(IdParams, req.params)
    const body = parseOr400(PresetBody, req.body)
    await requireHandle(engine, id)
    // await：工单 16.3 后设档可能 emit durable 事件（session.mode.changed），先落事件再回响应
    await engine.setPermissionPreset(id, body.preset)
    return reply.send({ ok: true })
  })

  // 文件夹信任（工单 16.4 / ADR D37）：trusted.json 的线上查看与修改
  app.get('/api/trust', () => {
    return engine.getTrust()
  })

  app.put('/api/trust', (req) => {
    const body = parseOr400(SetTrustBody, req.body)
    engine.setTrust(body.path, body.trust)
    return { ok: true }
  })

  // 扩展管理（工单 16.5 / ADR D38）：声明式内容包清单与启停（重启档）
  app.get('/api/extensions', async () => {
    return engine.listExtensions()
  })

  app.put('/api/extensions/:id/enabled', async (req, reply) => {
    const { id } = parseOr400(ExtensionIdParams, req.params)
    const body = parseOr400(SetExtensionEnabledBody, req.body)
    await engine.setExtensionEnabled(id, body.enabled)
    return reply.send({ ok: true })
  })

  // 模型管理（DESIGN §13.D③ / 工单 6.5 轻后端例外——本阶段唯一 engine/server 改动）
}
