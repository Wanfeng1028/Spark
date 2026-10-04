/**
 * 集成终端 pty 管理器（19.32 批 2 / D59）：main 进程持 pty，renderer 经白名单五通道
 * IPC 消费。安全口径（D59 S1–S6）：
 * - S1 spawn 参数（shell 路径/参数）由 main 的 spawn 工厂产生——IPC 面没有 shell
 *   路径字段，renderer 只给尺寸/键入/关闭意图（防 renderer 被注入后借 IPC 起 shell）；
 * - S2 通道名封闭枚举（create/input/resize/exit 四通道 + onData 单向推送）+ 入参 zod 校验；
 * - S3 槽位号绑定：slot 由 main 分发、数据只推回创建窗口（不收 renderer 自报 pid）；
 * - S4 生命周期：pty 退出（shell 自己结束）slot 即删除；窗口关闭/应用退出统一收口；
 * - S5 终端输出只推窗口，不进引擎上下文/日志（终端是用户直接 shell，不触 surface 纪律）；
 * - S6 contextIsolation/sandbox 不放松（preload 走 contextBridge 最小白名单）。
 * 依赖全部注入（spawn 工厂/窗口解析——单测打桩，不真开 pty、不碰 electron）。
 */
import { z } from 'zod'

/** node-pty IPty 的最小消费面（单测桩对齐；真实现来自 node-pty spawn） */
export interface PtyHandle {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(handler: (data: string) => void): void
  onExit(handler: (exitCode: number) => void): void
}

export type PtySpawn = (input: { cols: number; rows: number }) => { pty: PtyHandle; shell: string }

/** 通道入参 schema（S2：封闭枚举 + zod；上限防滥用） */
export const CreateInput = z.strictObject({
  cols: z.number().int().positive().max(500),
  rows: z.number().int().positive().max(200),
})
export const InputData = z.strictObject({
  slot: z.number().int().nonnegative(),
  data: z.string().max(8192),
})
export const ResizeData = z.strictObject({
  slot: z.number().int().nonnegative(),
  cols: z.number().int().positive().max(500),
  rows: z.number().int().positive().max(200),
})
export const SlotInput = z.strictObject({ slot: z.number().int().nonnegative() })

/** 推送通道名（S2 封闭枚举；唯一 main→renderer 通道） */
export const DATA_CHANNEL = 'terminal.data'
/** shell 退出时的带内标记（不新增第六通道——真实终端同款 in-band 提示） */
export const EXIT_MARKER = '\r\n\x1b[2m[进程已退出]\x1b[0m\r\n'

/** 窗口侧推送窄接口（S3：数据只推回创建窗口；不暴露 BrowserWindow 本体） */
export interface TerminalWindowPush {
  push: (channel: 'terminal.data', payload: { slot: number; data: string }) => void
}

interface SlotEntry {
  pty: PtyHandle
  webContentsId: number
  push: (channel: 'terminal.data', payload: { slot: number; data: string }) => void
}

export interface TerminalPtyManagerDeps {
  /** pty 工厂（main 接线：shellProfileOf + node-pty；label 随响应出——路径不出 main） */
  spawnPty: PtySpawn
  /** 从 WebContents id 解析创建窗口（S3 绑定用；engine 不参与） */
  resolveWindow: (webContentsId: number) => TerminalWindowPush | undefined
}

export class TerminalPtyManager {
  private readonly slots = new Map<number, SlotEntry>()
  private nextSlot = 0

  constructor(private readonly deps: TerminalPtyManagerDeps) {}

  /** terminal.create：spawn 并分配槽位；返回 shell 标签（S1——路径不出 main） */
  create(webContentsId: number, input: { cols: number; rows: number }): { slot: number; shell: string } {
    const parsed = CreateInput.parse(input)
    const win = this.deps.resolveWindow(webContentsId)
    if (win === undefined) {
      throw new Error('E_TERMINAL_NO_WINDOW: 创建来源窗口不存在（或已销毁）')
    }
    const { pty, shell } = this.deps.spawnPty({ cols: parsed.cols, rows: parsed.rows })
    const slot = this.nextSlot
    this.nextSlot += 1
    this.slots.set(slot, { pty, webContentsId, push: win.push })
    pty.onData((data) => {
      // S3：只推回创建窗口；S5：不进引擎/日志
      win.push(DATA_CHANNEL, { slot, data })
    })
    pty.onExit(() => {
      // shell 自己退出：带内标记 + 槽位删除（S4——不留僵尸槽位）
      win.push(DATA_CHANNEL, { slot, data: EXIT_MARKER })
      this.slots.delete(slot)
    })
    return { slot, shell }
  }

  /** terminal.input：键入写进 pty（未知槽位静默忽略——槽位已随 exit 删除） */
  input(input: { slot: number; data: string }): void {
    const parsed = InputData.parse(input)
    this.slots.get(parsed.slot)?.pty.write(parsed.data)
  }

  /** terminal.resize：未知槽位静默忽略 */
  resize(input: { slot: number; cols: number; rows: number }): void {
    const parsed = ResizeData.parse(input)
    this.slots.get(parsed.slot)?.pty.resize(parsed.cols, parsed.rows)
  }

  /** terminal.exit：renderer 发起的关闭（kill 细节在 pty 实现与平台口径内） */
  exit(input: { slot: number }): void {
    const parsed = SlotInput.parse(input)
    const entry = this.slots.get(parsed.slot)
    if (entry === undefined) return
    entry.pty.kill()
    this.slots.delete(parsed.slot)
  }

  /** S4：应用退出统一收口（全部 pty kill + 清表） */
  killAll(): void {
    for (const entry of this.slots.values()) entry.pty.kill()
    this.slots.clear()
  }

  /** S4：窗口关闭收口（按创建窗口的 webContents id 清槽——多窗口不串台） */
  killForContents(webContentsId: number): void {
    for (const [slot, entry] of [...this.slots.entries()]) {
      if (entry.webContentsId === webContentsId) {
        entry.pty.kill()
        this.slots.delete(slot)
      }
    }
  }

  /** 在跑槽位数（测试/诊断锚点） */
  get size(): number {
    return this.slots.size
  }

  /** S2 自检锚点：五通道封闭枚举（create/input/resize/exit 四通道 + onData 推送） */
  static readonly CHANNEL_NAMES = [
    'terminal.create',
    'terminal.input',
    'terminal.resize',
    'terminal.exit',
    'terminal.data',
  ] as const
}

