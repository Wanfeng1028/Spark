/**
 * 竞答历史路由单测（工单 19.10，翻案 D42"记录仅内存"登记限制）：
 * GET /api/arena/history——空历史 200 { runs: [] }、limit 缺省/合法值透传、非法值 400。
 * 非空历史（真实竞答全链路）属引擎层职责，见 packages/engine tests/arena.test.ts；
 * mock 对等按纪律不测（工单 16.8 判例）。
 */
import { describe, expect, it } from 'vitest'
import { makeServer } from './helpers.js'

type Json = Record<string, unknown>

describe('GET /api/arena/history（工单 19.10）', () => {
  it('空历史 → 200 { runs: [] }', async () => {
    const f = await makeServer()
    const res = await f.app.inject({ method: 'GET', url: '/api/arena/history' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ runs: [] })
  })

  it('limit 合法值透传（不打拳面，200）', async () => {
    const f = await makeServer()
    const res = await f.app.inject({ method: 'GET', url: '/api/arena/history?limit=5' })
    expect(res.statusCode).toBe(200)
    expect(res.json() as Json).toHaveProperty('runs')
  })

  it('limit 非数字 → 400（zod 查询解析）', async () => {
    const f = await makeServer()
    const res = await f.app.inject({ method: 'GET', url: '/api/arena/history?limit=abc' })
    expect(res.statusCode).toBe(400)
  })

  it('limit 超上限（>100）→ 400', async () => {
    const f = await makeServer()
    const res = await f.app.inject({ method: 'GET', url: '/api/arena/history?limit=101' })
    expect(res.statusCode).toBe(400)
  })
})
