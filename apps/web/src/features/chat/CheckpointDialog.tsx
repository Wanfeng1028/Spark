/**
 * 检查点视图（doc/02 §5.8.7 / 工单 4.6）：GET /:id/checkpoints → turn 边界快照
 * 列表（旧→新）；行内「回滚」→ POST /:id/checkpoints/:cid/rollback——两域复位
 * （工作区 + 会话文件）。回滚后 seq 回退：全量重放（resetSlice + 批量 apply，
 * 与冷启动/断线重连同一路径）；错误如实呈现（失败闭合，不造状态）。
 */
import { useEffect, useState } from 'react'
import type { CheckpointDto, CheckpointId, SessionId } from '@spark/protocol'
import { useTransport, replaySessionEvents } from '@/transports/context'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatRelative } from '@/lib/time'

export interface CheckpointDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sid: SessionId
  /** turn 进行中：引擎将拒绝回滚（E_TURN_ACTIVE），回滚按钮以禁用态前置 */
  busy: boolean
}

export function CheckpointDialog({ open, onOpenChange, sid, busy }: CheckpointDialogProps) {
  const { transport } = useTransport()
  const [rows, setRows] = useState<CheckpointDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rolling, setRolling] = useState<CheckpointId | null>(null)
  const [rollError, setRollError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRows(null)
    setError(null)
    setRollError(null)
    transport
      .listCheckpoints(sid)
      .then((rs) => {
        if (!cancelled) setRows(rs)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport, sid, open])

  async function rollback(cid: CheckpointId) {
    setRolling(cid)
    setRollError(null)
    try {
      await transport.rollbackCheckpoint(sid, cid)
      // seq 已回退：全量重放重建 slice（旧水位去重规则会挡住截断后的低 seq 事件）
      await replaySessionEvents(transport, sid)
      onOpenChange(false)
    } catch (err) {
      // E_NOT_FOUND/E_TURN_ACTIVE/E_CHECKPOINT_ROLLBACK 等如实呈现（失败闭合）
      setRollError(err instanceof Error ? err.message : String(err))
    } finally {
      setRolling(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogTitle>检查点</DialogTitle>
        <DialogDescription>
          每个 turn 边界自动快照（工作区 + 会话文件）；回滚将复位到所选时点。
        </DialogDescription>
        {error !== null && (
          <p className="font-mono text-xs text-[var(--spark-err)]">{error}</p>
        )}
        {error === null && rows === null && (
          <p className="py-4 text-center text-xs text-muted-foreground">加载检查点…</p>
        )}
        {rows !== null && rows.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            尚无检查点（完成一轮对话后生成）
          </p>
        )}
        {rows !== null && rows.length > 0 && (
          <ul className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
            {rows.map((c) => (
              <li key={c.checkpointId} className="group border-b border-border last:border-b-0">
                <div className="flex min-h-8 items-center gap-2 px-2.5 py-1">
                  <span className="w-[88px] shrink-0 font-mono text-[11px] text-muted-foreground/70">
                    ckpt {c.checkpointId.slice(4, 12)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {formatRelative(c.createdAt)} · {c.files.length} 个文件变更
                  </span>
                  <button
                    type="button"
                    onClick={() => void rollback(c.checkpointId)}
                    disabled={rolling !== null || busy}
                    title={busy ? 'turn 进行中，不可回滚' : '复位到该快照（工作区与会话文件）'}
                    className="h-6 shrink-0 rounded-md border border-border px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {rolling === c.checkpointId ? '回滚中…' : '回滚'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {rollError !== null && (
          <p className="font-mono text-xs text-[var(--spark-err)]">{rollError}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
