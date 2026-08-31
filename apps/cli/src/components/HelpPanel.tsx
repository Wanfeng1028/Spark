/**
 * 帮助面板（工单 10.10 / §13.K K.6，? 唤起）：三 tab——概览/命令/键位。
 * Tab/Shift+Tab 切换 tab、Esc 关闭（App 层键处理）；
 * 键位数据源=单一键位表 @spark/protocol KEYMAP（§6.11.1 纪律：只读同一来源不复制）。
 */
import { Box, Text } from 'ink'
import { KEYMAP } from '@spark/protocol'
import type { CommandDto, KeyBinding } from '@spark/protocol'
import { useCliStore } from '../store.js'

const TABS = ['概览', '命令', '键位'] as const

export function HelpPanel({ columns }: { columns: number }) {
  const tab = useCliStore((s) => s.helpTab)
  const commands = useCliStore((s) => s.commands)

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box>
        {TABS.map((t, i) =>
          i === tab ? (
            <Text key={t} inverse>
              {' '}
              {t}{' '}
            </Text>
          ) : (
            <Text key={t} color="gray">
              {' '}
              {t}{' '}
            </Text>
          ),
        )}
        <Text color="gray">  Tab/Shift+Tab 切换 · Esc 关闭</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {tab === 0 ? <Overview /> : null}
        {tab === 1 ? <Commands commands={commands} columns={columns} /> : null}
        {tab === 2 ? <Keymap /> : null}
      </Box>
    </Box>
  )
}

function Overview() {
  return (
    <Box flexDirection="column">
      <Text>Spark CLI —— Agent 工作台终端形态（单栏会话优先，ADR D19 修订）。</Text>
      <Text color="gray">会话管理：/new 新建 · /resume 恢复历史会话；/stats 查看水位明细。</Text>
      <Text color="gray">输入消息 Enter 发送；/ 前缀为命令；运行中 Esc 中断。</Text>
    </Box>
  )
}

function Commands({ commands, columns }: { commands: CommandDto[]; columns: number }) {
  if (commands.length === 0) return <Text color="gray">（命令清单未装载——服务不可达时为空）</Text>
  const nameWidth = Math.min(
    24,
    Math.max(...commands.map((c) => c.name.length)) + 2,
  )
  return (
    <Box flexDirection="column">
      {commands.map((c) => (
        <Text key={c.name} wrap="truncate-end">
          <Text color="cyan">/{c.name}</Text>
          {' '.repeat(Math.max(1, nameWidth - c.name.length))}
          <Text color="gray">{c.description}</Text>
        </Text>
      ))}
      <Text color="gray" wrap="truncate-end">
        {'—'.repeat(Math.min(columns - 2, 40))}
      </Text>
      <Text color="gray">共 {commands.length} 条（引擎注册表：内置 + ~/.spark/commands）</Text>
    </Box>
  )
}

/** 生效区人话（K.6 四列之三；数据源 keymap.surface） */
const SURFACE_COPY: Record<KeyBinding['surface'], string> = {
  cli: '终端',
  web: '网页',
  both: '两端',
}

function Keymap() {
  return (
    <Box flexDirection="column">
      <Text color="gray">{'键'.padEnd(14)}行为（生效区 · 备注）</Text>
      {KEYMAP.filter((k) => k.surface !== 'web').map((k) => (
        <Text key={k.keys} wrap="truncate-end">
          <Text color="cyan">{k.keys.padEnd(16)}</Text>
          {k.action}
          <Text color="gray">
            {' '}
            〔{SURFACE_COPY[k.surface]}〕
            {k.note !== undefined ? `（${k.note}）` : ''}
          </Text>
        </Text>
      ))}
    </Box>
  )
}
