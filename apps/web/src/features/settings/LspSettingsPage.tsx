/**
 * LSP 状态页（工单 16.9）：GET /api/lsp 只读——连接状态点 + 诊断缓存摘要
 * （文件数 / 错误 / 警告）。连接管理在引擎惰性拉起，首次 lsp 工具查询才 spawn。
 * 安装区（阶段十九 19.5 / ADR D47）：内置清单（protocol 单一来源）逐项安装——
 * npm 全局装 + 写 ~/.spark/lsp.json（POST /api/lsp/install）；已装探测幂等跳过。
 * 手写 ~/.spark/lsp.json 仍然有效（languages 表：语言 → command + args）。
 */
import type { LspServerStatusDto } from '@spark/protocol'
import { KNOWN_LSP_SERVERS } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SettingGroupCard, SettingRow } from './SettingRow'

export function LspSettingsPage() {
  const { transport } = useTransport()
  const { data: servers, error, refresh } = useTransportQuery((t) => t.listLspServers())
  const { busy, opError, run } = useAsyncOp()

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (servers === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  const configuredLanguages = new Set(servers.map((s: LspServerStatusDto) => s.language))

  async function install(id: string): Promise<void> {
    await run(async () => {
      await transport.installLspServer(id)
      await refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingGroupCard>
        {servers.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            未配置任何语言服务器——可在下方从内置清单一键安装，或手写 ~/.spark/lsp.json
            （version 1；languages 表：语言 → command + args）。配置改动即时生效：连接按
            config hash 复用，hash 不变不重启进程。
          </p>
        )}
        {servers.map((s: LspServerStatusDto) => (
          <SettingRow
            key={s.language}
            title={s.language}
            description={`命令 ${s.command} · 诊断 ${s.files} 文件（错误 ${s.errors} / 警告 ${s.warnings}）${
              s.connected ? '' : '（未连接——首次 lsp 工具查询时拉起；失败原因见下）'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  s.connected ? 'bg-[var(--spark-ok)]' : 'bg-[var(--spark-warn)]',
                )}
                title={s.connected ? '已连接' : '未连接'}
                aria-label={s.connected ? '已连接' : '未连接'}
              />
              <span className="font-mono text-xs text-muted-foreground">
                {s.connected ? '已连接' : '未连接'}
              </span>
            </div>
          </SettingRow>
        ))}
      </SettingGroupCard>

      {servers.some((s) => !s.connected && s.error !== undefined) && (
        <SettingGroupCard>
          {servers
            .filter((s) => !s.connected && s.error !== undefined)
            .map((s) => (
              <p key={s.language} className="px-4 py-2 font-mono text-xs text-destructive">
                {s.language}: {s.error}
              </p>
            ))}
        </SettingGroupCard>
      )}

      <SettingGroupCard>
        <div className="px-4 pt-3">
          <p className="font-mono text-[11px] text-muted-foreground">
            内置清单安装（npm 全局装 + 自动写入 ~/.spark/lsp.json；命令已在 PATH 时幂等跳过）
          </p>
        </div>
        <div className="divide-y divide-border">
          {KNOWN_LSP_SERVERS.map((k) => (
            <SettingRow
              key={k.id}
              title={`${k.language}（${k.id}）`}
              description={`${k.description} · ${k.command} ${k.args.join(' ')} · npm: ${k.npmPackages.join(' ')}`}
            >
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void install(k.id)}
              >
                安装
              </Button>
            </SettingRow>
          ))}
        </div>
        <div className="px-4 pb-3 pt-2">
          {opError !== null && (
            <p className="font-mono text-xs text-destructive">{opError}</p>
          )}
          <p className="text-xs text-muted-foreground">
            安装在本机执行 npm 全局安装（需 npm 在 PATH）；写入后新 server 在下次使用该语言
            工具时惰性连接。已配置语言：
            {configuredLanguages.size === 0 ? '（无）' : [...configuredLanguages].join('、')}。
          </p>
        </div>
      </SettingGroupCard>
    </div>
  )
}
