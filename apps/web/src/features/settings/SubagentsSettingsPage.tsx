/**
 * 子智能体页（工单 13.5）：GET /api/agents——子代理预设档只读清单。
 * 预设来自 ~/.spark/agents/&lt;name&gt;.json 声明式文件（ADR D18 同哲学：数据不是程序）；
 * 收窄语义（广告面隐藏 + 会话级 deny 规则）与 action 粒度限制见 doc/02 §5.6.3 task 行。
 * 增删改的管理面板属工单 16.2（/agents），本页只读如实标注写入方式。
 */
import type { AgentPresetDto } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { SettingGroupCard, SettingRow } from './SettingRow'

/** 工具面一句话：allow = 白名单、deny = 黑名单（deny 胜出），未设 = 不收窄 */
function toolsSummary(preset: AgentPresetDto): string {
  const tools = preset.tools
  if (tools === undefined) return '工具面不收窄'
  const parts: string[] = []
  if (tools.allow !== undefined) parts.push(`仅 ${tools.allow.join('、')}`)
  if (tools.deny !== undefined) parts.push(`禁 ${tools.deny.join('、')}`)
  return parts.length === 0 ? '工具面不收窄' : parts.join('；')
}

export function SubagentsSettingsPage() {
  const { data: presets, error } = useTransportQuery((t) => t.listAgentPresets())

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (presets === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  if (presets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        没有预设档——把声明式 JSON 放进 ~/.spark/agents/&lt;name&gt;.json 后重启生效；模型经 task
        工具的 preset 参数指名调用。
      </p>
    )
  }

  return (
    <SettingGroupCard>
      {presets.map((p) => (
        <SettingRow
          key={p.name}
          title={p.name}
          description={[
            p.model !== undefined ? `模型 ${p.model}` : '模型随子代理路由档',
            toolsSummary(p),
            p.title !== undefined ? `缺省标题「${p.title}」` : undefined,
            p.systemAppend !== undefined ? '含 system 附加段' : undefined,
          ]
            .filter((line) => line !== undefined)
            .join(' · ')}
        />
      ))}
    </SettingGroupCard>
  )
}
