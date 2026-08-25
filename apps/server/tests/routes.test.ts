/**
 * REST 路由单测（doc/02 §8.6 server 行）：zod 400 / 404 / 409 / 503 映射；
 * 列表分页 cursor；详情含 durable 回放；messages 三态直通；interrupt 幂等。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import { Engine, ScriptedLlm } from '@spark/engine'
import { registerRoutes } from '../src/routes.js'
import { makeConfig, makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

type Json = Record<string, unknown>

let fixtures: ServerFixture[] = []

async function setup(): Promise<ServerFixture> {
  const f = await makeServer()
  fixtures.push(f)
  return f
}

beforeEach(() => {
  fixtures = []
})

afterEach(async () => {
  for (const f of fixtures) {
    await f.app.close()
    await f.engine.shutdown()
  }
})

/** 收集引擎事件（审批流拿 requestId、steer 时序用） */
function collectEvents(f: ServerFixture): SparkEventEnvelope[] {
  const events: SparkEventEnvelope[] = []
  f.engine.subscribe((e) => {
    events.push(e)
  })
  return events
}

async function waitFor<T>(pred: () => T | undefined, timeoutMs = 2000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = pred()
    if (v !== undefined) return v
    if (Date.now() > deadline) throw new Error('waitFor 超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('POST /api/sessions', () => {
  test('201 + SessionMetaDto（status 实时填充；session.created 已落盘）', async () => {
    const f = await setup()
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { title: '测试会话' },
    })
    expect(res.statusCode).toBe(201)
    const dto: Json = res.json()
    expect(typeof dto['id']).toBe('string')
    expect((dto['id'] as string).startsWith('ses_')).toBe(true)
    expect(dto['title']).toBe('测试会话')
    expect(dto['model']).toBe('fake/fake-chat')
    expect(dto['cwd']).toBe(process.cwd())
    expect(dto['status']).toBe('idle')
    expect(dto['lastSeq']).toBe(1) // session.created
  })

  test('未知字段 → 400 E_VALIDATION + issues', async () => {
    const f = await setup()
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { unexpected: true },
    })
    expect(res.statusCode).toBe(400)
    const body: Json = res.json()
    expect(body['code']).toBe('E_VALIDATION')
    expect(Array.isArray(body['issues'])).toBe(true)
  })

  test('model 指向未配置 provider → 500 E_INTERNAL（详情不透出）', async () => {
    const f = await setup()
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { model: 'nope/model' },
    })
    expect(res.statusCode).toBe(500)
    const body: Json = res.json()
    expect(body['code']).toBe('E_INTERNAL')
    expect(body['message']).toBe('internal error')
  })
})

