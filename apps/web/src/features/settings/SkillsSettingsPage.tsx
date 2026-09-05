/**
 * 技能只读页（工单 7.4 / H04）：GET /api/skills——已加载技能的事件与钩子声明。
 * 技能来自 ~/.spark/skills/&lt;name&gt;/skill.json 声明式清单（ADR D18：插件是数据
 * 不是程序）；管理页与市场属 v2 候选池 H17/H18。
 */
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { SettingGroupCard, SettingRow } from './SettingRow'

export function SkillsSettingsPage() {
  const { data: skills, error } = useTransportQuery((t) => t.listSkills())

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (skills === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  if (skills.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        未加载任何技能——把 skill.json 清单放进 ~/.spark/skills/&lt;name&gt;/ 后重启生效。
      </p>
    )
  }

  return (
    <SettingGroupCard>
      {skills.map((s) => (
        <SettingRow
          key={s.name}
          title={s.name}
          description={`${s.events.length} 个插件事件 · ${
            s.hooks.length
          } 个钩子（${s.hooks.map((h) => `${h.on} → ${h.emit}`).join('、') || '无'}）`}
        />
      ))}
    </SettingGroupCard>
  )
}
