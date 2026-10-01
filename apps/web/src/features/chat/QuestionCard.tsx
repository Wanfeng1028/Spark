/**
 * 结构化提问卡（CK-6 批 1）：question.asked 落卡——逐问渲染封闭选项（单选点选 /
 * 多选 toggle）+ 可选备注；提交经 transport.replyQuestion 回引擎（挂起表裁决）。
 * resolved 后显示所选摘要；aborted（超时/中断 fail-closed）如实标注"未获回答"。
 * 视觉沿用审批卡语义位（warn 左边框表达"等待用户"），组件本体黑白中性。
 */
import { useState } from 'react'
import type { UiItem } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { cn } from '@/lib/utils'

export type QuestionItem = Extract<UiItem, { kind: 'question' }>

export function QuestionCard({ item }: { item: QuestionItem }) {
  const { transport } = useTransport()
  const [selected, setSelected] = useState<string[][]>(() =>
    item.questions.map(() => []),
  )
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)
  const resolved = item.status !== 'pending'

  function toggle(qi: number, label: string, multi: boolean): void {
    if (resolved || pending) return
    setSelected((prev) =>
      prev.map((arr, i) => {
        if (i !== qi) return arr
        if (multi) {
          return arr.includes(label) ? arr.filter((l) => l !== label) : [...arr, label]
        }
        return arr.includes(label) ? [] : [label]
      }),
    )
  }

  async function submit(): Promise<void> {
    setPending(true)
    setOpError(null)
    try {
      await transport.replyQuestion(
        item.requestId,
        selected.map((arr, i) => ({
          selected: arr,
          ...(note !== '' && i === 0 ? { note } : {}),
        })),
      )
    } catch (err) {
      setPending(false)
      setOpError(errorMessageOf(err))
    }
  }

  const complete =
    resolved && !item.aborted && item.answers?.every((a) => a.selected.length > 0) === true

  if (resolved) {
    return (
      <div className="rounded-r-md border-l-[3px] border-l-border bg-muted/30 px-3 py-2">
        <p className="font-mono text-xs text-muted-foreground/70">
          {item.aborted === true
            ? '提问超时/中断——未获用户回答（fail-closed）'
            : complete === true
              ? '提问已回答'
              : '提问已结清（未作答）'}
        </p>
        {item.answers !== undefined &&
          item.questions.map((q, qi) => {
            const a = item.answers?.[qi]
            if (a === undefined || a.selected.length === 0) return null
            return (
              <p key={qi} className="mt-0.5 text-xs text-muted-foreground">
                {qi + 1}. {q.question} → <span className="font-mono">{a.selected.join('、')}</span>
                {a.note !== undefined && a.note !== '' && `（备注：${a.note}）`}
              </p>
            )
          })}
      </div>
    )
  }

  const allAnswered = selected.every((arr, i) => arr.length > 0 || (item.questions[i]?.multiSelect === true && arr.length > 0))
  return (
    <div className="rounded-r-md border-l-[3px] border-l-[var(--spark-warn)] bg-[var(--spark-warn)]/[0.06] px-3 py-2">
      <p className="text-[13px] font-semibold">需要你的选择</p>
      {item.questions.map((q, qi) => (
        <div key={qi} className="mt-2">
          <p className="text-xs leading-relaxed">
            {qi + 1}. {q.question}
            {q.multiSelect === true && (
              <span className="text-muted-foreground">（可多选）</span>
            )}
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {q.options.map((o) => {
              const active = selected[qi]?.includes(o.label) === true
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => toggle(qi, o.label, q.multiSelect === true)}
                  className={cn(
                    'rounded-lg border border-border px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground',
                    active && 'border-foreground bg-accent text-accent-foreground',
                  )}
                >
                  <span className="font-medium">{o.label}</span>
                  {o.description !== undefined && (
                    <span className="ml-1 text-muted-foreground">{o.description}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="mt-2 flex items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注（可选）"
          className="h-7 min-w-0 flex-1 text-xs"
        />
        <Button
          size="sm"
          disabled={pending || !allAnswered}
          title={allAnswered ? undefined : '每问至少选择一项'}
          onClick={() => void submit()}
        >
          {pending ? '提交中…' : '提交回答'}
        </Button>
      </div>
      {opError !== null && (
        <p role="alert" className="mt-1 font-mono text-xs text-[var(--spark-err)]">
          {opError}
        </p>
      )}
    </div>
  )
}
