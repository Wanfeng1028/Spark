/**
 * Transport 上下文（doc/02 §6.6）：`<App>` → `<TransportProvider>` → `<AppShell>`。
 * VITE_SPARK_MOCK=1 → MockTransport（工单 1.4）；否则 HttpTransport（阶段三工单，当前显式抛错——禁假实现）。
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SparkEventEnvelope, Transport } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'
import { MockTransport } from './mock.js'
import type { MockScenario } from './mock.js'

function createHttpTransport(): Transport {
  // 阶段三工单（doc/02 §8）；显式失败优于幻觉实现（ARCHITECTURE §9）
  throw new Error('HttpTransport 未实现（阶段三）：当前请以 VITE_SPARK_MOCK=1 运行 web')
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
  const transport = useMemo<Transport>(
    () => mockTransport ?? createHttpTransport(), // mock=false 在此显式抛错（禁假实现）
    [mockTransport],
  )
  // 不在 effect 清理中 dispose：顶层 Provider 与页面同生命周期，
  // StrictMode 开发期双挂载的模拟卸载会误杀单例 transport（App 级资源不随组件树重挂销毁）

  // 事件流 → session-store（§6.4）：rAF 批量 flush——同帧多事件只触发一次渲染提交，
  // 缓冲按到达序 flush（live/durable 相对顺序不乱）；卸载时取消挂起的 rAF 并清缓冲（防卸载后写 store）
  useEffect(() => {
    const buf: SparkEventEnvelope[] = []
    let raf = 0
    const flush = () => {
      raf = 0
      const batch = buf.splice(0)
      for (const e of batch) useSessionStore.getState().applyEvent(e)
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
  }, [transport])

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
