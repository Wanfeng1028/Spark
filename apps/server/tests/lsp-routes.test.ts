/**
 * LSP 安装路由测试（阶段十九 19.5 / ADR D47）：POST /api/lsp/install——
 * 未知 id → 404（E_LSP_UNKNOWN_SERVER）；成功 → 200 DTO（假安装器注入，免真实 npm）；
 * 失败 → 502（E_LSP_INSTALL*）。缺省 id 缺失 → 400。
 */
import { describe, expect, test } from 'vitest'
import type { LspInstaller } from '@spark/engine'
import { makeServer } from './helpers'

function fakeInstaller(outcome: { ok: true; language: string; command: string; args: string[]; written: boolean } | { ok: false; code: string; message: string }): LspInstaller {
  // 测试假体：LspInstaller 形状的 install-only 实现（免真实 npm；纪律：无 async/await）
  const fake = {
    install: (id: string) => {
      void id
      return outcome.ok
        ? Promise.resolve({ ok: true as const, language: outcome.language, command: outcome.command, args: outcome.args, written: outcome.written })
        : Promise.resolve({ ok: false as const, code: outcome.code, message: outcome.message })
    },
  }
  return fake as unknown as LspInstaller
}

describe('POST /api/lsp/install（阶段十九 19.5 / ADR D47）', () => {
  test('成功：200 回安装结果 DTO（written 透传）', async () => {
    const server = await makeServer({
      lspInstaller: fakeInstaller({ ok: true, language: 'typescript', command: 'typescript-language-server', args: ['--stdio'], written: true }),
    })
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/lsp/install',
      payload: { id: 'typescript' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      language: 'typescript',
      command: 'typescript-language-server',
      args: ['--stdio'],
      written: true,
    })
  })

  test('未知 id → 404 E_LSP_UNKNOWN_SERVER', async () => {
    const server = await makeServer({
      lspInstaller: fakeInstaller({ ok: false, code: 'E_LSP_UNKNOWN_SERVER', message: '未知语言服务器 id：xyz' }),
    })
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/lsp/install',
      payload: { id: 'xyz' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('E_LSP_UNKNOWN_SERVER')
  })

  test('安装失败 → 502 E_LSP_INSTALL*', async () => {
    const server = await makeServer({
      lspInstaller: fakeInstaller({ ok: false, code: 'E_LSP_INSTALL', message: 'E_LSP_INSTALL: npm 安装失败' }),
    })
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/lsp/install',
      payload: { id: 'python' },
    })
    expect(res.statusCode).toBe(502)
    expect(res.json().code).toBe('E_LSP_INSTALL')
  })

  test('缺 id → 400', async () => {
    const server = await makeServer({
      lspInstaller: fakeInstaller({ ok: true, language: 'x', command: 'x', args: [], written: true }),
    })
    const res = await server.app.inject({ method: 'POST', url: '/api/lsp/install', payload: {} })
    expect(res.statusCode).toBe(400)
  })
})
