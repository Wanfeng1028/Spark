/**
 * useSessionList（doc/02 §6.2.1 数据源：transport.listSessions()）：
 * Sidebar 与欢迎页「最近会话」共用的列表加载 hook——loading/error/refresh 三态齐备。
 * R-E① 起改为 useTransportQuery 消费者（loading/error/refresh 收敛单点）。
 */
import type { SessionDto } from '@spark/protocol'
import { useTransportQuery } from './useTransportQuery'

export interface SessionListState {
  sessions: SessionDto[] | null // null = 加载中
  error: string | null
  refresh: () => Promise<void>
}

export function useSessionList(): SessionListState {
  const { data: sessions, error, refresh } = useTransportQuery((t) => t.listSessions())
  return { sessions, error, refresh }
}
