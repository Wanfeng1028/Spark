import { useEffect, useState } from 'react'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { SettingRow, SettingGroupCard } from './SettingRow'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

/** 推理档选项（空串 = 不设置，按 provider 默认） */
const EFFORT_OPTIONS: { value: 'low' | 'medium' | 'high' | ''; label: string }[] = [
  { value: '', label: '不设置' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]



/**
 * 模型路由（工单 10.20 A②；阶段十九 19.14 / V2-37，ADR D53）：fallback 链 + 任务三档位
 * （压缩/标题/子代理）+ **新建会话默认模型/推理档**——经同一 PUT /api/routing 写入
 * models.json（单写者：设置页不另起写路径，消双写者）。
 * 三档位不可清空（引擎运行时依赖；留空按未改处理），fallback 链可清空（= 不切换）。
 */
export function RoutingSection() {
  const { transport } = useTransport()
  // 加载走 useTransportQuery（R-E① 二批）；保存成功 refresh 对齐单源
  const { data: routing, error, refresh } = useTransportQuery((t) => t.getRouting())
  const { busy, opError, run } = useAsyncOp()
  const [fallbacksDraft, setFallbacksDraft] = useState('')
  const [compactionDraft, setCompactionDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [subagentDraft, setSubagentDraft] = useState('')
  // 新建会话默认模型/档位（阶段十九 19.14 / V2-37）
  const [defaultModelDraft, setDefaultModelDraft] = useState('')
  const [defaultEffortDraft, setDefaultEffortDraft] = useState<'low' | 'medium' | 'high' | ''>('')

  useEffect(() => {
    // 四草稿编辑态从数据播种（R-E① 二批）
    if (routing === null) return
    setFallbacksDraft(routing.fallbacks.join('\n'))
    setCompactionDraft(routing.compactionModel)
    setTitleDraft(routing.titleModel)
    setSubagentDraft(routing.subagentModel)
    setDefaultModelDraft(routing.defaultModel)
    setDefaultEffortDraft(routing.defaultEffort ?? '')
  }, [routing])

  async function save(): Promise<void> {
    const fallbacks = fallbacksDraft
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
    await run(async () => {
    const next = await transport.updateRouting({
      fallbacks,
      compactionModel: compactionDraft.trim(),
      titleModel: titleDraft.trim(),
      subagentModel: subagentDraft.trim(),
      ...(defaultModelDraft.trim() !== '' ? { defaultModel: defaultModelDraft.trim() } : {}),
      // 显式携带（含空串=清除）；与现值相同则不传，保持现值
      ...(defaultEffortDraft !== (routing?.defaultEffort ?? '')
        ? { defaultEffort: defaultEffortDraft === '' ? null : defaultEffortDraft }
        : {}),
    })
    await refresh()
    setFallbacksDraft(next.fallbacks.join('\n'))
    setCompactionDraft(next.compactionModel)
    setTitleDraft(next.titleModel)
    setSubagentDraft(next.subagentModel)
    setDefaultModelDraft(next.defaultModel)
    setDefaultEffortDraft(next.defaultEffort ?? '')
    })
  }

  const slotsReady =
    compactionDraft.trim() !== '' && titleDraft.trim() !== '' && subagentDraft.trim() !== ''
  const inputCls = 'w-56 font-mono text-xs'

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
            <Textarea
              value={fallbacksDraft}
              onChange={(e) => setFallbacksDraft(e.target.value)}
              rows={2}
              aria-label="fallback 链"
              disabled={busy}
              placeholder="provider/model（每行一条）"
              className="w-56 resize-none font-mono text-xs"
            />
          </SettingRow>
          <SettingRow title="压缩档" description="上下文压缩（compaction）使用的模型">
            <Input
              value={compactionDraft}
              onChange={(e) => setCompactionDraft(e.target.value)}
              aria-label="压缩档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="标题档" description="会话自动标题使用的模型">
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              aria-label="标题档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="子代理档" description="子代理（task）使用的模型">
            <Input
              value={subagentDraft}
              onChange={(e) => setSubagentDraft(e.target.value)}
              aria-label="子代理档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="新建会话默认模型" description="新会话未显式指定模型时使用（provider/model）——与任务档位同一写路径（models.json 单写者）">
            <Input
              value={defaultModelDraft}
              onChange={(e) => setDefaultModelDraft(e.target.value)}
              aria-label="新建会话默认模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="新建会话默认推理档" description="新会话未显式选档时使用；不设置 = 按 provider 默认">
            <Select
              aria-label="新建会话默认推理档"
              value={defaultEffortDraft}
              options={EFFORT_OPTIONS}
              onChange={setDefaultEffortDraft}
              className="w-32"
            />
          </SettingRow>
          <div className="flex items-center gap-2 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !slotsReady}
              onClick={() => void save()}
              >
              保存
            </Button>
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

