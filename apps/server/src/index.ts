/**
 * server 入口（doc/02 §7.1 组装与生命周期）：
 * Engine（root ~/.spark）→ Fastify → REST 路由 + SSE → 静态托管 → listen 127.0.0.1:4318。
 * 优雅退出：SIGINT/SIGTERM → 1) SSE 连接发 bye 帧后断 2) server.close()（停接新连接）
 *   3) engine.shutdown()（interrupt 收尾 + flush 全部会话 fsync）4) 进程退出。
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import { Engine } from '@spark/engine'
import { registerRoutes } from './routes.js'
import { registerSse } from './sse.js'
import { registerStatic } from './static.js'

const PORT = 4318
const HOST = '127.0.0.1' // 仅本地绑定，刻意不暴露（doc/02 §7.1）
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url))

const engine = new Engine()

// Fastify 内置 pino logger（§7.1 level info；传 pino 实例与 exactOptionalPropertyTypes 不兼容）
const app = Fastify({ logger: { level: 'info' } })

await app.register(registerRoutes, { engine })
await app.register(registerSse, { engine })

if (existsSync(WEB_DIST)) {
  await app.register(registerStatic, { root: WEB_DIST })
} else {
  app.log.warn(`web 构建产物不存在（${WEB_DIST}），跳过静态托管；开发模式走 Vite dev server 代理`)
}

await app.listen({ port: PORT, host: HOST })

// 优雅退出（§7.1 三步序列；重复信号幂等）
let closing = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return
    closing = true
    app.log.info({ signal }, '优雅退出开始')
    app.sseCloseAll() // 1) SSE 连接发 bye 帧后断开
    app.close().then(
      async () => {
        try {
          await engine.shutdown() // 2) interrupt 收尾 + 全量 flush
          process.exit(0)
        } catch (err) {
          app.log.error({ err }, 'engine.shutdown() 失败')
          process.exit(1)
        }
      },
      (err: unknown) => {
        app.log.error({ err }, 'server.close() 失败')
        process.exit(1)
      },
    )
  })
}
