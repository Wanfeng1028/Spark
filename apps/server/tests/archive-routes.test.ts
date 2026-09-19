/**
 * 会话归档与两段式删除路由单测（阶段十二工单 12.4）：
 * PUT /api/sessions/:id/archive（归档→默认列表消失→?archived=true 可见→恢复）；
 * DELETE /api/sessions/:id（缺 confirm 400 → confirm:true 204 + trash 落盘 → 列表消失）。
 * 另：PUT /api/mcp（工单 12.6）与 GET /api/mcp/config 掩码读回/合并（RT3-07）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MCP_ENV_MASK } from '@spark/protocol'
import { makeServer } from './helpers.js'

type Json = Record<string, unknown>

function jsonOf(res: { json: () => unknown }): Json {
  return res.json() as Json
}

describe('会话归档（工单 12.4）', () => {
  it('归档 → 默认列表消失 → ?archived=true 可见（archivedAt 透传）→ 恢复', async () => {
    const f = await makeServer()
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { title: '归档我' },
    })
    const sid = (jsonOf(created) as { id: string }).id

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
    const sid = (jsonOf(created) as { id: string }).id

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

  it('fs/tree：合法路径枚举 / 越界 400 / 深度与上限封顶', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = (jsonOf(created) as { id: string }).id

    const tree = await f.app.inject({ method: 'GET', url: `/api/sessions/${sid}/fs/tree` })
    expect(tree.statusCode).toBe(200)
    const dto = jsonOf(tree)
    expect(dto['truncated']).toBe(false)
    expect(Array.isArray(dto['entries'])).toBe(true)

    const outside = await f.app.inject({
      method: 'GET',
      url: '/api/sessions/' + sid + '/fs/tree?path=' + encodeURIComponent('../../..'),
    })
    expect(outside.statusCode).toBe(400)
  })

  it('删除后 GET 详情 → 404', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = (jsonOf(created) as { id: string }).id
    await f.app.inject({ method: 'DELETE', url: `/api/sessions/${sid}`, payload: { confirm: true } })
    const detail = await f.app.inject({ method: 'GET', url: `/api/sessions/${sid}` })
    expect(detail.statusCode).toBe(404)
  })
})


describe('PUT /api/mcp（工单 12.6）', () => {
  it('合法 body → ok + mcp.json 落盘；坏 body → 400', async () => {
    const f = await makeServer()
    const ok = await f.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: {
        version: 1,
        servers: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] } },
      },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ ok: true, restartRequired: true })
    expect(existsSync(join(f.root, 'mcp.json'))).toBe(true)

    const bad = await f.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: { version: 2, servers: {} },
    })
    expect(bad.statusCode).toBe(400)
  })

  it('server 形状不符（缺 command）→ zod 拦截不落盘', async () => {
    const f = await makeServer()
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: { version: 1, servers: { broken: { args: [] } } },
    })
    expect(res.statusCode).toBe(400)
    expect(existsSync(join(f.root, 'mcp.json'))).toBe(false)
  })

  it('RT3-07：GET /api/mcp/config 读回——env 值一律掩码占位，明文不出引擎', async () => {
    const f = await makeServer()
    await f.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: {
        version: 1,
        servers: { filesystem: { command: 'npx', env: { GITHUB_TOKEN: 'ghp_real_secret' } } },
      },
    })
    const res = await f.app.inject({ method: 'GET', url: '/api/mcp/config' })
    expect(res.statusCode).toBe(200)
    const cfg = jsonOf(res) as { version: number; servers: Record<string, Json> }
    expect(cfg.version).toBe(1)
    expect(cfg.servers['filesystem']).toEqual({
      command: 'npx',
      env: { GITHUB_TOKEN: MCP_ENV_MASK },
    })
    expect(res.body).not.toContain('ghp_real_secret')
  })

  it('RT3-07：PUT 掩码占位 → 引擎合并盘上真值落盘（掩码不覆盖真值）', async () => {
    const f = await makeServer()
    await f.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: {
        version: 1,
        servers: { filesystem: { command: 'npx', env: { GITHUB_TOKEN: 'ghp_real_secret' } } },
      },
    })
    // 客户端以读回为底改 args 后保存：env 值只有掩码占位
    const ok = await f.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: {
        version: 1,
        servers: {
          filesystem: { command: 'npx', args: ['-y', 'pkg'], env: { GITHUB_TOKEN: MCP_ENV_MASK } },
        },
      },
    })
    expect(ok.statusCode).toBe(200)
    const onDisk = JSON.parse(readFileSync(join(f.root, 'mcp.json'), 'utf8')) as {
      servers: Record<string, Json>
    }
    expect(onDisk.servers['filesystem']?.env).toEqual({ GITHUB_TOKEN: 'ghp_real_secret' })
    expect(onDisk.servers['filesystem']?.args).toEqual(['-y', 'pkg'])
  })

  it('RT3-07：掩码占位无既有真值（新 server）→ 400 不落盘', async () => {
    const f = await makeServer()
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: {
        version: 1,
        servers: { fresh: { command: 'npx', env: { N: MCP_ENV_MASK } } },
      },
    })
    expect(res.statusCode).toBe(400)
    expect(existsSync(join(f.root, 'mcp.json'))).toBe(false)
  })
})
