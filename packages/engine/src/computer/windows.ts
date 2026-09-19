/**
 * Windows 执行体（阶段十九 19.1 / ADR D43）：PowerShell 脚本桥。
 * 选型判决（D43）：对比 nut.js/robotjs（原生绑定 + 构建链 + 安装期下载，违反
 * AGENTS §2.3a 环境纪律与零原生依赖取向）与 SendInput 直写（需原生 addon），选
 * powershell.exe 每操作一次 spawn——零 npm 依赖、无构建链；代价是每操作约
 * 100-300ms 进程开销（对 agent 操作粒度可接受）。
 * 注入安全：所有可变参数经**环境变量**传入（CU_*），PowerShell 脚本文本是常量——
 * 输入内容永不进入脚本文本，零注入面；脚本经 -EncodedCommand（UTF-16LE base64）
 * 传输，免引号转义。
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

/** 单操作超时（screenshot 稍长）；超时杀进程 fail-closed */
const OP_TIMEOUT_MS = 10_000
const SCREENSHOT_TIMEOUT_MS = 20_000

/** 截图文件序号（进程内单调；与 browser 的 shot 命名同形不同源，同毫秒碰撞概率忽略） */
let shotSeq = 0

/** SendInput 帮助类（UNICODE 逐字符输入 + 组合键；点击/滚轮走 mouse_event 轻量路径） */
const PS_SEND_CLASS = String.raw`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CuSend {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  const uint KEYBOARD = 1; const uint KEYUP = 2; const uint UNICODE = 4;
  const ushort VK_CTRL = 0x11; const ushort VK_ALT = 0x12; const ushort VK_SHIFT = 0x10; const ushort VK_META = 0x5B;
  static void Chr(ushort c, bool up) {
    INPUT[] a = new INPUT[1];
    a[0].type = KEYBOARD; a[0].u.ki.wScan = c; a[0].u.ki.dwFlags = UNICODE | (up ? KEYUP : 0);
    SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
  }
  static void Vk(ushort vk, bool up) {
    INPUT[] a = new INPUT[1];
    a[0].type = KEYBOARD; a[0].u.ki.wVk = vk; a[0].u.ki.dwFlags = up ? KEYUP : 0;
    SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
  }
  static void Mods(string mods, bool up) {
    if (string.IsNullOrEmpty(mods)) return;
    foreach (string m in mods.Split(',')) {
      if (m == "ctrl") Vk(VK_CTRL, up); else if (m == "alt") Vk(VK_ALT, up);
      else if (m == "shift") Vk(VK_SHIFT, up); else if (m == "meta") Vk(VK_META, up);
    }
  }
  public static void Text(string s) {
    foreach (char c in s) {
      if (c == '\n') { Vk(13, false); Vk(13, true); continue; }
      Chr(c, false); Chr(c, true);
    }
  }
  public static void Key(ushort vk, string mods) {
    Mods(mods, false); Vk(vk, false); Vk(vk, true); Mods(mods, true);
  }
}
'@`

const PS_SCREENSHOT = String.raw`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b=[System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp=New-Object System.Drawing.Bitmap([int]$b.Width,[int]$b.Height)
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen([int]$b.X,[int]$b.Y,0,0,$bmp.Size)
$g.Dispose()
$bmp.Save($env:CU_FILE,[System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()`

const PS_CLICK = String.raw`$ErrorActionPreference='Stop'
Add-Type -Namespace Cu -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")] public static extern void mouse_event(uint f,int x,int y,uint d,UIntPtr e);'
[int]$x=$env:CU_X; [int]$y=$env:CU_Y
[void][Cu.Native]::SetCursorPos($x,$y)
Start-Sleep -Milliseconds 30
$d=6; if($env:CU_BUTTON -eq 'right'){$d=24}elseif($env:CU_BUTTON -eq 'middle'){$d=96}
[Cu.Native]::mouse_event($d,0,0,0,[UIntPtr]::Zero)
if($env:CU_DOUBLE -eq '1'){ Start-Sleep -Milliseconds 40; [Cu.Native]::mouse_event($d,0,0,0,[UIntPtr]::Zero) }`

