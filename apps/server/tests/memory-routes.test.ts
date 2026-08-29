/**
 * 长期记忆路由单测（阶段七工单 7.5 / H05 / ADR D25）：
 * GET /api/memories 列表 / DELETE /api/memories/:id 删除与 404 / 坏 id 400。
 * 落库走独立 MemoryStore 句柄（与 memory.save 工具同库；工具路径在 engine
 * memory.test.ts 覆盖）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { ids } from '@spark/protocol'
import { Engine, MemoryStore, ScriptedLlm } from '@spark/engine'
import { registerRoutes } from '../src/routes.js'
import { makeConfig } from './helpers.js'

type Json = Record<string, unknown>

interface Fixture {
  app: FastifyInstance
  engine: Engine
  root: string
}

let fixtures: Fixture[] = []
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

async function makeMemoryServer(): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), 'spark-memsrv-'))
  dirs.push(root)
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeConfig() })
  await engine.ready()
  const app = Fastify({ logger: false })
  await app.register(registerRoutes, { engine })
  const f: Fixture = { app, engine, root }
  fixtures.push(f)
  return f
}

describe('GET/DELETE /api/memories（工单 7.5）', () => {
  test('空库 → 空列表；写入后列出；删除后列表更新且再删 404', async () => {
    const f = await makeMemoryServer()
    const empty = await f.app.inject({ method: 'GET', url: '/api/memories' })
    expect(empty.statusCode).toBe(200)
    expect(empty.json()).toEqual([])

    // 独立句柄落一条（与 memory.save 工具同库同表）
    const store = new MemoryStore(join(f.root, 'memory.db'))
    const row = store.save(ids.session('ses_memroute0000000000'), '用户偏好 PostgreSQL', 1787800000000)
    store.close()

    const list = await f.app.inject({ method: 'GET', url: '/api/memories' })
    const rows: Json[] = list.json()
    expect(rows).toHaveLength(1)
    const first: Json = rows[0] ?? {}
    expect(first['content']).toBe('用户偏好 PostgreSQL')

    const del = await f.app.inject({ method: 'DELETE', url: `/api/memories/${row.id}` })
    expect(del.statusCode).toBe(200)
    const after = await f.app.inject({ method: 'GET', url: '/api/memories' })
    expect(after.json()).toEqual([])

    const again = await f.app.inject({ method: 'DELETE', url: `/api/memories/${row.id}` })
    expect(again.statusCode).toBe(404)
    const body: Json = again.json()
    expect(body['code']).toBe('E_NOT_FOUND')
  })

  test('坏 id（非正整数）→ 400 E_VALIDATION', async () => {
    const f = await makeMemoryServer()
    const res = await f.app.inject({ method: 'DELETE', url: '/api/memories/abc' })
    expect(res.statusCode).toBe(400)
    const body: Json = res.json()
    expect(body['code']).toBe('E_VALIDATION')
  })
})
