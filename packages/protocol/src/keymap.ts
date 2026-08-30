/**
 * 键位表（工单 8.3 成文）：四端键位的单一来源（D22 共享资产纪律的延伸）。
 * CLI（Ink useInput）与 web（keydown）各自的物理键可不同，但语义条目同出一表；
 * cli --help 文本由本表渲染（apps/cli/src/main.tsx），文档引用不复制（AGENTS §8 一条规则一个来源）。
 */

export interface KeyBinding {
  /** 键位描述（cli 口径；web 对应键在 note 说明） */
  keys: string
  /** 一句语义（与端无关——"发送消息"而非"按下 Enter"） */
  action: string
  /** 适用端 */
  surface: 'cli' | 'web' | 'both'
  /** 与另一端的对位说明（可选） */
  note?: string
}

export const KEYMAP: readonly KeyBinding[] = [
  { keys: 'Enter', action: '发送消息', surface: 'both', note: 'web Shift+Enter 换行' },
  { keys: '/', action: '命令前缀（注册表：/compact 与自定义 .md）', surface: 'both' },
  { keys: 'Tab', action: '循环提交模式 now / steer / queue', surface: 'cli', note: 'web 为 Composer 分段选择' },
  { keys: 'Esc', action: '中断当前 turn', surface: 'cli', note: 'web 为停止按钮；面板开放时先关面板' },
  { keys: '1 / 2 / 3（y / a / n）', action: '审批：允许一次 / 总是允许 / 拒绝（展开理由）', surface: 'cli', note: 'web 为审批卡按钮' },
  { keys: 'Ctrl+O', action: '展开/折叠最近一个工具或思考条目', surface: 'cli' },
  { keys: 'Ctrl+N', action: '新建会话（同 /new）', surface: 'cli', note: 'web 为侧栏按钮' },
  { keys: 'PageUp / PageDown', action: '切换会话', surface: 'cli' },
  { keys: '?', action: '帮助面板（三 tab：概览/命令/键位，Tab/Shift+Tab 切换）', surface: 'cli' },
  { keys: 'Ctrl+U', action: '清空输入', surface: 'cli' },
  { keys: 'Ctrl+C ×2', action: '退出（在途 turn 先中断，不悬挂）', surface: 'cli' },
  { keys: 'Ctrl/Cmd+K', action: '命令面板', surface: 'web' },
  { keys: 'Ctrl/Cmd+,', action: '设置页', surface: 'web' },
]

/** cli --help 的键位段（只取 cli/both 条目） */
export function cliKeymapText(): string {
  return KEYMAP.filter((k) => k.surface !== 'web')
    .map((k) => `  ${k.keys.padEnd(18)}${k.action}`)
    .join('\n')
}
