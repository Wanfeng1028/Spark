/**
 * ArenaCard（工单 16.8 / ADR D42）：会话页竞答卡片——轮询 getArena 快照，
 * running 显示各 contender 状态（模型/用量/时长），done 显示 diff 统计与
 * 胜者选择（应用走整体一次审批；取消中断并清理 worktree）。
 * 无竞答回 null 不渲染（禁假状态）；记录仅内存——重启后自然消失。
 */
import { useEffect, useState } from 'react'
import type { ArenaStatusDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ids } from '@spark/protocol'
import type { SessionId } from '@spark/protocol'

const POLL_MS = 2000

export function ArenaCard({ sessionId }: { sessionId: SessionId }) {
  const { transport } = useTransport()
  const [arena, setArena] = useState<ArenaStatusDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    const poll = (): void => {
      transport
        .getArena(sessionId)
        .then((snap) => {
          if (!disposed) setArena(snap)
        })
        .catch(() => {
          // 轮询失败静默保留上次快照（连接态由全局状态机呈现）
        })
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [sessionId, transport])

  if (arena === null) return null

  async function apply(contenderSessionId: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await transport.applyArenaWinner(sessionId, ids.session(contenderSessionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function cancel(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await transport.cancelArena(sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card variant="info" className="mx-auto w-full max-w-[768px]">
      <CardContent className="flex flex-col gap-2">
        <CardTitle>多模型竞答（{arena.status === 'running' ? '进行中' : arena.status === 'done' ? '已完成' : '已取消'}）</CardTitle>
        <p className="text-xs text-muted-foreground">{arena.prompt}</p>
        <div className="flex flex-col divide-y divide-border">
          {arena.contenders.map((c) => (
            <div key={c.sessionId} className="flex items-center justify-between gap-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-mono">{c.model}</p>
                <p className="text-muted-foreground">
                  {c.status === 'running' ? '运行中…' : `${(c.usage.inputTokens + c.usage.outputTokens).toLocaleString()} tokens · ${Math.round((c.durationMs ?? 0) / 1000)}s`}
                  {c.diffStat !== null && ` · ${c.diffStat.files} 文件（+${c.diffStat.additions} −${c.diffStat.deletions}）`}
                  {c.status === 'error' && ' · 失败'}
                  {arena.winner === c.sessionId && ' · 已应用'}
                </p>
              </div>
              {arena.status === 'done' && c.status === 'done' && arena.winner === null && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void apply(c.sessionId)}>
                  应用此版本
                </Button>
              )}
            </div>
          ))}
        </div>
        {arena.applied !== null && (
          <p className="text-xs text-muted-foreground">
            已应用 {arena.applied.files.length} 个文件
            {arena.applied.skippedDeletions.length > 0 &&
              `；跳过删除类改动 ${arena.applied.skippedDeletions.length} 个（${arena.applied.skippedDeletions.join('、')}）——请手动处理`}
          </p>
        )}
        {error !== null && <p className="text-xs text-destructive">{error}</p>}
        {arena.status === 'running' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void cancel()} className="self-start">
            取消竞答
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
