/**
 * 权限规则页（工单 6.4 迁入项）：用户级 permissions.json 的列表/删除/手动添加，
 * 即存即生效——原 SettingsDialog RulesSection 迁至设置中心 Agent 能力组
 * （用户指令"Agent 能力组先迁入权限规则页"；§13.D 15 页之外的 Spark 既有能力）。
 */
import { useEffect, useState } from 'react'
import type { PermissionRuleDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { SettingGroupCard } from './SettingRow'

const EFFECTS = ['allow', 'deny', 'ask'] as const

const ruleInputClass =
  'h-8 min-w-0 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring'

export function PermissionRulesPage() {
  const { transport } = useTransport()
  const [rules, setRules] = useState<PermissionRuleDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [resource, setResource] = useState('')
  const [effect, setEffect] = useState<PermissionRuleDto['effect']>('allow')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    transport
      .listPermissionRules()
      .then((rs) => {
        if (!cancelled) setRules(rs)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport])

  async function addRule() {
    if (action.trim() === '' || resource.trim() === '') return
    setBusy(true)
    setOpError(null)
    try {
      const rule: PermissionRuleDto = {
        action: action.trim(),
        resource: resource.trim(),
        effect,
      }
      await transport.addPermissionRule(rule)
      setRules((rs) => {
        const next = rs ?? []
        const idx = next.findIndex((r) => r.action === rule.action && r.resource === rule.resource)
        return idx >= 0 ? next.map((r, i) => (i === idx ? rule : r)) : [...next, rule]
      })
      setAction('')
      setResource('')
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeRule(rule: PermissionRuleDto) {
    setBusy(true)
    setOpError(null)
    try {
      await transport.removePermissionRule(rule.action, rule.resource)
      setRules((rs) =>
        (rs ?? []).filter((r) => !(r.action === rule.action && r.resource === rule.resource)),
      )
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingGroupCard>
        {error !== null && (
          <p className="px-4 py-3 font-mono text-xs text-[var(--spark-err)]">{error}</p>
        )}
        {error === null && rules === null && (
          <p className="px-4 py-3 text-xs text-muted-foreground">加载规则…</p>
        )}
        {error === null && rules !== null && rules.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            暂无规则——审批选「总是允许」或下方手动添加
          </p>
        )}
        {error === null &&
          rules !== null &&
          rules.map((r) => (
            <div key={`${r.action}:${r.resource}`} className="flex min-h-12 items-center gap-2 px-4 py-2">
              <span className="w-10 shrink-0 font-mono text-[11px] text-muted-foreground">{r.effect}</span>
              <span
                className="min-w-0 flex-1 truncate font-mono text-[11px]"
                title={`${r.action} ${r.resource}`}
              >
                {r.action} <span className="text-muted-foreground">{r.resource}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeRule(r)}
                className="h-6 shrink-0 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                删除
              </button>
            </div>
          ))}
      </SettingGroupCard>

      <section className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">添加规则（action + resource pattern + 效果）</p>
        <div className="flex items-center gap-1.5">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="action（如 shell.exec）"
            aria-label="规则 action"
            className={ruleInputClass + ' w-36'}
          />
          <input
            value={resource}
            onChange={(e) => setResource(e.target.value)}
            placeholder="resource pattern（如 cmd:git *）"
            aria-label="规则 resource"
            className={ruleInputClass + ' flex-1'}
          />
          <select
            value={effect}
            onChange={(e) => setEffect(e.target.value as PermissionRuleDto['effect'])}
            aria-label="效果"
            className={ruleInputClass + ' w-20'}
          >
            {EFFECTS.map((ef) => (
              <option key={ef} value={ef}>
                {ef}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || action.trim() === '' || resource.trim() === ''}
            onClick={() => void addRule()}
            className="h-8 shrink-0 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            添加
          </button>
        </div>
        {opError !== null && <p className="font-mono text-xs text-[var(--spark-err)]">{opError}</p>}
      </section>
    </div>
  )
}
