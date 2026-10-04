/**
 * session-store（doc/02 §6.4）：applyEvent reducer 是唯一写入口。
 * 工单 8.2 起 reducer 与投影类型下沉 @spark/protocol（ADR D22 四端共享资产，
 * apply-event.ts——web 与 cli 同一实现），本文件只保留 zustand 绑定与 web 选择器。
 * 去重规则（回放×直播重叠）与 27 种事件词表把关见 protocol 侧与 tests/applyEvent.test.ts。
 * UI 状态只来自事件流（AGENTS §2「UI 状态只来自事件流」）——本文件不含任何 fetch 与假状态。
 */
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { SessionId, SparkEventEnvelope } from '@spark/protocol'
import { applyEvent, emptySessionSlice } from '@spark/protocol'
import type {
  ActiveTurn,
  ProjectionState,
  SessionSlice,
  UiItem,
} from '@spark/protocol'

export type { ActiveTurn, SessionSlice, UiItem } from '@spark/protocol'

// ---------- state ----------

export interface SessionStoreState extends ProjectionState {
  applyEvent: (e: SparkEventEnvelope) => void
  resetSlice: (sid: SessionId) => void
  /** 路由激活（SessionPage 挂载即设；StatusBar/Sidebar 的「当前会话」数据源） */
  setActiveId: (sid: SessionId) => void
}

const EMPTY_ARRAY: UiItem[] = []
// ---------- store（create 只做绑定；§6.4 骨架） ----------

export const useSessionStore = create<SessionStoreState>()((set) => ({
  byId: {},
  activeId: null,
  applyEvent: (e) => set((s) => applyEvent(s, e)),
  resetSlice: (sid) => set((s) => ({ byId: { ...s.byId, [sid]: emptySessionSlice(sid) } })),
  setActiveId: (sid) => set({ activeId: sid }),
}))

// ---------- 选择器（shallow 比较——只有引用变化的 slice 重渲染） ----------

export const useSessionItems = (sid: SessionId): UiItem[] =>
  useSessionStore(useShallow((s) => s.byId[sid]?.items ?? EMPTY_ARRAY))

export const useActiveTurn = (sid: SessionId): ActiveTurn | null =>
  useSessionStore((s) => s.byId[sid]?.activeTurn ?? null)

/** 交付声明（CK-13 批 2）：present 工具的 durable 投影（null = 未声明） */
export const useSessionDeliverables = (sid: SessionId) =>
  useSessionStore((s) => s.byId[sid]?.deliverables ?? null)

/** 后台任务（CK-1 批 2 尾片）：slice.tasks 投影（四端任务卡数据源；空数组常量防
 *  zustand 不稳定快照——byId 缺项时每次返回新引用会触发重渲染循环） */
const EMPTY_TASKS: Array<{
  taskId: string
  kind: 'bash' | 'agent'
  command: string
  done: boolean
  tail: string
}> = []
export const useSessionTasks = (sid: SessionId) =>
  useSessionStore((s) => s.byId[sid]?.tasks ?? EMPTY_TASKS)

/**
 * 缓存会话判定（工单 10.16，纯函数可单测）：lastSeq>0 = store 已有该会话的持久投影。
 * 命中即立即渲染缓存、后台照常全量回放（replaySessionEvents 取回后同步覆写对齐
 * seq——不先 resetSlice，无闪空）；仅 lastSeq===0 的真冷会话才显示加载态。
 */
export function hasCachedProjection(slice: SessionSlice | undefined): boolean {
  return slice !== undefined && slice.lastSeq > 0
}

/** StatusBar：当前激活会话 slice（无会话时 null——如实显示，不造假） */
export const useActiveSlice = (): SessionSlice | null =>
  useSessionStore((s) => (s.activeId === null ? null : (s.byId[s.activeId] ?? null)))
