/**
 * 占位页（§13.D 未落地页统一形态）：
 * 分组卡内一行说明 + badge 标注（去向明示：desktop 特化 / v2 挂池），无可交互控件——
 * 不放假开关（假状态禁令），占位即明示"未落地 + 去向"（工单 10.20 C）。
 */
import { SettingRow, SettingGroupCard } from './SettingRow'

export function PlaceholderPage({
  title,
  reason,
}: {
  title: string
  reason: 'desktop 特化' | '后续工单' | 'v2 挂池' | undefined
}) {
  return (
    <SettingGroupCard>
      <SettingRow
        title={`${title}尚未落地`}
        description={
          reason === 'v2 挂池'
            ? '去向已登记 v2 候选池（doc/02 §8.7）——能力立项后在此填充设置项'
            : reason === 'desktop 特化'
              ? '桌面版（Electron）特有能力，web 端不提供'
              : '此页为骨架占位——对应能力落地后在此填充设置项'
        }
        placeholderBadge={reason === undefined ? '待立项' : reason}
      />
    </SettingGroupCard>
  )
}
