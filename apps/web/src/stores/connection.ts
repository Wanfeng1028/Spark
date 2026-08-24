/**
 * connection-store（doc/02 §6.4）：全局连接状态（跨会话单连接——SSE 直播全部会话）。
 * mock 模式下事件通道是本地回放，Provider 挂载即 open；HttpTransport（阶段三）
 * 由其重连状态机驱动 setStatus。lastSeq = 全局直播水位（StatusBar 显示用）。
 */
import { create } from 'zustand'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface ConnectionState {
  status: ConnectionStatus
  lastSeq: number
  retryCount: number
  setStatus: (s: ConnectionStatus) => void
  setRetryCount: (n: number) => void
  /** 直播事件水位上报（durable 有 seq；取最大防乱序） */
  noteSeq: (seq: number) => void
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  status: 'connecting',
  lastSeq: 0,
  retryCount: 0,
  setStatus: (status) => set({ status }),
  setRetryCount: (retryCount) => set({ retryCount }),
  noteSeq: (seq) => {
    if (seq > get().lastSeq) set({ lastSeq: seq })
  },
}))
