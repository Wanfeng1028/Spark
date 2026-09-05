/**
 * MCP 服务器只读页（工单 7.4 / H04）：GET /api/mcp——各 server 连接状态与工具数。
 * 管理操作（启停/编辑）属 v2 候选池 H17（mcp.json 手编的现状如实说明，不假装可写）。
 */
import { cn } from '@/lib/utils'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { SettingGroupCard, SettingRow } from './SettingRow'

export function McpSettingsPage() {
  const { data: servers, error } = useTransportQuery((t) => t.listMcpServers())

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (servers === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  if (servers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        未配置任何 MCP 服务器——在 ~/.spark/mcp.json 的 servers 段声明后重启生效。
      </p>
    )
  }

  return (
    <SettingGroupCard>
      {servers.map((s) => (
        <SettingRow
          key={s.name}
          title={s.name}
          description={`命令 ${s.command} · 工具 ${s.connected ? s.tools : 0} 个${
            s.connected ? '' : '（连接失败，工具未注册）'
          }`}
        >
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              s.connected ? 'bg-[var(--spark-ok)]' : 'bg-[var(--spark-warn)]',
            )}
            title={s.connected ? '已连接' : '连接失败'}
            aria-label={s.connected ? '已连接' : '连接失败'}
          />
        </SettingRow>
      ))}
    </SettingGroupCard>
  )
}
