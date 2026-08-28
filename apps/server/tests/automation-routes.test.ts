/**
 * 自动化路由单测（阶段七工单 7.6 / H06 / ADR D26）：
 * 清单/创建（校验 400 三态）/删除/启停/运行历史 limit/手动触发/webhook 拒绝；
 * 集成一条：手动触发 → 真实建会话（ScriptedLlm），/api/sessions 可见 + 运行历史带 sessionId。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { rmSync } from 'node:fs'
import type { AutomationCreateSchema, AutomationRunDto, AutomationTriggerDto, SessionDto } from '@spark/protocol'
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

async function makeAutomationServer(): Promise<ServerFixture> {
  const f = await makeServer()
  fixtures.push(f)
  dirs.push(f.root)
  return f
}

const VALID_CREATE = {
  name: '夜间巡检',
  cwd: '/tmp/spark-auto',
  prompt: '检查构建状态',
  cron: '0 3 * * *',
} satisfies ReturnType<typeof AutomationCreateSchema.parse>

describe('GET /api/automation（工单 7.6）', () => {
  test('空清单 → []；创建后列出（线上形状含 id/enabled/createdAt）', async () => {
    const f = await makeAutomationServer()
    let res = await f.app.inject({ method: 'GET', url: '/api/automation' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])

    res = await f.app.inject({ method: 'POST', url: '/api/automation', payload: VALID_CREATE })
    expect(res.statusCode).toBe(201)
    const created = res.json<AutomationTriggerDto>()
    expect(created).toMatchObject({ name: '夜间巡检', enabled: true, cron: '0 3 * * *' })
    expect(created.id.length).toBeGreaterThan(0)

    res = await f.app.inject({ method: 'GET', url: '/api/automation' })
    expect(res.json<AutomationTriggerDto[]>().map((t) => t.id)).toEqual([created.id])
  })
})

describe('POST /api/automation 校验（工单 7.6）', () => {
  test('无任何触发条件 → 400 E_TRIGGER', async () => {
    const f = await makeAutomationServer()
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/automation',
      payload: { name: 'x', cwd: '/tmp', prompt: 'p' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<ErrBody>().code).toBe('E_TRIGGER')
  })

  test('坏 cron 表达式 → 400 E_CRON（创建期解析，不带病入库）', async () => {
    const f = await makeAutomationServer()
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/automation',
      payload: { ...VALID_CREATE, cron: 'not a cron' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<ErrBody>().code).toBe('E_CRON')
  })

  test('形状非法（缺 name / 多余字段）→ 400 E_VALIDATION', async () => {
    const f = await makeAutomationServer()
    let res = await f.app.inject({
      method: 'POST',
      url: '/api/automation',
      payload: { cwd: '/tmp', prompt: 'p', cron: '* * * * *' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<ErrBody>().code).toBe('E_VALIDATION')

    res = await f.app.inject({
      method: 'POST',
      url: '/api/automation',
      payload: { ...VALID_CREATE, extra: 1 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE / PUT enabled（工单 7.6）', () => {
  test('删除存在 → 200 且清单更新；再删与未知 id → 404', async () => {
    const f = await makeAutomationServer()
    const created = (
      await f.app.inject({ method: 'POST', url: '/api/automation', payload: VALID_CREATE })
    ).json<AutomationTriggerDto>()

    let res = await f.app.inject({ method: 'DELETE', url: `/api/automation/${created.id}` })
    expect(res.statusCode).toBe(200)
    res = await f.app.inject({ method: 'DELETE', url: `/api/automation/${created.id}` })
    expect(res.statusCode).toBe(404)
    res = await f.app.inject({ method: 'DELETE', url: '/api/automation/nope' })
    expect(res.statusCode).toBe(404)
  })

  test('启停：200 生效；未知 404；坏 body 400', async () => {
    const f = await makeAutomationServer()
    const created = (
      await f.app.inject({ method: 'POST', url: '/api/automation', payload: VALID_CREATE })
    ).json<AutomationTriggerDto>()

    let res = await f.app.inject({
      method: 'PUT',
      url: `/api/automation/${created.id}/enabled`,
      payload: { enabled: false },
    })
    expect(res.statusCode).toBe(200)
    res = await f.app.inject({ method: 'GET', url: '/api/automation' })
    expect(res.json<AutomationTriggerDto[]>()[0]?.enabled).toBe(false)

    res = await f.app.inject({
      method: 'PUT',
      url: '/api/automation/nope/enabled',
      payload: { enabled: true },
    })
    expect(res.statusCode).toBe(404)

    res = await f.app.inject({
      method: 'PUT',
      url: `/api/automation/${created.id}/enabled`,
      payload: { enabled: 'yes' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('触发入口（工单 7.6 验收：三类触发 + 失败结构化留存）', () => {
  test('手动触发 → 真实建会话执行 prompt（ScriptedLlm 全链路）', async () => {
    const f = await makeAutomationServer()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '巡检完成' }] })
    const created = (
      await f.app.inject({ method: 'POST', url: '/api/automation', payload: VALID_CREATE })
    ).json<AutomationTriggerDto>()

    const res = await f.app.inject({ method: 'POST', url: `/api/automation/${created.id}/run` })
    expect(res.statusCode).toBe(200)

    const runs = (
      await f.app.inject({ method: 'GET', url: '/api/automation/runs' })
    ).json<AutomationRunDto[]>()
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      triggerId: created.id,
      kind: 'manual',
      finish: 'ok',
    })
    expect(runs[0]?.sessionId).toBeDefined()

    // 自动建的会话在会话列表可见（标题=自动化：<name>）
    const sessions = (
      await f.app.inject({ method: 'GET', url: '/api/sessions' })
    ).json<SessionDto[]>()
    const auto = sessions.find((s) => s.id === runs[0]?.sessionId)
    expect(auto?.title).toBe('自动化：夜间巡检')
  })

  test('webhook：非 webhook 触发器 400 / 停用 409 / 未知 404 / 正常 200', async () => {
    const f = await makeAutomationServer()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    const cronOnly = (
      await f.app.inject({ method: 'POST', url: '/api/automation', payload: VALID_CREATE })
    ).json<AutomationTriggerDto>()
    const hooked = (
      await f.app.inject({
        method: 'POST',
        url: '/api/automation',
        payload: { name: 'w', cwd: '/tmp', prompt: 'p', webhook: true },
      })
    ).json<AutomationTriggerDto>()

    let res = await f.app.inject({ method: 'POST', url: `/api/automation/webhook/${cronOnly.id}` })
    expect(res.statusCode).toBe(400)
    expect(res.json<ErrBody>().code).toBe('E_TRIGGER_KIND')

    await f.app.inject({
      method: 'PUT',
      url: `/api/automation/${hooked.id}/enabled`,
      payload: { enabled: false },
    })
    res = await f.app.inject({ method: 'POST', url: `/api/automation/webhook/${hooked.id}` })
    expect(res.statusCode).toBe(409)
    expect(res.json<ErrBody>().code).toBe('E_TRIGGER_DISABLED')

    res = await f.app.inject({ method: 'POST', url: '/api/automation/webhook/nope' })
    expect(res.statusCode).toBe(404)

    await f.app.inject({
      method: 'PUT',
      url: `/api/automation/${hooked.id}/enabled`,
      payload: { enabled: true },
    })
    res = await f.app.inject({ method: 'POST', url: `/api/automation/webhook/${hooked.id}` })
    expect(res.statusCode).toBe(200)
  })

  test('watch 触发器创建经 API（cron/watch/webhook 任一即可）+ runs limit', async () => {
    const f = await makeAutomationServer()
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/automation',
      payload: { name: '盯文件', cwd: '/tmp', prompt: 'p', watch: '/tmp/spark-watch-target' },
    })
    expect(res.statusCode).toBe(201)

    const runs = (
      await f.app.inject({ method: 'GET', url: '/api/automation/runs?limit=5' })
    ).json<AutomationRunDto[]>()
    expect(runs).toEqual([]) // 无 tick 循环（测试不调 ready）——清单可建，历史为空

    const bad = await f.app.inject({ method: 'GET', url: '/api/automation/runs?limit=0' })
    expect(bad.statusCode).toBe(400)
  })
})
