/**
 * 会话链路视图（工单 13.7 / V2-11 / doc/07 H27）：GET /api/sessions/:id/trace。
 *
 * 形态与 SessionTreeDialog 同族（会话页无 tab 容器，既有树/检查点都是浮层——不为一页新建
 * tab 骨架，口径差异已在 doc/08 §13.7 备案）：
 * - 回合时间线：纯 div 横条（宽度按回合时长归一），条内按 startedAt/durationMs 画出工具段；
 * - 工具行：时长条 + 失败/重试/护栏告警标记；挂起过审批的调用给「审计」跳转
 *   （/settings/audit?tool=&lt;name&gt;，与工单 7.12 审计流互链）；
 * - 步（= 一次模型往返）：时长与 token/成本；**无 usage 显示「—」不以 0 充数**；
 * - 错误与告警走既有语义色（--spark-err / --spark-warn），不引图表库、不加装饰。
 * 数据只从 durable 事件推导（引擎侧 buildTrace），因此这里看到的就是事件流本身。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { SessionId, TraceDto, TraceTurnDto } from '@spark/protocol'
import { fmtTokens } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { errorMessageOf } from '@/lib/error-copy'

export interface TraceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sid: SessionId
}

/** 时长文案：ms 原样 / 秒一位小数 / 分秒（本地小函数，协议面没有时长格式化器） */
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return `${min}m${sec}s`
}

/** finish 的中文态（与 TurnFinish 词表一一对应；null = 未闭合） */
function finishText(finish: TraceTurnDto['finish']): string {
  if (finish === null) return '未闭合'
  if (finish === 'stop') return '正常结束'
  if (finish === 'aborted') return '已中断'
  if (finish === 'error') return '出错'
  return finish
}

