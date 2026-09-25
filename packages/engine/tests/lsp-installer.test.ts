/**
 * LSP 安装器单测（阶段十九 19.5 / ADR D47）：
 * 未知 id / 已装探测幂等跳过 / 安装成功写配置 / npm 失败不落盘 / 装后校验失败 /
 * 同形状幂等 written:false。runNpm/probe 全注入（免真实网络）。**真实环境快路径**
 * 见文末 skipIf 用例（LA-07 兑现：曾有头注声称 SPARK_TEST_REAL_LSP 通道而用例不存在
 * ——幽灵通道已删，改为运行时探测：CI 装有 typescript-language-server 即真跑，
 * 本地无则 skip 绿，AGENTS §2.3a 零下载总则）。
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { KNOWN_LSP_SERVERS } from '@spark/protocol'
import { LspInstaller } from '../src/lsp/installer.js'
import { loadLspConfig } from '../src/lsp/config.js'

async function makeInstaller(overrides: {
  probe?: (command: string, args: readonly string[]) => Promise<boolean>
  runNpm?: (packages: readonly string[], onProgress: (t: string) => void) => Promise<void>
}): Promise<{ installer: LspInstaller; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'spark-lspin-'))
  const installer = new LspInstaller({ root, ...overrides })
  return { installer, root }
}

describe('LspInstaller（阶段十九 19.5 / ADR D47）', () => {
  test('未知 id → E_LSP_UNKNOWN_SERVER，不写配置', async () => {
    const { installer, root } = await makeInstaller({ probe: () => Promise.resolve(true) })
    const r = await installer.install('no-such-lang')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('E_LSP_UNKNOWN_SERVER')
    expect(loadLspConfig(root)).toBeNull()
  })

  test('已装探测成功 → 跳过 npm 直写配置（幂等入口快路径）', async () => {
    let npmCalls = 0
    const { installer, root } = await makeInstaller({
      probe: () => Promise.resolve(true),
      runNpm: () => {
        npmCalls += 1
        return Promise.resolve()
      },
    })
    const r = await installer.install('typescript')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.written).toBe(true)
      expect(r.command).toBe('typescript-language-server')
    }
    expect(npmCalls).toBe(0)
    expect(loadLspConfig(root)?.languages['typescript']).toEqual({
      command: 'typescript-language-server',
      args: ['--stdio'],
    })
  })

  test('未装 → npm 成功 → 装后校验通过 → 写配置', async () => {
    // probe 翻转：装前不可用（触发 npm），npm 回调置位后装后校验通过
    let installed = false
    const { installer, root } = await makeInstaller({
      probe: () => Promise.resolve(installed),
      runNpm: (packages) => {
        installed = true
        expect(packages.length).toBeGreaterThan(0)
        return Promise.resolve()
      },
    })
    const r = await installer.install('python')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.written).toBe(true)
    expect(loadLspConfig(root)?.languages['python']).toEqual({
      command: 'pyright-langserver',
      args: ['--stdio'],
    })
  })

  test('npm 失败 → E_LSP_INSTALL 前缀且不落盘', async () => {
    const { installer, root } = await makeInstaller({
      probe: () => Promise.resolve(false),
      runNpm: () =>
        Promise.reject(new Error('E_LSP_INSTALL: npm 安装失败——registry 不可达')),
    })
    const r = await installer.install('bash')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('E_LSP_INSTALL')
    expect(loadLspConfig(root)).toBeNull()
  })

  test('装后校验失败 → E_LSP_INSTALL_VERIFY 不写配置', async () => {
    const { installer, root } = await makeInstaller({
      probe: () => Promise.resolve(false),
      runNpm: () => Promise.resolve(),
    })
    const r = await installer.install('yaml')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('E_LSP_INSTALL_VERIFY')
    expect(loadLspConfig(root)).toBeNull()
  })

  test('同形状条目已存在 → written:false 幂等不重写', async () => {
    const { installer } = await makeInstaller({ probe: () => Promise.resolve(true) })
    const r1 = await installer.install('typescript')
    expect(r1.ok && r1.written).toBe(true)
    const r2 = await installer.install('typescript')
    expect(r2.ok && r2.written).toBe(false)
  })

  test('清单形状封闭集：id 唯一 / 语言键唯一 / npm 包带版本 pin', () => {
    const ids = KNOWN_LSP_SERVERS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const langs = KNOWN_LSP_SERVERS.map((s) => s.language)
    expect(new Set(langs).size).toBe(langs.length)
    for (const s of KNOWN_LSP_SERVERS) {
      expect(s.npmPackages.length).toBeGreaterThan(0)
      for (const p of s.npmPackages) {
        // 版本 pin：pkg@^major（.minor.patch 可省）
        expect(p).toMatch(/@[\^~]?\d+(\.\d+)*$/)
      }
      expect(s.command).not.toBe('')
    }
  })
})

describe('真实安装器快路径冒烟（CI 装工具后自动启用；本地无则 skip——AGENTS §2.3a）', () => {
  const hasTsls = (() => {
    try {
      execFileSync('typescript-language-server', ['--version'], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  })()

  test.skipIf(!hasTsls)('真实已装环境：探测命中 → 跳过 npm → lsp.json 形状', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-lspreal-'))
    // 不注入 probe/runNpm——真实探测真实命令、真实写盘（lsp.test.ts 真跑判例同法）
    const installer = new LspInstaller({ root })
    const r = await installer.install('typescript')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.written).toBe(true)
      expect(r.command).toBe('typescript-language-server')
      expect(r.args).toEqual(['--stdio'])
    }
    expect(loadLspConfig(root)?.languages['typescript']).toEqual({
      command: 'typescript-language-server',
      args: ['--stdio'],
    })
  })
})
