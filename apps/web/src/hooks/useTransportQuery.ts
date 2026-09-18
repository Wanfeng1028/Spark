/**
 * useTransportQuery（工单 R-E①：settings 族 12 处逐字加载 effect 与
 * useSessionList/useCommands 同构收敛）——transport 只读查询的三态 hook：
 * data（null=加载中）/ error / refresh。
 * 代际闸门（AUD-14）：effect 与 refresh 共用 genRef 计数——提交前只许最新代写
 * data/error，晚到的旧响应不覆盖新数据；成功提交同时清 error（一次失败后错误态
 * 可恢复，切换筛选成功即恢复，不再永久停留）。依赖变化不清旧 data（保持
 * stale-while-revalidate 观感，设置页不闪加载），但错误态必须能恢复。
 * 失败闭合：错误如实呈现（不吞、不用缓存冒充新数据）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transport } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'

export function useTransportQuery<T>(
  fetcher: (transport: Transport) => Promise<T>,
  deps: readonly unknown[] = [],
): { data: T | null; error: string | null; refresh: () => Promise<void> } {
  const { transport } = useTransport()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 代际计数：每次发起自增记代，提交前校验仍是最新代（cleanup 自增作废在途响应）
  const genRef = useRef(0)

  const refresh = useCallback(async () => {
    const gen = ++genRef.current
    setError(null) // 重试即清错（失败会在本代重新如实写入）
    try {
      const result = await fetcher(transport)
      if (genRef.current !== gen) return
      setData(result)
      setError(null)
    } catch (err) {
      if (genRef.current !== gen) return
      setError(errorMessageOf(err))
    }
    // deps 透传由调用方给定（R-E① 原口径：调用方保证 fetcher 与 deps 同步变化）
  }, [transport, ...deps])

  useEffect(() => {
    const gen = ++genRef.current
    void (async () => {
      try {
        const result = await fetcher(transport)
        if (genRef.current !== gen) return
        setData(result)
        setError(null)
      } catch (err) {
        if (genRef.current !== gen) return
        setError(errorMessageOf(err))
      }
    })()
    return () => {
      // 卸载/依赖变化：作废本代在途响应（含防卸载后 setState）
      genRef.current += 1
    }
  }, [transport, ...deps])

  return { data, error, refresh }
}
