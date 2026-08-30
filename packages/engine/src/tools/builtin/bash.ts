/**
 * bash 工具（doc/02 §5.6.3）：每次独立 shell（v1 不做常驻）；stdout+stderr 合流
 * progress 流式（16KB/帧截断）；退出码非 0 → isError 但 output 保留；
 * 超时 SIGTERM → 宽限期 → SIGKILL（Unix 进程组树杀 5s 宽限 / Windows taskkill /T /F
 * 两次都强杀、1s 宽限——树杀与派生竞态时补杀兼做孤儿清理）。
 * ctx.signal abort 同样树杀并报 E_ABORTED（跑到静默 + 自身响应 abort）。
 * shell 解析：Windows 优先 PATH 中的真实 bash.exe（where bash 列候选，逐个以
 * `-c "exit 0"` 探测可用性并缓存；System32/WindowsApps 的 WSL 别名 stub 无发行版时
 * 跑任何命令都非零退出，一律跳过），缺失则 powershell -NoProfile -Command；
 * Unix 一律 /bin/bash -c。
 * 沙箱（阶段五工单 5.2，ADR D15）：sandbox 'on' 时命令包平台 wrapper 前缀
 * （Linux bwrap / macOS Seatbelt；Windows 无 OS 级路线），wrapper 不可用即
 * E_SANDBOX_UNAVAILABLE 拒跑（fail-closed 不降级）。
 */
import { execFileSync, execSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { realpathSync } from 'node:fs'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'
import { resolveSandboxWrapper, wrapperAvailable } from '../sandbox.js'
import type { BashSandboxMode } from '../sandbox.js'

const PROGRESS_CHUNK_BYTES = 16 * 1024
// Windows 两次 taskkill 均为 /F 强杀，无需 Unix 的 5s SIGTERM 宽限；短宽限兼做
// 树杀与派生竞态时的孤儿补杀（首杀早于子进程派生 → 孤儿握管道，补杀收尾）
const KILL_GRACE_MS = process.platform === 'win32' ? 1000 : 5000

const BashInput = z.strictObject({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().max(120000).optional(),
  cwd: z.string().optional(),
})

type BashInput = z.infer<typeof BashInput>

/** Windows bash 探测结果缓存（进程生命周期内不变：装/卸 bash 都需重启进程） */
let cachedWinShell: { file: string; args: string[] } | null = null

function resolveShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    if (cachedWinShell !== null) return cachedWinShell
    try {
      const out = execSync('where bash', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
      for (const line of out.split(/\r?\n/)) {
        const candidate = line.trim()
        if (candidate === '') continue
        // System32\bash.exe 与 WindowsApps 别名是 WSL stub：无发行版时任何命令都失败，
        // 有发行版时文件系统语义也非本地上下文——不作为本地 shell 候选，直接跳过。
        if (/\b(system32|windowsapps)\\bash\.exe$/i.test(candidate)) continue
        // 探测真实可用性（能跑 `-c "exit 0"` 才算数）
        try {
          execFileSync(candidate, ['-c', 'exit 0'], { stdio: 'ignore', timeout: 2000 })
          cachedWinShell = { file: candidate, args: ['-c'] }
          return cachedWinShell
        } catch {
          // 该候选不可用：试下一个（或最终回落 powershell）
        }
      }
    } catch {
      // where 失败：回落 powershell
    }
    cachedWinShell = { file: 'powershell', args: ['-NoProfile', '-Command'] }
    return cachedWinShell
  }
  return { file: '/bin/bash', args: ['-c'] }
}

/**
 * 复合命令分段（§5.7 补强 1，工单 4.7）：按 && || ; | 切分并 trim，<2 段返回 undefined
 * （单段走单一 resource 审批路径）。v1 纯文本切分不解析引号——审批展示/固化用，
 * 误分段只会让审批更细不会更粗（fail-closed 方向）。
 */
export function splitCommandPatterns(command: string): string[] | undefined {
  const segments = command
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  return segments.length >= 2 ? segments.map((s) => `cmd:${s.slice(0, 80)}`) : undefined
}

/** 树杀：Unix 杀进程组（detached 使 child 即组长）；Windows taskkill /T /F */
function treeKill(pid: number | undefined, sig: 'SIGTERM' | 'SIGKILL'): void {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, sig)
  } catch {
    try {
      process.kill(pid, sig)
    } catch {
      // 进程已退出：无事可做
    }
  }
}

export interface BashToolOptions {
  /** 沙箱开关（spark.json engine.bashSandbox，ADR D15）：off = 现行为（审批 + 路径硬边界） */
  sandbox: BashSandboxMode
  /** 测试注入：wrapper 可用性探测替换（缺省真实探测 command -v） */
  isWrapperAvailable?: (file: string) => boolean
}

