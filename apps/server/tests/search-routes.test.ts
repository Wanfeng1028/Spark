/**
 * 会话全文搜索路由单测（阶段七工单 7.13 / H12）：
 * GET /api/search 命中形状（sessionId/eventId/type/snippet）/ limit 截断 / 坏查询 400。
 * 数据经真实 ScriptedLlm turn 产生（user/assistant 事件入索引）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { rmSync } from 'node:fs'
import type { SearchHitDto } from '@spark/protocol'
import { makeServer, type ServerFixture } from './helpers.js'

type ErrBody = { code: string }

let fixtures: ServerFixture[] = []
let dirs: string[] = []

beforeEach(() => {
  fixtures = []
  dirs = []
})

afterEach(async () => {
  for (const f of fixtures) await f.app.close()
  for (const f of fixtures) await f.engine.shutdown()
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      // 句柄未释放的目录跳过清理（交系统临时目录回收）
    }
  }
})

async function makeSearchServer(): Promise<ServerFixture> {
  const f = await makeServer()
  fixtures.push(f)
  dirs.push(f.root)
  return f
}

async function waitTurnDone(f: ServerFixture, n = 1): Promise<void> {
  // engine 订阅由 SSE/路由外部不可得——轮询 store 的 lastSeq 不变且存在 turn.completed
  const deadline = Date.now() + 2000
  for (;;) {
    const sessions = await f.engine.listSessions()
    const done = sessions.every(
      (s) =>
        f.engine.getSession(s.id)?.events().filter((e) => e.type === 'turn.completed').length === n,
    )
    if (done && sessions.length > 0) return
    if (Date.now() > deadline) throw new Error('等待 turn.completed 超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('GET /api/search（工单 7.13）', () => {
  test('空库 → []；一轮对话后 user/assistant 命中（形状完整、新→旧）', async () => {
    const f = await makeSearchServer()
    let res = await f.app.inject({ method: 'GET', url: '/api/search?q=任意词' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])

    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '路由层的检索应答词' }] })
    f.gateway.scriptOnce('路由搜索标题')
    const dto = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = dto.json<{ id: string }>().id
    await f.app.inject({ method: 'POST', url: `/api/sessions/${sid}/messages`, payload: { text: '路由层的提问检索词' } })
    await waitTurnDone(f)

    res = await f.app.inject({ method: 'GET', url: '/api/search?q=检索' })
    const rows = res.json<SearchHitDto[]>()
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.every((r) => r.sessionId === sid)).toBe(true)
    const kinds = rows.map((r) => r.type)
    expect(kinds).toContain('user.message')
    expect(kinds).toContain('assistant.message')
    for (const r of rows) {
      expect(r.eventId).toMatch(/^evt_/)
      expect(r.snippet).toContain('检索')
      expect(r.sessionTitle).toBe('路由搜索标题')
    }
  })

  test('limit 截断', async () => {
    const f = await makeSearchServer()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '截断检查甲' }] })
    f.gateway.scriptOnce('截断标题')
    const dto = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = dto.json<{ id: string }>().id
    await f.app.inject({ method: 'POST', url: `/api/sessions/${sid}/messages`, payload: { text: '截断检查乙' } })
    await waitTurnDone(f)

    const res = await f.app.inject({ method: 'GET', url: '/api/search?q=截断检查&limit=1' })
    const rows = res.json<SearchHitDto[]>()
    expect(rows).toHaveLength(1)
    // 新→旧：assistant.message 晚于 user.message
    expect(rows[0]?.type).toBe('assistant.message')
  })

  test('坏查询 → 400（q 缺失 / limit 越界）', async () => {
    const f = await makeSearchServer()
    for (const qs of ['', 'q=', 'limit=0', 'limit=101']) {
      const res = await f.app.inject({ method: 'GET', url: `/api/search?${qs}` })
      expect(res.statusCode, qs).toBe(400)
      expect(res.json<ErrBody>().code, qs).toBe('E_VALIDATION')
    }
  })
})
