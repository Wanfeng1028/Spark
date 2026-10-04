/**
 * 终端桥类型与探测（19.32 批 2 / D59）：desktop preload 经 contextBridge 暴露
 * window.sparkTerminal（五通道最小面）。浏览器独立跑 web 时不存在 → 终端面板
 * 不渲染（如实无此功能，不显假开关——D59 ④）。
 */

interface TerminalCreateResult {
  slot: number
  shell: string
}

export interface TerminalBridge {
  create(input: { cols: number; rows: number }): Promise<TerminalCreateResult>
  input(input: { slot: number; data: string }): void
  resize(input: { slot: number; cols: number; rows: number }): Promise<void>
  exit(input: { slot: number }): void
  /** 订阅输出推送；返回退订函数（面板卸载时调用） */
  onData(handler: (data: { slot: number; data: string }) => void): () => void
}

declare global {
  interface Window {
    sparkTerminal?: TerminalBridge
  }
}

/** 桥探测（desktop 态才有；浏览器态返回 null——调用方不渲染面板） */
export function terminalBridge(): TerminalBridge | null {
  return window.sparkTerminal ?? null
}

/** 终端字体大小（端侧偏好，localStorage；仅 desktop 态有消费者） */
const TERMINAL_FONT_KEY = 'spark.terminal.fontSize'
const TERMINAL_FONT_SIZES = [13, 14, 16] as const
export function terminalFontSize(): number {
  const raw = localStorage.getItem(TERMINAL_FONT_KEY)
  const n = raw === null ? NaN : Number(raw)
  return (TERMINAL_FONT_SIZES as readonly number[]).includes(n) ? n : 13
}
export function setTerminalFontSize(size: number): void {
  localStorage.setItem(TERMINAL_FONT_KEY, String(size))
}

