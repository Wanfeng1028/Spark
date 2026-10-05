/**
 * 项目层 hooks 信任路由测试（CK-2 批 2 ⑤）：GET/POST /api/hooks/project-trust——
 * 无声明 hasHooks=false 且 POST applied=false（无可信任对象不是错误，禁假 404）；
 * 有声明 ask → trusted → 撤销全链；坏 body 400（parseOr400）。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { makeServer } from './helpers.js'

const HOOKS_DECL = JSON.stringify({
  version: 1,
  hooks: { 'session.start': [{ command: 'echo hi' }] },
})

describe('GET/POST /api/hooks/project-trust（CK-2 批 2 ⑤）', () => {
  test('无声明：hasHooks=false 恒 untrusted，POST applied=false 不是错误', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spark-trust-'))
    const server = await makeServer({ cwd })
    const res = await server.app.inject({ method: 'GET', url: '/api/hooks/project-trust' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ hasHooks: false, decision: 'untrusted', mode: 'claude' })

    const post = await server.app.inject({
      method: 'POST',
      url: '/api/hooks/project-trust',
      payload: { trust: 'trusted' },
    })
    expect(post.statusCode).toBe(200)
    expect(post.json<{ applied: boolean }>().applied).toBe(false)
  })

  test('有声明全链：ask → trusted → 撤销 untrusted；写入后判定即时生效', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spark-trust-'))
    mkdirSync(join(cwd, '.spark'), { recursive: true })
    writeFileSync(join(cwd, '.spark', 'hooks.json'), HOOKS_DECL)
    const server = await makeServer({ cwd })

    const ask = await server.app.inject({ method: 'GET', url: '/api/hooks/project-trust' })
    expect(ask.json()).toMatchObject({ hasHooks: true, decision: 'ask' })

    const trust = await server.app.inject({
      method: 'POST',
      url: '/api/hooks/project-trust',
      payload: { trust: 'trusted' },
    })
    expect(trust.json<{ applied: boolean }>().applied).toBe(true)
    const trusted = await server.app.inject({ method: 'GET', url: '/api/hooks/project-trust' })
    expect(trusted.json<{ decision: string }>().decision).toBe('trusted')

    const revoke = await server.app.inject({
      method: 'POST',
      url: '/api/hooks/project-trust',
      payload: { trust: 'untrusted' },
    })
    expect(revoke.json<{ applied: boolean }>().applied).toBe(true)
    const untrusted = await server.app.inject({ method: 'GET', url: '/api/hooks/project-trust' })
    expect(untrusted.json<{ decision: string }>().decision).toBe('untrusted')
  })

  test('坏 body：非法 trust 值 400', async () => {
    const server = await makeServer()
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/hooks/project-trust',
      payload: { trust: 'whatever' },
    })
    expect(res.statusCode).toBe(400)
  })

  test('策略档切换：PUT settings hooks.projectTrust.mode 后 GET 即回新档（settings rebuild 热生效）', async () => {
    const server = await makeServer()
    const put = await server.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { hooks: { projectTrust: { mode: 'gemini' } } },
    })
    expect(put.statusCode).toBe(200)
    const res = await server.app.inject({ method: 'GET', url: '/api/hooks/project-trust' })
    expect(res.json<{ mode: string }>().mode).toBe('gemini')
  })
})
