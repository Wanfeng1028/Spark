/**
 * bash 工具（doc/02 §5.6.3）：缺省每次独立 shell；`engine.bashPersistent` 开启时
 * 走常驻会话池（阶段十九 19.3 / ADR D45，翻案"v1 不做常驻"判决）——每会话一个
 * 长驻 bash，cwd/环境变量/函数定义跨调用保持，空闲 10 分钟回收、池容量 8 按
 * LRU 逐出，超时/中断杀整 shell 下一调用自动重建（状态丢失是常驻语义的一部分，
 * fail-closed 不假装保状态）。POSIX bash 才有常驻路径（Windows 无 bash 时回落
 * 独立 shell，属平台边界非静默降级——行为在 ADR 与工具描述登记）；沙箱 'on'
 * 时沙箱路径优先（wrapper 包常驻 shell 属 19.6 范畴，v1 不混用）。
 * stdout+stderr 合流 progress 流式（16KB/帧截断）；退出码非 0 → isError 但 output
 * 保留；超时 SIGTERM → 宽限期 → SIGKILL（Unix 进程组树杀 5s 宽限 / Windows
 * taskkill /T /F 两次都强杀、1s 宽限——树杀与派生竞态时补杀兼做孤儿清理）。
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
import { StringDecoder } from 'node:string_decoder'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'
import { resolveSandboxWrapper, wrapperAvailable } from '../sandbox.js'
import type { BashSandboxMode } from '../sandbox.js'
import { sandboxProxyEnv, sandboxProxyExportLine } from '../../sandbox/network-env.js'
import { BashShellPool, COLLECT_TRUNCATION_MARK } from '../bash-pool.js'
import type { ShellPoolOpts } from '../bash-pool.js'

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
  return segments.length >= 2 ? segments.map((s) => `cmd:${s}`) : undefined
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
  /** 常驻会话开关（spark.json engine.bashPersistent，19.3 / ADR D45）：getter 执行期读（热档）；缺省 undefined = 永远独立 shell（旧行为） */
  persistent?: () => boolean
  /**
   * 沙箱网络隔离（spark.json sandbox.network，19.7 / ADR D50）：getter 执行期读（热档）。
   * enabled = allowlist 档——命令出口注入本地代理环境变量；ready = 代理已监听
   * （未就绪即拒跑 E_SANDBOX_NETWORK_UNAVAILABLE，不降级直连）。与 OS wrapper
   * 正交：Windows 无 OS 沙箱路线时网络隔离单独生效（出口引导，非内核隔离）。
   */
  networkIsolation?: () => { enabled: boolean; port: number; ready: boolean }
  /** 常驻池（测试注入；缺省按 poolOpts 构造——maxEntries 8 / idleMs 10 分钟） */
  pool?: BashShellPool
  poolOpts?: Partial<ShellPoolOpts>
  /** 池引用回调（LA-16：引擎 shutdown 排水）——构造期调用一次（persistent 未开时为 null） */
  onPool?: (pool: BashShellPool | null) => void
  /** 测试注入：wrapper 可用性探测替换（缺省真实探测 command -v） */
  isWrapperAvailable?: (file: string) => boolean
}

/** 默认实例（沙箱关、无常驻）：旧行为不变；引擎按配置用 makeBashTool 构造 */
export const bashTool: ToolDefinition<BashInput> = makeBashTool({ sandbox: 'off' })