describe('GET /api/sessions', () => {
  test('空列表 → []', async () => {
    const f = await setup()
    const res = await f.app.inject({ method: 'GET', url: '/api/sessions' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  test('按 updatedAt 倒序；limit 切片；cursor 翻页；cursor 不存在 404', async () => {
    const f = await setup()
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const r = await f.app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { title: `s${i}` },
      })
      const dto: Json = r.json()
      ids.push(dto['id'] as string)
      await new Promise((r2) => setTimeout(r2, 5)) // updatedAt 时间差
    }

    const all = await f.app.inject({ method: 'GET', url: '/api/sessions' })
    const list: Json[] = all.json()
    expect(list.map((m) => m['title'])).toEqual(['s2', 's1', 's0'])

    const limited = await f.app.inject({ method: 'GET', url: '/api/sessions?limit=1' })
    const onePage: Json[] = limited.json()
    expect(onePage.map((m) => m['title'])).toEqual(['s2'])

    const paged = await f.app.inject({
      method: 'GET',
      url: `/api/sessions?cursor=${ids[2]}`,
    })
    const secondPage: Json[] = paged.json()
    expect(secondPage.map((m) => m['title'])).toEqual(['s1', 's0'])

    const missing = await f.app.inject({
      method: 'GET',
      url: '/api/sessions?cursor=ses_nonexistent0000000000000000',
    })
    expect(missing.statusCode).toBe(404)
    const body: Json = missing.json()
    expect(body['code']).toBe('E_NOT_FOUND')
  })

  test('limit 非法 → 400', async () => {
    const f = await setup()
    const res = await f.app.inject({ method: 'GET', url: '/api/sessions?limit=abc' })
    expect(res.statusCode).toBe(400)
    const body: Json = res.json()
    expect(body['code']).toBe('E_VALIDATION')
  })
})

describe('GET /api/sessions/:id', () => {
  test('返回 meta + events（durable 按 seq 升序）', async () => {
    const f = await setup()
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    const res = await f.app.inject({ method: 'GET', url: `/api/sessions/${id}` })
    expect(res.statusCode).toBe(200)
    const detail: Json = res.json()
    expect(detail['id']).toBe(id)
    const events = detail['events'] as Json[]
    expect(events.map((e) => e['type'])).toEqual(['session.created'])
    expect(events[0]?.['seq']).toBe(1)
  })

  test('未加载会话走 resume 路径（磁盘扫描）', async () => {
    const f = await setup()
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    // 换引擎实例（进程重启语义）：同一 root，会话只在磁盘
    const engine2 = new Engine({ root: f.root, gateway: new ScriptedLlm(), config: makeConfig() })
    const app2 = Fastify({ logger: false })
    await app2.register(registerRoutes, { engine: engine2 })
    const res = await app2.inject({ method: 'GET', url: `/api/sessions/${id}` })
    expect(res.statusCode).toBe(200)
    // resume 路径补发 session.resumed durable 事件（§5.2.1）
    const detail: Json = res.json()
    const events = detail['events'] as Json[]
    expect(events.map((e) => e['type'])).toEqual(['session.created', 'session.resumed'])
    await app2.close()
    await engine2.shutdown()
  })

  test('未知 id → 404；格式非法 → 400', async () => {
    const f = await setup()
    const missing = await f.app.inject({
      method: 'GET',
      url: '/api/sessions/ses_notexist00000000000000000',
    })
    expect(missing.statusCode).toBe(404)
    const missingBody: Json = missing.json()
    expect(missingBody['code']).toBe('E_NOT_FOUND')

    const bad = await f.app.inject({ method: 'GET', url: '/api/sessions/not-an-id' })
    expect(bad.statusCode).toBe(400)
    const badBody: Json = bad.json()
    expect(badBody['code']).toBe('E_VALIDATION')
  })
})

describe('POST /api/sessions/:id/messages', () => {
  test('三态直通 started（不等 turn 结果）', async () => {
    const f = await setup()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '收到' }] })
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    const res = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '你好' },
    })
    expect(res.statusCode).toBe(200)
    const body: Json = res.json()
    expect(body['result']).toBe('started')
    expect(typeof body['turnId']).toBe('string')
  })

  test('turn 中 steer → steered', async () => {
    const f = await setup()
    const events = collectEvents(f)
    f.gateway.scriptStep({
      deltas: [{ kind: 'text', text: '长' }],
      hangMs: 300, // 挂起期间注入 steer
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '尾' }] })
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    const r1 = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '第一条' },
    })
    const b1: Json = r1.json()
    expect(b1['result']).toBe('started')
    await waitFor(() => (events.some((e) => e.type === 'turn.started') ? true : undefined))
    const r2 = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '插一句', delivery: 'steer' },
    })
    const b2: Json = r2.json()
    expect(b2['result']).toBe('steered')
  })

  test('text 空 → 400；delivery 非法 → 400；未知会话 → 404', async () => {
    const f = await setup()
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    const empty = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '' },
    })
    expect(empty.statusCode).toBe(400)
    const badDelivery = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: 'x', delivery: 'whenever' },
    })
    expect(badDelivery.statusCode).toBe(400)
    const missing = await f.app.inject({
      method: 'POST',
      url: '/api/sessions/ses_notexist00000000000000000/messages',
      payload: { text: 'x' },
    })
    expect(missing.statusCode).toBe(404)
  })
})

describe('POST /api/sessions/:id/interrupt', () => {
  test('idle 幂等 → 200 {ok:true}；未知会话 → 404', async () => {
    const f = await setup()
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    const res = await f.app.inject({ method: 'POST', url: `/api/sessions/${id}/interrupt` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })

    const missing = await f.app.inject({
      method: 'POST',
      url: '/api/sessions/ses_notexist00000000000000000/interrupt',
    })
    expect(missing.statusCode).toBe(404)
  })
})

