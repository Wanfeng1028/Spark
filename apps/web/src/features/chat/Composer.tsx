/**
 * Composer（doc/02 §6.2.2 / §6.3 / DESIGN §8）：底部输入区，三模式——
 * 空闲：Enter 发送 / Shift+Enter 换行 / 附件按钮（v1 只收路径文本）；
 * 进行中：[插话(主)][排队][停止]，Enter = steer（提示「将注入当前轮」），Ctrl+Enter 强制 queue；
 * 审批挂起：输入禁用（焦点交还上方 ApprovalCard）。
 * 提交三态（started/steered/queued）内联提示反馈（DESIGN §5：异步动作必须有反馈）。
 * busy 时 Enter 的默认模式取 settings.defaultDelivery（now 视作 steer——轮已在跑）。
 */
import { useEffect, useRef, useState } from 'react'
import { CircleStop, CornerDownLeft, Paperclip, X } from 'lucide-react'
import type { Delivery, SubmitOutcome } from '@spark/protocol'
import { useSettingsStore } from '@/stores/settings'
import { cn } from '@/lib/utils'

export interface ComposerProps {
  busy: boolean
  /** 审批挂起（activeTurn.waiting）——输入区整体禁用 */
  waiting: boolean
  /** 欢迎页 chip 发送失败时的回填草稿（doc/02 §6.2.1：不丢用户输入） */
  initialDraft?: string
  onSend: (text: string, delivery: Delivery, attachments?: string[]) => Promise<SubmitOutcome>
  onInterrupt: () => void
  /** 手动压缩命令入口（/compact，doc/02 §5.8.5；turn 进行中由引擎拒绝） */
  onCompact: () => Promise<void>
}

const MAX_HEIGHT = 176 // 8 行 × 21px 行高 + padding（§6.2.2「自适应 1-8 行」）

const OUTCOME_TEXT: Record<SubmitOutcome['result'], string> = {
  started: '已开始本轮',
  steered: '已插话注入当前轮',
  queued: '已排队（下一轮执行）',
}

export function Composer({ busy, waiting, initialDraft = '', onSend, onInterrupt, onCompact }: ComposerProps) {
  const defaultDelivery = useSettingsStore((s) => s.defaultDelivery)
  const [draft, setDraft] = useState(initialDraft)
  const [attachments, setAttachments] = useState<string[]>([])
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachInput, setAttachInput] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 自适应高度（1-8 行）
  useEffect(() => {
    const el = taRef.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  useEffect(() => {
    return () => {
      if (hintTimer.current !== null) clearTimeout(hintTimer.current)
    }
  }, [])

  function showHint(text: string): void {
    if (hintTimer.current !== null) clearTimeout(hintTimer.current)
    setHint(text)
    hintTimer.current = setTimeout(() => setHint(null), 2500)
  }

  const hasText = draft.trim().length > 0

  async function send(delivery: Delivery): Promise<void> {
    if (!hasText || waiting) return
    const text = draft.trim()
    if (text === '/compact') {
      // 手动压缩命令（doc/02 §5.8.5）：本地拦截，不进消息通道
      setDraft('')
      setAttachments([])
      setAttachOpen(false)
      try {
        await onCompact()
        showHint('已触发上下文压缩')
      } catch (err) {
        showHint(err instanceof Error ? err.message : String(err))
      }
      return
    }
    setDraft('')
    const outcome = await onSend(text, delivery, attachments.length > 0 ? attachments : undefined)
    setAttachments([])
    setAttachOpen(false)
    showHint(OUTCOME_TEXT[outcome.result])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key !== 'Enter' || e.shiftKey) return // Shift+Enter 换行走默认
    e.preventDefault()
    if (waiting) return
    if (busy) {
      // Ctrl/Cmd+Enter 强制 queue；Enter 走默认模式（settings.defaultDelivery，now 视作 steer）
      const delivery: Delivery =
        (e.ctrlKey || e.metaKey) || defaultDelivery === 'queue' ? 'queue' : 'steer'
      void send(delivery)
    } else {
      void send('now')
    }
  }

  function addAttachment(): void {
    const p = attachInput.trim()
    if (p === '') return
    setAttachments((a) => (a.includes(p) ? a : [...a, p]))
    setAttachInput('')
  }

  const enterHint = busy
    ? defaultDelivery === 'queue'
      ? 'Enter 排队 · Ctrl+Enter 排队 · Shift+Enter 换行'
      : 'Enter 将插话注入当前轮 · Ctrl+Enter 排队 · Shift+Enter 换行'
    : 'Enter 发送 · Shift+Enter 换行'

  return (
    <div className="flex flex-col gap-1.5">
      {/* 附件路径 chips（v1 只收路径文本） */}
      {(attachOpen || attachments.length > 0) && !waiting && (
        <div className="flex flex-col gap-1.5">
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="附件路径">
              {attachments.map((p) => (
                <li
                  key={p}
                  className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 font-mono text-xs text-muted-foreground"
                >
                  <span className="max-w-56 truncate">{p}</span>
                  <button
                    type="button"
                    aria-label={`移除附件 ${p}`}
                    onClick={() => setAttachments((a) => a.filter((x) => x !== p))}
                    className="text-muted-foreground/60 hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {attachOpen && (
            <input
              value={attachInput}
              onChange={(e) => setAttachInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addAttachment()
                }
              }}
              placeholder="输入文件路径后回车添加（v1 只收路径文本）"
              className="h-7 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground/60 focus:border-ring"
            />
          )}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <button
          type="button"
          aria-label="添加附件"
          aria-pressed={attachOpen}
          disabled={waiting}
          onClick={() => setAttachOpen((v) => !v)}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <Paperclip className="size-4" />
        </button>

        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={waiting}
          rows={1}
          placeholder={
            waiting
              ? '等待审批中——请先处理上方审批卡'
              : busy
                ? '插话将注入当前轮…'
                : '发送消息，或输入 /compact 手动压缩上下文'
          }
          className="min-h-8 min-w-0 flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
        />

        {waiting ? null : busy ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void send('steer')}
              disabled={!hasText}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              插话
              <CornerDownLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void send('queue')}
              disabled={!hasText}
              className="flex h-8 items-center rounded-md border border-border px-3 text-[13px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              排队
            </button>
            <button
              type="button"
              onClick={onInterrupt}
              title="停止当前轮"
              className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <CircleStop className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void send('now')}
            disabled={!hasText}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            发送
            <CornerDownLeft className="size-3.5" />
          </button>
        )}
      </div>

      <p
        aria-live="polite"
        className={cn(
          'h-4 text-xs',
          hint !== null ? 'text-[var(--spark-accent)]' : 'text-muted-foreground/60',
        )}
      >
        {hint ?? (waiting ? '等待审批中——请先处理上方审批卡' : enterHint)}
      </p>
    </div>
  )
}
