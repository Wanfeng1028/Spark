/**
 * 审查模式路由测试（工单 19.35）：GET /api/sessions/:id/review 与
 * POST /api/sessions/:id/permissions/reply-all 的映射口径——
 * checkpoint 关闭 → 404 E_NOT_FOUND（与 rollback 同判）；未知快照 from → 404；
 * 批量结清 body 校验（'always' 不可批量 → 400）与无挂起 → resolved 0。
 * 聚合/结清的引擎侧行为单测见 engine review.test.ts / permission.test.ts。
 */
import { describe, expect, test } from 'vitest'
import { makeServer, type ServerFixture } from './helpers.js'

async function createSession(server: ServerFixture): Promise<string> {
  const res = await server.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
  expect(res.statusCode).toBe(201)
  return (res.json<{ id: string }>() as { id: string }).id
}

describe('GET /api/sessions/:id/review（19.35）', () => {
  test('checkpoint 启用 + 无快照无变更 → 空聚合（baseCheckpointId null）', async () => {
    const server = await makeServer({ checkpoints: true })
    const sid = await createSession(server)
    const res = await server.app.inject({ method: 'GET', url: `/api/sessions/${sid}/review` })
    expect(res.statusCode).toBe(200)
    const body = res.json<{
      sessionId: string
      baseCheckpointId: string | null
      baseTurnId: string | null
      files: unknown[]
      patches: unknown[]
      truncated: boolean
    }>()
    expect(body.sessionId).toBe(sid)
    expect(body.baseCheckpointId).toBeNull()
    expect(body.files).toEqual([])
    expect(body.patches).toEqual([])
    expect(body.truncated).toBe(false)
  })

  test('checkpoint 关闭 → 404 E_NOT_FOUND（与 rollback 同判，不假装可聚合）', async () => {
    const server = await makeServer() // 缺省 checkpoints: false
    const sid = await createSession(server)
    const res = await server.app.inject({ method: 'GET', url: `/api/sessions/${sid}/review` })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('E_NOT_FOUND')
  })

  test('from 指定不存在的快照 → 404 E_NOT_FOUND', async () => {
    const server = await makeServer({ checkpoints: true })
    const sid = await createSession(server)
    const res = await server.app.inject({
      method: 'GET',
      url: `/api/sessions/${sid}/review?from=ckp_bogus000000`,
    })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('E_NOT_FOUND')
  })

  test('未知会话 → 404', async () => {
    const server = await makeServer({ checkpoints: true })
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/sessions/ses_reviewnosuch00000000/review',
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/sessions/:id/permissions/reply-all（19.35）', () => {
  test('无挂起 → 200 { ok:true, resolved: 0 }（不是错误）', async () => {
    const server = await makeServer({ checkpoints: true })
    const sid = await createSession(server)
    const res = await server.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/permissions/reply-all`,
      payload: { reply: 'once' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ ok: boolean; resolved: number }>()).toEqual({ ok: true, resolved: 0 })
  })

  test("reply 'always' 不可批量 → 400（批量语义无固化）", async () => {
    const server = await makeServer({ checkpoints: true })
    const sid = await createSession(server)
    const res = await server.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/permissions/reply-all`,
      payload: { reply: 'always' },
    })
    expect(res.statusCode).toBe(400)
  })

  test('未知会话 → 404（requireHandle 存在性校验，不回 resolved 0）', async () => {
    const server = await makeServer({ checkpoints: true })
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/sessions/ses_reviewnosuch00000000/permissions/reply-all',
      payload: { reply: 'once' },
    })
    expect(res.statusCode).toBe(404)
  })
})
