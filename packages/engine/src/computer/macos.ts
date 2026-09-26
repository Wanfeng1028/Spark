/**
 * macOS 执行体（阶段十九工单 19.2 / ADR D44 平台分层）：全部走系统内置命令——
 * osascript（System Events：点击/键入/按键/窗口与进程管理，需辅助功能授权）、
 * screencapture（截图，-x 静音）、pbpaste/pbcopy（剪贴板）。零 npm 依赖零构建链。
 * 参数一律走 spawn argv（无 shell 解析），注入面与 Windows 桥同级为零。
 * 首次使用需在 系统设置 → 隐私与安全性 → 辅助功能 中放行宿主终端——未授权时
 * System Events 报错，如实以 E_COMPUTER_EXEC 透出（不静默降级）。
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

/** 跑一条系统命令（argv 直传零 shell 解析；stdinData 可选——pbcopy 类从标准输入读的命令用；超时/中断杀进程 fail-closed） */
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
        // macOS 四命令全系统内置，ENOENT = 环境异常（PATH 被裁剪等）——与 linux 同归类，不落 E_COMPUTER_EXEC
        finish(() =>
          reject(
            new Error(
              `E_COMPUTER_UNAVAILABLE: macOS 执行体缺少 ${cmd}（系统内置命令，检查 PATH 环境变量）`,
            ),
          ),
        )
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

/** System Events 键名 → key code 的常用映射（osascript key code 需数字） */
const MAC_KEY_CODES: Record<string, number> = {
  return: 36, enter: 36, tab: 48, escape: 53, delete: 51, forwarddelete: 117,
  space: 49, up: 126, down: 125, left: 123, right: 124, home: 115, end: 119,
  pageup: 116, pagedown: 121, f1: 122, f2: 120, f3: 99, f4: 118, f5: 96,
  f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
}

function normalizeModifierScript(mods: string[] | undefined): string {
  const list = (mods ?? []).map((m) => (m === 'ctrl' ? 'control' : m === 'alt' ? 'option' : m === 'meta' ? 'command' : m))
  if (list.length === 0) return ''
  return ` using {${list.join(', ')}}`
}

export class MacComputerExecutor implements ComputerExecutor {
  constructor(private readonly shotsDir: string) {}

  async screenshot(signal: AbortSignal): Promise<ComputerScreenshotResult> {
    mkdirSync(this.shotsDir, { recursive: true })
    const file = `shot-${Date.now()}-${(shotSeq += 1)}.png`
    const path = join(this.shotsDir, file)
    await run('screencapture', ['-x', path], SCREENSHOT_TIMEOUT_MS, signal)
    return { file, bytes: statSync(path).size }
  }

  async click(input: ComputerClickInput, signal: AbortSignal): Promise<{ ok: true }> {
    // System Events click at 只支持左键；右/中键用 AppleScript 的辅助点击则需额外权限面——
    // 如实收窄：非左键走 key 纪律外路径时报错（19.2 如实限制，不假装支持）
    if (input.button !== undefined && input.button !== 'left') {
      throw new Error('E_COMPUTER_UNSUPPORTED: macOS 执行体当前仅支持左键（right/middle 未实现，登记限制）')
    }
    const times = input.double === true ? 2 : 1
    const script = `tell application "System Events" to click at {${String(input.x)}, ${String(input.y)}}`
    for (let i = 0; i < times; i += 1) {
      await run('osascript', ['-e', script], OP_TIMEOUT_MS, signal)
      if (times === 2) await new Promise((r) => setTimeout(r, 40))
    }
    return { ok: true }
  }

  async type(input: ComputerTypeInput, signal: AbortSignal): Promise<{ ok: true }> {
    // 文本经 osascript argv 传入（零转义面）；keystroke 对 \n 按回车处理
    await run(
      'osascript',
      ['-e', 'on run argv\ntell application "System Events" to keystroke (item 1 of argv)\nend run', input.text],
      OP_TIMEOUT_MS,
      signal,
    )
    return { ok: true }
  }

  async key(input: ComputerKeyInput, signal: AbortSignal): Promise<{ ok: true }> {
    const name = input.key.toLowerCase()
    const code = MAC_KEY_CODES[name]
    const mods = normalizeModifierScript(input.modifiers)
    const script =
      code === undefined
        ? `tell application "System Events" to keystroke ${JSON.stringify(input.key)}${mods}`
        : `tell application "System Events" to key code ${String(code)}${mods}`
    await run('osascript', ['-e', script], OP_TIMEOUT_MS, signal)
    return { ok: true }
  }

