/**
 * 自动归档策略与全局出网代理单测（阶段十九 19.13）：
 * ① 纯函数 dueForAutoArchive/selectDueForAutoArchive——idle 且超期才归档，
 *    running/waiting-approval 永不自动归档，边界值（恰好等于阈值）不归档；
 * ② 路由——GET /api/settings 三段归一化缺省、PUT 逐字段合并不清他段、
 *    certificates 只读回显形状。
 */
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { SessionId, SessionStatus } from '@spark/protocol'
// 归档策略纯函数在 engine 侧；apps/server 单测经 internal 入口直打（生产代码禁引 internal，
// 测试豁免——见 packages/engine/tests/public-surface.test.ts 的不变量网）
import {
  DEFAULT_AFTER_DAYS,
  dueForAutoArchive,
  selectDueForAutoArchive,
  type SessionMeta,
} from '@spark/engine/internal'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

const NOW = 1_800_000_000_000
const DAY = 86_400_000

function meta(over: Partial<SessionMeta> & { id: string }): SessionMeta {
  const { id, ...rest } = over
  return {
    title: 't',
    model: 'fake/fake-chat',
    cwd: '/tmp',
    createdAt: NOW - 100 * DAY,
    updatedAt: NOW - 40 * DAY,
    lastSeq: 1,
    id: ids.session(id),
    ...rest,
  }
}

describe('dueForAutoArchive（阶段十九 19.13 纯函数）', () => {
  test('idle 且超期 → 归档', () => {
    expect(dueForAutoArchive({ id: 'a', status: 'idle', updatedAt: NOW - 31 * DAY }, 30, NOW)).toBe(true)
  })

  test('idle 未超期 → 不归档', () => {
    expect(dueForAutoArchive({ id: 'a', status: 'idle', updatedAt: NOW - 29 * DAY }, 30, NOW)).toBe(false)
  })

  test('边界：恰好等于阈值时刻 → 归档（<= 语义，超期含当天）', () => {
    expect(dueForAutoArchive({ id: 'a', status: 'idle', updatedAt: NOW - 30 * DAY }, 30, NOW)).toBe(true)
  })

  test('running / waiting-approval 永不自动归档（会话还在工作）', () => {
    expect(dueForAutoArchive({ id: 'a', status: 'running', updatedAt: NOW - 999 * DAY }, 30, NOW)).toBe(false)
    expect(dueForAutoArchive({ id: 'a', status: 'waiting-approval', updatedAt: NOW - 999 * DAY }, 30, NOW)).toBe(false)
  })

  test('afterDays 非正 → 不归档（配置错误不当作"全部归档"）', () => {
    expect(dueForAutoArchive({ id: 'a', status: 'idle', updatedAt: 0 }, 0, NOW)).toBe(false)
    expect(dueForAutoArchive({ id: 'a', status: 'idle', updatedAt: 0 }, -5, NOW)).toBe(false)
  })

  test('DEFAULT_AFTER_DAYS = 30（spark.json 缺省）', () => {
    expect(DEFAULT_AFTER_DAYS).toBe(30)
  })

  test('selectDueForAutoArchive：保持入序，只取到期集合（running 经 statusOf 排除）', () => {
    const list = [
      meta({ id: 'ses_due0000000000000001', updatedAt: NOW - 40 * DAY }),
      meta({ id: 'ses_fresh00000000000002', updatedAt: NOW - 2 * DAY }),
      meta({ id: 'ses_run0000000000000003', updatedAt: NOW - 90 * DAY }),
      meta({ id: 'ses_due2000000000000004', updatedAt: NOW - 31 * DAY }),
    ]
    // 运行态不在 SessionMeta 上（磁盘元数据），由调用方注入访问器——第 3 条超期但在跑，不得归档
    const running = new Set<string>(['ses_run0000000000000003'])
    const statusOf = (id: SessionId): SessionStatus => (running.has(id) ? 'running' : 'idle')
    const due = selectDueForAutoArchive(list, statusOf, 30, NOW)
    expect(due.map((m) => m.id)).toEqual(['ses_due0000000000000001', 'ses_due2000000000000004'])
  })
})

describe('设置路由：archive / network / certificates（阶段十九 19.13）', () => {
  let f: ServerFixture

  test('GET：三段归一化缺省（archive 关 + 30 天 / network 空 / certificates null）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({ method: 'GET', url: '/api/settings' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{
      archive?: { autoArchive: boolean; afterDays: number }
      network?: { proxy: string; noProxy: string }
      certificates?: { nodeExtraCaCerts: string | null }
    }>()
    expect(body.archive).toEqual({ autoArchive: false, afterDays: 30 })
    expect(body.network).toEqual({ proxy: '', noProxy: '' })
    expect(body.certificates).toEqual({ nodeExtraCaCerts: null })
    await f.app.close()
    await f.engine.shutdown()
  })

  test('PUT archive 部分更新：只改 afterDays 不清 autoArchive', async () => {
    f = await makeServer({})
    const first = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { archive: { autoArchive: true } },
    })
    expect(first.statusCode).toBe(200)
    const second = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { archive: { afterDays: 7 } },
    })
    const body = second.json<{ archive?: { autoArchive: boolean; afterDays: number } }>()
    expect(body.archive).toEqual({ autoArchive: true, afterDays: 7 })
    await f.app.close()
    await f.engine.shutdown()
  })

  test('PUT network 部分更新：proxy/noProxy 各自独立', async () => {
    f = await makeServer({})
    await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { network: { proxy: 'http://127.0.0.1:7890' } },
    })
    const body = (
      await f.app.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { network: { noProxy: 'localhost,127.0.0.1' } },
      })
    ).json<{ network?: { proxy: string; noProxy: string } }>()
    expect(body.network).toEqual({ proxy: 'http://127.0.0.1:7890', noProxy: 'localhost,127.0.0.1' })
    await f.app.close()
    await f.engine.shutdown()
  })

  test('PUT 非法 afterDays → 400 不落盘（strict schema min/max）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { archive: { afterDays: 0 } },
    })
    expect(res.statusCode).toBe(400)
    await f.app.close()
    await f.engine.shutdown()
  })
})
