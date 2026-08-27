/**
 * MCP 服务器只读页（工单 7.4 / H04）：GET /api/mcp——各 server 连接状态与工具数。
 * 管理操作（启停/编辑）属 v2 候选池 H17（mcp.json 手编的现状如实说明，不假装可写）。
 */
import { useEffect, useState } from 'react'
import type { McpServerDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { cn } from '@/lib/utils'
import { SettingGroupCard, SettingRow } from './SettingRow'

type LoadState = 'loading' | { error: string }

export function McpSettingsPage() {
  const { transport } = useTransport()
  const [servers, setServers] = useState<McpServerDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    transport
      .listMcpServers()
      .then((list) => {
        if (!cancelled) setServers(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport])

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

export type { LoadState }
