/**
 * Transport 上下文（doc/02 §6.6）：`<App>` → `<TransportProvider>` → `<AppShell>`。
 * VITE_SPARK_MOCK=1 → MockTransport（工单 1.4）；否则 HttpTransport（工单 10c）：
 * 连接状态写 connection-store；重连成功 onResync → 对已打开会话
 * getSession 全量回放（resetSlice 后批量 apply——§6.10 时序④，冷启动与断线重连同一路径）。
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionId, SparkEventEnvelope, Transport } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'
import { useConnectionStore } from '@/stores/connection'
import { MockTransport } from './mock.js'
import type { MockScenario } from './mock.js'
import { HttpTransport } from './http.js'

/** 全量回放（§6.4）：resetSlice 清水位后逐条 apply（幂等；同步执行防直播流插入） */
export function replaySessionEvents(transport: Transport, sid: SessionId): Promise<void> {
  return transport
    .getSession(sid)
    .then((dto) => {
      const store = useSessionStore.getState()
      store.resetSlice(sid)
      for (const e of dto.events ?? []) store.applyEvent(e)
    })
    .catch((err: unknown) => {
      // 失败闭合：重放失败如实上抛（调用方呈现错误态；不吞、不用旧数据冒充）
      throw err instanceof Error ? err : new Error(String(err))
    })
}

export interface TransportContextValue {
  transport: Transport
  mock: boolean
  scenario: MockScenario
  setScenario: (s: MockScenario) => void
}

const TransportContext = createContext<TransportContextValue | null>(null)

export function TransportProvider({ children }: { children: ReactNode }) {
  const mock = import.meta.env.VITE_SPARK_MOCK === '1'
  const [scenario, setScenarioState] = useState<MockScenario>('normal')

  const mockTransport = useMemo(() => (mock ? new MockTransport('normal') : null), [mock])
  // onResync 闭包引用自身实例：ref 容器解开构造期自引用（运行期已赋值）
  const transportRef = useMemo(() => ({ current: null as Transport | null }), [])
  const transport = useMemo<Transport>(() => {
    if (mockTransport !== null) return mockTransport
    return new HttpTransport({
      onStatus: (s) => useConnectionStore.getState().setStatus(s),
      onResync: (sids) => {
        const t = transportRef.current
        if (t === null) return
        for (const sid of sids) {
          replaySessionEvents(t, sid).catch((err: unknown) => {
            // 失败闭合：resync 失败如实记录并保留旧快照（直播可能续上；下次重连再试）
            console.error('[http] 重连重放失败', sid, err)
          })
        }
      },
    })
  }, [mockTransport, transportRef])
  transportRef.current = transport
  // 不在 effect 清理中 dispose：顶层 Provider 与页面同生命周期，
  // StrictMode 开发期双挂载的模拟卸载会误杀单例 transport（App 级资源不随组件树重挂销毁）

  // 事件流 → session-store（§6.4）：rAF 批量 flush——同帧多事件只触发一次渲染提交，
  // 缓冲按到达序 flush（live/durable 相对顺序不乱）；卸载时取消挂起的 rAF 并清缓冲（防卸载后写 store）
  useEffect(() => {
    // mock 通道即挂即用；HttpTransport 由 SSE 状态机驱动 setStatus
    if (mock) useConnectionStore.getState().setStatus('open')
    const buf: SparkEventEnvelope[] = []
    let raf = 0
    const flush = () => {
      raf = 0
      const batch = buf.splice(0)
      for (const e of batch) {
        useSessionStore.getState().applyEvent(e)
        if (e.seq !== undefined) useConnectionStore.getState().noteSeq(e.seq)
      }
    }
    const off = transport.onEvent((e) => {
      buf.push(e)
      if (!raf) raf = requestAnimationFrame(flush)
    })
    return () => {
      off()
      if (raf) cancelAnimationFrame(raf)
      buf.length = 0
    }
  }, [transport, mock])

  const value = useMemo<TransportContextValue>(
    () => ({
      transport,
      mock,
      scenario,
      setScenario: (s: MockScenario) => {
        if (!mockTransport) return
        mockTransport.setScenario(s)
        setScenarioState(s)
      },
    }),
    [transport, mock, scenario, mockTransport],
  )

  return <TransportContext.Provider value={value}>{children}</TransportContext.Provider>
}

export function useTransport(): TransportContextValue {
  const ctx = useContext(TransportContext)
  if (!ctx) throw new Error('useTransport 必须在 <TransportProvider> 内使用')
  return ctx
}
