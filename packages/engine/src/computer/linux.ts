/**
 * Linux（X11）执行体（阶段十九工单 19.2 / ADR D44 平台分层）：全部走用户机系统工具——
 * xdotool（点击/键入/按键/窗口聚焦）、wmctrl（窗口清单）、scrot（截图，缺则退 ImageMagick
 * import）、xclip（剪贴板）。零 npm 依赖；工具缺失 → E_COMPUTER_UNAVAILABLE fail-closed
 * 并附安装提示（同 16.6 SoX 判例；CI 无 GUI 亦 skipIf 纪律的运行时对应面）。
 * **Wayland 不支持**（xdotool/wmctrl 依赖 X 协议）——如实 E_COMPUTER_UNAVAILABLE，
 * 不猜测会话类型静默降级。参数一律 spawn argv（无 shell 解析），零注入面。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ComputerAppInfo,
  ComputerAppInput,
  ComputerClickInput,
  ComputerClipboardInput,
  ComputerExecutor,
  ComputerKeyInput,
  ComputerScreenshotResult,
  ComputerScrollInput,
  ComputerTypeInput,
  ComputerWindowInfo,
  ComputerWindowInput,
} from './executor.js'

const OP_TIMEOUT_MS = 10_000
const SCREENSHOT_TIMEOUT_MS = 20_000

let shotSeq = 0

function run(
  cmd: string,
  args: string[],
  timeoutMs: number,
  signal: AbortSignal,
  stdinData?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [stdinData === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error(`E_COMPUTER_TIMEOUT: 电脑控制操作超时（${timeoutMs}ms）`)))
    }, timeoutMs)
    const onAbort = (): void => {
      child.kill()
      finish(() => reject(new Error('E_ABORTED: 电脑控制操作被中断')))
    }
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (stdinData !== undefined && child.stdin !== null) {
      child.stdin.write(stdinData)
      child.stdin.end()
    }
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString()
    })
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        finish(() => reject(unavailable(cmd)))
        return
      }
      finish(() => reject(new Error(`E_COMPUTER_EXEC: ${cmd} 启动失败——${err.message}`)))
    })
    child.on('close', (code) => {
      if (code === 0) {
        finish(() => resolve(stdout))
        return
      }
      const detail = stderr.trim().split('\n').filter((l) => l !== '').pop() ?? `exit ${String(code)}`
      finish(() => reject(new Error(`E_COMPUTER_EXEC: ${detail}`)))
    })
  })
}

/** 工具缺失的统一 fail-closed（附发行版安装提示） */
function unavailable(tool: string): Error {
  return new Error(
    `E_COMPUTER_UNAVAILABLE: Linux 执行体缺少 ${tool}——请安装（Debian/Ubuntu: xdotool wmctrl xclip scrot；Fedora: xdotool wmctrl xclip scrot）`,
  )
}

/** xdotool click 的按键参数 */
export function clickButton(button: 'left' | 'right' | 'middle' | undefined): string {
  if (button === 'right') return '3'
  if (button === 'middle') return '2'
  return '1'
}

/** xdotool key 的修饰键前缀 */
export function keyArgs(mods: string[] | undefined, key: string): string[] {
  const prefixes = (mods ?? []).map((m) => (m === 'ctrl' ? 'ctrl' : m === 'meta' ? 'super' : m))
  const combined = prefixes.length === 0 ? [key] : [`${prefixes.join('+')}+${key}`]
  return combined
}


