/**
 * useSessionList（doc/02 §6.2.1 数据源：transport.listSessions()）：
 * Sidebar 与欢迎页「最近会话」共用的列表加载 hook——loading/error/refresh 三态齐备。
 * mock 即时返回；HttpTransport（阶段三）接 Query 缓存时再评估引入 TanStack Query。
 */
import { useCallback, useEffect, useState } from 'react'
import type { SessionDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'

export interface SessionListState {
  sessions: SessionDto[] | null // null = 加载中
  error: string | null
  refresh: () => Promise<void>
}

export function useSessionList(): SessionListState {
  const { transport } = useTransport()
  const [sessions, setSessions] = useState<SessionDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const list = await transport.listSessions()
      setSessions(list)
    } catch (err) {
      // 失败闭合：列表不可用如实呈现错误块（不吞、不用缓存冒充新数据）
      setError(errorMessageOf(err))
    }
  }, [transport])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { sessions, error, refresh }
}
