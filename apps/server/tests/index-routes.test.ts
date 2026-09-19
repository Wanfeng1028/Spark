/**
 * 索引库管理路由测试（阶段十九 19.11）：GET /api/index/stats 形状 /
 * POST /api/index/rebuild 清表重扫后条目数 ≥1 / POST /api/index/vacuum 回前后体积（非增）。
 * 数据经真实 ScriptedLlm turn 产生（JSONL 权威 → 重建回填），与 search-routes 同夹具纪律。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { rmSync } from 'node:fs'
import type { IndexStatsDto, RebuildResultDto, SessionId, VacuumResultDto } from '@spark/protocol'
import { makeServer, type ServerFixture } from './helpers.js'

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

async function makeIndexServer(): Promise<ServerFixture> {
  const f = await makeServer()
  fixtures.push(f)
  dirs.push(f.root)
  return f
}

async function waitTurnDone(f: ServerFixture, n = 1): Promise<void> {
  const deadline = Date.now() + 2000
  for (;;) {
    const sessions = await f.engine.listSessions()
    const done =
      sessions.length > 0 &&
      sessions.every(
        (s) =>
          f.engine.getSession(s.id)?.events().filter((e) => e.type === 'turn.completed').length ===
          n,
      )
    if (done) return
    if (Date.now() > deadline) throw new Error('等待 turn.completed 超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

/** 一轮真实对话（user.message + assistant.message 入索引），返回会话 id */
async function seedOneTurn(f: ServerFixture): Promise<SessionId> {
  f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '索引管理路由的应答文本' }] })
  f.gateway.scriptOnce('索引管理标题')
  const dto = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
  const sid = dto.json<{ id: SessionId }>().id
  await f.app.inject({
    method: 'POST',
    url: `/api/sessions/${sid}/messages`,
    payload: { text: '索引管理路由的提问文本' },
  })
  await waitTurnDone(f)
  return sid
}

describe('索引库管理路由（阶段十九 19.11）', () => {
  test('GET /api/index/stats：200 形状（entries/sizeBytes/path；一轮对话后 entries ≥1）', async () => {
    const f = await makeIndexServer()
    let res = await f.app.inject({ method: 'GET', url: '/api/index/stats' })
    expect(res.statusCode).toBe(200)
    const empty = res.json<IndexStatsDto>()
    expect(empty.entries).toBe(0)
    expect(empty.sizeBytes).toBeGreaterThanOrEqual(0)
    expect(empty.path).toMatch(/search\.db$/)

    await seedOneTurn(f)
    res = await f.app.inject({ method: 'GET', url: '/api/index/stats' })
    expect(res.statusCode).toBe(200)
    const stats = res.json<IndexStatsDto>()
    expect(stats.entries).toBeGreaterThanOrEqual(1)
    expect(stats.sizeBytes).toBeGreaterThan(0)
  })

  test('POST /api/index/rebuild：清表重扫 JSONL，等待完成回条目数（检索可复验）', async () => {
    const f = await makeIndexServer()
    const sid = await seedOneTurn(f)

    const res = await f.app.inject({ method: 'POST', url: '/api/index/rebuild' })
    expect(res.statusCode).toBe(200)
    const r = res.json<RebuildResultDto>()
    expect(r.entries).toBeGreaterThanOrEqual(1)

    // 重建后全文检索照常命中（数据来自 JSONL 重扫而非增量残留）
    const q = await f.app.inject({ method: 'GET', url: '/api/search?q=索引管理' })
    expect(q.statusCode).toBe(200)
    expect(q.json<{ sessionId: string }[]>()[0]?.sessionId).toBe(sid)
  })

  test('POST /api/index/vacuum：200 回前后体积（after ≤ before，形状完整）', async () => {
    const f = await makeIndexServer()
    await seedOneTurn(f)

    const res = await f.app.inject({ method: 'POST', url: '/api/index/vacuum' })
    expect(res.statusCode).toBe(200)
    const r = res.json<VacuumResultDto>()
    expect(r.sizeBytesBefore).toBeGreaterThan(0)
    expect(r.sizeBytesAfter).toBeLessThanOrEqual(r.sizeBytesBefore)
  })
})
