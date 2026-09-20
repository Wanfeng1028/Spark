/**
 * 语义检索设置与路由单测（阶段十九 19.8 / ADR D51）：
 * GET /api/settings 的 embedding 段归一化（缺省开）；PUT 部分更新（显式 undefined 不清）；
 * GET /api/index/stats 的 semantic 状态（夹具无提供方 → available:false 如实降级）；
 * POST /api/index/vectors/rebuild 无提供方 → 502 E_EMBEDDING_UNAVAILABLE（fail-closed）。
 */
import { afterEach, describe, expect, test } from 'vitest'
import type { SettingsDto } from '@spark/protocol'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

describe('语义检索（阶段十九 19.8 / ADR D51）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  test('GET /api/settings：embedding.enabled 缺省 true（有提供方即用）', async () => {
    f = await makeServer({})
    const body: SettingsDto = (await f.app.inject({ method: 'GET', url: '/api/settings' })).json()
    expect(body.embedding?.enabled).toBe(true)
  })

  test('PUT embedding.enabled=false：写盘 + 回读（热档）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { embedding: { enabled: false } },
    })
    expect(res.statusCode).toBe(200)
    const body: SettingsDto = res.json()
    expect(body.embedding?.enabled).toBe(false)
    const again: SettingsDto = (await f.app.inject({ method: 'GET', url: '/api/settings' })).json()
    expect(again.embedding?.enabled).toBe(false)
  })

  test('GET /api/index/stats：semantic 状态在场（夹具无提供方 → available:false + enabled 透传）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({ method: 'GET', url: '/api/index/stats' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ semantic?: { available: boolean; provider: string | null; enabled: boolean; embedded: number } }>()
    expect(body.semantic?.available).toBe(false)
    expect(body.semantic?.provider).toBeNull()
    expect(body.semantic?.enabled).toBe(true)
    expect(body.semantic?.embedded).toBe(0)
  })

  test('POST /api/index/vectors/rebuild：无提供方 → 502 E_EMBEDDING_UNAVAILABLE（不假装成功）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({ method: 'POST', url: '/api/index/vectors/rebuild' })
    expect(res.statusCode).toBe(502)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('E_EMBEDDING_UNAVAILABLE')
  })

  test('GET /api/search：无提供方时仍走关键词通道（200，不因语义缺席而失败）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({ method: 'GET', url: '/api/search?q=接口' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })
})
