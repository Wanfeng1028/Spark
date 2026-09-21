/**
 * 提示词模板管理页（阶段十九 19.18 / V2-16 前端半边收口）：
 * 三槽位（base / compaction / title）查看与编辑——GET /api/prompts 快照 +
 * PUT 写文件（占位符白名单封闭集，非白名单 {{...}} 后端拒写）。
 * 恢复缺省 = 提交空内容（删 spark.json prompts.<slot> 配置，回内置模板；**文件保留**——
 * 删文件属 §2.10 人类决策，页面明示）。
 * 重启档：模板引擎构造期装载一次，保存后下次启动生效（如实标注，不假装热切换）。
 */
import { useEffect, useState } from 'react'
import type { PromptsDto, PromptSlot } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SettingGroupCard, SettingRow } from './SettingRow'

const SLOT_LABEL: Record<PromptSlot, string> = {
  base: '系统基座（base）',
  compaction: '上下文压缩（compaction）',
  title: '会话标题（title）',
}

const SLOT_DESC: Record<PromptSlot, string> = {
  base: '每轮会话的 system 提示词基座（渲染 {{cwd}}/{{model}}/{{platform}}）',
  compaction: '触发压缩时生成摘要的提示词',
  title: '新会话自动生成标题的提示词',
}

export function PromptsSettingsPage() {
  const { transport } = useTransport()
  const { data, error, refresh } = useTransportQuery((t) => t.promptsInfo())
  const { busy, opError, run } = useAsyncOp()
  const [drafts, setDrafts] = useState<Record<PromptSlot, string> | null>(null)

  useEffect(() => {
    if (data === null) return
    const d: Record<PromptSlot, string> = { base: '', compaction: '', title: '' }
    for (const s of data.slots) d[s.slot] = s.content
    setDrafts(d)
  }, [data])

  async function save(slot: PromptSlot, content: string): Promise<void> {
    await run(async () => {
      await transport.updatePrompt({ slot, content })
      await refresh()
    })
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (data === null || drafts === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-r-md border-l-[3px] border-l-[var(--spark-warn)] bg-[var(--spark-warn)]/[0.06] px-4 py-3">
        <p className="text-xs leading-relaxed text-[var(--spark-warn)]">
          重启档：模板在引擎构造期装载一次——保存写盘后**下次启动生效**（当前在跑的会话仍用旧模板）。
          占位符是封闭集（{data.placeholders.join(' / ')}），写入非白名单 {'{{...}}'} 会被拒。
        </p>
      </div>
      {opError !== null && <p className="px-3 py-2 font-mono text-xs text-destructive">{opError}</p>}

      {data.slots.map((s) => (
        <SettingGroupCard key={s.slot}>
          <SettingRow title={SLOT_LABEL[s.slot]} description={SLOT_DESC[s.slot]}>
            <span className="font-mono text-[11px] text-muted-foreground">
              {s.overridden ? `已覆盖：${s.path ?? ''}` : '内置模板'}
            </span>
          </SettingRow>
          <div className="px-4 pb-3">
            <Textarea
              value={drafts[s.slot]}
              onChange={(e) => setDrafts({ ...drafts, [s.slot]: e.target.value })}
              aria-label={`${SLOT_LABEL[s.slot]} 模板内容`}
              rows={8}
              disabled={busy}
              placeholder="模板原文（可用 {{cwd}}/{{model}}/{{platform}}）"
              className="w-full resize-y font-mono text-xs"
            />
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void save(s.slot, drafts[s.slot])}
              >
                保存（重启后生效）
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || !s.overridden}
                onClick={() => void save(s.slot, '')}
              >
                恢复缺省
              </Button>
              {s.overridden && (
                <span className="text-xs text-muted-foreground">
                  恢复缺省只删 spark.json 配置，磁盘上的模板文件保留（可人工处置）
                </span>
              )}
            </div>
          </div>
        </SettingGroupCard>
      ))}
    </div>
  )
}
