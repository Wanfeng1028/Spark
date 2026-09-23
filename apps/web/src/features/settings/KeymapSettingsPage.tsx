/**
 * 键位页（阶段十九 19.39 第二批 / V2-22）：`KEYMAP` 内置表的**覆盖层编辑面**。
 * 三条边界照 protocol/keymap.ts 模块头（本页只消费不复制）：① 只改物理键不新增语义——行来自
 * KEYMAP，用户改不出新 action；② 生效表由 `mergeKeymap` 单源推导；③ 冲突保存前挡下。
 *
 * 本页比"一张可编辑的表"多两件事，都是为了不给出假控件：
 * - **只有带 `spec` 的行可编辑**（= 真有端侧物理层消费它）。其余行只读并标"未接入"——
 *   给一个改了不生效的输入框，比不给更坏。
 * - **保存后写回 ui store**，快捷键当场生效；否则要重载页面，等于"改了不生效"的另一种形态。
 * 键串解析不出（如把 'Ctrl/Cmd+K' 写成 'Ctrl+C ×2'）也拒存：放行会让端侧比对不到任何按键，
 * 静默变成解绑，而输入框里还显示着用户刚写的那串字。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  KEYMAP,
  keymapRejected,
  keymapUnparseable,
  mergeKeymap,
  type KeyOverride,
} from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useUiStore } from '@/stores/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingGroupCard, SettingRow } from './SettingRow'

/** 可改的行 = 内置表里带 spec 的条目（有端侧物理层消费；判据单一来源在 protocol） */
const EDITABLE = KEYMAP.filter((k) => k.spec !== undefined)
const READONLY = KEYMAP.filter((k) => k.spec === undefined)

const SURFACE_LABEL = { cli: 'CLI', web: 'web', both: '两端' } as const

function sameOverrides(a: readonly KeyOverride[], b: readonly KeyOverride[]): boolean {
  const norm = (list: readonly KeyOverride[]): string =>
    JSON.stringify([...list].map((o) => `${o.action}=${o.keys}`).sort())
  return norm(a) === norm(b)
}

