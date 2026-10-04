/**
 * 集成终端面板（19.32 批 2 / D59）：xterm.js 渲染 + 桥五通道消费。
 * 仅 desktop 态渲染（window.sparkTerminal 存在）——浏览器独立跑 web 无此桥，
 * 调用方不挂载本面板（如实无此功能，不显假开关）。
 * 生命周期：挂载 → create（拿 slot）→ onData 回填 xterm → 尺寸随容器 fit + resize；
 * 卸载 → exit（树杀在 main 侧 pty.kill 与平台口径内）。create 是异步的——卸载竞态
 * 用 disposed 标志 + cleanup 链收口（create 完成晚于卸载时直接补 exit）。
 */
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { terminalBridge, terminalFontSize } from './bridge'

export function TerminalPanel(): React.JSX.Element | null {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const bridge = terminalBridge()
    const host = hostRef.current
    if (bridge === null || host === null) return

    let disposed = false
    let slot: number | undefined
    let unsubscribe: (() => void) | undefined
    let observer: ResizeObserver | undefined
    const term = new Terminal({
      fontFamily: 'IBM Plex Mono, Consolas, monospace',
      fontSize: terminalFontSize(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    const cleanup = (): void => {
      observer?.disconnect()
      unsubscribe?.()
      if (slot !== undefined) bridge.exit({ slot })
      term.dispose()
    }

    bridge
      .create({ cols: term.cols, rows: term.rows })
      .then((created) => {
        if (disposed) {
          bridge.exit({ slot: created.slot })
          return
        }
        slot = created.slot
        unsubscribe = bridge.onData((data) => {
          if (data.slot === slot) term.write(data.data)
        })
        term.onData((data) => {
          if (slot !== undefined) bridge.input({ slot, data })
        })
        const resize = (): void => {
          if (slot === undefined) return
          fit.fit()
          void bridge.resize({ slot, cols: term.cols, rows: term.rows })
        }
        resize()
        observer = new ResizeObserver(() => resize())
        observer.observe(host)
      })
      .catch((err: unknown) => {
        setFailed(err instanceof Error ? err.message : String(err))
      })

    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  if (failed !== null) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">
        终端启动失败：{failed}
      </div>
    )
  }
  return <div ref={hostRef} className="h-full w-full" />
}
