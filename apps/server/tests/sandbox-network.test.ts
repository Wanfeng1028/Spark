/**
 * 沙箱网络隔离设置与状态路由单测（阶段十九 19.7 / ADR D50）：
 * GET /api/sandbox/network（off 档未启动）；PUT /api/settings 的 sandbox.network
 * 逐字段合并（mode 热切换即起代理、allowlist 部分更新不清 mode、port 非法 400
 * fail-closed）+ GET /api/settings 归一化缺省 + 重启档清单登记 sandbox.network.port。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { SandboxNetworkStatusDto, SettingsDto } from '@spark/protocol'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 代理起停是异步的（updateSettings 内 void reconcile）——轮询等 ready，上限 ~2s */
async function waitReady(f: ServerFixture, want: boolean): Promise<SandboxNetworkStatusDto> {
  let last: SandboxNetworkStatusDto | null = null
  for (let i = 0; i < 20; i++) {
    last = (await f.app.inject({ method: 'GET', url: '/api/sandbox/network' })).json<SandboxNetworkStatusDto>()
    if (last.ready === want) return last
    await sleep(100)
  }
  throw new Error(`代理状态未达 ${String(want)}：${JSON.stringify(last)}`)
}

describe('沙箱网络隔离（阶段十九 19.7 / ADR D50）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  function seedModelsJson(fixture: ServerFixture): void {
    writeFileSync(
      join(fixture.root, 'models.json'),
      JSON.stringify({
        providers: { fake: { apiKeyEnv: null } },
        defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      }),
    )
  }

  test('GET /api/sandbox/network：off 档未启动（ready=false, port=1080 缺省）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({ method: 'GET', url: '/api/sandbox/network' })
    expect(res.statusCode).toBe(200)
    const body: SandboxNetworkStatusDto = res.json()
    expect(body.ready).toBe(false)
    expect(body.reason).toBeNull()
    expect(body.port).toBe(1080)
    expect(body.activeConnections).toBe(0)
  })

  test('GET /api/settings：sandbox.network 归一化缺省 + 重启档登记 sandbox.network.port', async () => {
    f = await makeServer({})
    const body: SettingsDto = (await f.app.inject({ method: 'GET', url: '/api/settings' })).json()
    expect(body.sandbox?.network.mode).toBe('off')
    expect(body.sandbox?.network.allowlist).toEqual([])
    expect(body.restartRequired).toContain('sandbox.network.port')
    // 热档字段不进重启表（mode/allowlist）
    expect(body.restartRequired).not.toContain('sandbox.network.mode')
  })

  test('PUT allowlist 档：模式热切换起代理（ready=true），关档即停', async () => {
    f = await makeServer({})
    seedModelsJson(f)
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sandbox: { network: { mode: 'allowlist', port: 18180 } } },
    })
    expect(res.statusCode).toBe(200)
    const body: SettingsDto = res.json()
    expect(body.sandbox?.network.mode).toBe('allowlist')
    expect(body.sandbox?.network.port).toBe(18180)

    const status = await waitReady(f, true)
    expect(status.port).toBe(18180)

    const off = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sandbox: { network: { mode: 'off' } } },
    })
    expect(off.statusCode).toBe(200)
    await waitReady(f, false)
  })

  test('PUT allowlist 部分更新不清 mode（逐字段合并，热档）', async () => {
    f = await makeServer({})
    seedModelsJson(f)
    await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sandbox: { network: { mode: 'allowlist', port: 18181, allowlist: ['a.com'] } } },
    })
    // 只改清单：mode/port 保持
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sandbox: { network: { allowlist: ['b.com', '*.c.com'] } } },
    })
    expect(res.statusCode).toBe(200)
    const body: SettingsDto = res.json()
    expect(body.sandbox?.network.mode).toBe('allowlist')
    expect(body.sandbox?.network.port).toBe(18181)
    expect(body.sandbox?.network.allowlist).toEqual(['b.com', '*.c.com'])
  })

  test('PUT 非法端口/未知键 → 400 不落盘（strict + min 1024，fail-closed）', async () => {
    f = await makeServer({})
    seedModelsJson(f)
    const bad = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sandbox: { network: { port: 80 } } },
    })
    expect(bad.statusCode).toBe(400)
    const unknown = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sandbox: { network: { mode: 'off', nope: 1 } } },
    })
    expect(unknown.statusCode).toBe(400)
    // 落盘值未被污染（仍是缺省 off/1080）
    const body: SettingsDto = (await f.app.inject({ method: 'GET', url: '/api/settings' })).json()
    expect(body.sandbox?.network.port).toBe(1080)
  })
})
