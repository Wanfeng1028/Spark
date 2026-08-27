/**
 * 命令注册表路由单测（阶段七工单 7.4 / H04 / doc/02 §7.2）：
 * GET /api/commands（内置基线 + 自定义合并）/ POST /api/sessions/:id/commands/:name
 * （compact ok / 自定义 prompt 展开 / client 命令 400 / 未知命令 404）/
 * GET /api/mcp 与 GET /api/skills（空表只读面）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import type { SparkEventEnvelope } from '@spark/protocol'
import { Engine, ScriptedLlm } from '@spark/engine'
import { registerRoutes } from '../src/routes.js'
import { makeConfig } from './helpers.js'

type Json = Record<string, unknown>

interface Fixture {
  app: FastifyInstance
  engine: Engine
  gateway: ScriptedLlm
  root: string
  events: SparkEventEnvelope[]
}

let fixtures: Fixture[] = []

/** 带自定义命令文件的 server 夹具（helpers.makeServer 不支持注入命令——本组专用） */
async function makeCommandServer(files: Record<string, string>): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'spark-cmdsrv-'))
  const dir = join(root, 'commands')
  await mkdir(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, 'utf8')
  }
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeConfig() })
  await engine.ready()
  const app = Fastify({ logger: false })
  await app.register(registerRoutes, { engine })
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    events.push(e)
  })
  const f: Fixture = { app, engine, gateway, root, events }
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

/** res.json() → Json（类型注解收窄——res.json() 返回 any） */
function jsonOf(res: { json(): unknown }): Json {
  return res.json() as Json
}

/** 新建会话的 id */
async function newSession(f: Fixture): Promise<string> {
  const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
  const body: Json = jsonOf(created)
  return body['id'] as string
}

describe('GET /api/commands', () => {
  test('内置基线六条 + 自定义命令合并', async () => {
    const f = await makeCommandServer({
      'review.md': '---\ndescription: 审查改动\n---\n\n请审查改动。',
    })
    const res = await f.app.inject({ method: 'GET', url: '/api/commands' })
    expect(res.statusCode).toBe(200)
    const list: Json[] = res.json()
    const names = list.map((c) => c['name'])
    for (const name of ['compact', 'model', 'mcp', 'skills', 'usage', 'resume']) {
      expect(names).toContain(name)
    }
    const review: Json = list.find((c) => c['name'] === 'review') ?? {}
    expect(review['description']).toBe('审查改动')
    expect(review['kind']).toBe('prompt')
    const compact: Json = list.find((c) => c['name'] === 'compact') ?? {}
    expect(compact['kind']).toBe('action')
  })
})

describe('POST /api/sessions/:id/commands/:name', () => {
  test('自定义命令：args 展开进 user.message（正常 turn 通道）', async () => {
    const f = await makeCommandServer({
      'review.md': '---\ndescription: 审查\n---\n\n请审查：$ARGUMENTS',
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const sid = await newSession(f)

    const res = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/commands/review`,
      payload: { args: 'src/a.ts' },
    })
    expect(res.statusCode).toBe(200)
    const body: Json = jsonOf(res)
    expect(body['ok']).toBe(true)

    const deadline = Date.now() + 2000
    while (!f.events.some((e) => e.type === 'turn.completed')) {
      if (Date.now() > deadline) throw new Error('等待 turn.completed 超时')
      await new Promise((r) => setTimeout(r, 10))
    }
    const userMsg = f.events.find((e) => e.type === 'user.message') as
      | SparkEventEnvelope<'user.message'>
      | undefined
    expect(userMsg?.data.text).toBe('请审查：src/a.ts')
  })

  test('compact：走压缩入口（compaction 事件对）', async () => {
    const f = await makeCommandServer({})
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    f.gateway.scriptOnce('标题')
    f.gateway.scriptOnce('摘要')
    const sid = await newSession(f)
    await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/messages`,
      payload: { text: 'hi' },
    })
    const deadline = Date.now() + 2000
    while (!f.events.some((e) => e.type === 'turn.completed')) {
      if (Date.now() > deadline) throw new Error('等待 turn.completed 超时')
      await new Promise((r) => setTimeout(r, 10))
    }

    const res = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/commands/compact`,
    })
    expect(res.statusCode).toBe(200)
    expect(f.events.some((e) => e.type === 'compaction.completed')).toBe(true)
  })

  test('client 命令 → 400 E_COMMAND_CLIENT；未知命令 → 404 E_NOT_FOUND', async () => {
    const f = await makeCommandServer({})
    const sid = await newSession(f)

    const client = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/commands/model`,
    })
    expect(client.statusCode).toBe(400)
    const clientBody: Json = jsonOf(client)
    expect(clientBody['code']).toBe('E_COMMAND_CLIENT')

    const unknown = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/commands/nope`,
    })
    expect(unknown.statusCode).toBe(404)
    const unknownBody: Json = jsonOf(unknown)
    expect(unknownBody['code']).toBe('E_NOT_FOUND')
  })

  test('body 带未知字段 → 400 E_VALIDATION', async () => {
    const f = await makeCommandServer({})
    const sid = await newSession(f)
    const res = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/commands/compact`,
      payload: { unexpected: 1 },
    })
    expect(res.statusCode).toBe(400)
    const body: Json = jsonOf(res)
    expect(body['code']).toBe('E_VALIDATION')
  })
})

describe('GET /api/mcp 与 GET /api/skills（只读数据面）', () => {
  test('无配置 → 空表', async () => {
    const f = await makeCommandServer({})
    const mcp = await f.app.inject({ method: 'GET', url: '/api/mcp' })
    expect(mcp.statusCode).toBe(200)
    expect(mcp.json()).toEqual([])
    const skills = await f.app.inject({ method: 'GET', url: '/api/skills' })
    expect(skills.statusCode).toBe(200)
    expect(skills.json()).toEqual([])
  })
})
