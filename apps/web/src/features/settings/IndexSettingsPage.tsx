/**
 * 索引库管理页（阶段十九工单 19.11）：GET /api/index/stats 只读统计 +
 * 「重建索引」（POST /api/index/rebuild，清表重扫 sessions JSONL）与
 * 「空间回收」（POST /api/index/vacuum，SQLite VACUUM）两个维护动作——
 * 重写类操作走内联两段式确认（首击变确认态 3s 超时还原，DESIGN §5 禁原生 confirm）。
 * 打开失败降级（available:false）如实黄条（禁假数据）；索引随引擎启停（停用开关不做）。
 */
import { useEffect, useRef, useState } from 'react'
import type { IndexStatsDto } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SettingGroupCard, SettingRow } from './SettingRow'

/** 库体积展示（B/KB/MB 一位小数；仅本页消费，不上收 protocol format） */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type ConfirmAction = 'rebuild' | 'vacuum'

export function IndexSettingsPage() {
  const { transport } = useTransport()
  const { data: stats, error, refresh } = useTransportQuery((t) => t.indexStats())
  const { busy, opError, run } = useAsyncOp()
  /** 内联两段式确认态（DESIGN §5）：首击进入确认态，3s 超时还原；期间再击才执行 */
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 上次维护动作的结果行回显 */
  const [lastResult, setLastResult] = useState<string | null>(null)

  // 卸载清定时器（确认态不跨页悬挂）
  useEffect(
    () => () => {
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    },
    [],
  )

  function askConfirm(action: ConfirmAction): void {
    if (confirming !== action) {
      setConfirming(action)
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirming(null), 3000)
      return
    }
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    setConfirming(null)
    void execute(action)
  }

  async function execute(action: ConfirmAction): Promise<void> {
    await run(async () => {
      if (action === 'rebuild') {
        const r = await transport.rebuildIndex()
        setLastResult(`重建完成：索引条目 ${r.entries} 条`)
      } else {
        const r = await transport.vacuumIndex()
        setLastResult(
          `空间回收完成：${formatBytes(r.sizeBytesBefore)} → ${formatBytes(r.sizeBytesAfter)}`,
        )
      }
      await refresh()
    })
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (stats === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  const degraded = stats.available === false

  return (
    <div className="flex flex-col gap-3">
      <SettingGroupCard>
        <SettingRow title="索引条目" description="用户消息 / 助手消息 / 会话标题三类事件文本">
          <span className="font-mono text-xs text-muted-foreground">{stats.entries}</span>
        </SettingRow>
        <SettingRow title="库体积" description="search.db 文件当前占用">
          <span className="font-mono text-xs text-muted-foreground">
            {formatBytes(stats.sizeBytes)}
          </span>
        </SettingRow>
        <SettingRow title="库路径">
          <span className="max-w-[320px] truncate font-mono text-xs text-muted-foreground" title={stats.path}>
            {stats.path}
          </span>
        </SettingRow>
      </SettingGroupCard>

      {degraded && (
        <div className="rounded-r-md border-l-[3px] border-l-[var(--spark-warn)] bg-[var(--spark-warn)]/[0.06] px-4 py-3">
          <p className="text-xs leading-relaxed text-[var(--spark-warn)]">
            索引库当前不可用（SQLite 打开失败已降级）——搜索由会话扫描兜底，主流程不受影响；
            上方统计为零值系如实回显，重建动作可尝试恢复。
          </p>
        </div>
      )}

      <SettingGroupCard>
        <SettingRow
          title="重建索引"
          description="清空索引并全量重扫本地会话 JSONL（装载点增量同步的兜底动作；会话数据不受影响）"
        >
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className={cn(
              confirming === 'rebuild' && 'bg-destructive/10 text-destructive hover:text-destructive',
            )}
            onClick={() => askConfirm('rebuild')}
          >
            {confirming === 'rebuild' ? '再次点击确认重建' : '重建'}
          </Button>
        </SettingRow>
        <SettingRow
          title="空间回收（VACUUM）"
          description="对索引库执行 SQLite VACUUM，回收删除留下的空闲页（会话数据不受影响）"
        >
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className={cn(
              confirming === 'vacuum' && 'bg-destructive/10 text-destructive hover:text-destructive',
            )}
            onClick={() => askConfirm('vacuum')}
          >
            {confirming === 'vacuum' ? '再次点击确认回收' : '回收'}
          </Button>
        </SettingRow>
        <div className="px-4 py-3">
          {opError !== null && <p className="font-mono text-xs text-destructive">{opError}</p>}
          {lastResult !== null && opError === null && (
            <p className="font-mono text-xs text-muted-foreground">{lastResult}</p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            索引随引擎启停（停用开关涉及重启面，v1 不做）；维护期间全文搜索短暂不可用属预期，
            会话 JSONL 恒为权威。
          </p>
        </div>
      </SettingGroupCard>
    </div>
  )
}
