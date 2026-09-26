/**
 * LSP server 安装器（阶段十九工单 19.5，翻案 16.9"无下载器"判决 / ADR D47）：
 * 从内置清单（protocol lsp-servers.ts 单一来源）查 id → 已装探测 → `npm install -g`
 * （用户机运行时行为，npm registry 自带完整性校验）→ 装后命令可用性校验 → 写入
 * ~/.spark/lsp.json。全链 fail-closed：未知 id / npm 缺失 / 安装失败 / 校验失败
 * 各有专属错误码，配置只在全链通过后才写。
 * 可注入缝（单测免真实网络）：runNpm 替换安装步、probe 替换命令探测步。
 */
import { spawn } from 'node:child_process'
import { findKnownLspServer, type KnownLspServer } from '@spark/protocol'
import { loadLspConfig, writeLspConfig, type LspServerEntry } from './config.js'

/** npm 全局安装墙钟上限（冷装含依赖拉取，给足） */
const NPM_TIMEOUT_MS = 600_000
/** 命令可用性探测上限（--version 级别） */
const PROBE_TIMEOUT_MS = 15_000

export interface LspInstallerDeps {
  /** 数据根（~/.spark；lsp.json 写入目标） */
  root: string
  /** 测试注入：安装步替换（缺省真实 `npm install -g <pkgs>`） */
  runNpm?: (packages: readonly string[], onProgress: (t: string) => void) => Promise<void>
  /** 测试注入：命令可用性探测替换（缺省 spawn `<command> --version`） */
  probe?: (command: string, args: readonly string[]) => Promise<boolean>
}

export type LspInstallOutcome =
  | { ok: true; language: string; command: string; args: string[]; written: boolean }
  | { ok: false; code: string; message: string }

/** npm 可执行名（Windows PATH 解析 .cmd 需显式后缀；spawn 不走 shell 零注入面） */
function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

export class LspInstaller {
  constructor(private readonly deps: LspInstallerDeps) {}

  /** 探测命令是否可用（缺省 `<command> --version` 退出 0 = 可用） */
  private probeCommand(command: string, args: readonly string[]): Promise<boolean> {
    if (this.deps.probe !== undefined) return this.deps.probe(command, args)
    return new Promise((resolve) => {
      const child = spawn(command, ['--version'], { stdio: 'ignore' })
      const timer = setTimeout(() => {
        child.kill()
        resolve(false)
      }, PROBE_TIMEOUT_MS)
      child.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve(code === 0)
      })
    })
  }

  /** 真实安装步：`npm install -g <pkgs>`，输出流式透传；超时/失败 fail-closed */
  private npmInstall(packages: readonly string[], onProgress: (t: string) => void): Promise<void> {
    if (this.deps.runNpm !== undefined) return this.deps.runNpm(packages, onProgress)
    return new Promise((resolve, reject) => {
      const child = spawn(npmCommand(), ['install', '-g', ...packages], {
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderr = ''
      let settled = false
      const timer = setTimeout(() => {
        child.kill()
        if (!settled) {
          settled = true
          reject(new Error('E_LSP_INSTALL_TIMEOUT: npm 安装超时（600s）——检查网络后重试'))
        }
      }, NPM_TIMEOUT_MS)
      child.stdout?.on('data', (b: Buffer) => {
        const t = b.toString('utf8')
        if (t.trim() !== '') onProgress(t.trimEnd())
      })
      child.stderr?.on('data', (b: Buffer) => {
        stderr += b.toString('utf8')
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          reject(new Error('E_LSP_INSTALL_NPM_MISSING: 未找到 npm——安装语言服务器需要 Node.js npm 在 PATH 中'))
          return
        }
        reject(new Error(`E_LSP_INSTALL: npm 启动失败——${err.message}`))
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        if (code === 0) {
          resolve()
          return
        }
        const detail = stderr.trim().split('\n').filter((l) => l !== '').pop() ?? `exit ${String(code)}`
        reject(new Error(`E_LSP_INSTALL: npm 安装失败——${detail}`))
      })
    })
  }

  /**
   * 安装清单 id 对应的语言服务器并写入 lsp.json：
   * 已装（命令可用）→ 跳过 npm 直写配置；装后校验失败 → E_LSP_INSTALL_VERIFY。
   * 幂等：lsp.json 已有同语言且同形状条目 → written:false 不重写。
   */
  async install(id: string, onProgress: (t: string) => void = () => {}): Promise<LspInstallOutcome> {
    const known: KnownLspServer | undefined = findKnownLspServer(id)
    if (known === undefined) {
      return {
        ok: false,
        code: 'E_LSP_UNKNOWN_SERVER',
        message: `未知语言服务器 id：${id}（可用：见 web 设置页语言服务器页清单）`,
      }
    }
    const args: string[] = [...known.args]
    const entry: LspServerEntry = { command: known.command, args }

    // 已装探测：命令可用即跳过 npm（重复安装幂等入口的快路径）
    const available = await this.probeCommand(known.command, ['--version'])
    if (!available) {
      try {
        await this.npmInstall(known.npmPackages, onProgress)
      } catch (err) {
        return { ok: false, code: (err as Error).message.split(':')[0] ?? 'E_LSP_INSTALL', message: (err as Error).message }
      }
      // 装后校验：命令仍不可用 = 安装结果与清单不符（fail-closed 不写配置）
      const verified = await this.probeCommand(known.command, ['--version'])
      if (!verified) {
        return {
          ok: false,
          code: 'E_LSP_INSTALL_VERIFY',
          message: `npm 安装完成但 ${known.command} 不可用——检查安装日志（可能平台不支持或 PATH 未刷新）`,
        }
      }
    }

    // 写 lsp.json（已有同形状条目 → 幂等跳过）
    const existing = loadLspConfig(this.deps.root)
    const languages: Record<string, LspServerEntry> = existing?.languages ?? {}
    const prev = languages[known.language]
    if (prev !== undefined && prev.command === entry.command) {
      const sameArgs =
        (prev.args ?? []).length === args.length &&
        (prev.args ?? []).every((a, i) => a === args[i])
      if (sameArgs) {
        return { ok: true, language: known.language, command: entry.command, args, written: false }
      }
    }
    languages[known.language] = entry
    writeLspConfig(this.deps.root, { languages })
    return { ok: true, language: known.language, command: entry.command, args, written: true }
  }
}
