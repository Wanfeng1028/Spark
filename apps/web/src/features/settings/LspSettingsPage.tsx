/**
 * LSP 状态页（工单 16.9）：GET /api/lsp 只读——连接状态点 + 诊断缓存摘要
 * （文件数 / 错误 / 警告）。v1 配置手写（~/.spark/lsp.json，语言→command），
 * 无自动发现无表单——连接管理在引擎惰性拉起，首次 lsp 工具查询才 spawn。
 * 未配置 = 空清单如实提示（禁假状态）。
 */
import type { LspServerStatusDto } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { cn } from '@/lib/utils'
import { SettingGroupCard, SettingRow } from './SettingRow'

export function LspSettingsPage() {
  const { data: servers, error } = useTransportQuery((t) => t.listLspServers())

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (servers === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  return (
    <div className="flex flex-col gap-3">
      <SettingGroupCard>
        {servers.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            未配置任何语言服务器——手写 ~/.spark/lsp.json（version 1；languages 表：语言 → command + args，
            如 typescript-language-server --stdio）。配置改动即时生效：连接按 config hash 复用，
            hash 不变不重启进程。
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
    </div>
  )
}