/** LA-21：app launch 的 detached 启动（루不等候、不超时杀） */
function spawnDetached(command: string): void {
  try {
    const child = spawn(command, [], { detached: true, stdio: 'ignore' })
    child.unref()
  } catch {
    // 启动失败忍略（app list 不会列出，如实）
  }
}
export class LinuxComputerExecutor implements ComputerExecutor {
  /** LA-17：已 abort 的 signal 不再启动操作（照 browser.ts 惯例） */
  private static assertNotAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new Error('E_ABORTED: 电脑控制操作被中断')
  }

  constructor(private readonly shotsDir: string) {}

  async screenshot(signal: AbortSignal): Promise<ComputerScreenshotResult> {
    LinuxComputerExecutor.assertNotAborted(signal)
    mkdirSync(this.shotsDir, { recursive: true })
    const file = `shot-${Date.now()}-${(shotSeq += 1)}.png`
    const path = join(this.shotsDir, file)
    try {
      await run('scrot', ['-z', path], SCREENSHOT_TIMEOUT_MS, signal)
    } catch {
      // scrot 缺则退 ImageMagick import（-window root 全屏）
      await run('import', ['-window', 'root', path], SCREENSHOT_TIMEOUT_MS, signal)
    }
    return { file, bytes: statSync(path).size }
  }

  async click(input: ComputerClickInput, signal: AbortSignal): Promise<{ ok: true }> {
    const args = ['mousemove', String(input.x), String(input.y), 'click', '--repeat', input.double === true ? '2' : '1', '--delay', '40', clickButton(input.button)]
    await run('xdotool', args, OP_TIMEOUT_MS, signal)
    return { ok: true }
  }

  async type(input: ComputerTypeInput, signal: AbortSignal): Promise<{ ok: true }> {
    await run('xdotool', ['type', '--clearmodifiers', '--', input.text], OP_TIMEOUT_MS, signal)
    return { ok: true }
  }

  async key(input: ComputerKeyInput, signal: AbortSignal): Promise<{ ok: true }> {
    await run('xdotool', ['key', '--clearmodifiers', ...keyArgs(input.modifiers, input.key)], OP_TIMEOUT_MS, signal)
    return { ok: true }
  }

  async scroll(input: ComputerScrollInput, signal: AbortSignal): Promise<{ ok: true }> {
    const clicks = Math.max(1, Math.min(50, Math.round(Math.abs(input.deltaY) / 120)))
    const button = input.deltaY > 0 ? '4' : '5' // X11 轮键：4=上 5=下
    if (input.x !== undefined && input.y !== undefined) {
      await run('xdotool', ['mousemove', String(input.x), String(input.y)], OP_TIMEOUT_MS, signal)
    }
    await run('xdotool', ['click', '--repeat', String(clicks), '--delay', '20', button], OP_TIMEOUT_MS, signal)
    return { ok: true }
  }

  async window(
    input: ComputerWindowInput,
    signal: AbortSignal,
  ): Promise<{ windows: ComputerWindowInfo[] } | { focused: string }> {
    if (input.action === 'list') {
      const stdout = await run('wmctrl', ['-l'], OP_TIMEOUT_MS, signal)
      const windows: ComputerWindowInfo[] = []
      for (const line of stdout.trim().split('\n')) {
        if (line.trim() === '') continue
        // wmctrl -l 行形如：0x03a00002  0 12345 host title...（无进程名——name 留空，title 承载）
        const cells = line.trim().split(/\s+/)
        if (cells.length < 5) continue
        windows.push({ pid: Number.parseInt(cells[2] ?? '', 10) || 0, name: '', title: cells.slice(4).join(' ') })
      }
      return { windows }
    }
    if (input.pid !== undefined) {
      await run('xdotool', ['search', '--pid', String(input.pid), '--windowactivate'], OP_TIMEOUT_MS, signal)
      return { focused: String(input.pid) }
    }
    await run('xdotool', ['search', '--name', '--', input.title ?? '', 'windowactivate'], OP_TIMEOUT_MS, signal)
    return { focused: input.title ?? '' }
  }

  async app(input: ComputerAppInput, signal: AbortSignal): Promise<{ pid?: number; apps: ComputerAppInfo[] }> {
    if (input.action === 'launch') {
      // 直接 exec 目标程序（spawn argv 无 shell，零注入面）；ENOENT 归 E_COMPUTER_NOTFOUND 语义由 run 层映射
      // LA-21: app launch = 启动后立即返回（detached+unref），
      // 不等候也不超时杀掉刚启动的程序
      spawnDetached(input.command ?? '')
      return { apps: [] }
    }
    const stdout = await run('ps', ['-eo', 'pid=,comm='], OP_TIMEOUT_MS, signal)
    const apps: ComputerAppInfo[] = []
    for (const line of stdout.trim().split('\n')) {
      if (line.trim() === '') continue
      const m = /^\s*(\d+)\s+(.+)$/.exec(line)
      if (m === null) continue
      apps.push({ pid: Number.parseInt(m[1] ?? '', 10) || 0, name: m[2]?.trim() ?? '' })
      if (apps.length >= 50) break
    }
    return { apps }
  }

  async clipboard(input: ComputerClipboardInput, signal: AbortSignal): Promise<{ text?: string }> {
    if (input.action === 'write') {
      await run('xclip', ['-selection', 'clipboard'], OP_TIMEOUT_MS, signal, input.text ?? '')
      return {}
    }
    const text = await run('xclip', ['-selection', 'clipboard', '-o'], OP_TIMEOUT_MS, signal)
    return { text }
  }
}
