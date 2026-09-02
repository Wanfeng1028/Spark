/**
 * slash 菜单（工单 10.10 / §13.K K.5 / 10.18⑦）：输入以 / 开头且未含空格时悬于输入区上方——
 * 行=左命令签名（/name）右一句描述；条目按描述符 group 分组（会话/模型/信息/帮助，
 * 无 group 的自定义命令归"自定义"组置底）；条目多时 (1/N) 分页 + ▾ 续页；
 * ↑↓ 选择、Enter 确认（App 层键处理）、Esc 关闭。
 * 数据源=命令注册表快照（启动时装载；未装载不渲染——禁假状态）。
 */
import { Box, Text } from 'ink'
import type { CommandDto } from '@spark/protocol'

/** 单页行数（终端高度有限——超出分页） */
export const SLASH_PAGE_SIZE = 8

/** 分组序与组名（工单 10.18⑦；描述符 group 字段单一来源） */
const GROUP_ORDER = ['session', 'model', 'info', 'help'] as const
const GROUP_LABEL: Record<string, string> = {
  session: '会话',
  model: '模型',
  info: '信息',
  help: '帮助',
}
const CUSTOM_LABEL = '自定义'

export function filterSlashCommands(commands: CommandDto[], query: string): CommandDto[] {
  const q = query.toLowerCase()
  const filtered =
    q === ''
      ? commands
      : commands.filter(
          (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
        )
  // 按组排序（组内保持注册序——稳定排序）；无 group 的自定义命令置底
  const rank = (c: CommandDto): number => {
    const i = c.group === undefined ? -1 : GROUP_ORDER.indexOf(c.group)
    return i === -1 ? GROUP_ORDER.length : i
  }
  return [...filtered].sort((a, b) => rank(a) - rank(b))
}

export interface SlashMenuProps {
  items: CommandDto[]
  selected: number
  page: number
}

export function SlashMenu({ items, selected, page }: SlashMenuProps) {
  const pageCount = Math.max(1, Math.ceil(items.length / SLASH_PAGE_SIZE))
  const start = page * SLASH_PAGE_SIZE
  const visible = items.slice(start, start + SLASH_PAGE_SIZE)

  // 组头：进入新组时插一行（组已排序连续，页内至多组数行）
  const rows: React.ReactNode[] = []
  let lastGroup: string | undefined = undefined
  let lastGroupSeen = false
  visible.forEach((c, i) => {
    const idx = start + i
    const groupKey = c.group ?? 'custom'
    if (groupKey !== lastGroup || !lastGroupSeen) {
      lastGroup = groupKey
      lastGroupSeen = true
      rows.push(
        <Text key={`h-${groupKey}-${idx}`} color="gray">
          {GROUP_LABEL[groupKey] ?? CUSTOM_LABEL}
        </Text>,
      )
    }
    // Qwen 对齐（工单 10.36，SuggestionsDisplay 同款）：活动行 `> ` 紫标记列，普通行两空格；
    // 命令名 accent 紫；描述 gray。不再整行反色（保留 8 项截图里的"> 标记+右移"形态）
    const active = idx === selected
    rows.push(
      <Text key={c.name} wrap="truncate-end">
        <Text color={active ? '#CBA6F7' : 'gray'}>{active ? '> ' : '  '}</Text>
        <Text color="#CBA6F7">/{c.name}</Text>
        {'  '}
        <Text color="gray">{c.description}</Text>
      </Text>,
    )
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray">
      {rows}
      {items.length === 0 ? <Text color="gray">（无匹配命令）</Text> : null}
      <Text color="gray">
        ({page + 1}/{pageCount}){items.length > start + SLASH_PAGE_SIZE ? ' ▾ 续页' : ''} · ↑↓ 选择
        Enter 确认 Esc 关闭
      </Text>
    </Box>
  )
}
