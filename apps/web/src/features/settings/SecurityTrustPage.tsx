/**
 * 安全与信任页（工单 16.4 / ADR D37）：文件夹信任档清单 + 当前目录有效档 + 修改。
 * trusted.json path → trusted/untrusted 两档，祖先链深匹配（顺序无关）；
 * 未信任目录下 bash/外部 MCP 的规则层自动放行收紧为 ask（deny/ask 不变——收紧审批而非扩权）。
 */
import type { TrustStatusDto } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { Switch } from '@/components/ui/switch'
import { SettingGroupCard, SettingRow } from './SettingRow'

const TRUST_LABEL: Record<TrustStatusDto['current'], string> = {
  trusted: '已信任',
  untrusted: '明确不信任',
  none: '未信任',
}

export function SecurityTrustPage() {
  const { transport } = useTransport()
  const { data: trust, error, refresh } = useTransportQuery((t) => t.getTrust())
  const { busy, opError, run } = useAsyncOp()

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (trust === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  /** 档位切换：Switch 开 = trusted / 关 = untrusted（两态显式，none = 未列出） */
  async function setTrust(path: string, trusted: boolean): Promise<void> {
    await run(async () => {
      await transport.setTrust(path, trusted ? 'trusted' : 'untrusted')
      await refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        当前工作目录：
        <span className="font-mono">{TRUST_LABEL[trust.current]}</span>
        ——未信任目录下 bash 与外部 MCP 工具的用户级自动放行收紧为逐次询问（deny 规则不受影响）。
      </p>
      {opError !== null && <p className="text-xs text-destructive">{opError}</p>}
      <SettingGroupCard>
        <div className="divide-y divide-border">
          {trust.folders.length === 0 ? (
            <div className="px-4 py-3.5">
              <p className="text-xs text-muted-foreground">
                trusted.json 暂无条目——打开陌生仓库时建议保持未信任（审批收紧），常驻项目可在此显式信任。
              </p>
            </div>
          ) : (
            trust.folders.map((f) => (
              <SettingRow
                key={f.path}
                title={f.path}
                description={
                  f.trust === 'trusted'
                    ? '已信任——该目录（含子目录）下自动放行照常生效'
                    : '明确不信任——该目录下 bash/MCP 自动放行收紧为逐次询问'
                }
              >
                <Switch
                  aria-label={`信任档切换 ${f.path}`}
                  checked={f.trust === 'trusted'}
                  disabled={busy}
                  onChange={(v) => void setTrust(f.path, v)}
                />
              </SettingRow>
            ))
          )}
        </div>
      </SettingGroupCard>
    </div>
  )
}
