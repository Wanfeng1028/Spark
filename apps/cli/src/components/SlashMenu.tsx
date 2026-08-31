/**
 * slash 菜单（工单 10.10 / §13.K K.5）：输入以 / 开头且未含空格时悬于输入区上方——
 * 行=左命令签名（/name）右一句描述；条目多时 (1/N) 分页 + ▾ 续页；
 * ↑↓ 选择、Enter 确认（App 层键处理）、Esc 关闭。
 * 数据源=命令注册表快照（启动时装载；未装载不渲染——禁假状态）。
 */
import { Box, Text } from 'ink'
import type { CommandDto } from '@spark/protocol'

/** 单页行数（终端高度有限——超出分页） */
export const SLASH_PAGE_SIZE = 8

export function filterSlashCommands(commands: CommandDto[], query: string): CommandDto[] {
  const q = query.toLowerCase()
  if (q === '') return commands
  return commands.filter(
    (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
  )
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

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray">
      {visible.map((c, i) => {
        const idx = start + i
        return (
          <Text key={c.name} inverse={idx === selected} wrap="truncate-end">
            <Text color="cyan">/{c.name}</Text>
            {'  '}
            <Text color="gray">{c.description}</Text>
          </Text>
        )
      })}
      {items.length === 0 ? <Text color="gray">（无匹配命令）</Text> : null}
      <Text color="gray">
        ({page + 1}/{pageCount}){items.length > start + SLASH_PAGE_SIZE ? ' ▾ 续页' : ''} · ↑↓ 选择
        Enter 确认 Esc 关闭
      </Text>
    </Box>
  )
}
