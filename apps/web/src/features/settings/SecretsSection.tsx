import { useEffect, useState } from 'react'
import type { SecretStatusDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { SettingRow, SettingGroupCard } from './SettingRow'

/** 密钥管理（工单 7.1）：providers 状态列表 + 单条录入（保存即生效，值不回显） */
/**
 * 密钥管理区（工单 7.1 / H01；工单 R-E 自 ModelSettingsPage 拆出，纯移动）：
 * providers 状态列表 + 单条录入（保存即生效，值不回显——只进不回红线）。
 */
/** 密钥来源徽标文案 */
const SOURCE_LABEL: Record<SecretStatusDto['source'], string> = {
  store: '密钥仓',
  env: '环境变量',
  none: '未配置',
}

export function SecretsSection() {
  const { transport } = useTransport()
  const [secrets, setSecrets] = useState<SecretStatusDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [provider, setProvider] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    transport
      .listSecrets()
      .then((ss) => {
        if (!cancelled) setSecrets(ss)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport])

  async function save() {
    if (provider.trim() === '' || value.trim() === '') return
    setBusy(true)
    setOpError(null)
    try {
      const p = provider.trim()
      await transport.setSecret(p, value.trim())
      setSecrets((ss) => {
        const next = ss ?? []
        return next.some((s) => s.provider === p)
          ? next.map((s) => (s.provider === p ? { ...s, source: 'store' as const } : s))
          : [...next, { provider: p, source: 'store' as const }]
      })
      setValue('')
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: string) {
    setBusy(true)
    setOpError(null)
    try {
      await transport.removeSecret(p)
      setSecrets((ss) =>
        (ss ?? []).map((s) => (s.provider === p ? { ...s, source: 'none' as const } : s)),
      )
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingGroupCard>
      <SettingRow
        title="API 密钥（密钥仓）"
        description="~/.spark/secrets.json，优先于环境变量；保存即生效，值不回显"
      />
      {error !== null && (
        <p className="px-4 py-3 font-mono text-xs text-[var(--spark-err)]">{error}</p>
      )}
      {error === null && secrets === null && (
        <p className="px-4 py-3 text-xs text-muted-foreground">加载密钥状态…</p>
      )}
      {error === null && secrets !== null && secrets.length === 0 && (
        <p className="px-4 py-3 text-xs text-muted-foreground">models.json 未配置任何 provider</p>
      )}
      {error === null &&
        secrets !== null &&
        secrets.map((s) => (
          <div key={s.provider} className="flex min-h-12 items-center gap-2 px-4 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{s.provider}</span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {SOURCE_LABEL[s.source]}
            </span>
            {s.source === 'store' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(s.provider)}
                className="h-6 shrink-0 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                删除
              </button>
            )}
          </div>
        ))}
      <div className="flex items-center gap-1.5 px-4 py-3">
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="provider（如 deepseek）"
          aria-label="密钥 provider"
          className="h-8 w-36 min-w-0 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          placeholder="apiKey（写入 ~/.spark/secrets.json）"
          aria-label="apiKey"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
        <button
          type="button"
          disabled={busy || provider.trim() === '' || value.trim() === ''}
          onClick={() => void save()}
          className="h-8 shrink-0 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          保存
        </button>
      </div>
      {opError !== null && (
        <p className="px-4 pb-3 font-mono text-xs text-[var(--spark-err)]">{opError}</p>
      )}
    </SettingGroupCard>
  )
}