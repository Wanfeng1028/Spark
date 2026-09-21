/**
 * AssistantActions（工单 10.4①，§13.H:519 扩展版）：assistant 尾操作行——
 * 复制 + 👍 + 👎 + hairline + "内容由 AI 生成" + 时间戳 + fork 到分支会话。
 * 👍👎 真接线（阶段十九 19.19 / 消解 V2-25）：POST /api/feedback（同 event 重复点是
 * 撤回——再点一次取消；备注经内联输入收集）。反馈不进事件流（用户侧评价非会话状态）。
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
  'flex size-7 items-center justify-center rounded-full text-muted-foreground/70 transition-opacity hover:bg-accent hover:text-accent-foreground'

export function AssistantActions({ sid, eventId, time, copyText }: AssistantActionsProps) {
  const { transport } = useTransport()
  const navigate = useNavigate()
  const { copied, copy } = useCopy()
  const [forking, setForking] = useState(false)
  const [forkError, setForkError] = useState<string | null>(null)
  // 反馈态（19.19）：当前票型（null = 未反馈）；busy 防连点
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')

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

  /** 反馈（19.19）：同票再点 = 撤回；异票 = 改票（后端按 vote 分行，互不覆盖） */
  async function feedback(next: 'up' | 'down'): Promise<void> {
    setFeedbackBusy(true)
    try {
      if (vote === next) {
        await transport.withdrawFeedback(sid, eventId, next)
        setVote(null)
        setNoteOpen(false)
      } else {
        await transport.submitFeedback({ sessionId: sid, eventId, vote: next })
        setVote(next)
      }
    } catch {
      // 失败保持原态（不假装已反馈——禁假状态）
    } finally {
      setFeedbackBusy(false)
    }
  }

  /** 存备注（19.19）：同票幂等更新，不堆行 */
  async function saveNote(): Promise<void> {
    if (vote === null) return
    setFeedbackBusy(true)
    try {
      await transport.submitFeedback({ sessionId: sid, eventId, vote, note })
      setNoteOpen(false)
    } catch {
      // 失败不关编辑态（用户可重试）
    } finally {
      setFeedbackBusy(false)
    }
  }

  const when = new Date(time)
  const stamp = when.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const full = when.toLocaleString('zh-CN')

  return (
    // §13.L L.6 修订 L.3：完成态操作行**常显**（复制/👍/👎 不再藏 hover——DSH 二批）
    <div className="mt-1.5 flex items-center gap-1">
      <button
        type="button"
        onClick={() => void copy(copyText)}
        title="复制正文"
        aria-label="复制正文"
        className={ICON_BTN}
      >
        {copied ? <Check className="size-[15px]" /> : <Copy className="size-[15px]" />}
      </button>
      <button
        type="button"
        disabled={feedbackBusy}
        onClick={() => void feedback('up')}
        title={vote === 'up' ? '已点赞（再点取消）' : '有帮助'}
        aria-label="有帮助"
        aria-pressed={vote === 'up'}
        className={cn(ICON_BTN, vote === 'up' && 'text-foreground', feedbackBusy && 'opacity-40')}
      >
        <ThumbsUp className="size-[15px]" />
      </button>
      <button
        type="button"
        disabled={feedbackBusy}
        onClick={() => void feedback('down')}
        title={vote === 'down' ? '已点踩（再点取消）' : '无帮助'}
        aria-label="无帮助"
        aria-pressed={vote === 'down'}
        className={cn(ICON_BTN, vote === 'down' && 'text-foreground', feedbackBusy && 'opacity-40')}
      >
        <ThumbsDown className="size-[15px]" />
      </button>
      {vote !== null && !noteOpen && (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          title="补充备注"
          aria-label="补充备注"
          className="text-[11px] text-muted-foreground/70 hover:text-foreground"
        >
          备注
        </button>
      )}
      {noteOpen && vote !== null && (
        <span className="flex items-center gap-1">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="补充备注（可空）"
            aria-label="反馈备注"
            maxLength={2000}
            className="h-6 w-40 rounded-md border border-input bg-transparent px-2 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => void saveNote()}
            disabled={feedbackBusy}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            存
          </button>
          <button
            type="button"
            onClick={() => setNoteOpen(false)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            取消
          </button>
        </span>
      )}
      <span aria-hidden className="mx-1 h-3 border-l border-border" />
      <span className="max-[479px]:hidden text-[11px] text-muted-foreground/60">内容由 AI 生成</span>
      <span className="max-[479px]:hidden text-[11px] text-muted-foreground/60" title={full}>
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
        <GitFork className="size-[15px]" />
      </button>
      {forkError !== null && (
        <span className="font-mono text-[11px] text-[var(--spark-err)]">{forkError}</span>
      )}
    </div>
  )
}
