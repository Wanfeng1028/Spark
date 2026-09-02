/**
 * 会话级事件流生命周期（工单 10.43，自 app.tsx 抽取）：activeSessionId 变化 →
 * SessionEventSource 订阅（since=0 全量重放，含断线退避重连）；replayNonce 变化
 * （/rollback 后 seq 倒退）→ since=0 重订阅重放（工单 10.18）。
 */
import { useEffect } from 'react'
import type { SparkEventEnvelope } from '@spark/protocol'
import { SessionEventSource } from '@spark/protocol'
import { useCliStore } from '../store.js'

export function useSessionStream(baseUrl: string, transport: { listSessions: () => Promise<unknown> }): void {
  const activeSessionId = useCliStore((s) => s.activeSessionId)
  const replayNonce = useCliStore((s) => s.replayNonce)

  useEffect(() => {
    if (activeSessionId === null) return
    const store = useCliStore.getState()
    const source = new SessionEventSource({
      baseUrl,
      sessionId: activeSessionId,
      since: 0,
      onStatus: (s) => {
        useCliStore.getState().setStatus(s)
        // 连接/重连成功：刷新会话快照（自动化等外部新建会话于此可见）
        if (s === 'open') {
          transport
            .listSessions()
            .then((list) => useCliStore.getState().setSessions(list as never))
            .catch(() => undefined)
        }
      },
      onEvent: (e: SparkEventEnvelope) => {
        store.apply(e)
      },
    })
    return () => {
      source.dispose()
    }
    // replayNonce：回滚后 seq 倒退，需 since=0 重订阅重放（工单 10.18 /rollback）
  }, [activeSessionId, baseUrl, transport, replayNonce])
}
