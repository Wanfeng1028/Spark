/**
 * 终端 preload（19.32 批 2 / D59）：contextBridge 最小白名单——恰好覆盖五通道，
 * 不暴露 ipcRenderer 本体、不透传任意通道名（S2/S6）。
 * sandbox:true 下 preload 可用受限 ipcRenderer（invoke/send/on）——Electron 官方口径。
 * 浏览器独立跑 web 时本文件不生效，window.sparkTerminal 不存在 → 终端面板不渲染（D59 ④）。
 */
import { contextBridge, ipcRenderer } from 'electron'

const create = (input: { cols: number; rows: number }): Promise<{ slot: number; shell: string }> =>
  ipcRenderer.invoke('terminal.create', input)

const input = (input: { slot: number; data: string }): void => {
  ipcRenderer.send('terminal.input', input)
}

const resize = (input: { slot: number; cols: number; rows: number }): Promise<void> =>
  ipcRenderer.invoke('terminal.resize', input)

const exit = (input: { slot: number }): void => {
  ipcRenderer.send('terminal.exit', input)
}

/** 订阅输出推送；返回退订函数（面板卸载时调用） */
const onData = (handler: (data: { slot: number; data: string }) => void): (() => void) => {
  const listener = (_event: unknown, payload: { slot: number; data: string }): void => {
    handler(payload)
  }
  ipcRenderer.on('terminal.data', listener)
  return () => {
    ipcRenderer.removeListener('terminal.data', listener)
  }
}

contextBridge.exposeInMainWorld('sparkTerminal', { create, input, resize, exit, onData })