export function makeBashTool(opts: BashToolOptions): ToolDefinition<BashInput> {
  const probe =
    opts.isWrapperAvailable ?? ((file: string) => wrapperAvailable(process.platform, file))
  const pool =
    opts.pool ??
    (opts.persistent !== undefined
      ? new BashShellPool({
          maxEntries: opts.poolOpts?.maxEntries ?? 8,
          idleMs: opts.poolOpts?.idleMs ?? 600_000,
          now: Date.now,
          ...(opts.poolOpts?.collectCapChars !== undefined
            ? { collectCapChars: opts.poolOpts.collectCapChars }
            : {}),
        })
      : null)
  opts.onPool?.(pool)
  return {
    name: 'bash',
    description:
      '在 shell 中执行命令。stdout/stderr 合流流式输出；' +
      '退出码非 0 时标记错误但保留输出。timeoutMs 上限 120000（默认同上限）。' +
      '危险命令（rm/网络写入等）会经过审批。' +
      '启用常驻会话（bashPersistent）时同一会话的 cwd/环境变量跨调用保持，' +
      '超时/中断会丢失该状态（整 shell 重建）；避免直接读标准输入的命令。' +
      'Windows 无 POSIX bash 时常驻自动回落独立 shell。' +
      '沙箱网络隔离（sandbox.network=allowlist）时命令出口经本地代理过滤，仅清单域名放行' +
      '——忽略代理环境变量的命令仍可直连（出口引导，非内核隔离）。',
    inputSchema: BashInput,
    permission: {
      action: 'shell.exec',
      resourceOf: (input) => `cmd:${input.command}`,
      // 复合命令多 pattern：逐段评估与展示；always 固化同样按段（§5.7 补强 1/3）
      patternsOf: (input) => splitCommandPatterns(input.command),
      alwaysPatternsOf: (input) => splitCommandPatterns(input.command),
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: BashInput): Promise<ToolOutput> {
      const workDir = input.cwd !== undefined ? resolveInRoot(ctx.cwd, input.cwd) : ctx.cwd
      const timeoutMs = input.timeoutMs ?? 120_000
      const shell = resolveShell()
      const persistentOn = opts.persistent?.() === true && pool !== null && shell.file !== 'powershell'

      // 网络隔离（19.7 / ADR D50）：allowlist 档且代理未就绪 → fail-closed 拒跑，
      // 不降级为直连（否则"已隔离"是假状态）。就绪 → 出口引导变量（见 network-env.ts）。
      const isolation = opts.networkIsolation?.()
      const isolated = isolation !== undefined && isolation.enabled
      if (isolated && !isolation.ready) {
        return {
          output: {
            code: 'E_SANDBOX_NETWORK_UNAVAILABLE',
            message: '沙箱网络隔离代理未就绪（端口绑定失败？）——fail-closed 拒跑，不降级直连',
          },
          isError: true,
        }
      }
      const proxyPort = isolated && isolation.ready ? isolation.port : null

      // LA-16：主开关关闭后的排水——关闭后该会话的下一条命令顺手回收常驻 shell
      if (pool !== null && !persistentOn && pool.has(ctx.sessionId)) {
        pool.drop(ctx.sessionId)
      }

      // 常驻路径（19.3 / ADR D45）：POSIX bash + 主开关开 + 沙箱关。
      // 沙箱 'on' 时沙箱路径优先（wrapper 包常驻 shell 属 19.6，v1 不混用）。
      if (persistentOn && (opts.sandbox === 'off' || opts.sandbox === 'approval')) {
        // 隔离档逐命令前缀 export（不依赖 shell 创建时的环境——常驻 shell 跨调用
        // 保持环境，创建时注入会在模式热切换后 fail-open）
        const command = proxyPort !== null ? `${sandboxProxyExportLine(proxyPort)}\n${input.command}` : input.command
        // cwd 语义（D45）：显式 cwd 才切目录；无 cwd = 保持常驻 shell 当前位置
        //（命令内 cd 跨调用保持——常驻的核心价值），不强制拉回会话根。
        // LA-12：新 shell 的起始目录显式落会话根（spawnCwd），绝不继承引擎进程 cwd。
        // LA-14：收集上限由池执行期生效（超限截断 + 同源标记），不再事后切片。
        const result = await pool.run(ctx.sessionId, {
          file: shell.file,
          command,
          spawnCwd: ctx.cwd,
          changeTo: input.cwd !== undefined ? workDir : null,
          timeoutMs,
          signal: ctx.signal,
          onOutput: ctx.onProgress,
          maxOutputChars: (ctx.outputLimitBytes ?? 32 * 1024) * 4,
        })
        const output = result.output
        if (result.aborted) {
          return { output: { code: 'E_ABORTED', output }, isError: true }
        }
        if (result.timedOut) {
          return { output: { code: 'E_TIMEOUT', output }, isError: true }
        }
        if (result.exitCode === null) {
          // shell 中途死亡（exit/set -e/外部信号）：状态已失，池已除名，下一调用自动重建
          return { output: { code: 'E_SHELL_DIED', output }, isError: true }
        }
        if (result.exitCode !== 0) {
          return { output: { code: 'E_EXIT_CODE', exitCode: result.exitCode, output }, isError: true }
        }
        return { output, isError: false }
      }

      // 沙箱前缀（ADR D15）：win32 无 wrapper 路线 → 拒跑；wrapper 缺失 → 拒跑（fail-closed）
      let file = shell.file
      let args = [...shell.args, input.command]
      if (opts.sandbox === 'light' || opts.sandbox === 'heavy') {
        const wrapper = resolveSandboxWrapper(process.platform, {
          cwd: workDir,
          tmpdir: realpathSync(tmpdir()),
        }, opts.sandbox)
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
          // 隔离档（19.7）：出口引导变量覆盖在进程环境之上；wrapper 内的 shell 同样继承
          ...(proxyPort !== null ? { env: { ...process.env, ...sandboxProxyEnv(proxyPort) } } : {}),
          ...(process.platform === 'win32' ? {} : { detached: true }),
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        // AUD-02：执行期收集上限（outputLimitBytes 的 4 倍缓冲，按字符数计——JS 字符串
        // 内存有界即达目的）——此前 chunks 无上限，`cat 1GB.log` 全量驻留内存（bound()
        // 在 execute 返回后才截断，管不住执行期）。超限即停收并标记；progress 照发
        // （直播流廉价）。UTF-8 用 StringDecoder 跨块增量解码——旧逐 buf.toString 会把
        // 被 chunk 切断的多字节字符变成 U+FFFD。
        const collectCapChars = (ctx.outputLimitBytes ?? 32 * 1024) * 4
        const stdoutDecoder = new StringDecoder('utf8')
        const stderrDecoder = new StringDecoder('utf8')
        const chunks: string[] = []
        let collectedChars = 0
        let collectTruncated = false
        const collect = (buf: Buffer, decoder: StringDecoder): void => {
          const text = decoder.write(buf)
          if (!collectTruncated) {
            // 按剩余空间切片收集（避免"整块先收再判超"让上限膨胀到一个 chunk 的大小）
            const room = collectCapChars - collectedChars
            const piece = text.length > room ? text.slice(0, room) : text
            chunks.push(piece)
            collectedChars += piece.length
            if (collectedChars >= collectCapChars) {
              collectTruncated = true
              chunks.push(COLLECT_TRUNCATION_MARK)
            }
          }
          // 16KB/帧截断（Grok）：长帧切开发 progress
          for (let i = 0; i < text.length; i += PROGRESS_CHUNK_BYTES) {
            ctx.onProgress(text.slice(i, i + PROGRESS_CHUNK_BYTES))
          }
        }
        child.stdout?.on('data', (b: Buffer) => collect(b, stdoutDecoder))
        child.stderr?.on('data', (b: Buffer) => collect(b, stderrDecoder))

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
          // AUD-02：冲刷 UTF-8 边界残字（多字节字符跨 chunk 切断的收尾恢复）；
          // 已截断时跳过（超限后不再扩收集，避免上限形同虚设）
          if (!collectTruncated) {
            const tail = stdoutDecoder.end() + stderrDecoder.end()
            if (tail !== '') chunks.push(tail)
          }
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
