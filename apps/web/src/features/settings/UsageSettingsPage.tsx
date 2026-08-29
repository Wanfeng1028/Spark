/**
 * 使用统计只读页（工单 7.4 / H04）：GET /api/routing 的 usage 区——成本累计与
 * 成本上限（熔断状态）。数据源与 /usage 命令同一入口；趋势图与看板归 H23（v2）。
 */
import { useEffect, useState } from 'react'
import type { RoutingDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { SettingGroupCard, SettingRow } from './SettingRow'

export function UsageSettingsPage() {
  const { transport } = useTransport()
  const [routing, setRouting] = useState<RoutingDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    transport
      .getRouting()
      .then((r) => {
        if (!cancelled) setRouting(r)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport])

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
        description={usage.exceeded ? '已达到上限——新 turn 被拒绝，清零累计后恢复' : '达到上限即熔断新 turn'}
      >
        <span className="font-mono text-[13px]">
          {routing.costLimitUsd === null ? '未设置' : `$${routing.costLimitUsd}`}
        </span>
      </SettingRow>
    </SettingGroupCard>
  )
}