describe('POST /api/sessions/:id/compact（工单 4.3 手动 /compact）', () => {
  test('idle → 200 {ok:true}；compaction.* 事件落盘；未知会话 → 404', async () => {
    const f = await setup()
    const events = collectEvents(f)
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复' }] })
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    await f.app.inject({ method: 'POST', url: `/api/sessions/${id}/messages`, payload: { text: '讨论' } })
    await waitFor(() => (events.some((e) => e.type === 'turn.completed') ? true : undefined))

    f.gateway.scriptOnce('路由层摘要')
    const res = await f.app.inject({ method: 'POST', url: `/api/sessions/${id}/compact` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    const types = events.filter((e) => e.seq !== undefined).map((e) => e.type)
    expect(types).toContain('compaction.started')
    expect(types.indexOf('compaction.started')).toBeLessThan(
      types.indexOf('compaction.completed'),
    )
    const completed = events.find((e) => e.type === 'compaction.completed')
    expect(completed?.data).toMatchObject({ summary: '路由层摘要' })

    const missing = await f.app.inject({
      method: 'POST',
      url: '/api/sessions/ses_notexist00000000000000000/compact',
    })
    expect(missing.statusCode).toBe(404)
  })

  test('turn 进行中 → 409 E_TURN_ACTIVE', async () => {
    const f = await setup()
    const events = collectEvents(f)
    f.gateway.scriptStep({
      deltas: [{ kind: 'text', text: '长' }],
      hangMs: 300,
    })
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    await f.app.inject({ method: 'POST', url: `/api/sessions/${id}/messages`, payload: { text: '第一条' } })
    await waitFor(() => (events.some((e) => e.type === 'turn.started') ? true : undefined))

    const res = await f.app.inject({ method: 'POST', url: `/api/sessions/${id}/compact` })
    expect(res.statusCode).toBe(409)
    const body: Json = res.json()
    expect(body['code']).toBe('E_TURN_ACTIVE')
  })
})

describe('POST /api/permissions/:requestId', () => {
  test('审批流：asked → reply 200；重复 → 409；未知 → 404', async () => {
    const f = await setup()
    const events = collectEvents(f)
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_sroutes01'),
          name: 'bash',
          input: { command: 'echo hi' },
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    const dto: Json = created.json()
    const id = dto['id'] as string
    await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '跑命令' },
    })

    const asked = await waitFor(() =>
      events.find(
        (e): e is SparkEventEnvelope<'permission.asked'> =>
          e.type === 'permission.asked',
      ),
    )
    const requestId = asked.data.requestId

    const ok = await f.app.inject({
      method: 'POST',
      url: `/api/permissions/${requestId}`,
      payload: { reply: 'once' },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ ok: true })

    const again = await f.app.inject({
      method: 'POST',
      url: `/api/permissions/${requestId}`,
      payload: { reply: 'reject' },
    })
    expect(again.statusCode).toBe(409)
    const againBody: Json = again.json()
    expect(againBody['code']).toBe('E_ALREADY_RESOLVED')

    const unknown = await f.app.inject({
      method: 'POST',
      url: '/api/permissions/req_notexist0000000000000000',
      payload: { reply: 'once' },
    })
    expect(unknown.statusCode).toBe(404)
  })

  test('reply 非法值 → 400', async () => {
    const f = await setup()
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/permissions/req_anything000000000000000000',
      payload: { reply: 'maybe' },
    })
    expect(res.statusCode).toBe(400)
    const body: Json = res.json()
    expect(body['code']).toBe('E_VALIDATION')
  })
})

describe('引擎 shutdown 后', () => {
  test('POST /api/sessions → 503 E_SHUTTING_DOWN', async () => {
    const f = await setup()
    await f.engine.shutdown()
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })
    expect(res.statusCode).toBe(503)
    const body: Json = res.json()
    expect(body['code']).toBe('E_SHUTTING_DOWN')
  })
})

