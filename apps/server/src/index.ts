/**
 * server 入口（doc/02 §7.1 组装与生命周期）：
 * Engine（root ~/.spark）→ Fastify → 鉴权钩子（工单 9.1）→ REST 路由 + SSE → 静态托管 → listen。
 * 绑定纪律（工单 9.1 / ADR D24）：缺省 127.0.0.1+无鉴权红线不变；非环回必须经
 * spark.json `server.host` 显式配置（SPARK_HOST 只允许环回覆盖——桌面壳 sidecar），
 * 且配对鉴权已启用（~/.spark/devices.json 存在），否则拒绝启动（fail-closed）。
 * 优雅退出：SIGINT/SIGTERM → 1) SSE 连接发 bye 帧后断 2) server.close()（停接新连接）
 *   3) engine.shutdown()（interrupt 收尾 + flush 全部会话 fsync）4) 进程退出。
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import { Engine, ConfigError, loadConfig } from '@spark/engine'
import { registerAuth, redactTokenQuery } from './auth.js'
import { registerErrorHandling } from './errors.js'
import { DeviceStore, PairService, isLoopbackHost, resolveBindTarget } from './pairing.js'
import { registerPairingRoutes } from './pairing-routes.js'
import { registerRoutes } from './routes.js'
import { registerSse } from './sse.js'
import { registerStatic } from './static.js'

const ROOT = join(homedir(), '.spark')
const CONFIG = loadConfig(ROOT)

// 配对鉴权（工单 9.1）：设备仓 + 配对码服务；鉴权启用态 = devices.json 存在。
// 启动护栏：设备仓坏文件拒载（ConfigError）与绑定纪律违规一律拒启动（fail-closed，人话退出）——单测见 pairing.test.ts
let deviceStore: DeviceStore
let HOST: string
try {
  deviceStore = new DeviceStore(join(ROOT, 'devices.json'))
  // SPARK_HOST 仅环回覆盖；非环回须 spark.json server.host 显式配置且鉴权已启用（ADR D24）
  HOST = resolveBindTarget(process.env.SPARK_HOST, CONFIG.spark.server.host, deviceStore.enabled)
} catch (err) {
  const prefix = err instanceof ConfigError ? `${err.code}: ` : ''
  console.error(`${prefix}${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
const LOOPBACK = isLoopbackHost(HOST)
// 端口/静态资源根可由桌面壳注入（阶段五工单 5.1 sidecar：SPARK_PORT/SPARK_WEB_DIST）
const PORT = Number(process.env.SPARK_PORT ?? CONFIG.spark.server.port)
const WEB_DIST = process.env.SPARK_WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url))
const pairService = new PairService(deviceStore)

const engine = new Engine()
// MCP 外部工具注册完成后再对外服务（无 mcp.json 立即返回；单 server 失败已 warn 跳过）
await engine.ready()

// Fastify 内置 pino logger（§7.1 level info；传 pino 实例与 exactOptionalPropertyTypes 不兼容）；
// req 序列化器剥离 ?token= 明文（secrets 纪律：SSE 建连日志不得含长效 token，工单 9.1 评审修复）
const app = Fastify({
  logger: {
    level: 'info',
    serializers: {
      req(req: FastifyRequest) {
        return {
          method: req.method,
          url: redactTokenQuery(req.url),
        }
      },
    },
  },
})

// 统一错误硬化（工单 10.12）：宽容 JSON 空 body + FST_ERR_* 收编进 {code, message}
registerErrorHandling(app)

// 鉴权钩子先于路由注册（环回缺省直通，非环回 REST/SSE 同口径；工单 9.1）
await app.register(registerAuth, { required: !LOOPBACK, store: deviceStore })
await app.register(registerRoutes, { engine })
await app.register(registerSse, { engine })
await app.register(registerPairingRoutes, {
  store: deviceStore,
  pair: pairService,
  host: HOST,
  port: PORT,
  loopback: LOOPBACK,
})

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
