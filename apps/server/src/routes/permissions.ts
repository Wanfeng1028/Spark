/**
 * 权限域（审批回复/规则管理/会话档位）（工单 R-F③ 域拆分：自 routes.ts 机械搬移，路由与行为零变化）。
 */
import type { FastifyPluginCallback } from 'fastify'
import type { RoutesOptions } from './shared.js'
import { parseOr400, replyOutcomeError, sendError } from '../errors.js'
import { PermissionRuleDtoSchema } from '@spark/protocol'
import { requireHandle, IdParams, ReplyBody, RequestIdParams, RemoveRuleBody, PresetBody } from './shared.js'

export const registerPermissionRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

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
}
