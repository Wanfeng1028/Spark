/**
 * 会话归档与两段式删除路由单测（阶段十二工单 12.4）：
 * PUT /api/sessions/:id/archive（归档→默认列表消失→?archived=true 可见→恢复）；
 * DELETE /api/sessions/:id（缺 confirm 400 → confirm:true 204 + trash 落盘 → 列表消失）。
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeServer } from './helpers.js'

type Json = Record<string, unknown>

function jsonOf(res: { json: () => unknown }): Json {
  return res.json() as Json
}

function idOf(res: { json: () => unknown }): string {
  return (res.json() as { id: string }).id
}

describe('会话归档（工单 12.4）', () => {
  it('归档 → 默认列表消失 → ?archived=true 可见（archivedAt 透传）→ 恢复', async () => {
    const f = await makeServer()
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { title: '归档我' },
    })
    const sid = idOf(created)

    const archived = await f.app.inject({
      method: 'PUT',
      url: `/api/sessions/${sid}/archive`,
      payload: { archived: true },
    })
    expect(archived.statusCode).toBe(200)
    expect((jsonOf(archived) as { archivedAt?: string }).archivedAt).toBeDefined()

    const active = jsonOf(await f.app.inject({ method: 'GET', url: '/api/sessions' })) as unknown as Json[]
    expect(active.some((s) => s.id === sid)).toBe(false)

    const archivedList = jsonOf(
      await f.app.inject({ method: 'GET', url: '/api/sessions?archived=true' }),
    ) as unknown as Json[]
    expect(archivedList.some((s) => s.id === sid)).toBe(true)

    const restored = await f.app.inject({
      method: 'PUT',
      url: `/api/sessions/${sid}/archive`,
      payload: { archived: false },
    })
    expect(restored.statusCode).toBe(200)
    const activeAgain = jsonOf(await f.app.inject({ method: 'GET', url: '/api/sessions' })) as unknown as Json[]
    expect(activeAgain.some((s) => s.id === sid)).toBe(true)
  })

  it('归档不存在会话 → 404', async () => {
    const f = await makeServer()
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/sessions/ses_0000000000000000000000000000dead/archive',
      payload: { archived: true },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('两段式删除（工单 12.4）', () => {
  it('缺 confirm → 400；confirm:true → 204 + trash 落盘 + 列表消失', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = idOf(created)

    const noConfirm = await f.app.inject({ method: 'DELETE', url: `/api/sessions/${sid}` })
    expect(noConfirm.statusCode).toBe(400)

    const ok = await f.app.inject({
      method: 'DELETE',
      url: `/api/sessions/${sid}`,
      payload: { confirm: true },
    })
    expect(ok.statusCode).toBe(204)

    const trashDir = join(f.root, 'trash')
    expect(existsSync(trashDir)).toBe(true)
    expect(readdirSync(trashDir).length).toBe(1)

    const list = jsonOf(await f.app.inject({ method: 'GET', url: '/api/sessions' })) as unknown as Json[]
    expect(list.some((s) => s.id === sid)).toBe(false)
  })

  it('删除后 GET 详情 → 404', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = idOf(created)
    await f.app.inject({ method: 'DELETE', url: `/api/sessions/${sid}`, payload: { confirm: true } })
    const detail = await f.app.inject({ method: 'GET', url: `/api/sessions/${sid}` })
    expect(detail.statusCode).toBe(404)
  })
})
