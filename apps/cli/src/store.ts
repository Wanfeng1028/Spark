/**
 * cli 状态层（doc/02 §6.4 的终端投影壳）：D22 共享 applyEvent 投影 + 连接态 + 交互态。
 * UI 状态只来自事件流（AGENTS §2.7）——会话列表是连接/重连时刻的 REST 快照，不轮询。
 * 阶段十工单 10.8 起为纯单栏形态（ADR D19 修订）：无侧栏，面板族（帮助/恢复/统计）
 * 与输入预览（slash 菜单）挂本层。
 */
import { create } from 'zustand'
import type {
  CommandDto,
  Delivery,
  ModelsDto,
  ProjectionState,
  SessionDto,
  SessionId,
  SparkEventEnvelope,
} from '@spark/protocol'
import { applyEvent, emptySessionSlice } from '@spark/protocol'

export type CliConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** Tab 循环顺序（与 web Composer 的 now/steer/queue 分段同口径） */
export const DELIVERY_ORDER: readonly Delivery[] = ['now', 'steer', 'queue']

/** 面板族（工单 10.10/10.11/10.18，§13.K）：同时至多一个开放 */
export type CliPanel =
  | 'none'
  | 'help'
  | 'resume'
  | 'stats'
  | 'model'
  | 'mcp'
  | 'skills'
  | 'usage'
  | 'checkpoints'
  | 'tree'

export interface CliState extends ProjectionState {
  status: CliConnectionStatus
  /** 会话快照（连接/重连时 listSessions；/resume 面板数据源——如实呈现） */
  sessions: SessionDto[]
  /** 激活会话（会话级流的订阅对象） */
  activeSessionId: SessionId | null
  /** 提交模式（Tab 循环） */
  delivery: Delivery
  /** 模型目录（上下文水位计算；启动时装载一次，失败不阻塞——水位如实缺省） */
  models: ModelsDto | null
  /** 命令注册表快照（启动时装载；帮助面板与 slash 菜单数据源，工单 10.10） */
  commands: CommandDto[]
  /** 展开态：工具行按 callId / reasoning 按 eventId / 聚合组行按组 key（默认折叠——工单 8.3） */
  expandedTools: ReadonlySet<string>
  expandedReasoning: ReadonlySet<string>
  expandedGroups: ReadonlySet<string>
  /** 最近一条人话提示（REST 失败/引擎 error 事件；ErrorBanner 同思路的细条数据源） */
  notice: string | null
  /** 面板开关（工单 10.10/10.11/10.18） */
  panel: CliPanel
  /** 帮助面板 tab（0 概览 / 1 命令 / 2 键位；Tab/Shift+Tab 切换） */
  helpTab: number
  /** 输入预览（InputBox 逐键上报；slash 菜单可见性与过滤数据源） */
  draftPreview: string
  /** 启动失败态（工单 10.17④：显式错误屏+重试，不再只挂 notice） */
  bootError: string | null
  /** resume/回滚后 boot 头部重现一次（工单 10.17③ / DESIGN K.1） */
  bootEcho: boolean
  /** 回放重订阅 nonce（工单 10.18 rollback：seq 倒退后 since=0 重放需重订阅） */
  replayNonce: number

  apply: (e: SparkEventEnvelope) => void
  /** 清会话投影（回滚后 seq 倒退，重放重建——工单 10.18 /rollback） */
  resetSlice: (sid: SessionId) => void
  setStatus: (s: CliConnectionStatus) => void
  setSessions: (list: SessionDto[]) => void
  setActiveSession: (sid: SessionId | null) => void
  cycleDelivery: () => void
  setModels: (m: ModelsDto) => void
  setCommands: (c: CommandDto[]) => void
  toggleTool: (callId: string) => void
  toggleReasoning: (eventId: string) => void
  toggleToolGroup: (groupKey: string) => void
  setNotice: (msg: string | null) => void
  setPanel: (p: CliPanel) => void
  cycleHelpTab: (dir: 1 | -1) => void
  setDraftPreview: (v: string) => void
  setBootError: (msg: string | null) => void
  setBootEcho: (v: boolean) => void
  bumpReplay: () => void
  /** 新建会话的 UI 态归位（工单 10.35）：展开集合/草稿/提示/面板/错误全部回到初始 */
  resetUi: () => void
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
  commands: [],
  expandedTools: new Set<string>(),
  expandedReasoning: new Set<string>(),
  expandedGroups: new Set<string>(),
  notice: null,
  panel: 'none',
  helpTab: 0,
  draftPreview: '',
  bootError: null,
  bootEcho: false,
  replayNonce: 0,

  // ProjectionState 部分交共享 reducer（zustand set 接受 Partial——byId/activeId 即全部所需）
  apply: (e) => set((s) => applyEvent(s, e)),
  resetSlice: (sid) => set((s) => ({ byId: { ...s.byId, [sid]: emptySessionSlice(sid) } })),
  setStatus: (status) => set({ status }),
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (activeSessionId) => set({ activeSessionId }),
  cycleDelivery: () =>
    set((s) => {
      const i = DELIVERY_ORDER.indexOf(s.delivery)
      return { delivery: DELIVERY_ORDER[(i + 1) % DELIVERY_ORDER.length] ?? 'now' }
    }),
  setModels: (models) => set({ models }),
  setCommands: (commands) => set({ commands }),
  toggleTool: (callId) => set((s) => ({ expandedTools: toggle(s.expandedTools, callId) })),
  toggleReasoning: (eventId) =>
    set((s) => ({ expandedReasoning: toggle(s.expandedReasoning, eventId) })),
  toggleToolGroup: (groupKey) =>
    set((s) => ({ expandedGroups: toggle(s.expandedGroups, groupKey) })),
  setNotice: (notice) => set({ notice }),
  setPanel: (panel) => set({ panel, ...(panel === 'help' ? { helpTab: 0 } : {}) }),
  cycleHelpTab: (dir) => set((s) => ({ helpTab: (s.helpTab + dir + 3) % 3 })),
  setDraftPreview: (draftPreview) => set({ draftPreview }),
  setBootError: (bootError) => set({ bootError }),
  setBootEcho: (bootEcho) => set({ bootEcho }),
  bumpReplay: () => set((s) => ({ replayNonce: s.replayNonce + 1 })),
  resetUi: () =>
    set({
      expandedTools: new Set<string>(),
      expandedReasoning: new Set<string>(),
      expandedGroups: new Set<string>(),
      notice: null,
      panel: 'none',
      helpTab: 0,
      draftPreview: '',
      bootError: null,
    }),
}))
