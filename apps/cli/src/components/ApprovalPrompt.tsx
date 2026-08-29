/**
 * 审批提示（挂起态专属渲染——工单 8.3：y 允许一次 / a 总是允许 / n 拒绝）：
 * 两行高密度——动作+资源一行，理由一行（灰）；拒绝走 InputBox 收 feedback。
 */
import { Box, Text } from 'ink'
import type { UiItem } from '@spark/protocol'

export type ApprovalItem = Extract<UiItem, { kind: 'approval' }>

export function ApprovalPrompt({ item }: { item: ApprovalItem }) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text color="yellow">[审批]</Text> {item.action} <Text bold>{item.resource}</Text>
        <Text color="gray"> — y 允许一次 / a 总是允许 / n 拒绝</Text>
      </Text>
      {item.reason !== '' ? <Text color="gray">理由：{item.reason}</Text> : null}
    </Box>
  )
}
