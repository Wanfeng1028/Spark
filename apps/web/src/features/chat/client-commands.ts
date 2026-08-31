/**
 * client 命令动作表（工单 7.4 / H04 / 10.18 描述符架构）：
 * 键 = 协议 clientAction 封闭枚举（单一词表 @spark/protocol commands.ts）；
 * 本端只实现 surface 含 web 的命令——未实现的 clientAction 不进表，
 * 命令清单面向本端过滤后不渲染（禁假状态）。覆盖不变量见
 * tests/client-commands.test.ts（防 /model 在 web 坏掉复发的回归网）。
 * 动作是声明式的（导航目标 / 打开命令面板），执行由调用处注入 navigate 与
 * setPaletteOpen——本模块保持纯逻辑可单测，不依赖 React Router。
 */
import type { ClientAction, CommandDto } from '@spark/protocol'

/** client 命令动作：navigate = 跳设置页；palette = 打开命令面板（会话切换） */
export type ClientCommandAction = { kind: 'navigate'; path: string } | { kind: 'palette' }

/** web 端实现映射（键空间 = ClientAction；未实现端不渲染，故为 Partial） */
export const CLIENT_ACTIONS: Readonly<Partial<Record<ClientAction, ClientCommandAction>>> = {
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

/** 命令名 → 本端动作（未实现返 undefined——禁假状态，调用处如实处理） */
export function clientActionOf(name: string): ClientCommandAction | undefined {
  return CLIENT_ACTIONS[name as ClientAction]
}
