/**
 * 设置读写路由单测（工单 10.20 B / 10.21 / ADR D28）：
 * GET /api/settings 脱敏全量；PUT 部分字段更新——校验失败 400 不落盘（fail-closed）、
 * 热档字段写盘+内存重载、重启档字段写盘标注、hooks 整体替换与清空（10.21 并入路径）。
 * 夹具默认直注入 config（无配置文件）——用例按需在临时 root 补 models.json
 * （updateSettings 写盘后经 loadConfig 全量重载，磁盘上必须有 models.json）。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { SettingsDto } from '@spark/protocol'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

describe('GET|PUT /api/settings（工单 10.20 B / D28）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  /** updateSettings 写盘后 loadConfig 全量重载——磁盘须有 models.json */
  function seedModelsJson(fixture: ServerFixture): void {
    writeFileSync(
      join(fixture.root, 'models.json'),
      JSON.stringify({
        providers: { fake: { apiKeyEnv: null } },
        defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      }),
    )
  }

  test('GET：引擎行为设置全量 + 重启档清单 + models 只读参考；掩码红线（无 key 值）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({ method: 'GET', url: '/api/settings' })
    expect(res.statusCode).toBe(200)
    const body: SettingsDto = res.json()
    expect(body.engine.maxStepsPerTurn).toBe(40) // 夹具缺省值
    expect(body.engine.bashSandbox).toBe('off')
    expect(body.restartRequired).toContain('engine.bashSandbox')
    expect(body.restartRequired).toContain('server.host')
    expect(body.restartRequired).not.toContain('engine.compactionThreshold') // 热档不在重启表
    expect(body.models.defaultModel).toBe('fake/fake-chat')
    // 掩码红线：响应任何位置不得出现 key 值形态字符串
    expect(JSON.stringify(body)).not.toContain('sk-')
  })

  test('PUT 热档字段：写盘 + 内存重载，后续 GET 可见', async () => {
    f = await makeServer({})
    seedModelsJson(f)
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { engine: { maxStepsPerTurn: 7, compactionThreshold: 0.5 } },
    })
    expect(res.statusCode).toBe(200)
    const body: SettingsDto = res.json()
    expect(body.engine.maxStepsPerTurn).toBe(7)
    expect(body.engine.compactionThreshold).toBe(0.5)
    // 未改字段保持现值（部分更新语义）
    expect(body.engine.toolTimeoutMs).toBe(120_000)

    const again: SettingsDto = (await f.app.inject({ method: 'GET', url: '/api/settings' })).json()
    expect(again.engine.maxStepsPerTurn).toBe(7)
  })

  test('PUT 重启档字段：写盘成功（下次启动生效语义）', async () => {
    f = await makeServer({})
    seedModelsJson(f)
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { engine: { bashSandbox: 'on' } },
    })
    expect(res.statusCode).toBe(200)
    const dto: SettingsDto = res.json()
    expect(dto.engine.bashSandbox).toBe('on')
  })

  test('PUT hooks：整体替换生效；null 清空（工单 10.21 并入路径）', async () => {
    f = await makeServer({})
    seedModelsJson(f)
    const put = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { hooks: { 'turn.before': [{ command: 'echo hello' }] } },
    })
    expect(put.statusCode).toBe(200)
    const withHooks: SettingsDto = put.json()
    expect(withHooks.hooks?.['turn.before']).toHaveLength(1)

    const clear = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { hooks: null },
    })
    expect(clear.statusCode).toBe(200)
    const cleared: SettingsDto = clear.json()
    expect(cleared.hooks).toBeUndefined()
  })

  test('PUT 非法值：400 E_VALIDATION 且不落盘（fail-closed，内存/磁盘一致）', async () => {
    f = await makeServer({})
    seedModelsJson(f)
    const bad = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { engine: { compactionThreshold: 5 } }, // schema 上限 <1
    })
    expect(bad.statusCode).toBe(400)
    const body: { code: string } = bad.json()
    expect(body.code).toBe('E_VALIDATION')

    // 未落盘：后续 GET 仍是缺省 0.8
    const after: SettingsDto = (await f.app.inject({ method: 'GET', url: '/api/settings' })).json()
    expect(after.engine.compactionThreshold).toBe(0.8)
  })

  test('PUT 未知字段：strictObject 拒绝（防字段混写）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { engine: { notAField: 1 } },
    })
    expect(res.statusCode).toBe(400)
  })
})
