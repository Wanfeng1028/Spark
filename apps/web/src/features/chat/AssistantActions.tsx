/**
 * AssistantActions（工单 10.4①，§13.H:519 扩展版）：assistant 尾操作行——
 * 复制 + 👍 + 👎 + hairline + "内容由 AI 生成" + 时间戳 + fork 到分支会话。
 * 👍👎 置灰：存储依赖未落地（§8.7 V2-25），先给形态不给假交互；
 * fork 数据源=引擎既有 fork 端点（工单 4.5），POST 成功导航新会话，
 * 三拒绝码等人话呈现（失败闭合：不导航不造会话）；线性图标禁 emoji（§12）。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Copy, GitFork, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { EventId, SessionId } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { useCopy } from '@/hooks/useCopy'
import { cn } from '@/lib/utils'

export interface AssistantActionsProps {
  sid: SessionId
  /** 本条 assistant 项的 eventId——fork 边界 */
  eventId: EventId
  /** 定稿信封时间（时间戳呈现） */
  time: number
  /** 复制用纯文本（text 块拼接） */
  copyText: string
}

const ICON_BTN =
  'flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground'

export function AssistantActions({ sid, eventId, time, copyText }: AssistantActionsProps) {
  const { transport } = useTransport()
  const navigate = useNavigate()
  const { copied, copy } = useCopy()
  const [forking, setForking] = useState(false)
  const [forkError, setForkError] = useState<string | null>(null)

  /** fork 到分支会话：引擎既有端点（工单 4.5）——成功后导航；失败如实呈现不跳转 */
  async function fork() {
    setForking(true)
    setForkError(null)
    try {
      const dto = await transport.fork(sid, eventId)
      void navigate(`/session/${dto.id}`)
    } catch (err) {
      setForkError(errorMessageOf(err))
    } finally {
      setForking(false)
    }
  }

  const when = new Date(time)
  const stamp = when.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const full = when.toLocaleString('zh-CN')

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <button
        type="button"
        onClick={() => void copy(copyText)}
        title="复制正文"
        aria-label="复制正文"
        className={ICON_BTN}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
      <button
        type="button"
        disabled
        title="反馈（规划中，V2-25）"
        aria-label="有帮助（规划中）"
        className={cn(ICON_BTN, 'cursor-not-allowed opacity-40')}
      >
        <ThumbsUp className="size-3" />
      </button>
      <button
        type="button"
        disabled
        title="反馈（规划中，V2-25）"
        aria-label="无帮助（规划中）"
        className={cn(ICON_BTN, 'cursor-not-allowed opacity-40')}
      >
        <ThumbsDown className="size-3" />
      </button>
      <span aria-hidden className="mx-1 h-3 border-l border-border" />
      <span className="text-[11px] text-muted-foreground/60">内容由 AI 生成</span>
      <span className="text-[11px] text-muted-foreground/60" title={full}>
        {stamp}
      </span>
      <button
        type="button"
        onClick={() => void fork()}
        disabled={forking}
        title="fork 到分支会话（从本条消息起）"
        aria-label="fork 到分支会话"
        className={cn(ICON_BTN, 'ml-auto', forking && 'opacity-40')}
      >
        <GitFork className="size-3" />
      </button>
      {forkError !== null && (
        <span className="font-mono text-[11px] text-[var(--spark-err)]">{forkError}</span>
      )}
    </div>
  )
}