describe('GET /api/sessions/:id/tree 与 POST /:id/fork（工单 4.5）', () => {
  /** 建一个完整 turn 的会话，返回 { id, nodes }（树节点数组） */
  async function makeTurnSession(
    f: ServerFixture,
  ): Promise<{ id: string; nodes: Record<string, unknown>[] }> {
    const events = collectEvents(f)
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复内容' }] })
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const id = created.json<Json>()['id'] as string
    await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '用户提问' },
    })
    await waitFor(() => (events.some((e) => e.type === 'turn.completed') ? true : undefined))
    const tree = await f.app.inject({ method: 'GET', url: `/api/sessions/${id}/tree` })
    return { id, nodes: tree.json<Record<string, unknown>[]>() }
  }

  test('tree：节点链 + label 摘要 + childIds 线性链', async () => {
    const f = await setup()
    const { nodes } = await makeTurnSession(f)
    expect(nodes).toHaveLength(5)
    const types = nodes.map((n) => n['type'])
    expect(types).toEqual([
      'session.created',
      'user.message',
      'turn.started',
      'assistant.message',
      'turn.completed',
    ])
    // label：user.message 取 text、turn.completed 取 finish 摘要
    expect(nodes[1]?.['label']).toBe('用户提问')
    expect(nodes[4]?.['label']).toBe('turn 结束（stop）')
    // 线性链：childIds 指向下一节点
    expect(nodes[0]?.['childIds']).toEqual([nodes[1]?.['id']])
    expect(nodes[4]?.['childIds']).toEqual([])
    // parentId 链
    expect(nodes[1]?.['parentId']).toBe(nodes[0]?.['id'])
  })

  test('fork：201 + 新会话 dto；树出现 forks；边界/未知会话/坏 body 拒绝', async () => {
    const f = await setup()
    const { id, nodes } = await makeTurnSession(f)
    const boundary = nodes[1]?.['id'] as string // user.message

    const forked = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/fork`,
      payload: { fromEventId: boundary },
    })
    expect(forked.statusCode).toBe(201)
    const fdto: Json = forked.json()
    expect(fdto['lastSeq']).toBe(2)
    expect(fdto['status']).toBe('idle')
    expect(fdto['title']).toBe('') // 无显式标题（自动标题未触发——fork 不发 session.created）

    // 分叉后树视图：boundary 节点挂 forks 子会话
    const tree = await f.app.inject({ method: 'GET', url: `/api/sessions/${id}/tree` })
    const treeNodes = tree.json<Record<string, unknown>[]>()
    const boundaryNode = treeNodes.find((n) => n['id'] === boundary)
    expect(boundaryNode).toBeDefined()
    const forks = boundaryNode?.['forks'] as Record<string, unknown>[]
    expect(forks).toHaveLength(1)
    expect(forks[0]?.['sessionId']).toBe(fdto['id'])

    // 边界事件不存在 → 400 E_INVALID_BOUNDARY
    const bad = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/fork`,
      payload: { fromEventId: 'evt_01HXNOTEXIST00000000000X' },
    })
    expect(bad.statusCode).toBe(400)
    expect((bad.json<Json>())['code']).toBe('E_INVALID_BOUNDARY')

    // 边界落在历史 turn 中间 → 409 E_OPEN_TURN
    const midTurn = nodes[3]?.['id'] as string // assistant.message（turn.started 之后）
    const mid = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/fork`,
      payload: { fromEventId: midTurn },
    })
    expect(mid.statusCode).toBe(409)
    expect((mid.json<Json>())['code']).toBe('E_OPEN_TURN')

    // 未知会话 → 404
    const missing = await f.app.inject({
      method: 'POST',
      url: '/api/sessions/ses_notexist00000000000000000/fork',
      payload: { fromEventId: boundary },
    })
    expect(missing.statusCode).toBe(404)

    // 坏 body（缺 fromEventId）→ 400 E_VALIDATION
    const badBody = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/fork`,
      payload: {},
    })
    expect(badBody.statusCode).toBe(400)
    expect((badBody.json<Json>())['code']).toBe('E_VALIDATION')
  })
})

