/**
 * V2-37 默认模型/档位单写者 + 设置控件补批（阶段十九 19.14）路由侧单测：
 * ① PUT /api/routing 的 defaultModel/defaultEffort——写入 models.json（单写者）、
 *    热生效（新建会话读到新值）、defaultEffort=null 清除；
 * ② GET /api/routing 回显两字段（形状不回归）；
 * ③ 非法 model（未配置 provider）→ 400/409 不落盘。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, test } from 'vitest'
import type { RoutingDto } from '@spark/protocol'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

/**
 * 夹具的引擎是直注入 config 启动的（helpers.ts makeConfig），装载后不再读盘——
 * 本函数写的 models.json 只作 persistRouting 的读写靶子（providers 与引擎内存里那份保持一致：
 * 只有 fake，多写一个 provider 也不会被解析到，见 engine.ts:2632 resolveModelRef）。
 */
function seedModels(fixture: ServerFixture, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    join(fixture.root, 'models.json'),
    JSON.stringify({
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      ...extra,
    }),
  )
}

function readModels(fixture: ServerFixture): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixture.root, 'models.json'), 'utf8')) as Record<string, unknown>
}

describe('V2-37 默认模型/档位单写者（阶段十九 19.14 / ADR D53）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  test('GET /api/routing：defaultModel/defaultEffort 在场（缺省取装载值）', async () => {
    f = await makeServer({})
    // 本端点是纯内存读（routes/models.ts:53）：回显引擎装载态。夹具的 config 是直注入的
    // （helpers.ts makeConfig：defaultModel=fake/fake-chat、defaultEffort 未设），启动后改写
    // 磁盘 models.json 不参与本回显——ADR D53「内存态热改即时生效、重启回 models.json 装载值」。
    const body: RoutingDto = (await f.app.inject({ method: 'GET', url: '/api/routing' })).json()
    expect(body.defaultModel).toBe('fake/fake-chat')
    expect(body.defaultEffort).toBeNull() // §5.1：defaultEffort 缺省 = 不设置（按 provider 默认）
  })

  test('PUT defaultModel：写盘 models.json.defaultModel + 回显', async () => {
    f = await makeServer({})
    seedModels(f)
    // 换的是模型名不是 provider：defaultModel 经 resolveModelRef 校验**装载进内存**的 providers
    // 表（engine.ts:2632），夹具只配了 fake 一家——换 provider 的用例见下方「未知 provider」例
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultModel: 'fake/other-chat' },
    })
    expect(res.statusCode).toBe(200)
    const body: RoutingDto = res.json()
    expect(body.defaultModel).toBe('fake/other-chat')
    // 单写者：写的是 models.json defaultModel（不是另起一份配置）
    const doc = readModels(f)
    expect(doc.defaultModel).toEqual({ provider: 'fake', model: 'other-chat', contextWindow: 100_000 })
  })

  test('PUT defaultEffort：high 写入 / null 清除', async () => {
    f = await makeServer({})
    seedModels(f, { defaultEffort: 'low' })
    const set = await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultEffort: 'high' },
    })
    expect(set.json<RoutingDto>().defaultEffort).toBe('high')
    expect(readModels(f).defaultEffort).toBe('high')

    const cleared = await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultEffort: null },
    })
    expect(cleared.json<RoutingDto>().defaultEffort).toBeNull()
    expect(readModels(f).defaultEffort).toBeUndefined()
  })

  test('PUT 未知 provider 的 defaultModel → 4xx 不落盘（fail-closed）', async () => {
    f = await makeServer({})
    seedModels(f)
    const before = readModels(f).defaultModel
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultModel: 'nope/nope-chat' },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(readModels(f).defaultModel).toEqual(before)
  })

  test('新建会话读默认模型（单写者读侧：routing.defaultModel 优先）', async () => {
    f = await makeServer({})
    seedModels(f)
    const put = await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultModel: 'fake/other-chat' },
    })
    expect(put.statusCode).toBe(200)
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    // 建资源 201 是本包既有口径（routes.test.ts:66 / empty-body.test.ts:72 同断）
    expect(created.statusCode).toBe(201)
    const sid = created.json<{ id: string }>().id
    const detail = await f.app.inject({ method: 'GET', url: `/api/sessions/${sid}` })
    expect(detail.statusCode).toBe(200)
    // GET /api/sessions/:id = SessionDto（meta 字段平铺 + events，protocol api.ts:41）
    const body = detail.json<{ model: string }>()
    expect(body.model).toBe('fake/other-chat')
  })
})
