/**
 * @ 文件路径补全面板（工单 10.53 / doc/02 批次 6，qwen useAtCompletion 同形态）：
 * 草稿尾部词以 @ 开头即悬于输入区上方——左=路径段（目录带 / 后缀）右=目录/文件标记；
 * 条目多时 (1/N) 分页 + ▾ 续页；↑↓ 选择、Enter 补全（回写路径，目录不关闭不加尾空格）、Esc 关闭。
 * 数据源=GET /api/sessions/:id/fs（会话 cwd 目录列举，硬边界内；仅补路径不含内容——禁假状态）。
 * 复用 SlashMenu 的下拉形态（活动行 > 紫标记、圆角灰框）；@ 检测为 CLI-local 派生态
 * （与 slashQuery 同模式；web detectMenu 的另一实现，跨端统一留阶段十七 R-G）。
 */
import { Box, Text } from 'ink'
import type { FsEntryDto } from '@spark/protocol'

/** 单页行数（与 SlashMenu 同口径——终端高度有限，超出分页） */
export const FS_PAGE_SIZE = 8

/**
 * 草稿尾部 @ token 解析：取末尾连续非空白词（光标常在行尾输入路径），词首为 @ 即触发。
 * 返回 { start: @ 在草稿中的下标, query: @ 后的部分路径 }；无有效 token 返回 null。
 * 词首判定（前一字符为空白或串首）与 web detectMenu 同语义——避免 hello@x 误触发。
 */
export function parseAtToken(draft: string): { start: number; query: string } | null {
  const m = /\S+$/.exec(draft)
  if (m === null) return null
  const word = m[0]
  if (!word.startsWith('@')) return null
  return { start: m.index, query: word.slice(1) }
}

export interface FsMenuProps {
  entries: FsEntryDto[]
  selected: number
  page: number
}

export function FsMenu({ entries, selected, page }: FsMenuProps) {
  const pageCount = Math.max(1, Math.ceil(entries.length / FS_PAGE_SIZE))
  const start = page * FS_PAGE_SIZE
  const visible = entries.slice(start, start + FS_PAGE_SIZE)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray">
      {visible.map((entry, i) => {
        const idx = start + i
        const active = idx === selected
        return (
          <Text key={entry.path} wrap="truncate-end">
            <Text color={active ? '#CBA6F7' : 'gray'}>{active ? '> ' : '  '}</Text>
            <Text>{entry.isDir ? `${entry.name}/` : entry.name}</Text>
            {'  '}
            <Text color="gray">{entry.isDir ? '目录' : '文件'}</Text>
          </Text>
        )
      })}
      {entries.length === 0 ? <Text color="gray">（无匹配路径）</Text> : null}
      <Text color="gray">
        ({page + 1}/{pageCount})
        {entries.length > start + FS_PAGE_SIZE ? ' ▾ 续页' : ''} · ↑↓ 选择 Enter 补全 Esc 关闭
      </Text>
    </Box>
  )
}
