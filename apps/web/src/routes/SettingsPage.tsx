/**
 * 设置中心路由页（DESIGN §13.D 页面骨架）：页头=大标题 20px semibold + 说明 12px meta 色；
 * 内容列 max-width 768px 居中；页面级滚动收在本页（AppShell 锁页面滚动的例外区）。
 * ready 页映射真组件，其余渲染占位页；未知 :page 段重定向到外观页。
 */
import { Navigate, useParams } from 'react-router'
import { findSettingsPage } from '@/features/settings/settings-pages'
import { GeneralSettingsPage } from '@/features/settings/GeneralPage'
import { AppearancePage } from '@/features/settings/AppearancePage'
import { ModelSettingsPage } from '@/features/settings/ModelSettingsPage'
import { PermissionRulesPage } from '@/features/settings/PermissionRulesPage'
import { McpSettingsPage } from '@/features/settings/McpSettingsPage'
import { SkillsSettingsPage } from '@/features/settings/SkillsSettingsPage'
import { CommandsSettingsPage } from '@/features/settings/CommandsSettingsPage'
import { HooksSettingsPage } from '@/features/settings/HooksSettingsPage'
import { UsageSettingsPage } from '@/features/settings/UsageSettingsPage'
import { MemorySettingsPage } from '@/features/settings/MemorySettingsPage'
import { DevicesSettingsPage } from '@/features/settings/DevicesSettingsPage'
import { AuditSettingsPage } from '@/features/settings/AuditSettingsPage'
import { PlaceholderPage } from '@/features/settings/PlaceholderPage'

/** ready 页 → 真组件（settings-pages.ts 只承载数据，映射单一来源在此） */
const READY_COMPONENTS = {
  general: GeneralSettingsPage,
  appearance: AppearancePage,
  models: ModelSettingsPage,
  devices: DevicesSettingsPage,
  'permission-rules': PermissionRulesPage,
  mcp: McpSettingsPage,
  skills: SkillsSettingsPage,
  commands: CommandsSettingsPage,
  hooks: HooksSettingsPage,
  usage: UsageSettingsPage,
  memory: MemorySettingsPage,
  audit: AuditSettingsPage,
} as const

export function SettingsPage() {
  const { page } = useParams()
  const def = findSettingsPage(page)

  if (def === undefined) return <Navigate to="/settings/appearance" replace />

  const readyKey = def.id as keyof typeof READY_COMPONENTS
  const Ready = READY_COMPONENTS[readyKey]
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[768px] flex-col gap-5 px-6 py-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-tight">{def.title}</h1>
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </header>
        {def.status === 'ready' && Ready !== undefined ? (
          <Ready />
        ) : (
          <PlaceholderPage title={def.title} reason={def.placeholderReason} />
        )}
      </div>
    </div>
  )
}
