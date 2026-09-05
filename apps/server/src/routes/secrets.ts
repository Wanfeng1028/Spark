/**
 * 密钥仓域（列表/写入/删除——值只进不回）（工单 R-F③ 域拆分：自 routes.ts 机械搬移，路由与行为零变化）。
 */
import type { FastifyPluginCallback } from 'fastify'
import type { RoutesOptions } from './shared.js'
import { parseOr400 } from '../errors.js'
import { SecretProviderParams, SetSecretBody } from './shared.js'

export const registerSecretRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  const { engine } = opts

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
}
