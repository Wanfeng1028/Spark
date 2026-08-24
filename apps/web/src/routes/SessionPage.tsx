/**
 * 工作台 /session/:sessionId（doc/02 §6.2.2）：ChatView 虚拟化会话流 + 最小输入区。
 * 事件 → store 接线在 TransportProvider（applyEvent 唯一写入口）；本页只消费选择器。
 * Composer 三模式是工单 5，当前为最小输入（Enter 发送 + running 时停止）；
 * error finish 的正式黄条 + 重试也是工单 5，此处只做 store 状态的如实轻提示。
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ids } from '@spark/protocol'
import { CircleStop, CornerDownLeft } from 'lucide-react'
import { useTransport } from '@/transports/context'
import { MOCK_SCENARIOS } from '@/transports/mock'
import type { MockScenario } from '@/transports/mock'
import { ChatView } from '@/features/chat/ChatView'
import { useActiveTurn, useSessionStore } from '@/stores/session'

export function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { transport, mock, scenario, setScenario } = useTransport()
  const [draft, setDraft] = useState('')

  const sid = ids.session(sessionId ?? '')
  const busy = useActiveTurn(sid) !== null
  const topBanner = useSessionStore((s) => s.byId[sid]?.topBanner ?? null)

  async function switchScenario(s: MockScenario) {
    if (s === scenario) return
    setScenario(s)
    const dto = await transport.createSession()
    void navigate(`/session/${dto.id}`, { replace: true })
  }

  async function send() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await transport.sendMessage(text)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {mock && (
        <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-border px-3">
          {MOCK_SCENARIOS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void switchScenario(s)}
              className={
                'h-6 rounded-md px-2 font-mono text-xs ' +
                (s === scenario
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')
              }
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 px-6 py-3">
        <div className="mx-auto h-full max-w-2xl">
          {topBanner !== null && (
            <p className="mb-2 rounded-md border border-[var(--spark-warn)]/40 px-3 py-1.5 font-mono text-xs text-[var(--spark-warn)]">
              本轮以 error 结束（重试是工单 5）
            </p>
          )}
          <ChatView sessionId={sessionId ?? ''} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-6 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
            placeholder="发送消息（mock 回放预录对话）"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-ring"
          />
          {busy && (
            <button
              type="button"
              onClick={() => void transport.interrupt()}
              title="停止回放"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <CircleStop className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void send()}
            disabled={draft.trim().length === 0}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            发送
            <CornerDownLeft className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
