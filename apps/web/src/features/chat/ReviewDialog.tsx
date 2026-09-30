/**
 * 审查模式（工单 19.35 / V2-08）：多文件 diff 聚合 + 批量放行。
 * 左栏文件清单（状态字母 + 行数统计）、右栏选中文件 unified patch（Codex Diff/Logs
 * 双栏形态）；顶栏批量动作——「全部放行」（replyAllPermissions 'once'，不固化规则）
 * 与「全部拒绝」（'reject'，feedback 单条回喂）。数据源 GET /api/sessions/:id/review
 * （checkpoint shadow git 只读聚合）；挂起审批清单来自事件流派生的 items（真源是
 * 事件流，批量结清后各 ApprovalCard 经 permission.resolved 自行翻牌）。
 * checkpoint 未启用 → 404 如实呈现（diff 区报错，批量审批区不受影响）。
 */
import { useEffect, useState } from 'react'
import type { ReviewDto, SessionId } from '@spark/protocol'
import type { UiItem } from '@/stores/session'
import { useTransport } from '@/transports/context'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessageOf } from '@/lib/error-copy'

export type PendingApproval = Extract<UiItem, { kind: 'approval' }>

export interface ReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sid: SessionId
  /** 挂起审批（SessionSurface 从 items 派生；批量按钮的计数与可用性数据源） */
  pending: PendingApproval[]
}

/** 状态字母与色：语义色只用于 +/- 行数（其余黑白中性，DESIGN §12） */
const STATUS_LETTER: Record<ReviewDto['files'][number]['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
}

export function ReviewDialog({ open, onOpenChange, sid, pending }: ReviewDialogProps) {
  const { transport } = useTransport()
  const [review, setReview] = useState<ReviewDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [acting, setActing] = useState<'allow' | 'reject' | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setReview(null)
    setError(null)
    setSelected(null)
    setNote(null)
    setOpError(null)
    setRejecting(false)
    setFeedback('')
    transport
      .getSessionReview(sid)
      .then((r) => {
        if (cancelled) return
        setReview(r)
        setSelected(r.files[0]?.path ?? null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport, sid, open])

  async function replyAll(reply: 'once' | 'reject') {
    setActing(reply === 'once' ? 'allow' : 'reject')
    setOpError(null)
    setNote(null)
    try {
      const r = await transport.replyAllPermissions(sid, reply, reply === 'reject' ? feedback || undefined : undefined)
      setNote(r.resolved === 0 ? '无挂起审批' : reply === 'once' ? `已放行 ${r.resolved} 项审批` : `已拒绝 ${r.resolved} 项审批`)
      setRejecting(false)
      setFeedback('')
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setActing(null)
    }
  }

  const patchOf = (path: string): ReviewDto['patches'][number] | undefined =>
    review?.patches.find((p) => p.path === path)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px]">
        <DialogTitle>审查</DialogTitle>
        <DialogDescription>
          工作区相对最近一次快照的变更聚合（只读）；挂起审批可在此批量放行或拒绝。
        </DialogDescription>

        {/* 批量动作条（审批域，不依赖 diff 可用性） */}
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            挂起审批 {pending.length} 项
          </span>
          {rejecting ? (
            <>
              <Input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="拒绝原因（可选，回喂给模型）"
                className="h-7 min-w-0 flex-1 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={acting !== null || pending.length === 0}
                onClick={() => void replyAll('reject')}
              >
                {acting === 'reject' ? '拒绝中…' : '确认全部拒绝'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                取消
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={acting !== null || pending.length === 0}
                title="逐条放行一次（不固化任何规则）"
                onClick={() => void replyAll('once')}
              >
                {acting === 'allow' ? '放行中…' : '全部放行'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-[var(--spark-err)]"
                disabled={acting !== null || pending.length === 0}
                onClick={() => setRejecting(true)}
              >
                全部拒绝
              </Button>
            </>
          )}
          {note !== null && <span className="text-xs text-[var(--spark-ok)]">{note}</span>}
        </div>
        {opError !== null && (
          <p role="alert" className="font-mono text-xs text-[var(--spark-err)]">
            {opError}
          </p>
        )}

        {/* 差聚合区（checkpoint 未启用/出错时如实报错，不影响上方审批域） */}
        {error !== null && <p className="font-mono text-xs text-[var(--spark-err)]">{error}</p>}
        {error === null && review !== null && (
          <>
            <p className="font-mono text-[11px] text-muted-foreground/70">
              {review.baseCheckpointId === null
                ? '基准：无快照（仅聚合未跟踪新增文件）'
                : `基准：快照 ${review.baseCheckpointId.slice(4, 12)}`}
              {review.truncated ? ' · 差异文本超预算已截断（清单与统计完整）' : ''}
            </p>
            {review.files.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">工作区无变更</p>
            ) : (
              <div className="flex h-[52vh] min-h-0 overflow-hidden rounded-xl border border-border">
                <ul className="w-56 shrink-0 overflow-y-auto border-r border-border">
                  {review.files.map((f) => {
                    const active = f.path === selected
                    const patch = patchOf(f.path)
                    return (
                      <li key={f.path}>
                        <button
                          type="button"
                          onClick={() => setSelected(f.path)}
                          className={`flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-accent hover:text-accent-foreground ${active ? 'bg-accent text-accent-foreground' : ''}`}
                        >
                          <span className="w-2 shrink-0 font-mono text-[11px] text-muted-foreground/70">
                            {STATUS_LETTER[f.status]}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={f.path}>
                            {f.path}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-[var(--spark-ok)]">
                            +{f.additions}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-[var(--spark-err)]">
                            -{f.deletions}
                          </span>
                          {patch === undefined && !f.binary && (
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50" title="差异文本超预算">
                              …
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <div className="min-w-0 flex-1 overflow-auto bg-background">
                  <SelectedPatch review={review} path={selected} />
                </div>
              </div>
            )}
          </>
        )}
        {error === null && review === null && (
          <p className="py-6 text-center text-xs text-muted-foreground">加载审查聚合…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** 右栏：选中文件的差异文本（二进制/超预算/未选中各给一行如实说明，不造假内容） */
function SelectedPatch({ review, path }: { review: ReviewDto; path: string | null }) {
  if (path === null) {
    return <p className="p-3 text-xs text-muted-foreground">选择左侧文件查看差异</p>
  }
  const file = review.files.find((f) => f.path === path)
  if (file === undefined) {
    return <p className="p-3 text-xs text-muted-foreground">该文件已不在当前变更集中</p>
  }
  if (file.binary) {
    return <p className="p-3 font-mono text-xs text-muted-foreground">（二进制文件，无文本差异）</p>
  }
  const patch = review.patches.find((p) => p.path === path)
  if (patch === undefined) {
    return <p className="p-3 text-xs text-muted-foreground">差异文本超预算截断（统计仍完整）</p>
  }
  return (
    <pre className="whitespace-pre-wrap break-all p-2 font-mono text-[11px] leading-relaxed text-foreground">
      {patch.patch}
    </pre>
  )
}