export function TraceDialog({ open, onOpenChange, sid }: TraceDialogProps) {
  const { transport } = useTransport()
  const navigate = useNavigate()
  const [trace, setTrace] = useState<TraceDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setTrace(null)
    setError(null)
    transport
      .getSessionTrace(sid)
      .then((t) => {
        if (!cancelled) setTrace(t)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport, sid, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogTitle>会话链路</DialogTitle>
        <DialogDescription>
          回合级链路聚合——时长、步与 token、工具调用与失败重试、护栏告警，全部从会话事件流推导。
        </DialogDescription>
        {error !== null && <p className="font-mono text-xs text-[var(--spark-err)]">{error}</p>}
        {error === null && trace === null && (
          <p className="py-4 text-center text-xs text-muted-foreground">聚合链路…</p>
        )}
        {trace !== null && (
          <div className="max-h-[64vh] overflow-y-auto">
            <TraceView
              trace={trace}
              onAudit={(tool) => {
                onOpenChange(false)
                void navigate(`/settings/audit?tool=${encodeURIComponent(tool)}`)
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * 链路正文（与浮层壳分离）：组件测试直接吃这份数据，不经 Radix portal。
 * onAudit = 点「审计」时的跳转回调（带工具名去审计页过滤，工单 7.12 互链）。
 */
export function TraceView({
  trace,
  onAudit,
}: {
  trace: TraceDto
  onAudit: (tool: string) => void
}): React.JSX.Element {
  const maxTurnMs = trace.turns.reduce((m, t) => Math.max(m, t.durationMs), 0)
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs text-muted-foreground">
        {trace.totals.turns} 回合 · {trace.totals.steps} 步 · {trace.totals.toolCalls} 次工具调用
        {trace.totals.toolErrors > 0 && `（${trace.totals.toolErrors} 次失败）`} · 总时长{' '}
        {fmtMs(trace.totals.durationMs)} · {fmtTokens(trace.totals.usage.inputTokens)} in /{' '}
        {fmtTokens(trace.totals.usage.outputTokens)} out · ${trace.totals.usage.costUsd.toFixed(4)}
      </p>
      {trace.turns.length === 0 && (
        <p className="text-xs text-muted-foreground">还没有回合——发一条消息后再看链路。</p>
      )}
      {trace.turns.map((t, i) => (
        <TurnBlock key={t.turnId} turn={t} index={i + 1} scale={maxTurnMs} onAudit={onAudit} />
      ))}
      {trace.looseErrors.length > 0 && (
        <section className="flex flex-col gap-1 rounded-md border border-border px-2.5 py-2">
          <p className="text-xs text-muted-foreground">会话级错误（不属于任何回合）</p>
          {trace.looseErrors.map((e, i) => (
            <p key={`${e.at}-${i}`} className="font-mono text-xs text-[var(--spark-err)]">
              [{e.scope}] {e.message}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}

interface TurnBlockProps {
  turn: TraceTurnDto
  index: number
  /** 时间线归一分母（全表最慢回合）；0 = 无时长信息，横条不画 */
  scale: number
  onAudit: (tool: string) => void
}

function TurnBlock({ turn, index, scale, onAudit }: TurnBlockProps) {
  const widthPct = scale > 0 ? Math.max(2, (turn.durationMs / scale) * 100) : 0
  return (
    <section className="flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">#{index}</span>
        <span className="text-[13px]">{finishText(turn.finish)}</span>
        <span className="font-mono text-xs text-muted-foreground">{fmtMs(turn.durationMs)}</span>
        {turn.delivery === 'queue' && (
          <span className="text-[11px] text-muted-foreground">排队进入</span>
        )}
        {turn.usage !== null && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {fmtTokens(turn.usage.inputTokens)} in / {fmtTokens(turn.usage.outputTokens)} out · $
            {turn.usage.costUsd.toFixed(4)}
          </span>
        )}
        {turn.usage === null && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground/60">无 usage</span>
        )}
      </div>

      {/* 回合时间线：外框 = 回合占全表比例；内段 = 各工具调用在其时间轴上的位置与时长 */}
      <div
        className="relative h-3 bg-muted"
        style={{ width: `${widthPct}%` }}
        title={`回合时长 ${fmtMs(turn.durationMs)}`}
      >
        {turn.durationMs > 0 &&
          turn.tools.map((tool) => {
            const left = ((tool.startedAt - turn.startedAt) / turn.durationMs) * 100
            const w =
              tool.durationMs === null ? 1 : (tool.durationMs / turn.durationMs) * 100
            return (
              <span
                key={tool.callId}
                className={
                  'absolute block h-3 ' + (tool.isError ? 'bg-[var(--spark-err)]' : 'bg-primary')
                }
                style={{
                  left: `${Math.min(100, Math.max(0, left))}%`,
                  width: `${Math.min(100, Math.max(1.5, w))}%`,
                }}
                title={`${tool.name} ${tool.durationMs === null ? '未闭合' : fmtMs(tool.durationMs)}`}
              />
            )
          })}
      </div>

      {turn.marks.map((m) => (
        <p key={`${m.at}-${m.kind}`} className="text-[11px] text-muted-foreground">
          · {m.label}
        </p>
      ))}

      {turn.steps.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {turn.steps.map((s) => (
            <li key={s.index} className="flex items-center gap-2 font-mono text-[11px]">
              <span className="w-10 shrink-0 text-muted-foreground">步 {s.index + 1}</span>
              <span className="w-14 shrink-0 text-muted-foreground">{fmtMs(s.durationMs)}</span>
              <span className="w-16 shrink-0 text-muted-foreground">
                {s.toolCalls > 0 ? `${s.toolCalls} 次工具` : '无工具'}
              </span>
              {s.usage !== null ? (
                <span className="text-muted-foreground">
                  {fmtTokens(s.usage.inputTokens)} in / {fmtTokens(s.usage.outputTokens)} out
                  {s.usage.cacheRead > 0 && ` / 缓存命中 ${fmtTokens(s.usage.cacheRead)}`} · $
                  {s.usage.costUsd.toFixed(4)}
                </span>
              ) : (
                <span className="text-muted-foreground/60">—</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {turn.tools.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {turn.tools.map((tool) => {
            const pct =
              tool.durationMs === null || turn.durationMs === 0
                ? 0
                : Math.min(100, (tool.durationMs / turn.durationMs) * 100)
            return (
              <li key={tool.callId} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 shrink-0 truncate font-mono">{tool.name}</span>
                <span className="h-2 w-24 shrink-0 bg-muted">
                  <span
                    className={
                      'block h-2 ' + (tool.isError ? 'bg-[var(--spark-err)]' : 'bg-primary')
                    }
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 font-mono text-muted-foreground">
                  {tool.durationMs === null ? '未闭合' : fmtMs(tool.durationMs)}
                </span>
                {tool.isError && <span className="text-[var(--spark-err)]">失败</span>}
                {tool.retry && <span className="text-muted-foreground">重试</span>}
                {tool.warnings.map((w) => (
                  <span key={w} className="text-[var(--spark-warn)]">
                    {w === 'injection' ? '注入告警' : '密钥告警'}
                  </span>
                ))}
                {tool.approvalAsked && (
                  <button
                    type="button"
                    onClick={() => onAudit(tool.name)}
                    className="ml-auto shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    审计
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {turn.errors.map((e, i) => (
        <p key={`${e.at}-${i}`} className="font-mono text-[11px] text-[var(--spark-err)]">
          [{e.scope}] {e.message}
        </p>
      ))}
    </section>
  )
}
