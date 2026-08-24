/**
 * 工作台 /session/:sessionId 最小会话流（工单 1.4 验收 + 阶段验收「发送→流式回复」假对话）。
 * ChatView/MessageItem/ToolCard/Composer 三态等全量组件是阶段二；此处仅做事件流的最小投影——
 * 所有 UI 状态从已收事件派生（AGENTS §2「UI 状态只来自事件流」，无乐观更新）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { PermissionReply, SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { CircleStop, CornerDownLeft } from 'lucide-react'
import { useTransport } from '@/transports/context'
import { MOCK_SCENARIOS } from '@/transports/mock'
import type { MockScenario } from '@/transports/mock'

/** 按词表窄化事件 data 的类型守卫 */
function ofType<T extends SparkEventType>(e: SparkEventEnvelope, t: T): e is SparkEventEnvelope<T> {
  return e.type === t
}

type FlowItem =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'reasoning'; key: string; turnId: string; text: string }
  | { kind: 'text'; key: string; turnId: string; text: string }
  | {
      kind: 'tool'
      key: string
      callId: string
      name: string
      detail: string
      status: 'running' | 'done' | 'error'
      output: string
    }
  | {
      kind: 'approval'
      key: string
      requestId: string
      action: string
      resource: string
      reason: string
      resolved: { reply: PermissionReply; feedback?: string } | null
    }
  | { kind: 'turn'; key: string; turnId: string; finish: string }
  | { kind: 'error'; key: string; scope: string; message: string }

/** 事件 → 会话流 item 的最小投影（阶段二换完整 applyEvent reducer） */
function project(prev: FlowItem[], e: SparkEventEnvelope): FlowItem[] {
  const items = [...prev]

  if (ofType(e, 'user.message')) {
    items.push({ kind: 'user', key: e.id, text: e.data.text })
    return items
  }
  if (ofType(e, 'reasoning.delta') || ofType(e, 'reasoning.ended')) {
    const data = e.data
    const i = items.findIndex((it) => it.kind === 'reasoning' && it.turnId === data.turnId)
    const cur = i >= 0 ? items[i] : undefined
    if (cur !== undefined && cur.kind === 'reasoning') {
      items[i] = { ...cur, text: cur.text + data.text }
    } else {
      items.push({ kind: 'reasoning', key: e.id, turnId: data.turnId, text: data.text })
    }
    return items
  }
  if (ofType(e, 'assistant.delta')) {
    const i = items.findIndex((it) => it.kind === 'text' && it.turnId === e.data.turnId)
    const cur = i >= 0 ? items[i] : undefined
    if (cur !== undefined && cur.kind === 'text') {
      items[i] = { ...cur, text: cur.text + e.data.text }
    } else {
      items.push({ kind: 'text', key: e.id, turnId: e.data.turnId, text: e.data.text })
    }
    return items
  }
  if (ofType(e, 'tool.started')) {
    items.push({
      kind: 'tool',
      key: e.id,
      callId: e.data.callId,
      name: e.data.name,
      detail: describeInput(e.data.input),
      status: 'running',
      output: '',
    })
    return items
  }
  if (ofType(e, 'tool.progress')) {
    const i = items.findIndex((it) => it.kind === 'tool' && it.callId === e.data.callId)
    const cur = i >= 0 ? items[i] : undefined
    if (cur !== undefined && cur.kind === 'tool') {
      items[i] = { ...cur, output: cur.output + e.data.chunk }
    }
    return items
  }
  if (ofType(e, 'tool.completed')) {
    const i = items.findIndex((it) => it.kind === 'tool' && it.callId === e.data.callId)
    const cur = i >= 0 ? items[i] : undefined
    if (cur !== undefined && cur.kind === 'tool') {
      const tail = describeOutput(e.data.output)
      items[i] = { ...cur, status: e.data.isError ? 'error' : 'done', output: tail || cur.output }
    }
    return items
  }
  if (ofType(e, 'permission.asked')) {
    items.push({
      kind: 'approval',
      key: e.id,
      requestId: e.data.requestId,
      action: e.data.action,
      resource: e.data.resource,
      reason: e.data.reason,
      resolved: null,
    })
    return items
  }
  if (ofType(e, 'permission.resolved')) {
    const i = items.findIndex((it) => it.kind === 'approval' && it.requestId === e.data.requestId)
    const cur = i >= 0 ? items[i] : undefined
    if (cur !== undefined && cur.kind === 'approval') {
      items[i] = {
        ...cur,
        resolved: {
          reply: e.data.reply,
          ...(e.data.feedback !== undefined ? { feedback: e.data.feedback } : {}),
        },
      }
    }
    return items
  }
  if (ofType(e, 'turn.started')) {
    items.push({ kind: 'turn', key: e.id, turnId: e.data.turnId, finish: '' })
    return items
  }
  if (ofType(e, 'turn.completed')) {
    const i = items.findIndex((it) => it.kind === 'turn' && it.turnId === e.data.turnId)
    const cur = i >= 0 ? items[i] : undefined
    if (cur !== undefined && cur.kind === 'turn') {
      items[i] = { ...cur, finish: e.data.finish }
    } else {
      items.push({ kind: 'turn', key: e.id, turnId: e.data.turnId, finish: e.data.finish })
    }
    return items
  }
  if (ofType(e, 'error')) {
    items.push({ kind: 'error', key: e.id, scope: e.data.scope, message: e.data.message })
    return items
  }
  return items // session.created / turn.started / assistant.message 等由其余 item 呈现，不单列
}