/** 默认实例（沙箱关）：旧行为不变；引擎按配置用 makeBashTool 构造 */
export const bashTool: ToolDefinition<BashInput> = makeBashTool({ sandbox: 'off' })

export function makeBashTool(opts: BashToolOptions): ToolDefinition<BashInput> {
  const probe =
    opts.isWrapperAvailable ?? ((file: string) => wrapperAvailable(process.platform, file))
  return {
    name: 'bash',
    description:
      '在独立 shell 中执行命令（每次新 shell，无常驻状态）。stdout/stderr 合流流式输出；' +
      '退出码非 0 时标记错误但保留输出。timeoutMs 上限 120000（默认同上限）。' +
      '危险命令（rm/网络写入等）会经过审批。',
    inputSchema: BashInput,
    permission: {
      action: 'shell.exec',
      resourceOf: (input) => `cmd:${input.command.slice(0, 80)}`,
      // 复合命令多 pattern：逐段评估与展示；always 固化同样按段（§5.7 补强 1/3）
      patternsOf: (input) => splitCommandPatterns(input.command),
      alwaysPatternsOf: (input) => splitCommandPatterns(input.command),
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: BashInput): Promise<ToolOutput> {
      const workDir = input.cwd !== undefined ? resolveInRoot(ctx.cwd, input.cwd) : ctx.cwd
      const timeoutMs = input.timeoutMs ?? 120_000
      const shell = resolveShell()

      // 沙箱前缀（ADR D15）：win32 无 wrapper 路线 → 拒跑；wrapper 缺失 → 拒跑（fail-closed）
      let file = shell.file
      let args = [...shell.args, input.command]
      if (opts.sandbox === 'on') {
        const wrapper = resolveSandboxWrapper(process.platform, {
          cwd: workDir,
          tmpdir: realpathSync(tmpdir()),
        })
        if (wrapper === null) {
          return {
            output: {
              code: 'E_SANDBOX_UNAVAILABLE',
              message:
                '当前平台（Windows）无 OS 级沙箱路线（ADR D15）——bashSandbox 置 off 或迁移工作区',
            },
            isError: true,
          }
        }
        if (!probe(wrapper.file)) {
          return {
            output: {
              code: 'E_SANDBOX_UNAVAILABLE',
              message: `沙箱 wrapper ${wrapper.file} 不可用（未安装？）——fail-closed 拒跑`,
            },
            isError: true,
          }
        }
        file = wrapper.file
        args = [...wrapper.args, shell.file, ...shell.args, input.command]
      }

      return new Promise<ToolOutput>((resolve) => {
        const child = spawn(file, args, {
          cwd: workDir,
          ...(process.platform === 'win32' ? {} : { detached: true }),
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        const chunks: string[] = []
        const collect = (buf: Buffer): void => {
          const text = buf.toString('utf8')
          chunks.push(text)
          // 16KB/帧截断（Grok）：长帧切开发 progress
          for (let i = 0; i < text.length; i += PROGRESS_CHUNK_BYTES) {
            ctx.onProgress(text.slice(i, i + PROGRESS_CHUNK_BYTES))
          }
        }
        child.stdout?.on('data', collect)
        child.stderr?.on('data', collect)

        let timedOut = false
        let aborted = false
        let settled = false
        let killTimer: ReturnType<typeof setTimeout> | null = null
        const timeoutTimer = setTimeout(() => {
          timedOut = true
          treeKill(child.pid, 'SIGTERM')
          killTimer = setTimeout(() => treeKill(child.pid, 'SIGKILL'), KILL_GRACE_MS)
        }, timeoutMs)
        const onAbort = (): void => {
          aborted = true
          treeKill(child.pid, 'SIGTERM')
          killTimer = setTimeout(() => treeKill(child.pid, 'SIGKILL'), KILL_GRACE_MS)
        }
        ctx.signal.addEventListener('abort', onAbort, { once: true })

        const finish = (output: ToolOutput): void => {
          if (settled) return
          settled = true
          clearTimeout(timeoutTimer)
          if (killTimer !== null) clearTimeout(killTimer)
          ctx.signal.removeEventListener('abort', onAbort)
          resolve(output)
        }

        child.on('error', (err) => {
          finish({
            output: { code: 'E_SPAWN', message: err.message },
            isError: true,
          })
        })

        child.on('close', (code, signal) => {
          const combined = chunks.join('')
          if (aborted) {
            finish({ output: { code: 'E_ABORTED', output: combined }, isError: true })
            return
          }
          if (timedOut) {
            finish({ output: { code: 'E_TIMEOUT', output: combined }, isError: true })
            return
          }
          if (code !== 0) {
            finish({
              output: { code: 'E_EXIT_CODE', exitCode: code, signal, output: combined },
              isError: true,
            })
            return
          }
          finish({ output: combined, isError: false })
        })
      })
    },
  }
}
