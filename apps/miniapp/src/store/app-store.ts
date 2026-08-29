/**
 * 小程序状态层（镜像 apps/mobile/src/store/app-store.ts——D22 共享 applyEvent
 * 投影 + 连接态；UI 状态只来自事件流，会话列表是刷新时刻的 REST 快照）。
 *
 * 批处理（工单 9.4 重点）：小程序渲染层与逻辑层分离，setData 频次敏感——
 * 事件入队后以时间窗合并（缺省 24ms，任务口径 16–32ms），窗口内多事件
 * 一次提交；无 requestAnimationFrame（逻辑层非渲染线程），调度器可注入便于测试。
 */
import { create } from 'zustand'
import type {
  ProjectionState,
  SessionDto,
  SessionId,
  SparkEventEnvelope,
} from '@spark/protocol'
import { applyEvent } from '@spark/protocol'

export type MiniAppConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface AppState extends ProjectionState {
  status: MiniAppConnectionStatus
  /** 会话列表快照（下拉刷新时刻 listSessions；如实呈现） */
  sessions: SessionDto[]
  /** 激活会话（会话级流的订阅对象；列表当前行） */
  activeSessionId: SessionId | null
  /** 最近一条人话提示（REST 失败/引擎 error 事件；顶部细条数据源，J.4） */
  notice: string | null

  apply: (e: SparkEventEnvelope) => void
  setStatus: (s: MiniAppConnectionStatus) => void
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

  // ProjectionState 部分交共享 reducer（与 web/cli/mobile 同口径）
  apply: (e) => set((s) => applyEvent(s, e)),
  setStatus: (status) => set({ status }),
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (activeSessionId) => set({ activeSessionId }),
  setNotice: (notice) => set({ notice }),
}))

/** 批处理时间窗（ms）：setData 频次敏感，窗口内事件一次提交 */
export const BATCH_WINDOW_MS = 24

export interface EventBatcher {
  enqueue: (e: SparkEventEnvelope) => void
  /** 立即 flush 挂起缓冲（卸载/测试断言用） */
  flushNow: () => void
}

/**
 * 事件批处理入队：缓冲按到达序、时间窗到期统一 flush（顺序不乱、一窗一次提交）。
 * 调度器可注入（测试用同步调度）；缺省 setTimeout(BATCH_WINDOW_MS)。
 */
export function createEventBatcher(
  apply: (e: SparkEventEnvelope) => void,
  schedule: (fn: () => void) => void = (fn) => {
    setTimeout(fn, BATCH_WINDOW_MS)
  },
): EventBatcher {
  const buf: SparkEventEnvelope[] = []
  let pending = false
  const flush = (): void => {
    pending = false
    const batch = buf.splice(0)
    for (const e of batch) apply(e)
  }
  return {
    enqueue: (e) => {
      buf.push(e)
      if (!pending) {
        pending = true
        schedule(flush)
      }
    },
    flushNow: flush,
  }
}