describe('GET /:id/checkpoints 与 POST /:id/checkpoints/:cid/rollback（工单 4.6）', () => {
  test('checkpoints:false（默认夹具）：列表 []；回滚 → 404（快照不存在）', async () => {
    const f = await setup()
    const events = collectEvents(f)
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复' }] })
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const id = created.json<Json>()['id'] as string
    await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '问题' },
    })
    await waitFor(() => (events.some((e) => e.type === 'turn.completed') ? true : undefined))

    const list = await f.app.inject({ method: 'GET', url: `/api/sessions/${id}/checkpoints` })
    expect(list.statusCode).toBe(200)
    expect(list.json()).toEqual([])

    const rb = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/checkpoints/${ids.checkpoint('ckp_none0000000000000000')}/rollback`,
    })
    expect(rb.statusCode).toBe(404)
    expect((rb.json<Json>())['code']).toBe('E_NOT_FOUND')
  })

  test('checkpoints:true：turn 边界快照 + 回滚两域复位（工作区恢复/清除 + 会话截断 + resumed）', async () => {
    const f = await makeServer({ checkpoints: true })
    fixtures.push(f)
    const ws = await mkdtemp(join(tmpdir(), 'spark-ckpt-ws-'))
    const events = collectEvents(f)

    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复一' }] })
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { cwd: ws },
    })
    const id = created.json<Json>()['id'] as string
    await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '问题一' },
    })
    await waitFor(
      () => (events.filter((e) => e.type === 'checkpoint.created').length >= 1 ? true : undefined),
    )
    await writeFile(join(ws, 'a.txt'), 'v1', 'utf8')

    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复二' }] })
    await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '问题二' },
    })
    await waitFor(
      () => (events.filter((e) => e.type === 'checkpoint.created').length >= 2 ? true : undefined),
    )
    // 第二个快照之后的用户改动：a.txt 改内容 + 新增未跟踪 b.txt
    await writeFile(join(ws, 'a.txt'), 'v2', 'utf8')
    await writeFile(join(ws, 'b.txt'), '快照后新增', 'utf8')

    const list = await f.app.inject({ method: 'GET', url: `/api/sessions/${id}/checkpoints` })
    expect(list.statusCode).toBe(200)
    const rows = list.json<Json[]>()
    expect(rows).toHaveLength(2)
    expect(rows[0]?.['files']).toContain('.spark-checkpoint/session.jsonl')
    expect(rows[0]?.['commit']).toBeUndefined() // commit sha 不上线（DTO 形状）
    // 回滚到第二快照（a.txt 已入库为 v1）：一并验证 reset --hard 内容还原与 clean -fd 清新增
    const second = rows[1]?.['checkpointId'] as string

    const rb = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/checkpoints/${second}/rollback`,
    })
    expect(rb.statusCode).toBe(200)
    const dto: Json = rb.json()
    expect(dto['status']).toBe('idle')

    // 工作区复位：a.txt 还原快照内容（reset --hard）、b.txt 清除（clean -fd）
    expect(await readFile(join(ws, 'a.txt'), 'utf8')).toBe('v1')
    await expect(readFile(join(ws, 'b.txt'), 'utf8')).rejects.toThrow()

    // 会话文件截断到第二 turn 边界（含第一轮的 checkpoint.created）+ 重载补 session.resumed
    const detail = await f.app.inject({ method: 'GET', url: `/api/sessions/${id}` })
    const evs = (detail.json<Json>()['events'] as Json[]).map((e) => e['type'])
    expect(evs).toEqual([
      'session.created',
      'user.message',
      'turn.started',
      'assistant.message',
      'turn.completed',
      'checkpoint.created',
      'user.message',
      'turn.started',
      'assistant.message',
      'turn.completed',
      'session.resumed',
    ])
  })

  test('拒绝码：未知快照 404；坏 cid 400；未知会话 404；turn 进行中 409', async () => {
    const f = await makeServer({ checkpoints: true })
    fixtures.push(f)
    // cwd 指向临时空目录：checkpoints:true 下 turn 边界会对工作区 git add -A，
    // 默认 cwd（server 源码树）会让快照吞掉整个 node_modules
    const ws = await mkdtemp(join(tmpdir(), 'spark-ckpt-ws-'))
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: { cwd: ws } })
    const id = created.json<Json>()['id'] as string

    const missing = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/checkpoints/${ids.checkpoint('ckp_missing00000000000000')}/rollback`,
    })
    expect(missing.statusCode).toBe(404)

    const badCid = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/checkpoints/not-a-cid/rollback`,
    })
    expect(badCid.statusCode).toBe(400)
    expect((badCid.json<Json>())['code']).toBe('E_VALIDATION')

    const missingSession = await f.app.inject({
      method: 'GET',
      url: '/api/sessions/ses_notexist00000000000000000/checkpoints',
    })
    expect(missingSession.statusCode).toBe(404)

    // turn 进行中 → 409 E_TURN_ACTIVE（运行检查先于快照存在性检查）
    const events = collectEvents(f)
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '长回复' }], hangMs: 300 })
    await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/messages`,
      payload: { text: '第一句' },
    })
    await waitFor(() => (events.some((e) => e.type === 'turn.started') ? true : undefined))
    const active = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${id}/checkpoints/${ids.checkpoint('ckp_any000000000000000000')}/rollback`,
    })
    expect(active.statusCode).toBe(409)
    expect((active.json<Json>())['code']).toBe('E_TURN_ACTIVE')
  })
})