  scroll(_input: ComputerScrollInput, _signal: AbortSignal): Promise<{ ok: true }> {
    // macOS 无内置滚轮 CLI（System Events 无滚轮事件面）——如实拒绝，登记限制
    return Promise.reject(new Error('E_COMPUTER_UNSUPPORTED: macOS 执行体暂不支持 scroll（无内置滚轮 CLI，登记限制）'))
  }

  async window(
    input: ComputerWindowInput,
    signal: AbortSignal,
  ): Promise<{ windows: ComputerWindowInfo[] } | { focused: string }> {
    if (input.action === 'list') {
      // 逐进程行格式（单元分隔符 0x1F 分列）——AppleScript 列表输出的 ", " 分列
      // 会被标题/应用名里的逗号污染（LA-08 测试实证），行式输出无歧义
      const script = [
        'tell application "System Events"',
        '  set out to ""',
        '  repeat with p in (every process whose background only is false)',
        '    try',
        '      set w to name of front window of p',
        '    on error',
        '      set w to ""',
        '    end try',
        `    set out to out & (name of p) & "${APPLE_FIELD_SEP}" & ((unix id of p) as text) & "${APPLE_FIELD_SEP}" & w & linefeed`,
        '  end repeat',
        '  return out',
        'end tell',
      ].join('\n')
      const stdout = await run('osascript', ['-e', script], OP_TIMEOUT_MS, signal)
      return { windows: parseAppleList(stdout) }
    }
    const target = input.pid !== undefined ? `(every process whose unix id is ${String(input.pid)})` : `(every process whose name contains ${JSON.stringify(input.title ?? '')})`
    const script = `tell application "System Events" to set frontmost of item 1 of ${target} to true`
    await run('osascript', ['-e', script], OP_TIMEOUT_MS, signal)
    return { focused: input.title ?? String(input.pid ?? '') }
  }

  async app(input: ComputerAppInput, signal: AbortSignal): Promise<{ pid?: number; apps: ComputerAppInfo[] }> {
    if (input.action === 'launch') {
      await run('open', [input.command ?? ''], OP_TIMEOUT_MS, signal)
      return { apps: [] }
    }
    const script = [
      'tell application "System Events"',
      '  set out to ""',
      '  repeat with p in (every process whose background only is false)',
      `    set out to out & (name of p) & "${APPLE_FIELD_SEP}" & ((unix id of p) as text) & linefeed`,
      '  end repeat',
      '  return out',
      'end tell',
    ].join('\n')
    const stdout = await run('osascript', ['-e', script], OP_TIMEOUT_MS, signal)
    return { apps: parsePairs(stdout) }
  }

  async clipboard(input: ComputerClipboardInput, signal: AbortSignal): Promise<{ text?: string }> {
    if (input.action === 'write') {
      await run('pbcopy', [], OP_TIMEOUT_MS, signal, input.text ?? '')
      return {}
    }
    const text = await run('pbpaste', [], OP_TIMEOUT_MS, signal)
    return { text }
  }
}

/** AppleScript 行式输出的字段分隔符（0x1F 单元分隔符——标题/应用名里不会出现） */
export const APPLE_FIELD_SEP = '\u001f'

/** 逐进程行输出的宽容解析（行 = 名称<sep>pid<sep>标题；空行跳过；pid 非数字归 0） */
export function parseAppleList(stdout: string): ComputerWindowInfo[] {
  const out: ComputerWindowInfo[] = []
  for (const rowRaw of stdout.split('\n')) {
    const row = rowRaw.replace(/\r$/, '').trim()
    if (row === '') continue
    const cells = row.split(APPLE_FIELD_SEP)
    if (cells.length < 3) continue
    const pid = Number.parseInt(cells[1] ?? '', 10)
    out.push({ name: cells[0] ?? '', pid: Number.isNaN(pid) ? 0 : pid, title: cells[2] ?? '' })
  }
  return out
}

/** app 清单行解析（行 = 名称<sep>pid） */
export function parsePairs(stdout: string): ComputerAppInfo[] {
  const apps: ComputerAppInfo[] = []
  for (const rowRaw of stdout.split('\n')) {
    const row = rowRaw.replace(/\r$/, '').trim()
    if (row === '') continue
    const cells = row.split(APPLE_FIELD_SEP)
    if (cells.length < 2) continue
    const pid = Number.parseInt(cells[1] ?? '', 10)
    apps.push({ pid: Number.isNaN(pid) ? 0 : pid, name: cells[0] ?? '' })
  }
  return apps
}
