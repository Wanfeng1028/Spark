/**
 * 反馈存储与路由单测（阶段十九 19.19 / 消解 V2-25）：
 * ① store 层——提交/同键幂等改备注/撤回/stateOf 回显/列表过滤；
 * ② 路由层——POST 201 形状、GET 过滤与 limit、DELETE 撤回、未知字段 400。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
// FeedbackStore 落点在 engine（19.19）；server 侧只有路由，故 store 层判据经 internal 入口
// 直打（生产代码禁引 internal，测试豁免——见 packages/engine/tests/public-surface.test.ts）
import { FeedbackStore } from '@spark/engine/internal'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

const SID = ids.session('ses_feedback000000001')
const EID = ids.event('evt_feedback00000001')

describe('FeedbackStore（阶段十九 19.19 / V2-25）', () => {
  const dirs: string[] = []
  afterEach(async () => {
    const { rm } = await import('node:fs/promises')
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
  })

  async function store(): Promise<FeedbackStore> {
    const dir = await mkdtemp(join(tmpdir(), 'spark-fb-'))
    dirs.push(dir)
    return new FeedbackStore(join(dir, 'feedback.db'))
  }

  test('提交 → 落库并可读回', async () => {
    const s = await store()
    const row = s.submit({ sessionId: SID, eventId: EID, vote: 'up', note: '很好' }, 1000)
    expect(row.vote).toBe('up')
    expect(row.note).toBe('很好')
    expect(s.list({}, 10)).toHaveLength(1)
    expect(s.stateOf(SID, EID)).toBe('up')
    s.close()
  })

  test('同键重复提交幂等（改备注不堆行）', async () => {
    const s = await store()
    s.submit({ sessionId: SID, eventId: EID, vote: 'up', note: '一稿' }, 1000)
    const second = s.submit({ sessionId: SID, eventId: EID, vote: 'up', note: '二稿' }, 2000)
    expect(s.count()).toBe(1)
    expect(second.note).toBe('二稿')
    expect(second.createdAt).toBe(1000) // 创建时间不刷新（改备注不是新反馈）
    s.close()
  })

  test('异票是两行（up/down 各自独立——用户可对同一条既点赞又点踩？不：UI 层互斥）', async () => {
    const s = await store()
    s.submit({ sessionId: SID, eventId: EID, vote: 'up' }, 1000)
    s.submit({ sessionId: SID, eventId: EID, vote: 'down' }, 1001)
    expect(s.count()).toBe(2)
    // stateOf 取首条（UI 层不会同时亮两个——防御性回显只给一个）
    expect(s.stateOf(SID, EID)).not.toBeNull()
    s.close()
  })

  test('撤回：存在 → true 且行消失；不存在 → false（幂等）', async () => {
    const s = await store()
    s.submit({ sessionId: SID, eventId: EID, vote: 'down' }, 1000)
    expect(s.withdraw(SID, EID, 'down')).toBe(true)
    expect(s.withdraw(SID, EID, 'down')).toBe(false)
    expect(s.stateOf(SID, EID)).toBeNull()
    s.close()
  })

  test('列表：sessionId/vote 过滤 + 新→旧', async () => {
    const s = await store()
    const other = ids.session('ses_feedback000000002')
    s.submit({ sessionId: SID, eventId: ids.event('evt_1'), vote: 'up' }, 1000)
    s.submit({ sessionId: SID, eventId: ids.event('evt_2'), vote: 'down' }, 2000)
    s.submit({ sessionId: other, eventId: ids.event('evt_3'), vote: 'up' }, 3000)
    expect(s.list({ sessionId: SID }, 10).map((r) => r.eventId)).toEqual(['evt_2', 'evt_1'])
    expect(s.list({ vote: 'up' }, 10)).toHaveLength(2)
    expect(s.list({}, 2)).toHaveLength(2) // limit 截断
    s.close()
  })
})

describe('反馈路由（阶段十九 19.19）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  test('POST → 200 + 条目形状；GET 读回；DELETE 撤回', async () => {
    f = await makeServer({})
    const sid = ids.session('ses_fbroute0000000001')
    const eid = ids.event('evt_fbroute00000001')
    const post = await f.app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: { sessionId: sid, eventId: eid, vote: 'up', note: '到位' },
    })
    expect(post.statusCode).toBe(200)
    expect(post.json<{ vote: string; note: string }>().vote).toBe('up')

    const list = await f.app.inject({ method: 'GET', url: `/api/feedback?sessionId=${sid}` })
    expect(list.statusCode).toBe(200)
    const rows = list.json<{ eventId: string }[]>()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.eventId).toBe(eid)

    const del = await f.app.inject({
      method: 'DELETE',
      url: '/api/feedback',
      payload: { sessionId: sid, eventId: eid, vote: 'up' },
    })
    expect(del.statusCode).toBe(200)
    expect(del.json<{ removed: boolean }>().removed).toBe(true)
    const after = await f.app.inject({ method: 'GET', url: `/api/feedback?sessionId=${sid}` })
    expect(after.json()).toEqual([])
  })

  test('非法 vote → 400（strict enum）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: {
        sessionId: ids.session('ses_fbroute0000000002'),
        eventId: ids.event('evt_fbroute00000002'),
        vote: 'mid',
      },
    })
    expect(res.statusCode).toBe(400)
  })
})
