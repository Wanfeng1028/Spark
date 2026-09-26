/**
 * 使用统计与成本看板（工单 7.4 / H04 + 10.20 A①② + 工单 13.6 / V2-07 + 13.6a 可视化图表）：
 * - 总账与熔断：GET /api/routing 的 usage 区（上限可编辑 PUT /api/routing，清零 DELETE /api/routing/usage）；
 * - 看板：GET /api/usage/summary——按日 tokens 堆叠柱状（纯 div/Tailwind，不引图表库）/
 *   按供应商·模型 tokens 占比条 + 明细表 / 上下文命中率 cacheRead ÷ (cacheRead + 未命中输入)，
 *   nonCachedInput 由三分量恒等式还原；
 * - 旧账如实：`unbucketed` 是旧平铺格式时期没有明细的累计，单列一行说明，不摊进按日/按供应商
 *   （伪造明细即假状态）；分母为 0 时命中率显示「—」而非 0%。
 * - 竞答历史（工单 19.10，翻案 D42 内存态）：GET /api/arena/history 摘要表——落盘记录
 *   在 ~/.spark/arena/（engine ArenaStore），本页是四端唯一的全量历史查看面（CLI 只给计数）。
 */
import { useEffect, useMemo, useState } from 'react'
import type { ArenaHistoryDto, UsageBucketDto } from '@spark/protocol'
import { fmtTokens } from '@spark/protocol'
import { formatRelative } from '@/lib/time'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SettingGroupCard, SettingRow } from './SettingRow'
import { Input } from '@/components/ui/input'

/** 命中率 = cacheRead / (cacheRead + nonCachedInput)；nonCachedInput = input − cacheRead − cacheWrite */
function cacheHitRatio(inputTokens: number, cacheRead: number, cacheWrite: number): number | null {
  const nonCached = Math.max(0, inputTokens - cacheRead - cacheWrite)
  const denom = cacheRead + nonCached
  if (denom <= 0) return null // 无输入 = 无从谈命中率（显示「—」，不伪造 0%）
  return cacheRead / denom
}

