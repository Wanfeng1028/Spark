/**
 * SettingsDialog（doc/02 §6.2.3）：v1 用 Dialog 不换路由；即存即生效（无保存按钮）。
 * 字段全部走 settings-store（localStorage 持久化）；默认模型只影响新建会话。
 * 权限规则区（工单 4.7）：用户级 permissions.json 的列表/删除/手动添加，即存即生效。
 */
import { useEffect, useState } from 'react'
import type { Delivery, PermissionRuleDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const DELIVERIES: { value: Delivery; label: string; hint: string }[] = [
  { value: 'now', label: 'now', hint: '空闲时立即开新轮' },
  { value: 'steer', label: 'steer', hint: '进行中注入当前轮' },
  { value: 'queue', label: 'queue', hint: '排队等本轮结束' },
]

const EFFECTS = ['allow', 'deny', 'ask'] as const

function SectionLabel({ children }: { children: string }) {
  return <p className="font-mono text-[11px] text-muted-foreground">{children}</p>
}

/** 权限规则行内删除/添加表单共用样式 */
const ruleInputClass =
  'h-7 min-w-0 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring'

/** 权限规则管理（§5.7 规则表 / 工单 4.7）：加载失败如实呈现，操作错误行内提示 */
function RulesSection() {
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
      setRules((rs) => (rs ?? []).filter((r) => !(r.action === rule.action && r.resource === rule.resource)))
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>权限 · 规则（用户级，跨会话生效；always 固化同表）</SectionLabel>
      {error !== null && <p className="font-mono text-xs text-[var(--spark-err)]">{error}</p>}
      {error === null && rules === null && (
        <p className="text-xs text-muted-foreground">加载规则…</p>
      )}
      {rules !== null && rules.length === 0 && (
        <p className="text-xs text-muted-foreground">暂无规则——审批选「总是允许」或下方手动添加</p>
      )}
      {rules !== null && rules.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
          {rules.map((r) => (
            <li key={`${r.action}:${r.resource}`} className="flex min-h-7 items-center gap-2 px-2 py-0.5">
              <span className="w-10 shrink-0 font-mono text-[11px] text-muted-foreground">{r.effect}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={`${r.action} ${r.resource}`}>
                {r.action} <span className="text-muted-foreground">{r.resource}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeRule(r)}
                className="h-5 shrink-0 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="action（如 shell.exec）"
          className={ruleInputClass + ' w-32'}
        />
        <input
          value={resource}
          onChange={(e) => setResource(e.target.value)}
          placeholder="resource pattern（如 cmd:git *）"
          className={ruleInputClass + ' flex-1'}
        />
        <select
          value={effect}
          onChange={(e) => setEffect(e.target.value as PermissionRuleDto['effect'])}
          aria-label="效果"
          className={ruleInputClass + ' w-16'}
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
          className="h-7 shrink-0 rounded-md border border-border px-2 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          添加
        </button>
      </div>
      {opError !== null && <p className="font-mono text-xs text-[var(--spark-err)]">{opError}</p>}
    </section>
  )
}

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const defaultDelivery = useSettingsStore((s) => s.defaultDelivery)
  const setDefaultDelivery = useSettingsStore((s) => s.setDefaultDelivery)
  const model = useSettingsStore((s) => s.model)
  const setModel = useSettingsStore((s) => s.setModel)

  // 本地编辑态：失焦时非空才落库（§6.2.3 唯一校验为非空）；初始不报错，动过才提示
  const [modelDraft, setModelDraft] = useState(model)
  const [modelTouched, setModelTouched] = useState(false)
  const modelInvalid = modelDraft.trim() === ''

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>即存即生效，仅本地持久化</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <SectionLabel>通用 · 主题</SectionLabel>
            <div className="flex h-8 w-fit rounded-md border border-border p-0.5" role="radiogroup" aria-label="主题">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  onClick={() => setTheme(t)}
                  className={
                    'h-7 rounded-sm px-4 text-xs ' +
                    (theme === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>通用 · 默认 delivery</SectionLabel>
            <div className="flex flex-col gap-1" role="radiogroup" aria-label="默认 delivery">
              {DELIVERIES.map((d) => (
                <label
                  key={d.value}
                  className={
                    'flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-[13px] ' +
                    (defaultDelivery === d.value ? 'bg-accent' : 'hover:bg-accent/50')
                  }
                >
                  <input
                    type="radio"
                    name="default-delivery"
                    checked={defaultDelivery === d.value}
                    onChange={() => setDefaultDelivery(d.value)}
                    className="size-3 accent-[var(--primary)]"
                  />
                  <span className="font-mono text-xs">{d.label}</span>
                  <span className="text-xs text-muted-foreground">{d.hint}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>模型 · 新建会话默认模型</SectionLabel>
            <input
              value={modelDraft}
              onChange={(e) => {
                setModelDraft(e.target.value)
                setModelTouched(true)
              }}
              onBlur={() => {
                setModelTouched(true)
                if (!modelInvalid) setModel(modelDraft.trim())
              }}
              placeholder="provider/model"
              aria-invalid={modelTouched && modelInvalid}
              className={
                'h-8 rounded-md border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 ' +
                (modelTouched && modelInvalid ? 'border-[var(--spark-err)]/60' : 'border-border focus:border-ring')
              }
            />
            {modelTouched && modelInvalid && (
              <p className="text-xs text-[var(--spark-err)]">模型名不能为空——留空将沿用上次保存值</p>
            )}
          </section>

          <RulesSection />
        </div>
      </DialogContent>
    </Dialog>
  )
}
