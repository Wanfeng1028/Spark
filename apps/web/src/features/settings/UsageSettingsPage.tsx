/**
 * 使用统计与成本看板（工单 7.4 / H04 + 10.20 A①② + 工单 13.6 / V2-07）：
 * - 总账与熔断：GET /api/routing 的 usage 区（上限可编辑 PUT /api/routing，清零 DELETE /api/routing/usage）；
 * - 看板：GET /api/usage/summary——按日柱状（纯 div，不引图表库）/ 按供应商·模型表 /
 *   上下文命中率 cacheRead ÷ (cacheRead + nonCachedInput)，nonCachedInput 由三分量恒等式还原；
 * - 旧账如实：`unbucketed` 是旧平铺格式时期没有明细的累计，单列一行说明，不摊进按日/按供应商
 *   （伪造明细即假状态）；分母为 0 时命中率显示「—」而非 0%。
 */
import { useEffect, useMemo, useState } from 'react'
import type { UsageBucketDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { Button } from '@/components/ui/button'
import { SettingGroupCard, SettingRow, settingInputCls } from './SettingRow'

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

/** 按日聚合（day 升序）——柱状图数据源 */
function byDay(buckets: readonly UsageBucketDto[]): Array<{ day: string; costUsd: number }> {
  const map = new Map<string, number>()
  for (const b of buckets) map.set(b.day, (map.get(b.day) ?? 0) + b.costUsd)
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, costUsd]) => ({ day, costUsd }))
}

/** 按 provider/model 聚合（成本降序，同成本按名字字典序——顺序稳定） */
function byModel(
  buckets: readonly UsageBucketDto[],
): Array<{ key: string; inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number }> {
  const map = new Map<string, { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number }>()
  for (const b of buckets) {
    const key = `${b.provider}/${b.model}`
    const cur = map.get(key) ?? { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 }
    cur.inputTokens += b.inputTokens
    cur.outputTokens += b.outputTokens
    cur.cacheRead += b.cacheRead
    cur.cacheWrite += b.cacheWrite
    cur.costUsd += b.costUsd
    map.set(key, cur)
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (b.costUsd === a.costUsd ? a.key.localeCompare(b.key) : b.costUsd - a.costUsd))
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
  // 成本上限编辑态（工单 10.20 A①）：失焦/保存时解析；空串 = 清除上限（永不熔断）
  const [limitDraft, setLimitDraft] = useState('')
  const { busy, opError, setOpError, run } = useAsyncOp()

  useEffect(() => {
    if (routing !== null) setLimitDraft(routing.costLimitUsd === null ? '' : String(routing.costLimitUsd))
  }, [routing])

  const days = useMemo(() => (summary === null ? [] : byDay(summary.buckets)), [summary])
  const models = useMemo(() => (summary === null ? [] : byModel(summary.buckets)), [summary])
  const maxDayCost = useMemo(() => days.reduce((m, d) => Math.max(m, d.costUsd), 0), [days])

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
          <span className="font-mono text-[13px]">
            {ratioText(
              cacheHitRatio(summary.total.inputTokens, summary.total.cacheRead, summary.total.cacheWrite),
            )}
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
            <input
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              onBlur={() => void saveLimit()}
              placeholder="未设置"
              aria-label="成本上限（美元）"
              disabled={busy}
              className={settingInputCls + ' w-24 disabled:opacity-40'}
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => void saveLimit()}>
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
          <p className="text-[13px] font-medium">按日成本</p>
          {days.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              还没有明细——跑过回合后按本地日历日聚合（旧格式时期只有总账，见上方「无明细旧账」）。
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {days.map((d) => (
                <li key={d.day} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{d.day}</span>
                  {/* 纯 div 柱状（boring：不引图表库）；宽度按当区间最大日成本归一 */}
                  <span className="h-3 flex-1 bg-muted">
                    <span
                      className="block h-3 bg-primary"
                      style={{
                        width: `${maxDayCost > 0 ? Math.max(2, (d.costUsd / maxDayCost) * 100) : 0}%`,
                      }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right font-mono text-xs">${d.costUsd.toFixed(4)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-[13px] font-medium">按供应商 / 模型</p>
          {models.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有明细。</p>
          ) : (
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
                {models.map((m) => (
                  <tr key={m.key} className="border-t border-border">
                    <td className="py-1 font-mono">{m.key}</td>
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
          )}
          <p className="text-xs text-muted-foreground">
            本会话的上下文水位见会话页用量条（工单 6.6）；本页是跨会话/跨进程的全局账。
          </p>
        </div>
      </SettingGroupCard>
    </div>
  )
}
