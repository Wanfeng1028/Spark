/**
 * cli 状态层（doc/02 §6.4 的终端投影壳）：D22 共享 applyEvent 投影 + 连接态 + 交互态。
 * UI 状态只来自事件流（AGENTS §2.7）——侧栏列表是连接/重连时刻的 REST 快照，不轮询。
 */
import { create } from 'zustand'
import type {
  Delivery,
  ModelsDto,
  ProjectionState,
  SessionDto,
  SessionId,
  SparkEventEnvelope,
} from '@spark/protocol'
import { applyEvent } from '@spark/protocol'

export type CliConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** Tab 循环顺序（与 web Composer 的 now/steer/queue 分段同口径） */
export const DELIVERY_ORDER: readonly Delivery[] = ['now', 'steer', 'queue']

export interface CliState extends ProjectionState {
  status: CliConnectionStatus
  /** 侧栏快照（连接/重连时 listSessions；自动化新建会话于下次重连可见——如实呈现） */
  sessions: SessionDto[]
  /** 激活会话（会话级流的订阅对象；侧栏当前行） */
  activeSessionId: SessionId | null
  /** 提交模式（Tab 循环） */
  delivery: Delivery
  /** 模型目录（上下文水位计算；启动时装载一次，失败不阻塞——水位如实缺省） */
  models: ModelsDto | null
  /** 展开态：工具行按 callId / reasoning 按 eventId（默认折叠——工单 8.3） */
  expandedTools: ReadonlySet<string>
  expandedReasoning: ReadonlySet<string>
  /** 最近一条人话提示（REST 失败/引擎 error 事件；ErrorBanner 同思路的细条数据源） */
  notice: string | null

  apply: (e: SparkEventEnvelope) => void
  setStatus: (s: CliConnectionStatus) => void
  setSessions: (list: SessionDto[]) => void
  setActiveSession: (sid: SessionId | null) => void
  cycleDelivery: () => void
  setModels: (m: ModelsDto) => void
  toggleTool: (callId: string) => void
  toggleReasoning: (eventId: string) => void
  setNotice: (msg: string | null) => void
}

function toggle(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export const useCliStore = create<CliState>()((set) => ({
  byId: {},
  activeId: null,
  status: 'connecting',
  sessions: [],
  activeSessionId: null,
  delivery: 'now',
  models: null,
  expandedTools: new Set<string>(),
  expandedReasoning: new Set<string>(),
  notice: null,

  // ProjectionState 部分交共享 reducer（zustand set 接受 Partial——byId/activeId 即全部所需）
  apply: (e) => set((s) => applyEvent(s, e)),
  setStatus: (status) => set({ status }),
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (activeSessionId) => set({ activeSessionId }),
  cycleDelivery: () =>
    set((s) => {
      const i = DELIVERY_ORDER.indexOf(s.delivery)
      return { delivery: DELIVERY_ORDER[(i + 1) % DELIVERY_ORDER.length] ?? 'now' }
    }),
  setModels: (models) => set({ models }),
  toggleTool: (callId) => set((s) => ({ expandedTools: toggle(s.expandedTools, callId) })),
  toggleReasoning: (eventId) =>
    set((s) => ({ expandedReasoning: toggle(s.expandedReasoning, eventId) })),
  setNotice: (notice) => set({ notice }),
}))
