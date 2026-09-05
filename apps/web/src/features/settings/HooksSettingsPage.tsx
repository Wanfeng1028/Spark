/**
 * 钩子页（工单 10.21，拍板并入 /api/settings——doc/02 v3.43）：
 * spark.json hooks 段真值呈现（四挂点 → 命令/skill 条目清单）+ JSON 编辑写盘。
 * 数据源 GET /api/settings 的 hooks 字段；保存走 PUT /api/settings（zod 校验，
 * 坏 JSON/坏形状 400 如实呈现）；无挂点时如实说明，不放假控件。
 */
import { useEffect, useState } from 'react'
import type { SettingsDto, SettingsHookDef, SettingsHooks } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { errorMessageOf } from '@/lib/error-copy'
import { Button } from '@/components/ui/button'
import { SettingGroupCard, SettingRow } from './SettingRow'

const HOOK_POINTS: { key: keyof SettingsHooks; label: string }[] = [
  { key: 'turn.before', label: '回合开始前' },
  { key: 'turn.after', label: '回合结束后' },
  { key: 'permission.resolved', label: '审批裁决后' },
  { key: 'tool.completed', label: '工具完成后' },
]

/** 单条 hook 的人话描述（命令触发 / skill 触发两形态） */
function describeHook(h: SettingsHookDef): string {
  if ('command' in h) {
    return h.timeoutMs !== undefined ? `命令：${h.command}（超时 ${h.timeoutMs}ms）` : `命令：${h.command}`
  }
  return `技能：${h.skill}（触发 ${h.emit}）`
}

export function HooksSettingsPage() {
  const { transport } = useTransport()
  const [settings, setSettings] = useState<SettingsDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { busy, opError, setOpError, run } = useAsyncOp()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    transport
      .getSettings()
      .then((s) => {
        if (!cancelled) setSettings(s)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport])

  async function save(): Promise<void> {
    let parsed: SettingsHooks
    try {
      parsed = JSON.parse(draft) as SettingsHooks
    } catch {
      setOpError('不是合法 JSON：请检查引号与逗号')
      return
    }
    await run(async () => {
    const next = await transport.updateSettings({ hooks: parsed })
    setSettings(next)
    setEditing(false)
    })
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (settings === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  const hooks = settings.hooks
  const configured = HOOK_POINTS.filter((p) => (hooks?.[p.key]?.length ?? 0) > 0)

  return (
    <div className="flex flex-col gap-5">
      <SettingGroupCard>
        <SettingRow
          title="生命周期钩子"
          description="spark.json hooks 段（工单 7.3 四挂点）；经 GET|PUT /api/settings 读写（工单 10.21 拍板并入）"
        >
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDraft(JSON.stringify(hooks ?? {}, null, 2))
              setEditing((v) => !v)
            }}
            className="h-7 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:opacity-40"
          >
            {editing ? '收起编辑' : '编辑'}
          </Button>
        </SettingRow>
        {configured.length === 0 && !editing && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            未配置任何钩子——在 ~/.spark/spark.json 的 hooks 段声明，或点「编辑」写入。
          </p>
        )}
        {configured.map((p) => (
          <SettingRow key={p.key} title={p.label} description={p.key}>
            <div className="flex min-w-0 flex-col items-end gap-0.5">
              {hooks?.[p.key]?.map((h, i) => (
                <span key={i} className="max-w-72 truncate font-mono text-[11px] text-muted-foreground">
                  {describeHook(h)}
                </span>
              ))}
            </div>
          </SettingRow>
        ))}
      </SettingGroupCard>
      {editing && (
        <SettingGroupCard>
          <SettingRow
            title="JSON 编辑"
            description='形状：{ "turn.before": [{ "command": "…" }], "tool.completed": [{ "skill": "…", "emit": "…" }] }'
          />
          <div className="px-4 py-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              aria-label="hooks JSON"
              disabled={busy}
              className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-ring disabled:opacity-40"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void save()}
                >
                保存
              </Button>
              {opError !== null && (
                <span className="min-w-0 truncate font-mono text-xs text-[var(--spark-err)]">{opError}</span>
              )}
            </div>
          </div>
        </SettingGroupCard>
      )}
    </div>
  )
}
