/**
 * 记忆管理页（工单 7.5 / H05 / ADR D25）：GET /api/memories 列表 + 逐条删除。
 * 保存路径 = 会话中模型调 memory.save 工具（审批卡可见内容）；页面只做查看与删除。
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { SettingGroupCard, SettingRow } from './SettingRow'

export function MemorySettingsPage() {
  const { transport } = useTransport()
  const { data: memories, error: loadError, refresh } = useTransportQuery((t) => t.listMemories())
  const [opError, setOpError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  // 加载失败与删除失败共用同一错误条（原单 error 态语义保持）
  const error = loadError ?? opError

  async function remove(id: number): Promise<void> {
    setDeleting(id)
    try {
      await transport.removeMemory(id)
      await refresh()
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setDeleting(null)
    }
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (memories === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  if (memories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        暂无长期记忆——会话中让模型用 memory.save 保存值得跨会话记住的事实。
      </p>
    )
  }

  return (
    <SettingGroupCard>
      {memories.map((m) => (
        <SettingRow
          key={m.id}
          title={m.content}
          description={new Date(m.createdAt).toLocaleString()}
        >
          <button
            type="button"
            onClick={() => void remove(m.id)}
            disabled={deleting === m.id}
            aria-label={`删除记忆 ${m.id}`}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </SettingRow>
      ))}
    </SettingGroupCard>
  )
}
