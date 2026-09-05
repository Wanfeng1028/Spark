/**
 * 设置页异步操作三件套（工单 R-E⑨：busy / opError / try-catch-finally 样板收敛）。
 * run 包装一次异步操作：开工先清旧错、失败 errorMessageOf 入 opError、终态复位 busy；
 * 成功后的后续动作（refresh/清表单）写在 fn 内——与原手写版逐条对应。
 */
import { useCallback, useState } from 'react'
import { errorMessageOf } from '@/lib/error-copy'

export function useAsyncOp(): {
  busy: boolean
  opError: string | null
  setOpError: (msg: string | null) => void
  clearError: () => void
  run: (fn: () => Promise<void>) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)
  const clearError = useCallback(() => setOpError(null), [])
  const run = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setOpError(null)
    try {
      await fn()
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, opError, setOpError, clearError, run }
}