const PS_SCROLL = String.raw`$ErrorActionPreference='Stop'
Add-Type -Namespace Cu -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")] public static extern void mouse_event(uint f,int x,int y,uint d,UIntPtr e);'
if($env:CU_X -ne '' -and $env:CU_Y -ne ''){ [void][Cu.Native]::SetCursorPos([int]$env:CU_X,[int]$env:CU_Y) }
[Cu.Native]::mouse_event(0x0800,0,0,[uint32]$env:CU_DELTA,[UIntPtr]::Zero)`

const PS_TYPE = PS_SEND_CLASS + String.raw`
$ErrorActionPreference='Stop'
[CuSend]::Text($env:CU_TEXT)`

const PS_KEY = PS_SEND_CLASS + String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$vk=[ushort][System.Enum]::Parse([System.Windows.Forms.Keys],$env:CU_KEY,$true)
[CuSend]::Key($vk,$env:CU_MODS)`

const PS_WINDOW_LIST = String.raw`$ErrorActionPreference='Stop'
$p=@(Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 50 @{n='pid';e={$_.Id}},@{n='name';e={$_.ProcessName}},@{n='title';e={$_.MainWindowTitle}})
$json=@($p) | ConvertTo-Json -Compress -Depth 2
if(-not $json){ $json='[]' }
$json`

const PS_WINDOW_FOCUS = String.raw`$ErrorActionPreference='Stop'
Add-Type -Namespace Cu -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);'
$t=$null
foreach($p in Get-Process){
  if($p.MainWindowTitle -eq ''){ continue }
  if($env:CU_PID -ne '' -and $p.Id -eq [int]$env:CU_PID){ $t=$p; break }
  if($env:CU_TITLE -ne '' -and $p.MainWindowTitle -like "*$env:CU_TITLE*"){ $t=$p; break }
}
if(-not $t){ throw 'E_COMPUTER_NOTFOUND: 未找到匹配的窗口' }
[void][Cu.W]::SetForegroundWindow($t.MainWindowHandle)
"focused=$($t.MainWindowTitle)"`

const PS_APP_LAUNCH = String.raw`$ErrorActionPreference='Stop'
$p=Start-Process -FilePath $env:CU_CMD -PassThru
"pid=$($p.Id)"`

const PS_APP_LIST = String.raw`$ErrorActionPreference='Stop'
$p=@(Get-Process | Sort-Object -Property WS -Descending | Select-Object -First 50 @{n='pid';e={$_.Id}},@{n='name';e={$_.ProcessName}})
$json=@($p) | ConvertTo-Json -Compress -Depth 2
if(-not $json){ $json='[]' }
$json`

const PS_CLIP_READ = String.raw`$ErrorActionPreference='Stop'
Get-Clipboard -Raw`

const PS_CLIP_WRITE = String.raw`$ErrorActionPreference='Stop'
Set-Clipboard -Value $env:CU_TEXT`

/** 执行一段 PowerShell 脚本：参数只经环境变量（CU_*）进入；超时/中断杀进程 fail-closed */
function runPowerShell(
  script: string,
  args: Record<string, string>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { env: { ...process.env, ...args }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error(`E_COMPUTER_TIMEOUT: 电脑控制操作超时（${timeoutMs}ms）`)))
    }, timeoutMs)
    const onAbort = (): void => {
      child.kill()
      finish(() => reject(new Error('E_ABORTED: 电脑控制操作被中断')))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString()
    })
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    child.on('error', (err) => {
      finish(() => reject(new Error(`E_COMPUTER_EXEC: PowerShell 启动失败——${err.message}`)))
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

/** 解析单条 k=v 输出行（app launch / window focus） */
function parseKv(stdout: string, key: string): string | undefined {
  const line = stdout.trim().split('\n').find((l) => l.startsWith(`${key}=`))
  return line === undefined ? undefined : line.slice(key.length + 1)
}

/** Process 清单 JSON → 条目数组（单元素时 ConvertTo-Json 出对象，归一成数组） */
function parseProcessList<T extends { pid: number; name: string }>(stdout: string): T[] {
  const parsed: unknown = JSON.parse(stdout.trim())
  if (parsed === null || parsed === undefined) return []
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  return arr.filter((e): e is T => {
    if (typeof e !== 'object' || e === null) return false
    const r = e as Record<string, unknown>
    return typeof r.pid === 'number' && typeof r.name === 'string'
  })
}

export class WindowsComputerExecutor implements ComputerExecutor {
  constructor(private readonly shotsDir: string) {}

  async screenshot(signal: AbortSignal): Promise<ComputerScreenshotResult> {
    mkdirSync(this.shotsDir, { recursive: true })
    const file = `shot-${Date.now()}-${(shotSeq += 1)}.png`
    const path = join(this.shotsDir, file)
    await runPowerShell(PS_SCREENSHOT, { CU_FILE: path }, SCREENSHOT_TIMEOUT_MS, signal)
    return { file, bytes: statSync(path).bytes }
  }

  async click(input: ComputerClickInput, signal: AbortSignal): Promise<{ ok: true }> {
    await runPowerShell(
      PS_CLICK,
      {
        CU_X: String(input.x),
        CU_Y: String(input.y),
        CU_BUTTON: input.button ?? 'left',
        CU_DOUBLE: input.double === true ? '1' : '0',
      },
      OP_TIMEOUT_MS,
      signal,
    )
    return { ok: true }
  }

  async type(input: ComputerTypeInput, signal: AbortSignal): Promise<{ ok: true }> {
    await runPowerShell(PS_TYPE, { CU_TEXT: input.text }, OP_TIMEOUT_MS, signal)
    return { ok: true }
  }

  async key(input: ComputerKeyInput, signal: AbortSignal): Promise<{ ok: true }> {
    await runPowerShell(
      PS_KEY,
      { CU_KEY: input.key, CU_MODS: (input.modifiers ?? []).join(',') },
      OP_TIMEOUT_MS,
      signal,
    )
    return { ok: true }
  }

  async scroll(input: { deltaY: number; x?: number; y?: number }, signal: AbortSignal): Promise<{ ok: true }> {
    await runPowerShell(
      PS_SCROLL,
      {
        CU_DELTA: String(input.deltaY),
        CU_X: input.x === undefined ? '' : String(input.x),
        CU_Y: input.y === undefined ? '' : String(input.y),
      },
      OP_TIMEOUT_MS,
      signal,
    )
    return { ok: true }
  }

  async window(
    input: ComputerWindowInput,
    signal: AbortSignal,
  ): Promise<{ windows: ComputerWindowInfo[] } | { focused: string }> {
    if (input.action === 'list') {
      const stdout = await runPowerShell(PS_WINDOW_LIST, {}, OP_TIMEOUT_MS, signal)
      return { windows: parseProcessList<ComputerWindowInfo>(stdout) }
    }
    const stdout = await runPowerShell(
      PS_WINDOW_FOCUS,
      { CU_PID: input.pid === undefined ? '' : String(input.pid), CU_TITLE: input.title ?? '' },
      OP_TIMEOUT_MS,
      signal,
    )
    return { focused: parseKv(stdout, 'focused') ?? '' }
  }

  async app(input: ComputerAppInput, signal: AbortSignal): Promise<{ pid?: number; apps: ComputerAppInfo[] }> {
    if (input.action === 'launch') {
      const stdout = await runPowerShell(PS_APP_LAUNCH, { CU_CMD: input.command ?? '' }, OP_TIMEOUT_MS, signal)
      const pid = parseKv(stdout, 'pid')
      return { pid: pid === undefined ? undefined : Number(pid), apps: [] }
    }
    const stdout = await runPowerShell(PS_APP_LIST, {}, OP_TIMEOUT_MS, signal)
    return { apps: parseProcessList<ComputerAppInfo>(stdout) }
  }

  async clipboard(input: ComputerClipboardInput, signal: AbortSignal): Promise<{ text?: string }> {
    if (input.action === 'write') {
      await runPowerShell(PS_CLIP_WRITE, { CU_TEXT: input.text ?? '' }, OP_TIMEOUT_MS, signal)
      return {}
    }
    const text = await runPowerShell(PS_CLIP_READ, {}, OP_TIMEOUT_MS, signal)
    return { text: text.replace(/\r?\n$/, '') }
  }
}