function describeInput(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const r = input as Record<string, unknown>
  if (typeof r.path === 'string') return r.path
  if (typeof r.command === 'string') return r.command
  return ''
}

function describeOutput(output: unknown): string {
  if (typeof output !== 'object' || output === null) return ''
  const r = output as Record<string, unknown>
  if (typeof r.diff === 'string') return r.diff
  if (typeof r.tail === 'string') return r.tail
  if (typeof r.message === 'string') return r.message
  if (typeof r.code === 'number') return `exit ${r.code}`
  return ''
}

export function SessionPage() {
  const navigate = useNavigate()
  const { transport, mock, scenario, setScenario } = useTransport()
  const [items, setItems] = useState<FlowItem[]>([])
  const [draft, setDraft] = useState('')
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => transport.onEvent((e) => setItems((prev) => project(prev, e))), [transport])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  const running = useMemo(() => {
    const lastTurn = [...items].reverse().find((it) => it.kind === 'turn')
    return lastTurn === undefined ? false : lastTurn.kind === 'turn' && lastTurn.finish === ''
  }, [items])

  async function switchScenario(s: MockScenario) {
    if (s === scenario) return
    setItems([])
    setFeedbackDraft('')
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

  async function reply(requestId: string, answer: PermissionReply) {
    await transport.replyPermission(
      ids.request(requestId),
      answer,
      answer === 'reject' ? feedbackDraft || undefined : undefined,
    )
    setFeedbackDraft('')
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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {items.length === 0 && (
            <p className="pt-16 text-center font-mono text-xs text-muted-foreground/70">
              {mock ? 'mock 场景就绪——输入任意内容发送，回放预录对话' : '等待事件流'}
            </p>
          )}
          {items.map((item) => (
            <FlowRow
              key={item.key}
              item={item}
              feedback={feedbackDraft}
              onFeedback={setFeedbackDraft}
              onReply={(id, r) => void reply(id, r)}
            />
          ))}
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
          {running && (
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

function FlowRow({
  item,
  feedback,
  onFeedback,
  onReply,
}: {
  item: FlowItem
  feedback: string
  onFeedback: (v: string) => void
  onReply: (id: string, reply: PermissionReply) => void
}) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-lg bg-accent px-3 py-1.5 text-[13px] leading-relaxed">
            {item.text}
          </p>
        </div>
      )
    case 'reasoning':
      return (
        <p className="border-l-2 border-border pl-3 text-xs italic leading-relaxed text-muted-foreground">
          {item.text}
        </p>
      )
    case 'text':
      return <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{item.text}</p>
    case 'tool':
      return (
        <div className="rounded-md border border-border">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="font-mono text-xs">
              {item.name}
              {item.detail && <span className="text-muted-foreground"> {item.detail}</span>}
            </span>
            <span
              className={
                'font-mono text-xs ' +
                (item.status === 'running'
                  ? 'text-muted-foreground'
                  : item.status === 'error'
                    ? 'text-destructive'
                    : 'text-muted-foreground')
              }
            >
              {item.status === 'running' ? '运行中…' : item.status === 'error' ? '失败' : '完成'}
            </span>
          </div>
          {item.output && (
            <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
              {item.output}
            </pre>
          )}
        </div>
      )
    case 'approval':
      return (
        <ApprovalRow item={item} feedback={feedback} onFeedback={onFeedback} onReply={onReply} />
      )
    case 'turn':
      return (
        <p className="font-mono text-xs text-muted-foreground/70">
          {item.finish === '' ? 'turn 进行中…' : `—— turn ${item.finish}`}
        </p>
      )
    case 'error':
      return (
        <p className="rounded-md border border-destructive/40 px-3 py-1.5 font-mono text-xs text-destructive">
          [{item.scope}] {item.message}
        </p>
      )
  }
}

function ApprovalRow({
  item,
  feedback,
  onFeedback,
  onReply,
}: {
  item: FlowItem & { kind: 'approval' }
  feedback: string
  onFeedback: (v: string) => void
  onReply: (id: string, reply: PermissionReply) => void
}) {
  if (item.resolved) {
    return (
      <p className="font-mono text-xs text-muted-foreground/70">
        审批已{item.resolved.reply === 'reject' ? '拒绝' : '通过'}（{item.resolved.reply}）
        {item.resolved.feedback ? `：${item.resolved.feedback}` : ''}
      </p>
    )
  }
  return (
    <div className="rounded-md border border-ring/50">
      <div className="px-3 py-2">
        <p className="font-mono text-xs">
          审批：{item.action}
          <span className="text-muted-foreground"> {item.resource}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <input
          value={feedback}
          onChange={(e) => onFeedback(e.target.value)}
          placeholder="拒绝时的补充说明（可选）"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
        <button
          type="button"
          onClick={() => onReply(item.requestId, 'once')}
          className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground"
        >
          允许一次
        </button>
        <button
          type="button"
          onClick={() => onReply(item.requestId, 'always')}
          className="h-7 rounded-md border border-border px-2.5 text-xs hover:bg-accent"
        >
          总是允许
        </button>
        <button
          type="button"
          onClick={() => onReply(item.requestId, 'reject')}
          className="h-7 rounded-md border border-border px-2.5 text-xs text-destructive hover:bg-accent"
        >
          拒绝
        </button>
      </div>
    </div>
  )
}
