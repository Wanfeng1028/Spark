import { useEffect, useState } from 'react'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { SettingRow, SettingGroupCard } from './SettingRow'



/**
 * 模型路由（工单 10.20 A②）：fallback 链 + 任务三档位（压缩/标题/子代理）——
 * GET|PUT /api/routing 端点与 RoutingDto 四字段本就可读写，页面此前缺接线。
 * 三档位不可清空（引擎运行时依赖；留空按未改处理），fallback 链可清空（= 不切换）。
 */
export function RoutingSection() {
  const { transport } = useTransport()
  // 加载走 useTransportQuery（R-E① 二批）；保存成功 refresh 对齐单源
  const { data: routing, error, refresh } = useTransportQuery((t) => t.getRouting())
  const [opError, setOpError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fallbacksDraft, setFallbacksDraft] = useState('')
  const [compactionDraft, setCompactionDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [subagentDraft, setSubagentDraft] = useState('')

  useEffect(() => {
    // 四草稿编辑态从数据播种（R-E① 二批）
    if (routing === null) return
    setFallbacksDraft(routing.fallbacks.join('\n'))
    setCompactionDraft(routing.compactionModel)
    setTitleDraft(routing.titleModel)
    setSubagentDraft(routing.subagentModel)
  }, [routing])

  async function save(): Promise<void> {
    const fallbacks = fallbacksDraft
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
    setBusy(true)
    setOpError(null)
    try {
      const next = await transport.updateRouting({
        fallbacks,
        compactionModel: compactionDraft.trim(),
        titleModel: titleDraft.trim(),
        subagentModel: subagentDraft.trim(),
      })
      await refresh()
      setFallbacksDraft(next.fallbacks.join('\n'))
      setCompactionDraft(next.compactionModel)
      setTitleDraft(next.titleModel)
      setSubagentDraft(next.subagentModel)
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const slotsReady =
    compactionDraft.trim() !== '' && titleDraft.trim() !== '' && subagentDraft.trim() !== ''
  const inputCls =
    'h-8 w-56 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring disabled:opacity-40'

  return (
    <SettingGroupCard>
      <SettingRow
        title="模型路由"
        description="fallback 链与任务档位（provider/model）；保存后热生效（下一次请求），主档=会话模型不在此表"
      />
      {error !== null && (
        <p className="px-4 py-3 font-mono text-xs text-[var(--spark-err)]">{error}</p>
      )}
      {error === null && routing === null && (
        <p className="px-4 py-3 text-xs text-muted-foreground">加载路由配置…</p>
      )}
      {error === null && routing !== null && (
        <>
          <SettingRow title="fallback 链" description="主请求失败按序切换；每行一条，留空 = 不切换">
            <textarea
              value={fallbacksDraft}
              onChange={(e) => setFallbacksDraft(e.target.value)}
              rows={2}
              aria-label="fallback 链"
              disabled={busy}
              placeholder="provider/model（每行一条）"
              className="w-56 resize-none rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring disabled:opacity-40"
            />
          </SettingRow>
          <SettingRow title="压缩档" description="上下文压缩（compaction）使用的模型">
            <input
              value={compactionDraft}
              onChange={(e) => setCompactionDraft(e.target.value)}
              aria-label="压缩档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="标题档" description="会话自动标题使用的模型">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              aria-label="标题档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="子代理档" description="子代理（task）使用的模型">
            <input
              value={subagentDraft}
              onChange={(e) => setSubagentDraft(e.target.value)}
              aria-label="子代理档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              type="button"
              disabled={busy || !slotsReady}
              onClick={() => void save()}
              className="h-8 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              保存
            </button>
            {opError !== null && (
              <span className="min-w-0 truncate font-mono text-xs text-[var(--spark-err)]">
                {opError}
              </span>
            )}
          </div>
        </>
      )}
    </SettingGroupCard>
  )
}

