/**
 * session-store（doc/02 §6.4）：applyEvent reducer 是唯一写入口。
 * 工单 8.2 起 reducer 与投影类型下沉 @spark/protocol（ADR D22 四端共享资产，
 * apply-event.ts——web 与 cli 同一实现），本文件只保留 zustand 绑定与 web 选择器。
 * 去重规则（回放×直播重叠）与 21 种事件词表把关见 protocol 侧与 tests/applyEvent.test.ts。
 * UI 状态只来自事件流（AGENTS §2「UI 状态只来自事件流」）——本文件不含任何 fetch 与假状态。
 */
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { SessionId, SparkEventEnvelope } from '@spark/protocol'
import { applyEvent, emptySessionSlice, ids } from '@spark/protocol'
import type {
  ActiveTurn,
  ProjectionState,
  SessionMeta,
  SessionSlice,
  UiItem,
} from '@spark/protocol'

export type { ActiveTurn, SessionMeta, SessionSlice, UiItem } from '@spark/protocol'

// ---------- state ----------

export interface SessionStoreState extends ProjectionState {
  applyEvent: (e: SparkEventEnvelope) => void
  resetSlice: (sid: SessionId) => void
  /** 路由激活（SessionPage 挂载即设；StatusBar/Sidebar 的「当前会话」数据源） */
  setActiveId: (sid: SessionId) => void
}

const EMPTY_ARRAY: UiItem[] = []
const EMPTY_META: SessionMeta = {
  id: ids.session(''),
  title: '',
  model: '',
  cwd: '',
  createdAt: 0,
  updatedAt: 0,
}

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

export const useSessionMeta = (sid: SessionId): SessionMeta =>
  useSessionStore((s) => s.byId[sid]?.meta ?? EMPTY_META)

export const useLastSeq = (sid: SessionId): number =>
  useSessionStore((s) => s.byId[sid]?.lastSeq ?? 0)

/** StatusBar：当前激活会话 slice（无会话时 null——如实显示，不造假） */
export const useActiveSlice = (): SessionSlice | null =>
  useSessionStore((s) => (s.activeId === null ? null : (s.byId[s.activeId] ?? null)))
