/**
 * bash 沙箱网络隔离联动单测（阶段十九 19.7 / ADR D50）：
 * ① allowlist 档且代理未就绪 → E_SANDBOX_NETWORK_UNAVAILABLE fail-closed 拒跑（不降级直连）；
 * ② 就绪 → 独立 shell 走 spawn env（HTTP_PROXY/HTTPS_PROXY/ALL_PROXY socks5h/NO_PROXY）；
 *    常驻 shell 走逐命令 export 前缀（不依赖 shell 创建时环境——模式热切换后仍 fail-closed 语义）；
 * ③ off 档 → 零注入（缺省行为不变，旧用例不回归）。
 * POSIX 断言（printenv）——Windows powershell 回落为平台边界，skipIf 条件化。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { ToolContext } from '../src/tools/definition.js'
import { makeBashTool } from '../src/tools/builtin/bash.js'
import { sandboxProxyEnv, sandboxProxyExportLine } from '../src/sandbox/network-env.js'

const posix = process.platform !== 'win32'

function makeCtx(cwd: string): ToolContext {
  return {
    sessionId: ids.session('ses_sandboxnet'),
    turnId: ids.turn('trn_sandboxnet'),
    callId: ids.call('cal_sandboxnet'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd,
  }
}

async function run(
  tool: ReturnType<typeof makeBashTool>,
  ctx: ToolContext,
  command: string,
): Promise<{ isError: boolean; text: string; message: string; code?: string | undefined }> {
  const r = await tool.execute(ctx, { command })
  if (typeof r.output === 'string') return { isError: r.isError, text: r.output, message: '' }
  const o = r.output as Record<string, unknown>
  return {
    isError: r.isError,
    text: typeof o.output === 'string' ? o.output : '',
    message: typeof o.message === 'string' ? o.message : '',
    code: typeof o.code === 'string' ? o.code : undefined,
  }
}

describe('sandboxProxyEnv / sandboxProxyExportLine（出口引导纯函数）', () => {
  test('env 四件套 + socks5h + NO_PROXY 回环放行', () => {
    const env = sandboxProxyEnv(1080)
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:1080')
    expect(env.HTTPS_PROXY).toBe('http://127.0.0.1:1080')
    // socks5h（带 h）= 主机名交代理解析——域名清单才能按域名判定
    expect(env.ALL_PROXY).toBe('socks5h://127.0.0.1:1080')
    expect(env.NO_PROXY).toContain('127.0.0.1')
    expect(env.http_proxy).toBe(env.HTTP_PROXY)
    expect(env.all_proxy).toBe(env.ALL_PROXY)
  })

  test('export 行可被 shell 求值（单引号安全编码）', () => {
    const line = sandboxProxyExportLine(1080)
    expect(line.startsWith('export ')).toBe(true)
    expect(line).toContain('HTTP_PROXY=')
    expect(line).not.toContain('"')
  })
})

describe('bash 网络隔离联动（阶段十九 19.7 / ADR D50）', () => {
  test('allowlist 档且代理未就绪 → E_SANDBOX_NETWORK_UNAVAILABLE（fail-closed，不降级直连）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-sbxnet-'))
    const tool = makeBashTool({
      sandbox: 'off',
      networkIsolation: () => ({ enabled: true, port: 1080, ready: false }),
    })
    const r = await run(tool, makeCtx(root), 'echo hi')
    expect(r.isError).toBe(true)
    expect(r.code).toBe('E_SANDBOX_NETWORK_UNAVAILABLE')
    expect(r.message).toContain('fail-closed')
  })

  test.skipIf(!posix)('off 档：零注入（缺省行为不变）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-sbxnet-'))
    const tool = makeBashTool({ sandbox: 'off' })
    const r = await run(tool, makeCtx(root), 'printenv HTTP_PROXY; printenv ALL_PROXY; echo done')
    expect(r.isError).toBe(false)
    expect(r.text).toContain('done')
    expect(r.text).not.toContain('socks5h')
  })

  test.skipIf(!posix)('allowlist 档就绪：独立 shell 注入代理四件套', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-sbxnet-'))
    const tool = makeBashTool({
      sandbox: 'off',
      networkIsolation: () => ({ enabled: true, port: 11080, ready: true }),
    })
    const r = await run(
      tool,
      makeCtx(root),
      'printenv HTTP_PROXY; printenv ALL_PROXY; printenv NO_PROXY; echo end',
    )
    expect(r.isError).toBe(false)
    expect(r.text).toContain('http://127.0.0.1:11080')
    expect(r.text).toContain('socks5h://127.0.0.1:11080')
    expect(r.text).toContain('localhost')
    expect(r.text).toContain('end')
  })

  test.skipIf(!posix)('allowlist 档就绪：常驻 shell 逐命令 export 前缀（热切换后仍生效）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-sbxnet-'))
    const tool = makeBashTool({
      sandbox: 'off',
      persistent: () => true,
      networkIsolation: () => ({ enabled: true, port: 11081, ready: true }),
    })
    const ctx = makeCtx(root)
    // 首调用即带 export 前缀（shell 创建时并无代理环境——逐命令前缀是 fail-closed 的前提）
    const r = await run(tool, ctx, 'printenv HTTPS_PROXY; echo end')
    expect(r.isError).toBe(false)
    expect(r.text).toContain('http://127.0.0.1:11081')
    expect(r.text).toContain('end')
  })
})
