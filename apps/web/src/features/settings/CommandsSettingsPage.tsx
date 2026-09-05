/**
 * 命令只读页（工单 10.20 A④）：GET /api/commands——内置 + 自定义命令清单。
 * 形态照 McpSettingsPage：只读真值呈现，不假装可写——自定义 .md 命令的
 * 增改走 ~/.spark/commands 目录，页面如实说明。
 */
import type { CommandDto } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { SettingGroupCard, SettingRow } from './SettingRow'

/** kind → 人话徽标（action=引擎动作 / prompt=自定义提示词 / client=界面命令） */
const KIND_LABEL: Record<CommandDto['kind'], string> = {
  action: '引擎',
  prompt: '自定义',
  client: '界面',
}

export function CommandsSettingsPage() {
  const { data: commands, error } = useTransportQuery((t) => t.listCommands())

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (commands === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  if (commands.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        无可用命令——自定义命令放 ~/.spark/commands（.md 文件）后重启生效。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingGroupCard>
        {commands.map((c) => (
          <SettingRow
            key={c.name}
            title={`/${c.name}`}
            description={c.description !== '' ? c.description : '—'}
          >
            <span className="shrink-0 rounded border border-border px-1.5 text-[11px] text-muted-foreground">
              {KIND_LABEL[c.kind]}
            </span>
          </SettingRow>
        ))}
      </SettingGroupCard>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        只读清单：引擎动作经会话执行，自定义命令增改走 ~/.spark/commands（.md 文件，保存后重启生效）。
      </p>
    </div>
  )
}