export function KeymapSettingsPage(): React.JSX.Element {
  const { transport } = useTransport()
  const { data: settings, error, refresh } = useTransportQuery((t) => t.getSettings())
  const { busy, opError, run } = useAsyncOp()
  const setKeymapOverrides = useUiStore((s) => s.setKeymapOverrides)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const stored = settings?.ui?.keymap?.overrides ?? []

  useEffect(() => {
    if (settings === null) return
    const byAction = new Map(stored.map((o) => [o.action, o.keys]))
    const next: Record<string, string> = {}
    for (const k of EDITABLE) next[k.action] = byAction.get(k.action) ?? k.keys
    setDraft(next)
    // stored 由 settings 派生，deps 只列 settings（列 stored 会每次渲染都是新数组而反复重置草稿）
  }, [settings]) // eslint-disable-line react-hooks/exhaustive-deps

  const overrides = useMemo<KeyOverride[]>(
    () =>
      EDITABLE.map((k) => ({ action: k.action, keys: (draft[k.action] ?? k.keys).trim() })).filter(
        (o) => o.keys !== (KEYMAP.find((k) => k.action === o.action)?.keys ?? ''),
      ),
    [draft],
  )

  const merged = useMemo(() => mergeKeymap(overrides), [overrides])
  const rejected = useMemo(() => keymapRejected(overrides), [overrides])
  const unparseable = useMemo(() => keymapUnparseable(overrides), [overrides])
  const dirty = !sameOverrides(overrides, stored)
  const blocked = rejected !== null || unparseable.length > 0

  async function save(): Promise<void> {
    await run(async () => {
      await transport.updateSettings({ ui: { keymap: { overrides } } })
      // 写回 store：快捷键当场生效，不必重载页面
      setKeymapOverrides(overrides)
      await refresh()
    })
  }

  async function restoreAll(): Promise<void> {
    await run(async () => {
      await transport.updateSettings({ ui: { keymap: { overrides: [] } } })
      setKeymapOverrides([])
      await refresh()
    })
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (settings === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  return (
    <div className="flex flex-col gap-3">
      {rejected !== null && (
        <div className="rounded-lg border border-[var(--spark-warn)]/40 bg-[var(--spark-warn)]/[0.06] px-3 py-2 text-xs leading-5">
          {rejected.conflicts.map((c) => (
            <p key={c.keys} className="text-[var(--spark-warn)]">
              键位冲突：{c.keys} 同时绑到 {c.actions.join(' / ')}——按下会同时触发两件事，保存已挡住。
            </p>
          ))}
          {rejected.unknownActions.map((a) => (
            <p key={a} className="text-muted-foreground">
              配置里有一条覆盖指向已不存在的条目「{a}」，保存时会被丢弃。
            </p>
          ))}
        </div>
      )}
      {unparseable.length > 0 && (
        <div className="rounded-lg border border-[var(--spark-err)]/40 bg-[var(--spark-err)]/[0.06] px-3 py-2 text-xs leading-5 text-[var(--spark-err)]">
          {unparseable.map((u) => (
            <p key={u.action}>
              「{u.action}」的键串 <span className="font-mono">{u.keys}</span> 解析不出单一按键
              （认 'Ctrl+G' / 'Ctrl/Cmd+K' / 'Shift+Enter' 这类写法）——保存已挡住。
            </p>
          ))}
        </div>
      )}

      <SettingGroupCard>
        {EDITABLE.map((k) => {
          const eff = merged.entries.find((e) => e.action === k.action)
          const value = draft[k.action] ?? k.keys
          return (
            <SettingRow
              key={k.action}
              title={k.action}
              description={`${SURFACE_LABEL[k.surface]}${k.note !== undefined ? ` · ${k.note}` : ''}`}
            >
              <div className="flex shrink-0 items-center gap-2">
                {eff?.overridden === true && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                    {eff.unbound ? '未绑定' : '已自定义'}
                  </span>
                )}
                <Input
                  value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, [k.action]: e.target.value }))}
                  aria-label={k.action}
                  placeholder="留空 = 解除绑定"
                  className="h-7 w-40 font-mono text-xs"
                />
                {eff?.overridden === true && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft((d) => ({ ...d, [k.action]: k.keys }))}
                  >
                    恢复
                  </Button>
                )}
              </div>
            </SettingRow>
          )
        })}
      </SettingGroupCard>

      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={() => void save()} disabled={busy || !dirty || blocked}>
          {busy ? '保存中…' : '保存'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void restoreAll()} disabled={busy || stored.length === 0}>
          全部恢复默认
        </Button>
        {opError !== null && <span className="text-xs text-destructive">{opError}</span>}
        {dirty && !blocked && <span className="text-xs text-muted-foreground">有未保存的改动</span>}
      </div>

      <section className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          以下 {READONLY.length} 条暂不可自定义——它们的键位描述不是单一按键（如
          'Home / End / Ctrl+A / Ctrl+E'、'Ctrl+C ×2'），或所在端还没接入覆盖层；给一个改了不生效的
          输入框比不给更坏，故只读列出。CLI 侧目前也只展示生效表、不接管按下。
        </p>
        <SettingGroupCard>
          {READONLY.map((k) => (
            <SettingRow
              key={k.action}
              title={k.action}
              description={`${SURFACE_LABEL[k.surface]}${k.note !== undefined ? ` · ${k.note}` : ''}`}
            >
              {/* 不用 SettingRow 的 placeholderBadge——它与 children 二选一，会把键串顶掉 */}
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{k.keys}</span>
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                  未接入
                </span>
              </span>
            </SettingRow>
          ))}
        </SettingGroupCard>
      </section>
    </div>
  )
}
