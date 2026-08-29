/**
 * client 命令动作表（工单 7.4 / H04）：基线中 kind=client 的五条命令在前端的执行体。
 * 动作是声明式的（导航目标 / 打开命令面板），执行由调用处注入 navigate 与
 * setPaletteOpen——本模块保持纯逻辑可单测，不依赖 React Router。
 */
import type { CommandDto } from '@spark/protocol'

/** client 命令动作：navigate = 跳设置页；palette = 打开命令面板（会话切换） */
export type ClientCommandAction = { kind: 'navigate'; path: string } | { kind: 'palette' }

export const CLIENT_ACTIONS: Readonly<Record<string, ClientCommandAction>> = {
  model: { kind: 'navigate', path: '/settings/models' },
  mcp: { kind: 'navigate', path: '/settings/mcp' },
  skills: { kind: 'navigate', path: '/settings/skills' },
  usage: { kind: 'navigate', path: '/settings/usage' },
  resume: { kind: 'palette' },
}

/** 是否 client 命令（前端本地执行，不进引擎） */
export function isClientCommand(name: string, commands: readonly CommandDto[]): boolean {
  return commands.some((c) => c.name === name && c.kind === 'client')
}
