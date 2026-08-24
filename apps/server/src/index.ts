/**
 * server 入口（doc/02 §7.1 组装与生命周期，工单 1.6 空壳）：
 * Fastify + /api/healthz + 静态托管 + 优雅退出。REST/SSE 全端点与 engine 集成是阶段二。
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import { registerStatic } from './static.js'

const PORT = 4318
const HOST = '127.0.0.1' // 仅本地绑定，刻意不暴露（doc/02 §7.1）
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url))

// Fastify 内置 pino logger（§7.1 level info；传 pino 实例与 exactOptionalPropertyTypes 不兼容）
const app = Fastify({ logger: { level: 'info' } })

// 临时健康检查端点，仅阶段一调试用（doc/02 §8 工单 1.6 验收）
app.get('/api/healthz', () => ({ ok: true }))

if (existsSync(WEB_DIST)) {
  await app.register(registerStatic, { root: WEB_DIST })
} else {
  app.log.warn(`web 构建产物不存在（${WEB_DIST}），跳过静态托管；开发模式走 Vite dev server 代理`)
}

await app.listen({ port: PORT, host: HOST })

// 优雅退出（§7.1）：SIGINT/SIGTERM → server.close()（停止接新连接）→ 进程退出
let closing = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return
    closing = true
    app.log.info({ signal }, '优雅退出开始')
    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, 'server.close() 失败')
        process.exit(1)
      },
    )
  })
}
