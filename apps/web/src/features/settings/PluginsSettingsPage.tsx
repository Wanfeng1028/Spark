/**
 * 扩展页（工单 16.5 / ADR D38）：声明式内容包清单 + 启停 Switch。
 * 扩展 = ~/.spark/extensions/<id>/ 目录 + spark-extension.json（不执行任意代码，D18）；
 * 启停写 settings.extensions.disabledExtensions 名单（PUT /api/extensions/:id/enabled，
 * 重启档——注册表装配在构造期，页面如实标注）。v1 无安装/下载（ADR D38 登记限制）。
 */
import type { ExtensionDto } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { Switch } from '@/components/ui/switch'
import { SettingGroupCard, SettingRow } from './SettingRow'

/** 内容面一句话（有则列，无则不收窄） */
function contentSummary(e: ExtensionDto): string[] {
  const parts: string[] = []
  if (e.skills !== undefined) parts.push(`${e.skills.length} 技能`)
  if (e.agents !== undefined) parts.push(`${e.agents.length} 子代理`)
  if (e.commands !== undefined) parts.push(`${e.commands.length} 命令`)
  if (e.mcpServers !== undefined) parts.push(`${e.mcpServers.length} MCP 服务器`)
  return parts
}

export function PluginsSettingsPage() {
  const { transport } = useTransport()
  const { data: extensions, error, refresh } = useTransportQuery((t) => t.listExtensions())
  const { busy, opError, run } = useAsyncOp()

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (extensions === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  if (extensions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        没有已安装扩展——把声明式内容包放进 ~/.spark/extensions/&lt;id&gt;/（含
        spark-extension.json 清单）即可被发现；扩展只声明 skills/agents/命令/MCP
        服务器，不执行任意代码。v1 无安装源，安装 = 手动放置目录。
      </p>
    )
  }

  /** 启停开关：直接调启停端点（引擎内写 settings.extensions 名单），成功后重拉对齐 */
  async function toggle(id: string, enabled: boolean): Promise<void> {
    await run(async () => {
      await transport.setExtensionEnabled(id, enabled)
      await refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        启停写 spark.json（extensions.disabledExtensions），重启后生效于新会话装配。
      </p>
      {opError !== null && <p className="text-xs text-destructive">{opError}</p>}
      <SettingGroupCard>
        <div className="divide-y divide-border">
          {extensions.map((e) => (
            <SettingRow
              key={e.id}
              title={`${e.name}（${e.id}）`}
              description={[
                `v${e.version}`,
                e.description,
                ...contentSummary(e),
              ].join(' · ')}
            >
              <Switch
                aria-label={`启停扩展 ${e.id}`}
                checked={e.enabled}
                disabled={busy}
                onChange={(v) => void toggle(e.id, v)}
              />
            </SettingRow>
          ))}
        </div>
      </SettingGroupCard>
    </div>
  )
}
