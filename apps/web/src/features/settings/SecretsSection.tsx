import { useState } from 'react'
import type { SecretStatusDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { SettingRow, SettingGroupCard, settingInputCls } from './SettingRow'

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
  // 加载走 useTransportQuery（R-E① 二批）；set/remove 错误走本地 opError（同条展示）
  const { data: secrets, error: loadError, refresh } = useTransportQuery((t) => t.listSecrets())
  const { busy, opError, run } = useAsyncOp()
  const error = loadError ?? opError
  const [provider, setProvider] = useState('')
  const [value, setValue] = useState('')

  async function save() {
    if (provider.trim() === '' || value.trim() === '') return
    await run(async () => {
    const p = provider.trim()
    await transport.setSecret(p, value.trim())
    await refresh()
    setValue('')
    })
  }

  async function remove(p: string) {
    await run(async () => {
    await transport.removeSecret(p)
    await refresh()
    })
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
          className={settingInputCls + ' w-36'}
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