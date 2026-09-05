/**
 * REST 路由组装入口（工单 R-F③ 域拆分）：六域子插件 + 探活端点。
 * 端点清单 = doc/02 §4.5 表；zod 解析 → engine 调用 → DTO 序列化；
 * 错误经 errors.ts 全局收编（registerErrorHandling），路由层无锁（单写者在引擎）。
 */
import type { FastifyPluginCallback } from 'fastify'
import type { RoutesOptions } from './shared.js'
import { registerSessionRoutes } from './sessions.js'
import { registerPermissionRoutes } from './permissions.js'
import { registerSecretRoutes } from './secrets.js'
import { registerModelRoutingRoutes } from './models.js'
import { registerAutomationRoutes } from './automation.js'
import { registerReadonlyRoutes } from './readonly.js'

export type { RoutesOptions } from './shared.js'

export const registerRoutes: FastifyPluginCallback<RoutesOptions> = (app, opts) => {
  // 探活端点（阶段五工单 5.1）：桌面壳 sidecar 就绪轮询用；listen 成功即引擎可用
  app.get('/api/healthz', () => ({ ok: true }))

  app.register(registerSessionRoutes, opts)
  app.register(registerPermissionRoutes, opts)
  app.register(registerSecretRoutes, opts)
  app.register(registerModelRoutingRoutes, opts)
  app.register(registerAutomationRoutes, opts)
  app.register(registerReadonlyRoutes, opts)
}
