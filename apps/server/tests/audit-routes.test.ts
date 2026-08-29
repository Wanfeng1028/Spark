/**
 * 审计日志路由单测（阶段七工单 7.12 / H11）：
 * GET /api/audit 缺省列表 / kind·result·tool·limit 过滤 / 坏查询 400。
 * 数据经 Engine 门面注入（规则管理行），不打真实审批链路。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { rmSync } from 'node:fs'
import type { AuditEntryDto } from '@spark/protocol'
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

async function makeAuditServer(): Promise<ServerFixture> {
  const f = await makeServer()
  fixtures.push(f)
  dirs.push(f.root)
  return f
}

describe('GET /api/audit（工单 7.12）', () => {
  test('空明细 → []；规则管理后列出（新→旧，含 op/source）', async () => {
    const f = await makeAuditServer()
    let res = await f.app.inject({ method: 'GET', url: '/api/audit' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])

    f.engine.addPermissionRule({ action: 'fs.read', resource: '**', effect: 'allow' })
    f.engine.removePermissionRule('fs.read', '**')
    res = await f.app.inject({ method: 'GET', url: '/api/audit' })
    const rows = res.json<AuditEntryDto[]>()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => `${r.kind}:${r.op}`)).toEqual([
      'permission.rule:remove',
      'permission.rule:add',
    ])
    expect(rows.every((r) => r.source === 'settings-ui' && r.actor === 'user')).toBe(true)
  })

  test('过滤：kind / result / tool / limit', async () => {
    const f = await makeAuditServer()
    f.engine.addPermissionRule({ action: 'fs.read', resource: '**', effect: 'allow' })
    f.engine.addPermissionRule({ action: 'shell.exec', resource: 'cmd:npm test', effect: 'allow' })

    let res = await f.app.inject({ method: 'GET', url: '/api/audit?kind=permission.rule&result=applied' })
    expect(res.json<AuditEntryDto[]>()).toHaveLength(2)

    res = await f.app.inject({ method: 'GET', url: '/api/audit?kind=permission.decision' })
    expect(res.json<AuditEntryDto[]>()).toEqual([])

    res = await f.app.inject({ method: 'GET', url: '/api/audit?limit=1' })
    const one = res.json<AuditEntryDto[]>()
    expect(one).toHaveLength(1)
    expect(one[0]?.resource).toBe('cmd:npm test') // 新→旧：最后写入的在前
  })

  test('坏查询 → 400（limit 越界 / 坏枚举 / since 非数）', async () => {
    const f = await makeAuditServer()
    for (const qs of ['limit=0', 'limit=501', 'kind=nope', 'result=nope', 'since=abc']) {
      const res = await f.app.inject({ method: 'GET', url: `/api/audit?${qs}` })
      expect(res.statusCode, qs).toBe(400)
      expect(res.json<ErrBody>().code, qs).toBe('E_VALIDATION')
    }
  })
})
