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

function seedModels(fixture: ServerFixture, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    join(fixture.root, 'models.json'),
    JSON.stringify({
      providers: { fake: { apiKeyEnv: null }, other: { apiKeyEnv: null } },
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

  test('GET /api/routing：defaultModel/defaultEffort 在场（缺省取 models.json）', async () => {
    f = await makeServer({})
    seedModels(f, { defaultEffort: 'high' })
    // 夹具引擎已用旧 config 启动——本断言只验形状与缺省回退
    const body: RoutingDto = (await f.app.inject({ method: 'GET', url: '/api/routing' })).json()
    expect(body.defaultModel).toBe('fake/fake-chat')
    expect(body.defaultEffort).toBe('high')
  })

  test('PUT defaultModel：写盘 models.json.defaultModel + 回显', async () => {
    f = await makeServer({})
    seedModels(f)
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultModel: 'other/other-chat' },
    })
    expect(res.statusCode).toBe(200)
    const body: RoutingDto = res.json()
    expect(body.defaultModel).toBe('other/other-chat')
    // 单写者：写的是 models.json defaultModel（不是另起一份配置）
    const doc = readModels(f)
    expect(doc.defaultModel).toEqual({ provider: 'other', model: 'other-chat', contextWindow: 100_000 })
  })

  test('PUT defaultEffort：high 写入 / null 清除', async () => {
    f = await makeServer({})
    seedModels(f, { defaultEffort: 'low' })
    const set = await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultEffort: 'high' },
    })
    expect((set.json() as RoutingDto).defaultEffort).toBe('high')
    expect(readModels(f).defaultEffort).toBe('high')

    const cleared = await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultEffort: null },
    })
    expect((cleared.json() as RoutingDto).defaultEffort).toBeNull()
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
    await f.app.inject({
      method: 'PUT',
      url: '/api/routing',
      payload: { defaultModel: 'other/other-chat' },
    })
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    expect(created.statusCode).toBe(200)
    const sid = (created.json() as { id: string }).id
    const detail = await f.app.inject({ method: 'GET', url: `/api/sessions/${sid}` })
    expect(detail.statusCode).toBe(200)
    const body = detail.json<{ meta: { model: string } }>()
    expect(body.meta.model).toBe('other/other-chat')
  })
})
