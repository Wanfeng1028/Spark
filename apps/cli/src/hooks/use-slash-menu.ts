/**
 * slash 菜单派生态（工单 10.10；工单 R-G② 自 app.tsx 抽出）：
 * `/` 前缀且未含空格即开——过滤、选中位回位、开合判定。
 */
import { useEffect, useMemo, useState } from 'react'
import type { CommandDto } from '@spark/protocol'
import { filterSlashCommands } from '../components/SlashMenu.js'

export function useSlashMenu(
  panel: string,
  draft: string,
  commands: CommandDto[],
): {
  query: string | null
  items: CommandDto[]
  selected: number
  setSelected: (n: number) => void
  open: boolean
} {
  const query =
    panel === 'none' && draft.startsWith('/') && !draft.includes(' ') ? draft.slice(1) : null
  const items = useMemo(
    () => (query === null ? [] : filterSlashCommands(commands, query)),
    [query, commands],
  )
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    setSelected(0) // 过滤词变化回位首项
  }, [query])
  const open = query !== null && items.length > 0
  return { query, items, selected, setSelected, open }
}
