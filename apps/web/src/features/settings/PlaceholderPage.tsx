/**
 * 占位页（§13.D 未截图/后续工单页统一形态）：
 * 分组卡内一行说明 + badge 标注（desktop 特化 / 后续工单），无可交互控件——
 * 不放假开关（假状态禁令），占位即明示"未落地"。
 */
import { SettingRow, SettingGroupCard } from './SettingRow'

export function PlaceholderPage({
  title,
  reason,
}: {
  title: string
  reason: 'desktop 特化' | '后续工单' | undefined
}) {
  return (
    <SettingGroupCard>
      <SettingRow
        title={`${title}尚未落地`}
        description="此页为骨架占位——对应能力落地后在此填充设置项"
        placeholderBadge={reason === undefined ? '后续工单' : reason}
      />
    </SettingGroupCard>
  )
}
