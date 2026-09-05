/**
 * 使用统计页（工单 7.4 / H04 + 工单 10.20 A①②）：GET /api/routing 的 usage 区——
 * 成本累计与成本上限（熔断状态）；成本上限可编辑（PUT /api/routing + updateRouting，
 * 留空 = 清除上限）；「清零累计」接 DELETE /api/routing/usage + resetUsage
 * （此前页面文案写了"清零累计后恢复"却没接线）。趋势图与看板归 H23（v2）。
 */
import { useEffect, useState } from 'react'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { errorMessageOf } from '@/lib/error-copy'
import { SettingGroupCard, SettingRow } from './SettingRow'

export function UsageSettingsPage() {
  const { transport } = useTransport()
  // 加载走 useTransportQuery；上限编辑态从数据播种（保存后 refresh 对齐单源）
  const { data: routing, error, refresh } = useTransportQuery((t) => t.getRouting())
  // 成本上限编辑态（工单 10.20 A①）：失焦/保存时解析；空串 = 清除上限（永不熔断）
  const [limitDraft, setLimitDraft] = useState('')
  const [opError, setOpError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (routing !== null) setLimitDraft(routing.costLimitUsd === null ? '' : String(routing.costLimitUsd))
  }, [routing])

  async function saveLimit(): Promise<void> {
    const text = limitDraft.trim()
    if (text !== '' && (Number.isNaN(Number(text)) || Number(text) <= 0)) {
      setOpError('成本上限须为正数（美元）；留空 = 不设上限')
      return
    }
    setBusy(true)
    setOpError(null)
    try {
      const next = await transport.updateRouting({
        costLimitUsd: text === '' ? null : Number(text),
      })
      await refresh()
      setLimitDraft(next.costLimitUsd === null ? '' : String(next.costLimitUsd))
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function resetAll(): Promise<void> {
    setBusy(true)
    setOpError(null)
    try {
      await transport.resetUsage()
      await refresh()
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (routing === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  const { usage } = routing
  return (
    <SettingGroupCard>
      <SettingRow title="累计成本" description="跨进程持久累计（~/.spark/usage.json）">
        <span className="font-mono text-[13px]">${usage.costUsd.toFixed(4)}</span>
      </SettingRow>
      <SettingRow title="输入 / 输出 tokens">
        <span className="font-mono text-[13px]">
          {usage.inputTokens.toLocaleString()} / {usage.outputTokens.toLocaleString()}
        </span>
      </SettingRow>
      <SettingRow
        title="成本上限"
        description={usage.exceeded ? '已达到上限——新 turn 被拒绝，清零累计后恢复' : '达到上限即熔断新 turn；留空 = 不设上限'}
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
            className="h-8 w-24 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring disabled:opacity-40"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLimit()}
            className="h-8 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </SettingRow>
      <SettingRow title="清零累计" description="成本与 token 计数归零；熔断状态随之解除">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resetAll()}
          className="h-8 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          清零累计
        </button>
      </SettingRow>
      {opError !== null && (
        <p className="px-4 pb-3 font-mono text-xs text-[var(--spark-err)]">{opError}</p>
      )}
    </SettingGroupCard>
  )
}
