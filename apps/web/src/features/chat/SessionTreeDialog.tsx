/**
 * 会话树视图（doc/02 §5.8.6，工单 4.5）：GET /api/sessions/:id/tree → 事件节点链 +
 * 各节点分叉出的子会话。节点行 hover 出现「分叉」→ POST /:id/fork（三拒绝码如实
 * 呈现；E_OPEN_TURN 以禁用态前置）；子会话 chip 点击跳转（fork 复制的 durable
 * 事件冷启动回放与普通会话同一路径）。
 * 数据源 transport.getTree（组件不直接 fetch 之外的旁路——DESIGN §9）。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { GitBranch } from 'lucide-react'
import type { EventId, SessionId, TreeNodeDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface SessionTreeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sid: SessionId
  /** turn 进行中：引擎将拒绝分叉（E_OPEN_TURN），入口以禁用态前置 */
  busy: boolean
}

export function SessionTreeDialog({ open, onOpenChange, sid, busy }: SessionTreeDialogProps) {
  const { transport } = useTransport()
  const navigate = useNavigate()
  const [nodes, setNodes] = useState<TreeNodeDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forking, setForking] = useState<EventId | null>(null)
  const [forkError, setForkError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setNodes(null)
    setError(null)
    setForkError(null)
    transport
      .getTree(sid)
      .then((ns) => {
        if (!cancelled) setNodes(ns)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport, sid, open])

  async function fork(fromEventId: EventId) {
    setForking(fromEventId)
    setForkError(null)
    try {
      const dto = await transport.fork(sid, fromEventId)
      onOpenChange(false)
      void navigate(`/session/${dto.id}`)
    } catch (err) {
      // 三拒绝码等错误如实呈现（失败闭合：不跳转、不造会话）
      setForkError(err instanceof Error ? err.message : String(err))
    } finally {
      setForking(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogTitle>会话树</DialogTitle>
        <DialogDescription>从任意事件分叉出新会话；点击子会话跳转。</DialogDescription>
        {error !== null && (
          <p className="font-mono text-xs text-[var(--spark-err)]">{error}</p>
        )}
        {error === null && nodes === null && (
          <p className="py-4 text-center text-xs text-muted-foreground">加载事件树…</p>
        )}
        {nodes !== null && (
          <ul className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
            {nodes.map((n) => (
              <TreeNodeRow
                key={n.id}
                node={n}
                busy={busy}
                forking={forking === n.id}
                disabled={forking !== null}
                onFork={() => void fork(n.id)}
                onOpenChild={(childId) => {
                  onOpenChange(false)
                  void navigate(`/session/${childId}`)
                }}
              />
            ))}
          </ul>
        )}
        {forkError !== null && (
          <p className="font-mono text-xs text-[var(--spark-err)]">{forkError}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface TreeNodeRowProps {
  node: TreeNodeDto
  busy: boolean
  forking: boolean
  disabled: boolean
  onFork: () => void
  onOpenChild: (sessionId: string) => void
}

function TreeNodeRow({ node, busy, forking, disabled, onFork, onOpenChild }: TreeNodeRowProps) {
  return (
    <li className="border-b border-border last:border-b-0">
      <div className="group flex min-h-8 items-center gap-2 px-2.5 py-1">
        <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted-foreground/60">
          #{node.seq}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{node.type}</span>
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {node.label === '' ? <span className="text-muted-foreground/50">—</span> : node.label}
        </span>
        <button
          type="button"
          onClick={onFork}
          disabled={disabled || busy}
          title={busy ? 'turn 进行中，不可分叉' : '从此事件分叉出新会话'}
          className="h-6 shrink-0 rounded-md border border-border px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {forking ? '分叉中…' : '分叉'}
        </button>
      </div>
      {node.forks.length > 0 && (
        <ul className="flex flex-col gap-0.5 pb-1.5 pl-12 pr-2.5">
          {node.forks.map((f) => (
            <li key={f.sessionId}>
              <button
                type="button"
                onClick={() => onOpenChild(f.sessionId)}
                className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <GitBranch className="size-3 shrink-0 text-[var(--spark-accent)]" />
                <span className="min-w-0 truncate">{f.title === '' ? '新会话' : f.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
