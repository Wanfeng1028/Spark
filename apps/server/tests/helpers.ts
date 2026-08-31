/**
 * server 测试夹具：Fastify + Engine（临时 root + ScriptedLlm + 直注入 config）。
 * 路由测试走 app.inject；SSE 测试另起真实 listen（hijack 的 raw 流无法 inject）。
 * 配对鉴权（工单 9.1）：opts.pairing 挂载 DeviceStore/鉴权钩子/配对路由（注入 remoteAddress 测非环回口径）。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import type { EngineConfig } from '@spark/engine'
import { Engine, ScriptedLlm } from '@spark/engine'
import { registerAuth } from '../src/auth.js'
import { DeviceStore, PairService } from '../src/pairing.js'
import { registerPairingRoutes } from '../src/pairing-routes.js'
import { registerRoutes } from '../src/routes.js'
import { registerSse } from '../src/sse.js'

export interface ServerFixture {
  app: FastifyInstance
  engine: Engine
  gateway: ScriptedLlm
  root: string
  /** 配对鉴权句柄（仅 opts.pairing 时存在） */
  deviceStore?: DeviceStore
  pairService?: PairService
}

export function makeConfig(): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 40,
        maxToolParallel: 8,
        toolTimeoutMs: 120_000,
        permissionTimeoutMs: 300_000,
        progressThrottleMs: 200,
        toolOutputLimitKB: 32,
        compactionThreshold: 0.8,
        checkpoints: false, // 路由用例不落 git 快照；4.6 专项集成用例单开
        bashSandbox: 'off',
      },
    },
    models: {
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      fallbacks: [],
      titleModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      subagentModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      costLimitUsd: undefined,
      defaultEffort: undefined,
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
    },
    permissions: { version: 1, rules: [] },
  }
}

export async function makeServer(
  opts?: {
    heartbeatMs?: number
    checkpoints?: boolean
    /** 挂载配对鉴权面（工单 9.1）：authRequired = 非环回鉴权钩子启用 */
    pairing?: { authRequired: boolean }
  },
): Promise<ServerFixture> {
  const root = await mkdtemp(join(tmpdir(), 'spark-server-'))
  const gateway = new ScriptedLlm()
  const config = makeConfig()
  if (opts?.checkpoints === true) config.spark.engine.checkpoints = true // 工单 4.6 专项集成用例
  const engine = new Engine({ root, gateway, config })
  const app = Fastify({ logger: false })
  let deviceStore: DeviceStore | undefined
  let pairService: PairService | undefined
  if (opts?.pairing !== undefined) {
    deviceStore = new DeviceStore(join(root, 'devices.json'))
    pairService = new PairService(deviceStore)
    await app.register(registerAuth, {
      required: opts.pairing.authRequired,
      store: deviceStore,
    })
  }
  await app.register(registerRoutes, { engine })
  await app.register(registerSse, {
    engine,
    ...(opts?.heartbeatMs !== undefined ? { heartbeatMs: opts.heartbeatMs } : {}),
  })
  if (deviceStore !== undefined && pairService !== undefined) {
    await app.register(registerPairingRoutes, {
      store: deviceStore,
      pair: pairService,
      host: opts?.pairing?.authRequired === true ? '192.168.1.10' : '127.0.0.1',
      port: 4318,
      loopback: opts?.pairing?.authRequired !== true,
    })
  }
  return {
    app,
    engine,
    gateway,
    root,
    ...(deviceStore !== undefined ? { deviceStore } : {}),
    ...(pairService !== undefined ? { pairService } : {}),
  }
}
