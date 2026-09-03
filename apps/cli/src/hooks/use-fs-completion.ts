/**
 * @ 文件路径补全数据装载（工单 10.53）：按 (sessionId, query) 拉取会话 cwd 目录列举。
 * query 每次变化重新拉取（本地 readdir 快，不去抖）；ignore 标志丢弃过期响应（乱序保护）。
 * 失败/无会话如实空清单（禁假状态——补全面板不报错打断输入，越界由服务端硬边界收敛为空）。
 */
import { useEffect, useState } from 'react'
import type { FsEntryDto, HttpTransport, SessionId } from '@spark/protocol'

export function useFsCompletion(
  transport: HttpTransport,
  sessionId: SessionId | null,
  query: string | null,
): FsEntryDto[] {
  const [entries, setEntries] = useState<FsEntryDto[]>([])
  useEffect(() => {
    if (sessionId === null || query === null) {
      setEntries([])
      return
    }
    let ignore = false
    transport
      .listFs(sessionId, query)
      .then((r) => {
        if (!ignore) setEntries(r.entries)
      })
      .catch(() => {
        if (!ignore) setEntries([])
      })
    return () => {
      ignore = true
    }
  }, [transport, sessionId, query])
  return entries
}
