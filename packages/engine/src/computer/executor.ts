/**
 * 电脑控制执行体（阶段十九工单 19.1 / ADR D43）：computer.* 工具族的平台执行层。
 * 接口 = 八操作封闭集；平台实现分两层——Windows 走 PowerShell 脚本桥（零 npm 原生
 * 依赖，选型判决见 ARCHITECTURE D43），macOS/Linux 由 19.2 落地（此前一切操作如实
 * 报 E_COMPUTER_UNSUPPORTED，不假装可执行）。
 * 主开关（spark.json engine.computerUseEnabled）在工具层判——每操作执行期读引擎内存
 * 配置，改设置下一操作即生效（热档，不入 SETTINGS_RESTART_REQUIRED）。
 */
import { WindowsComputerExecutor } from './windows.js'

/** 截图结果：文件名与字节数（图片本体落 shotsDir，经 GET /api/artifacts/:file 供图——browser.screenshot 同通道） */
export interface ComputerScreenshotResult {
  file: string
  bytes: number
}

/** 窗口清单条目（有主窗口的进程） */
export interface ComputerWindowInfo {
  pid: number
  name: string
  title: string
}

/** 运行中应用条目（app list；按内存占用降序截前 50） */
export interface ComputerAppInfo {
  pid: number
  name: string
}

export interface ComputerClickInput {
  x: number
  y: number
  button?: 'left' | 'right' | 'middle'
  double?: boolean
}

export interface ComputerWindowInput {
  action: 'list' | 'focus'
  title?: string
  pid?: number
}

export interface ComputerAppInput {
  action: 'launch' | 'list'
  command?: string
}

export interface ComputerClipboardInput {
  action: 'read' | 'write'
  text?: string
}

export interface ComputerExecutor {
  /** 截取整个虚拟屏幕（多显示器全覆盖）为 PNG */
  screenshot(signal: AbortSignal): Promise<ComputerScreenshotResult>
  click(input: ComputerClickInput, signal: AbortSignal): Promise<{ ok: true }>
  /** 输入文本（UNICODE 逐字符 SendInput；\n 转回车） */
  type(input: { text: string }, signal: AbortSignal): Promise<{ ok: true }>
  /** 按键或组合键（key = 键名，如 Enter/F5/a；modifiers 组合） */
  key(input: { key: string; modifiers?: string[] }, signal: AbortSignal): Promise<{ ok: true }>
  /** 滚轮（deltaY > 0 向上滚一档格；x/y 缺省在当前位置滚） */
  scroll(input: { deltaY: number; x?: number; y?: number }, signal: AbortSignal): Promise<{ ok: true }>
  /** 窗口：list = 有主窗口的进程清单；focus = 按 pid/标题子串置前 */
  window(input: ComputerWindowInput, signal: AbortSignal): Promise<{ windows: ComputerWindowInfo[] } | { focused: string }>
  /** 应用：launch = 启动可执行本体（无参数——带参数走 bash）；list = 运行中进程清单 */
  app(input: ComputerAppInput, signal: AbortSignal): Promise<{ pid?: number; apps: ComputerAppInfo[] }>
  /** 剪贴板读/写（纯文本） */
  clipboard(input: ComputerClipboardInput, signal: AbortSignal): Promise<{ text?: string }>
}

/**
 * 平台工厂（engine 装配期调用一次；构造零副作用——spawn 只发生在操作执行期）。
 * shotsDir 与 browser 截图共用（~/.spark/browser-shots）：GET /api/artifacts 的
 * 文件名白名单（shot-<ts>-<seq>.png）单通道供图，不另开面。
 */
export function createComputerExecutor(shotsDir: string): ComputerExecutor {
  if (process.platform === 'win32') {
    return new WindowsComputerExecutor(shotsDir)
  }
  return new UnsupportedComputerExecutor(process.platform)
}

/** 未覆盖平台的如实降级（19.2 落地 macOS/Linux 前的 fail-closed 面） */
export class UnsupportedComputerExecutor implements ComputerExecutor {
  constructor(private readonly platform: string) {}

  screenshot(): Promise<ComputerScreenshotResult> {
    return Promise.reject(this.unsupported())
  }
  click(): Promise<{ ok: true }> {
    return Promise.reject(this.unsupported())
  }
  type(): Promise<{ ok: true }> {
    return Promise.reject(this.unsupported())
  }
  key(): Promise<{ ok: true }> {
    return Promise.reject(this.unsupported())
  }
  scroll(): Promise<{ ok: true }> {
    return Promise.reject(this.unsupported())
  }
  window(): Promise<{ windows: ComputerWindowInfo[] } | { focused: string }> {
    return Promise.reject(this.unsupported())
  }
  app(): Promise<{ pid?: number; apps: ComputerAppInfo[] }> {
    return Promise.reject(this.unsupported())
  }
  clipboard(): Promise<{ text?: string }> {
    return Promise.reject(this.unsupported())
  }

  private unsupported(): Error {
    return new Error(
      `E_COMPUTER_UNSUPPORTED: 当前平台（${this.platform}）的电脑控制执行体未实现（阶段十九 19.2 落地 macOS/Linux）`,
    )
  }
}
