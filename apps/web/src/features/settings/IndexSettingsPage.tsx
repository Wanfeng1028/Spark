/**
 * 索引库管理页（阶段十九工单 19.11）：GET /api/index/stats 只读统计 +
 * 「重建索引」（POST /api/index/rebuild，清表重扫 sessions JSONL）与
 * 「空间回收」（POST /api/index/vacuum，SQLite VACUUM）两个维护动作——
 * 重写类操作走内联两段式确认（首击变确认态 3s 超时还原，DESIGN §5 禁原生 confirm）。
 * 打开失败降级（available:false）如实黄条（禁假数据）；索引随引擎启停（停用开关不做）。
 * 阶段十九 19.8 / ADR D51：语义（向量）区——总开关（spark.json embedding.enabled 热档）、
 * 提供方/维度/已嵌条目只读态、增量补嵌（POST /api/index/vectors/rebuild，两段式确认）。
 * 无提供方 → available:false 黄条（不宣称"语义已启用"）。
 */
import { useEffect, useRef, useState } from 'react'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import type { IndexStatsDto } from '@spark/protocol'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { SettingGroupCard, SettingRow } from './SettingRow'
import { formatBytes } from '@/lib/format'

type ConfirmAction = 'rebuild' | 'vacuum' | 'vectors'

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
      } else if (action === 'vacuum') {
        const r = await transport.vacuumIndex()
        setLastResult(
          `空间回收完成：${formatBytes(r.sizeBytesBefore)} → ${formatBytes(r.sizeBytesAfter)}`,
        )
      } else {
        const r = await transport.rebuildVectors()
        setLastResult(`向量补嵌完成：本次嵌入 ${r.embedded} 条${r.remaining > 0 ? `，仍缺 ${r.remaining} 条（可再次点补嵌）` : '，已全覆盖'}`)
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

      {/* 语义（向量）检索区（阶段十九 19.8 / ADR D51） */}
      <SemanticSection stats={stats} onChanged={() => void refresh()} />
    </div>
  )
}

/**
 * 语义区（19.8）：总开关热档 + 提供方/维度只读 + 增量补嵌。
 * 独立组件自取 settings（开关 PUT /api/settings 与 stats 查询解耦，刷新互不牵连）。
 */
function SemanticSection({ stats, onChanged }: { stats: IndexStatsDto; onChanged: () => void }) {
  const { transport } = useTransport()
  const { data: settings } = useTransportQuery((t) => t.getSettings())
  const { busy, opError, run } = useAsyncOp()
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    },
    [],
  )

  const sem = stats.semantic
  const enabled = settings?.embedding?.enabled ?? true

  async function toggle(next: boolean): Promise<void> {
    await run(async () => {
      await transport.updateSettings({ embedding: { enabled: next } })
      onChanged()
    })
  }

  async function backfill(): Promise<void> {
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    setConfirming(false)
    await run(async () => {
      const r = await transport.rebuildVectors()
      onChanged()
      // 结果行由父页 lastResult 承载——此处只驱动刷新；失败（无提供方）走 opError
      void r
    })
  }

  if (sem === undefined) return null
  return (
    <SettingGroupCard>
      <SettingRow
        title="语义检索（向量）"
        description="embedding 提供方就绪时，搜索与记忆召回走「语义 + 关键词」合流；关闭后纯关键词（保存即生效）"
      >
        <Switch
          aria-label="语义检索总开关"
          checked={enabled && sem.available}
          disabled={busy || !sem.available}
          onChange={(v) => void toggle(v)}
        />
      </SettingRow>
      <SettingRow title="提供方" description="models.json providers 中声明 embeddings 的提供方（首个生效；换提供方需重启）">
        <span className="font-mono text-xs text-muted-foreground">
          {sem.provider !== null ? `${sem.provider} · ${sem.model ?? ''}` : '未配置'}
        </span>
      </SettingRow>
      <SettingRow title="已嵌条目" description="记忆与会话事件的向量条目数（派生缓存，丢失只丢语义检索不丢数据）">
        <span className="font-mono text-xs text-muted-foreground">
          {sem.embedded}
          {sem.dimensions !== null ? ` · ${sem.dimensions} 维` : ''}
        </span>
      </SettingRow>
      <div className="px-4 pb-3">
        {opError !== null && <p className="font-mono text-xs text-destructive">{opError}</p>}
        <div className="flex items-center gap-2 pb-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !sem.available || !enabled}
            className={cn(confirming && 'bg-destructive/10 text-destructive hover:text-destructive')}
            onClick={() => {
              if (confirming) {
                void backfill()
                return
              }
              setConfirming(true)
              confirmTimer.current = setTimeout(() => setConfirming(false), 3000)
            }}
          >
            {confirming ? '再次点击确认补嵌' : '补嵌向量'}
          </Button>
          <span className="text-xs text-muted-foreground">
            只嵌缺向量条目（不清表、已嵌零重复计费）；新存记忆即时补嵌，会话事件在此手动补嵌
          </span>
        </div>
        {!sem.available && (
          <p className="text-xs leading-relaxed text-[var(--spark-warn)]">
            语义检索不可用——models.json 未配置 embedding 提供方（在 provider 上加{' '}
            <span className="font-mono">embeddings: {'{ model }'}</span> 声明）或向量库打开失败；
            搜索与记忆召回按纯关键词进行（如实降级，非故障）。
          </p>
        )}
        <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
          边界：向量是派生缓存（会话 JSONL 与记忆库恒为权威）；embedding 调用走提供方
          OpenAI 兼容 /embeddings 端点，调用失败时该次检索自动回落关键词。
        </p>
      </div>
    </SettingGroupCard>
  )
}
