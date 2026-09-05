/**
 * useTransportQuery（工单 R-E①：settings 族 12 处逐字加载 effect 与
 * useSessionList/useCommands 同构收敛）——transport 只读查询的三态 hook：
 * data（null=加载中）/ error / refresh。cancelled 旗标防卸载后 setState；
 * 失败闭合：错误如实呈现（不吞、不用缓存冒充新数据）。
 */
import { useCallback, useEffect, useState } from 'react'
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

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setData(await fetcher(transport))
    } catch (err) {
      setError(errorMessageOf(err))
    }
  }, [transport, ...deps])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await fetcher(transport)
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) setError(errorMessageOf(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, ...deps])

  return { data, error, refresh }
}