function ratioText(ratio: number | null): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(1)}%`
}

function fmtInt(n: number): string {
  return n.toLocaleString()
}

/** 按日聚合行：分量拆开供堆叠柱使用 */
interface DayUsage {
  day: string
  costUsd: number
  cacheRead: number
  cacheWrite: number
  nonCachedInput: number
  outputTokens: number
}

/** 按日经手 tokens（堆叠柱高度 = 各分量占区间最大日的比例） */
function dayTokens(d: DayUsage): number {
  return d.cacheRead + d.cacheWrite + d.nonCachedInput + d.outputTokens
}

/** 按日聚合（day 升序）——堆叠柱数据源 */
function byDay(buckets: readonly UsageBucketDto[]): DayUsage[] {
  const map = new Map<string, DayUsage>()
  for (const b of buckets) {
    const cur = map.get(b.day) ?? {
      day: b.day,
      costUsd: 0,
      cacheRead: 0,
      cacheWrite: 0,
      nonCachedInput: 0,
      outputTokens: 0,
    }
    cur.cacheRead += b.cacheRead
    cur.cacheWrite += b.cacheWrite
    cur.nonCachedInput += Math.max(0, b.inputTokens - b.cacheRead - b.cacheWrite)
    cur.outputTokens += b.outputTokens
    cur.costUsd += b.costUsd
    map.set(b.day, cur)
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
}

/** 堆叠段定义（自下而上）：单色明度阶梯编码分量——黑白 token 体系内的四档梯度（DESIGN §12 无违例） */
const DAY_SEGMENTS = [
  { key: 'cacheRead', label: 'cache 读', className: 'bg-primary/25' },
  { key: 'cacheWrite', label: 'cache 写', className: 'bg-primary/45' },
  { key: 'nonCachedInput', label: '未命中输入', className: 'bg-primary/70' },
  { key: 'outputTokens', label: '输出', className: 'bg-primary' },
] as const

type DaySegmentKey = (typeof DAY_SEGMENTS)[number]['key']

function segmentValue(d: DayUsage, key: DaySegmentKey): number {
  return d[key]
}

/** 按日 tokens 堆叠柱状（13.6a）：悬浮单日时标尺行切换为该日明细，其余柱降灰聚焦 */
function DailyUsageChart({ days }: { days: DayUsage[] }) {
  const [hovered, setHovered] = useState<DayUsage | null>(null)
  const maxTokens = days.reduce((m, d) => Math.max(m, dayTokens(d)), 0)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 text-[11px] leading-none text-muted-foreground">
        <span className="shrink-0">tokens / 日</span>
        <span className="truncate text-right font-mono">
          {hovered
            ? `${hovered.day} · 输入 ${fmtInt(hovered.cacheRead + hovered.cacheWrite + hovered.nonCachedInput)}（cache 读 ${fmtInt(hovered.cacheRead)} / 写 ${fmtInt(hovered.cacheWrite)}）· 输出 ${fmtInt(hovered.outputTokens)} · $${hovered.costUsd.toFixed(4)}`
            : `峰值 ${fmtTokens(maxTokens)} tokens/日`}
        </span>
      </div>
      <div
        role="img"
        aria-label="按日 tokens 柱状图"
        className="flex h-32 items-stretch gap-2 border-b border-border"
        onMouseLeave={() => setHovered(null)}
      >
        {days.map((d) => {
          const total = dayTokens(d)
          return (
            <div
              key={d.day}
              onMouseEnter={() => setHovered(d)}
              className={cn(
                'flex min-w-0 flex-1 cursor-default flex-col justify-end transition-opacity',
                hovered !== null && hovered.day !== d.day && 'opacity-50',
              )}
            >
              <div
                className="mx-auto flex w-full max-w-16 flex-col justify-end overflow-hidden rounded-t-[3px] transition-[height]"
                style={{ height: maxTokens > 0 ? `${(total / maxTokens) * 100}%` : '0%' }}
              >
                {DAY_SEGMENTS.map((s) => {
                  const v = segmentValue(d, s.key)
                  if (v <= 0) return null
                  return (
                    <div
                      key={s.key}
                      className={cn('w-full', s.className)}
                      style={{ height: `${(v / total) * 100}%` }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2">
        {days.map((d) => (
          <div key={d.day} className="min-w-0 flex-1 text-center">
            <p className="truncate font-mono text-[11px] leading-tight text-muted-foreground">{d.day}</p>
            <p className="font-mono text-[11px] leading-tight">${d.costUsd.toFixed(4)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {DAY_SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('h-2 w-2 rounded-[2px]', s.className)} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 按供应商/模型聚合行 */
interface ModelUsage {
  key: string
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
}

/** 按 provider/model 聚合（成本降序，同成本按名字字典序——顺序稳定） */
function byModel(buckets: readonly UsageBucketDto[]): ModelUsage[] {
  const map = new Map<string, ModelUsage>()
  for (const b of buckets) {
    const key = `${b.provider}/${b.model}`
    const cur = map.get(key) ?? {
      key,
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
      costUsd: 0,
    }
    cur.inputTokens += b.inputTokens
    cur.outputTokens += b.outputTokens
    cur.cacheRead += b.cacheRead
    cur.cacheWrite += b.cacheWrite
    cur.costUsd += b.costUsd
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) =>
    b.costUsd === a.costUsd ? a.key.localeCompare(b.key) : b.costUsd - a.costUsd,
  )
}

/** 模型经手 tokens（含 cache 读写——占比条与表行色标的统一口径） */
function shareTokens(m: ModelUsage): number {
  return m.inputTokens + m.outputTokens + m.cacheRead + m.cacheWrite
}

/** 占比条分段明度阶梯（按表序取值，超出档位取最浅）——表格即图例 */
const SHARE_STEPS = [1, 0.72, 0.52, 0.36, 0.24, 0.16]

function shareOpacity(index: number): number {
  // Math.min 已夹在档位区间内，?? 只是 noUncheckedIndexedAccess 的收窄（取最浅档同值）
  return SHARE_STEPS[Math.min(index, SHARE_STEPS.length - 1)] ?? 0.16
}

/** 模型 tokens 占比堆叠条（13.6a）：段序 = 表序，行首色标与段明度一一对应；全零不渲染（禁假状态） */
function ModelShareBar({ models }: { models: ModelUsage[] }) {
  const total = models.reduce((sum, m) => sum + shareTokens(m), 0)
  if (total <= 0) return null
  return (
    <div role="img" aria-label="模型 tokens 占比条" className="flex h-2 w-full gap-px overflow-hidden rounded-sm">
      {models.map((m, i) => {
        const tokens = shareTokens(m)
        return (
          <div
            key={m.key}
            className="bg-primary"
            style={{ width: `${(tokens / total) * 100}%`, opacity: shareOpacity(i) }}
            title={`${m.key}：${fmtInt(tokens)} tokens（${((tokens / total) * 100).toFixed(1)}%）· 成本 $${m.costUsd.toFixed(4)}`}
          />
        )
      })}
    </div>
  )
}

export function UsageSettingsPage() {
  const { transport } = useTransport()
  // 加载走 useTransportQuery；上限编辑态从数据播种（保存后 refresh 对齐单源）
  const { data: routing, error, refresh } = useTransportQuery((t) => t.getRouting())
  const {
    data: summary,
    error: summaryError,
    refresh: refreshSummary,
  } = useTransportQuery((t) => t.usageSummary())
  // 竞答历史（工单 19.10）：独立加载——失败只在卡内呈现，不拖累上方看板
  const {
    data: arenaHistory,
    error: arenaHistoryError,
  } = useTransportQuery((t) => t.listArenaHistory())
  // 成本上限编辑态（工单 10.20 A①）：失焦/保存时解析；空串 = 清除上限（永不熔断）
  const [limitDraft, setLimitDraft] = useState('')
  // LA-29：token 维度兜底上限——模型未声明计价时美元维度恒 0 失效，此上限仍可熔断
  const [tokenLimitDraft, setTokenLimitDraft] = useState('')
  const { busy, opError, setOpError, run } = useAsyncOp()

  useEffect(() => {
    if (routing !== null) {
      setLimitDraft(routing.costLimitUsd === null ? '' : String(routing.costLimitUsd))
      setTokenLimitDraft(routing.costLimitTokens === null ? '' : String(routing.costLimitTokens))
    }
  }, [routing])

  const days = useMemo(() => (summary === null ? [] : byDay(summary.buckets)), [summary])
  const models = useMemo(() => (summary === null ? [] : byModel(summary.buckets)), [summary])
  const totalRatio = useMemo(
    () =>
      summary === null
        ? null
        : cacheHitRatio(summary.total.inputTokens, summary.total.cacheRead, summary.total.cacheWrite),
    [summary],
  )

  async function saveLimit(): Promise<void> {
    const text = limitDraft.trim()
    if (text !== '' && (Number.isNaN(Number(text)) || Number(text) <= 0)) {
      setOpError('成本上限须为正数（美元）；留空 = 不设上限')
      return
    }
    await run(async () => {
      const next = await transport.updateRouting({
        costLimitUsd: text === '' ? null : Number(text),
      })
      await refresh()
      await refreshSummary()
      setLimitDraft(next.costLimitUsd === null ? '' : String(next.costLimitUsd))
    })
  }

  async function saveTokenLimit(): Promise<void> {
    const text = tokenLimitDraft.trim()
    if (text !== '' && (Number.isNaN(Number(text)) || Number(text) <= 0 || !Number.isInteger(Number(text)))) {
      setOpError('token 上限须为正整数；留空 = 不设上限')
      return
    }
    await run(async () => {
      const next = await transport.updateRouting({
        costLimitTokens: text === '' ? null : Number(text),
      })
      await refresh()
      await refreshSummary()
      setTokenLimitDraft(next.costLimitTokens === null ? '' : String(next.costLimitTokens))
    })
  }

  async function resetAll(): Promise<void> {
    await run(async () => {
      await transport.resetUsage()
      await refresh()
      await refreshSummary()
    })
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (summaryError !== null) return <p className="text-xs text-destructive">{summaryError}</p>
  if (routing === null || summary === null) {
    return <p className="text-xs text-muted-foreground">加载中…</p>
  }

  const { usage } = routing
  const hasLegacy = summary.unbucketed.costUsd > 0 || summary.unbucketed.inputTokens > 0

  return (
    <div className="flex flex-col gap-4">
      <SettingGroupCard>
        <SettingRow title="累计成本" description="跨进程持久累计（~/.spark/usage.json）；熔断判据同源">
          <span className="font-mono text-[13px]">${usage.costUsd.toFixed(4)}</span>
        </SettingRow>
        <SettingRow title="输入 / 输出 tokens">
          <span className="font-mono text-[13px]">
            {usage.inputTokens.toLocaleString()} / {usage.outputTokens.toLocaleString()}
          </span>
        </SettingRow>
        <SettingRow
          title="上下文命中率"
          description="cacheRead ÷（cacheRead + 未命中输入）；无输入时显示「—」"
        >
          <span className="flex items-center gap-2">
            {totalRatio !== null && (
              <span className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary/70"
                  style={{ width: `${totalRatio * 100}%` }}
                />
              </span>
            )}
            <span className="font-mono text-[13px]">{ratioText(totalRatio)}</span>
          </span>
        </SettingRow>
        <SettingRow title="cache 读 / 写 tokens" description="供应商侧上下文缓存分量（opencode 三分量契约）">
          <span className="font-mono text-[13px]">
            {summary.total.cacheRead.toLocaleString()} / {summary.total.cacheWrite.toLocaleString()}
          </span>
        </SettingRow>
        {hasLegacy && (
          <SettingRow
            title="其中无明细旧账"
            description="明细聚合上线前的累计（按日/按供应商表不含这部分，不摊派伪造明细）"
          >
            <span className="font-mono text-[13px]">${summary.unbucketed.costUsd.toFixed(4)}</span>
          </SettingRow>
        )}
        <SettingRow
          title="成本上限"
          description={
            usage.exceeded ? '已达到上限——新 turn 被拒绝，清零累计后恢复' : '达到上限即熔断新 turn；留空 = 不设上限'
          }
        >
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">$</span>
            <Input
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              onBlur={() => void saveLimit()}
              placeholder="未设置"
              aria-label="成本上限（美元）"
              disabled={busy}
              className="w-24 font-mono text-xs"
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => void saveLimit()}>
              保存
            </Button>
          </div>
        </SettingRow>
        <SettingRow
          title="token 上限"
          description="全 token 累计（含 cache）达到即熔断——模型未声明价格时美元上限不生效，此上限兜底；留空 = 不设"
        >
          <div className="flex items-center gap-1.5">
            <Input
              value={tokenLimitDraft}
              onChange={(e) => setTokenLimitDraft(e.target.value)}
              onBlur={() => void saveTokenLimit()}
              placeholder="未设置"
              aria-label="token 上限"
              disabled={busy}
              className="w-28 font-mono text-xs"
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => void saveTokenLimit()}>
              保存
            </Button>
          </div>
        </SettingRow>
        <SettingRow title="清零累计" description="总账与按日/按供应商明细一并归零；熔断状态随之解除">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void resetAll()}>
            清零累计
          </Button>
        </SettingRow>
        {opError !== null && (
          <p className="px-4 pb-3 font-mono text-xs text-[var(--spark-err)]">{opError}</p>
        )}
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-[13px] font-medium">按日用量</p>
          {days.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              还没有明细——跑过回合后按本地日历日聚合（旧格式时期只有总账，见上方「无明细旧账」）。
            </p>
          ) : (
            <DailyUsageChart days={days} />
          )}
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-[13px] font-medium">按供应商 / 模型</p>
          {models.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有明细。</p>
          ) : (
            <>
              <ModelShareBar models={models} />
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 font-normal">模型</th>
                    <th className="py-1 text-right font-normal">输入</th>
                    <th className="py-1 text-right font-normal">输出</th>
                    <th className="py-1 text-right font-normal">命中率</th>
                    <th className="py-1 text-right font-normal">成本</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m, i) => (
                    <tr key={m.key} className="border-t border-border">
                      <td className="py-1 font-mono">
                        <span
                          aria-hidden
                          className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-primary align-[-1px]"
                          style={{ opacity: shareOpacity(i) }}
                        />
                        {m.key}
                      </td>
                      <td className="py-1 text-right font-mono">{m.inputTokens.toLocaleString()}</td>
                      <td className="py-1 text-right font-mono">{m.outputTokens.toLocaleString()}</td>
                      <td className="py-1 text-right font-mono">
                        {ratioText(cacheHitRatio(m.inputTokens, m.cacheRead, m.cacheWrite))}
                      </td>
                      <td className="py-1 text-right font-mono">${m.costUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            本会话的上下文水位见会话页用量条（工单 6.6）；本页是跨会话/跨进程的全局账。
          </p>
        </div>
      </SettingGroupCard>

      <ArenaHistoryCard history={arenaHistory} error={arenaHistoryError} />
    </div>
  )
}

/** 竞答历史卡（工单 19.10，翻案 D42 内存态）：落盘记录摘要表（新→旧；CLI 端只显示计数） */
function ArenaHistoryCard({
  history,
  error,
}: {
  history: ArenaHistoryDto | null
  error: string | null
}) {
  return (
    <SettingGroupCard>
      <div className="flex flex-col gap-2 px-4 py-3">
        <p className="text-[13px] font-medium">竞答历史</p>
        {error !== null ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : history === null ? (
          <p className="text-xs text-muted-foreground">加载中…</p>
        ) : history.runs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            还没有竞答记录——会话里 /arena &lt;模型…&gt; &lt;任务&gt; 发起；记录落盘 ~/.spark/arena/，重启可查。
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-normal">时间</th>
                <th className="py-1 font-normal">任务</th>
                <th className="py-1 font-normal">模型</th>
                <th className="py-1 font-normal">胜者</th>
                <th className="py-1 font-normal">状态</th>
              </tr>
            </thead>
            <tbody>
              {history.runs.map((r) => (
                <tr key={r.arenaId} className="border-t border-border">
                  <td className="py-1 font-mono text-muted-foreground" title={new Date(r.startedAt).toLocaleString()}>
                    {formatRelative(r.startedAt)}
                  </td>
                  <td className="max-w-64 py-1">
                    <span className="block truncate" title={r.prompt}>
                      {r.prompt}
                    </span>
                  </td>
                  <td className="py-1 font-mono" title={r.models.join(' / ')}>
                    <span className="block truncate">{r.models.join(' / ')}</span>
                  </td>
                  <td className="py-1 font-mono">{r.winnerModel ?? '—'}</td>
                  <td className="py-1">
                    {r.status === 'running' ? '进行中' : r.status === 'done' ? '已完成' : '已取消'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SettingGroupCard>
  )
}
