/**
 * 装/换可执行代码的确认门路由测试（doc/11 LA-05）：POST /api/lsp/install 与
 * PUT /api/mcp 在非环回来源（remoteAddress 注入，配对鉴权同法）要求 confirm:true，
 * 403 message 回显将执行的完整命令；环回缺省行为不变（本仓红线）。
 */
import { describe, expect, test } from 'vitest'
import { makeServer } from './helpers.js'

const REMOTE = { remoteAddress: '192.168.1.50' }

describe('POST /api/lsp/install 确认门（LA-05）', () => {
  test('非环回 + 无 confirm → 403 E_CONFIRM_REQUIRED，回显完整 npm 命令与 lsp.json 写入内容', async () => {
    const server = await makeServer()
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/lsp/install',
      payload: { id: 'typescript' },
      ...REMOTE,
    })
    expect(res.statusCode).toBe(403)
    const body = res.json<{ code: string; message: string }>()
    expect(body.code).toBe('E_CONFIRM_REQUIRED')
    expect(body.message).toContain('npm install -g')
    expect(body.message).toContain('confirm:true')
  })

  test('非环回 + confirm:true → 过门进入安装器（未知 id 由安装器报 404，证明门已放行）', async () => {
    const server = await makeServer()
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/lsp/install',
      payload: { id: 'no-such-lsp', confirm: true },
      ...REMOTE,
    })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('E_LSP_UNKNOWN_SERVER')
  })

  test('环回缺省不带 confirm → 行为不变（未知 id 直达安装器 404）', async () => {
    const server = await makeServer()
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/lsp/install',
      payload: { id: 'no-such-lsp' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('E_LSP_UNKNOWN_SERVER')
  })
})

describe('PUT /api/mcp 确认门（LA-05）', () => {
  test('非环回 + 无 confirm → 403，回显将写入的 stdio 命令清单', async () => {
    const server = await makeServer()
    const res = await server.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: { version: 1, servers: { demo: { command: 'npx', args: ['-y', 'demo-mcp'] } } },
      ...REMOTE,
    })
    expect(res.statusCode).toBe(403)
    const body = res.json<{ code: string; message: string }>()
    expect(body.code).toBe('E_CONFIRM_REQUIRED')
    expect(body.message).toContain('demo = npx -y demo-mcp')
  })

  test('非环回 + confirm:true → 正常写入（200 + restartRequired）', async () => {
    const server = await makeServer()
    const res = await server.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: { version: 1, confirm: true, servers: { demo: { command: 'echo', args: ['hi'] } } },
      ...REMOTE,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ ok: boolean; restartRequired: boolean }>().restartRequired).toBe(true)
  })

  test('环回缺省不带 confirm → 行为不变（红线：200 写入）', async () => {
    const server = await makeServer()
    const res = await server.app.inject({
      method: 'PUT',
      url: '/api/mcp',
      payload: { version: 1, servers: { demo: { command: 'echo', args: ['hi'] } } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ ok: boolean }>().ok).toBe(true)
  })
})
