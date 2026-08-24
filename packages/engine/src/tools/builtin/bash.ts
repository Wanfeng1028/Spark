/**
 * bash 工具（doc/02 §5.6.3）：每次独立 shell（v1 不做常驻）；stdout+stderr 合流
 * progress 流式（16KB/帧截断）；退出码非 0 → isError 但 output 保留；
 * 超时 SIGTERM → 5s → SIGKILL（Unix 进程组树杀 / Windows taskkill /T /F）。
 * ctx.signal abort 同样树杀并报 E_ABORTED（跑到静默 + 自身响应 abort）。
 * shell 解析：Windows 优先 PATH 中的 bash.exe（where bash 探测），缺失则
 * powershell -NoProfile -Command；Unix 一律 /bin/bash -c。
 */
import { execSync, spawn } from 'node:child_process'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'

const PROGRESS_CHUNK_BYTES = 16 * 1024
const KILL_GRACE_MS = 5000

const BashInput = z.strictObject({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().max(120000).optional(),
  cwd: z.string().optional(),
})

type BashInput = z.infer<typeof BashInput>

function resolveShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    try {
      execSync('where bash', { stdio: 'ignore' })
      return { file: 'bash', args: ['-c'] }
    } catch {
      return { file: 'powershell', args: ['-NoProfile', '-Command'] }
    }
  }
  return { file: '/bin/bash', args: ['-c'] }
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

export const bashTool: ToolDefinition<BashInput> = {
  name: 'bash',
  description:
    '在独立 shell 中执行命令（每次新 shell，无常驻状态）。stdout/stderr 合流流式输出；' +
    '退出码非 0 时标记错误但保留输出。timeoutMs 上限 120000（默认同上限）。' +
    '危险命令（rm/网络写入等）会经过审批。',
  inputSchema: BashInput,
  permission: {
    action: 'shell.exec',
    resourceOf: (input) => `cmd:${input.command.slice(0, 80)}`,
  },
  parallelizable: false,

  async execute(ctx: ToolContext, input: BashInput): Promise<ToolOutput> {
    const workDir = input.cwd !== undefined ? resolveInRoot(ctx.cwd, input.cwd) : ctx.cwd
    const timeoutMs = input.timeoutMs ?? 120_000
    const shell = resolveShell()

    return new Promise<ToolOutput>((resolve) => {
      const child = spawn(shell.file, [...shell.args, input.command], {
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
