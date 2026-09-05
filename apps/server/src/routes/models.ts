/**
 * 模型与路由域（目录/测试/换模型/换档位/routing 读写/成本清零）（工单 R-F③ 域拆分：自 routes.ts 机械搬移，路由与行为零变化）。
 */
import type { FastifyPluginCallback } from 'fastify'
import type { RoutesOptions } from './shared.js'
import { parseOr400 } from '../errors.js'
import { requireHandle, IdParams, ProviderIdParams, SetModelBody, SetEffortBody } from './shared.js'
import { RoutingUpdateSchema } from '@spark/protocol'

export const registerModelRoutingRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

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
}
