/**
 * 会话改名全链路（阶段十九 19.20，消解 /title /rename 挂池）：
 * 路由层 PUT /api/sessions/:id/title + 命令基线（/rename /title 两入口同实现）。
 * 索引/列表同步由既有 meta 增量维护承担（engine bus 钩子处理 session.title）——
 * 本测验证"改名后 GET /api/sessions 列表可见新标题"这一用户可见结果。
 */
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

describe('会话改名（阶段十九 19.20）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  test('PUT /title：改名成功 + 列表可见新标题（索引同步）', async () => {
    f = await makeServer({})
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: { title: '旧名' } })
    const sid = (created.json() as { id: string }).id

    const renamed = await f.app.inject({
      method: 'PUT',
      url: `/api/sessions/${sid}/title`,
      payload: { title: '新名字' },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json<{ title: string }>().title).toBe('新名字')

    const list = await f.app.inject({ method: 'GET', url: '/api/sessions' })
    const rows = list.json<{ id: string; title: string }[]>()
    expect(rows.find((r) => r.id === sid)?.title).toBe('新名字')
  })

  test('空标题 → 400（min(1)；"新会话"是展示态不是可写入值）', async () => {
    f = await makeServer({})
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = (created.json() as { id: string }).id
    const res = await f.app.inject({
      method: 'PUT',
      url: `/api/sessions/${sid}/title`,
      payload: { title: '' },
    })
    expect(res.statusCode).toBe(400)
  })

  test('超长标题 → 400（max(200)）', async () => {
    f = await makeServer({})
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = (created.json() as { id: string }).id
    const res = await f.app.inject({
      method: 'PUT',
      url: `/api/sessions/${sid}/title`,
      payload: { title: 'x'.repeat(201) },
    })
    expect(res.statusCode).toBe(400)
  })

  test('未知会话 → 404（E_NOT_FOUND，不假造会话）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'PUT',
      url: `/api/sessions/${ids.session('ses_nope0000000000000001')}/title`,
      payload: { title: 'whatever' },
    })
    expect(res.statusCode).toBe(404)
  })

  test('命令基线：/rename 与 /title 同为 client 命令且同 clientAction', async () => {
    const { BUILTIN_COMMANDS } = await import('@spark/protocol')
    const rename = BUILTIN_COMMANDS.find((c) => c.name === 'rename')
    const title = BUILTIN_COMMANDS.find((c) => c.name === 'title')
    expect(rename?.kind).toBe('client')
    expect(title?.kind).toBe('client')
    expect(rename?.clientAction).toBe('rename')
    expect(title?.clientAction).toBe('rename')
    expect(BUILTIN_COMMANDS).toHaveLength(27) // 25（19.7 基线）+ /rename + /title
  })
})
