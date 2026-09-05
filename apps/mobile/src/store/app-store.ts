/**
 * mobile 状态层（镜像 apps/cli/src/store.ts——D22 共享 applyEvent 投影 + 连接态）。
 * UI 状态只来自事件流（AGENTS §2.7）；会话列表是连接/刷新时刻的 REST 快照。
 * 事件入队做批处理：requestAnimationFrame flush（参照 apps/web context.tsx 模式）——
 * 同帧多事件只触发一次渲染提交，避免高频 assistant.delta 逐事件渲染。
 */
import { create } from 'zustand'
import type {
  ProjectionState,
  SessionDto,
  SessionId,
  SparkEventEnvelope,
} from '@spark/protocol'
import { applyEvent } from '@spark/protocol'

export type MobileConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface AppState extends ProjectionState {
  status: MobileConnectionStatus
  /** 会话列表快照（下拉刷新/聚焦时刻 listSessions；如实呈现） */
  sessions: SessionDto[]
  /** 激活会话（会话级流的订阅对象；列表当前行） */
  activeSessionId: SessionId | null
  /** 最近一条人话提示（REST 失败/引擎 error 事件；顶部细条数据源，J.4） */
  notice: string | null

  apply: (e: SparkEventEnvelope) => void
  setStatus: (s: MobileConnectionStatus) => void
  setSessions: (list: SessionDto[]) => void
  setActiveSession: (sid: SessionId | null) => void
  setNotice: (msg: string | null) => void
}

export const useAppStore = create<AppState>()((set) => ({
  byId: {},
  activeId: null,
  status: 'connecting',
  sessions: [],
  activeSessionId: null,
  notice: null,

  // ProjectionState 部分交共享 reducer（与 cli 同口径——byId/activeId 即全部所需）
  apply: (e) => set((s) => applyEvent(s, e)),
  setStatus: (status) => set({ status }),
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (activeSessionId) => set({ activeSessionId }),
  setNotice: (notice) => set({ notice }),
}))


  
