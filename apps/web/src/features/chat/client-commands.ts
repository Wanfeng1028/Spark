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

/** client 命令动作：navigate = 跳设置页；palette = 打开命令面板（会话切换）；
 *  rename = 会话改名（阶段十九 19.20）；new-session = 新建并跳转（19.21）；
 *  open-dialog = 开会话级对话框（checkpoint/tree，19.21——SessionPage 持有开合态）；
 *  cycle-effort = 循环推理档（19.21，Composer 既有 setter）；fork-last = 从最后一条
 *  消息 fork（19.21）；rollback-last = 回滚到上一检查点（19.21，CheckpointDialog 同端点） */
export type ClientCommandAction =
  | { kind: 'navigate'; path: string }
  | { kind: 'palette' }
  | { kind: 'voice' }
  | { kind: 'rename' }
  | { kind: 'new-session' }
  | { kind: 'open-dialog'; dialog: 'checkpoint' | 'tree' }
  | { kind: 'cycle-effort' }
  | { kind: 'fork-last' }
  | { kind: 'rollback-last' }

/** web 端实现映射（键空间 = ClientAction；未实现端不渲染，故为 Partial） */
export const CLIENT_ACTIONS: Readonly<Partial<Record<ClientAction, ClientCommandAction>>> = {
  model: { kind: 'navigate', path: '/settings/models' },
  mcp: { kind: 'navigate', path: '/settings/mcp' },
  skills: { kind: 'navigate', path: '/settings/skills' },
  usage: { kind: 'navigate', path: '/settings/usage' },
  // 语言服务器面板（工单 16.9）：连接状态 + 诊断摘要（/settings/lsp 只读页）
  lsp: { kind: 'navigate', path: '/settings/lsp' },
  resume: { kind: 'palette' },
  // 语音听写模式循环（工单 16.6）：执行由调用处接 ui store cycleVoiceMode
  voice: { kind: 'voice' },
  // 子代理管理页（工单 16.2）
  agents: { kind: 'navigate', path: '/settings/subagents' },
  // 文件夹信任（工单 16.4）与扩展（工单 16.5）
  trust: { kind: 'navigate', path: '/settings/security' },
  extensions: { kind: 'navigate', path: '/settings/plugins' },
  // 电脑控制页（阶段十九 19.2）
  computer: { kind: 'navigate', path: '/settings/computer' },
  // 沙箱与网络页（阶段十九 19.7）：出口域名过滤与代理状态
  sandbox: { kind: 'navigate', path: '/settings/sandbox' },
  // 会话改名（阶段十九 19.20）：/rename 与 /title 同实现
  rename: { kind: 'rename' },
  // 以下七项（阶段十九 19.21）：补 18 个 client 命令中 web 缺映射的 8 项里的 7 项。
  // /help 不映射：web 无帮助面板（键位说明在 CLI /help 与文档站）——**未实现端不渲染**，
  // 命令面板过滤掉它，禁假状态（不做一个点了没反应的入口）。
  new: { kind: 'new-session' },
  stats: { kind: 'navigate', path: '/settings/usage' },
  checkpoint: { kind: 'open-dialog', dialog: 'checkpoint' },
  tree: { kind: 'open-dialog', dialog: 'tree' },
  effort: { kind: 'cycle-effort' },
  fork: { kind: 'fork-last' },
  rollback: { kind: 'rollback-last' },
}

/** 是否 client 命令（前端本地执行，不进引擎） */
export function isClientCommand(name: string, commands: readonly CommandDto[]): boolean {
  return commands.some((c) => c.name === name && c.kind === 'client')
}

/** 命令名 → 本端动作（未实现返 undefined——禁假状态，调用处如实处理） */
export function clientActionOf(name: string): ClientCommandAction | undefined {
  return CLIENT_ACTIONS[name as ClientAction]
}
