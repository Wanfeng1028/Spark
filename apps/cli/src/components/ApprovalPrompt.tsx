/**
 * 审批框（工单 10.9 / §13.K K.2，挂起态专属渲染）：
 * 三选项纵列——1 是，允许一次 / 2 总是允许 / 3 否，建议更改（esc）；
 * 数字键直达，y/a/n 为别名（键位表 8.3 对位）。
 * 注记：§13.K 原四选项含「本项目总是允许 / 对该用户总是允许」两级，
 * 引擎 replyPermission 暂无作用域参数（always 恒写用户级规则），
 * 不虚设第四项（禁假状态）——作用域扩展记 v2 候选（提交说明登记）。
 * 审批进行中 footer 由 App 层切「请求授权」态（K.2 纪律）。
 */
import { Box, Text } from 'ink'
import type { UiItem } from '@spark/protocol'

export type ApprovalItem = Extract<UiItem, { kind: 'approval' }>

export function ApprovalPrompt({ item }: { item: ApprovalItem }) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text color="yellow">[审批]</Text> {item.action} <Text bold>{item.resource}</Text>
      </Text>
      {item.reason !== '' ? <Text color="gray">理由：{item.reason}</Text> : null}
      <Text color="gray">
        1 是，允许一次（y） · 2 总是允许（a） · 3 否，建议更改（n，esc 取消）
      </Text>
    </Box>
  )
}
