/**
 * ApprovalCard（doc/02 §6.3 / DESIGN §8）：基于 components/ui/confirmation（AI Elements copy-in
 * 改造）组合的审批卡。pending：action/resource（mono）+ reason + [允许一次][总是允许][拒绝]，
 * 拒绝展开 feedback 文本框；resolved：结果徽标 2s 后收起为摘要行（DESIGN §6）。
 * warn 左边框 3px + 浅 warn 背景（DESIGN §8）——左边框只表达语义状态。
 */
import { useEffect, useState } from 'react'
import type { PermissionReply } from '@spark/protocol'
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ui/confirmation'
import { Button } from '@/components/ui/button'

export interface ApprovalCardProps {
  action: string
  resource: string
  /** 多 pattern 清单（§5.7 补强 1，工单 4.7）：复合命令逐段展示；缺省单资源行 */
  patterns?: readonly string[] | undefined
  /** always 固化范围（补强 3）：展示「总是允许」将固化的规则 */
  alwaysPatterns?: readonly string[] | undefined
  reason: string
  detail?: unknown
  status: 'pending' | 'resolved'
  /** resolved 时的实际回复（结果徽标与收起摘要的数据源，来自 permission.resolved 事件） */
  reply?: PermissionReply | undefined
  onReply: (reply: PermissionReply, feedback?: string) => void
}

export function ApprovalCard({
  action,
  resource,
  patterns,
  alwaysPatterns,
  reason,
  detail,
  status,
  reply,
  onReply,
}: ApprovalCardProps) {
  const [feedback, setFeedback] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // resolved → 2s 后收起为摘要行（DESIGN §6/§8）
  useEffect(() => {
    if (status !== 'resolved') return
    const t = setTimeout(() => setCollapsed(true), 2000)
    return () => clearTimeout(t)
  }, [status])

  if (status === 'resolved' && collapsed) {
    return (
      <p className="font-mono text-xs text-muted-foreground/70">
        审批已{reply === 'reject' ? '拒绝' : '允许'}（{reply ?? ''}）
      </p>
    )
  }

  return (
    <Confirmation
      approval={{ status, ...(reply !== undefined ? { reply } : {}) }}
      className="rounded-r-md border-l-[3px] border-l-[var(--spark-warn)] bg-[var(--spark-warn)]/[0.06]"
    >
      <ConfirmationTitle>
        审批：{action}
        <span className="text-muted-foreground"> {resource}</span>
      </ConfirmationTitle>
      <p className="text-xs leading-relaxed text-muted-foreground">{reason}</p>
      {(patterns?.length ?? 0) > 1 && (
        <ul className="flex flex-col gap-0.5">
          {patterns?.map((p) => (
            <li key={p} className="font-mono text-[11px] text-muted-foreground">
              · {p}
            </li>
          ))}
        </ul>
      )}
      {(alwaysPatterns?.length ?? 0) > 1 && (
        <p className="font-mono text-[11px] text-muted-foreground/70">
          「总是允许」将固化以上 {alwaysPatterns?.length} 条模式规则（跨会话生效）
        </p>
      )}
      {detail !== undefined && (
        <pre className="max-h-24 overflow-auto rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-muted-foreground">
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}

      <ConfirmationRequest>
        {rejecting ? (
          <div className="flex items-center gap-2">
            <input
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="拒绝原因（可选，将作为 feedback 记录）"
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onReply('reject', feedback || undefined)
                setFeedback('')
                setRejecting(false)
              }}
            >
              确认拒绝
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              取消
            </Button>
          </div>
        ) : (
          <ConfirmationActions>
            <ConfirmationAction size="sm" onClick={() => onReply('once')}>
              允许一次
            </ConfirmationAction>
            <ConfirmationAction variant="outline" size="sm" onClick={() => onReply('always')}>
              总是允许
            </ConfirmationAction>
            <ConfirmationAction
              variant="outline"
              size="sm"
              className="text-[var(--spark-err)]"
              onClick={() => setRejecting(true)}
            >
              拒绝
            </ConfirmationAction>
          </ConfirmationActions>
        )}
      </ConfirmationRequest>

      <ConfirmationAccepted>
        <p className="font-mono text-xs text-[var(--spark-ok)]">已允许（{reply ?? ''}）</p>
      </ConfirmationAccepted>
      <ConfirmationRejected>
        <p className="font-mono text-xs text-[var(--spark-err)]">已拒绝（reject）</p>
      </ConfirmationRejected>
    </Confirmation>
  )
}
