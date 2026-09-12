/**
 * 子智能体页（工单 13.5 只读清单 → 工单 16.2 / ADR D36 管理态）：
 * 两层预设档清单（项目层 .spark/agents/<name>.json 覆盖用户层 ~/.spark/agents/<name>.json）
 * + 启停 Switch——停用名单写 spark.json agents.disabledAgents（PUT /api/settings 既有端点，
 * 重启档：预设档构造期装载，页面如实标注"重启后生效"）。
 * 定义文件增删改仍归用户手改（声明式 D18 哲学；写入过审批面不进本单）。
 */
import type { AgentPresetDto } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { Switch } from '@/components/ui/switch'
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

const SOURCE_LABEL: Record<'project' | 'user', string> = {
  project: '项目层（.spark/agents/）',
  user: '用户层（~/.spark/agents/）',
}

export function SubagentsSettingsPage() {
  const { transport } = useTransport()
  const { data: presets, error, refresh } = useTransportQuery((t) => t.listAgentPresets())
  const { data: settings } = useTransportQuery((t) => t.getSettings())
  const { busy, opError, run } = useAsyncOp()

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (presets === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  if (presets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        没有预设档——把声明式 JSON 放进 ~/.spark/agents/&lt;name&gt;.json（用户层）或
        .spark/agents/&lt;name&gt;.json（项目层，覆盖用户层同名）后重启生效；模型经 task 工具的
        preset 参数指名调用。
      </p>
    )
  }

  const disabledNames = new Set(settings?.agents?.disabledAgents ?? [])

  /** 启停开关：名单语义（补丁带即全量覆盖）——从现值出发增删该项，成功后重拉对齐 */
  async function toggle(name: string, enable: boolean): Promise<void> {
    const current = new Set(disabledNames)
    if (enable) current.delete(name)
    else current.add(name)
    await run(async () => {
      await transport.updateSettings({ agents: { disabledAgents: [...current] } })
      await refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        启停写 spark.json（agents.disabledAgents），重启后生效——运行中的会话不受影响。
      </p>
      {opError !== null && <p className="text-xs text-destructive">{opError}</p>}
      {(['project', 'user'] as const).map((layer) => {
        const group = presets.filter((p) => (p.source ?? 'user') === layer)
        if (group.length === 0) return null
        return (
          <SettingGroupCard key={layer}>
            <div className="px-4 pt-3">
              <p className="font-mono text-[11px] text-muted-foreground">{SOURCE_LABEL[layer]}</p>
            </div>
            <div className="divide-y divide-border">
              {group.map((p) => {
                const enabled = !disabledNames.has(p.name) && p.disabled !== true
                return (
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
                  >
                    <Switch
                      aria-label={`启停子代理 ${p.name}`}
                      checked={enabled}
                      disabled={busy}
                      onChange={(v) => void toggle(p.name, v)}
                    />
                  </SettingRow>
                )
              })}
            </div>
          </SettingGroupCard>
        )
      })}
    </div>
  )
}
