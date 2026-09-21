/**
 * 键位表（工单 8.3 成文）：四端键位的单一来源（D22 共享资产纪律的延伸）。
 * CLI（Ink useInput）与 web（keydown）各自的物理键可不同，但语义条目同出一表；
 * cli --help 文本由本表渲染（apps/cli/src/main.tsx），文档引用不复制（AGENTS §8 一条规则一个来源）。
 */
import { z } from 'zod'

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
  { keys: '1 / 2 / 3 / 4（y / a / n）', action: '审批：允许一次 / 总是允许 / 拒绝（展开理由）/ 本项目总是允许', surface: 'cli', note: 'web 为审批卡按钮；4=项目级固化（19.9 / ADR D48）' },
  { keys: 'Ctrl+O', action: '展开/折叠最近一个工具或思考条目', surface: 'cli' },
  { keys: 'Ctrl+N', action: '新建会话（同 /new）', surface: 'cli', note: 'web 为侧栏按钮' },
  { keys: 'PageUp / PageDown', action: '切换会话', surface: 'cli' },
  { keys: '?', action: '帮助面板（三 tab：概览/命令/键位，Tab/Shift+Tab 切换）', surface: 'cli' },
  { keys: 'Ctrl+U', action: '清空输入', surface: 'cli' },
  { keys: 'Home / End / Ctrl+A / Ctrl+E', action: '光标移到行首 / 行尾', surface: 'cli', note: '工单 19.25' },
  { keys: 'Ctrl+K / Ctrl+W', action: '删除光标到行尾 / 删除前一个词', surface: 'cli', note: '工单 19.25（readline 同语义）' },
  { keys: 'Ctrl+C ×2', action: '退出（在途 turn 先中断，不悬挂）', surface: 'cli' },
  { keys: 'Ctrl+R', action: '重试最近一次发送（错误提示存在、无在途 turn 时）', surface: 'cli', note: '工单 10.11 / §13.K K.8' },
  { keys: 'Ctrl/Cmd+K', action: '命令面板', surface: 'web' },
  { keys: 'Ctrl/Cmd+,', action: '设置面（web 设置中心整页 / CLI 设置面板）', surface: 'both', note: '工单 19.23 CLI 侧落地' },
]

/** cli --help 的键位段（只取 cli/both 条目） */
export function cliKeymapText(): string {
  return KEYMAP.filter((k) => k.surface !== 'web')
    .map((k) => `  ${k.keys.padEnd(18)}${k.action}`)
    .join('\n')
}

/**
 * 键位自定义（阶段十九工单 19.39 / V2-22）：用户覆盖层 + 合并 + 冲突检测。
 *
 * 三条设计约束（决定了覆盖面为什么这么窄）：
 * ① **只改物理键，不新增语义**——`action` 是内置表的稳定标识（如 `'发送消息'`），
 *    各端消费点按它查键；允许用户发明新 action 就等于要求各端认得一个不存在的动作。
 * ② **不删内置表**——`KEYMAP` 是四端共享的单一来源，覆盖层只在合并时生效；
 *    内置键的真实按下逻辑在各端物理层（`use-cli-keys.ts` / AppShell 键处理），
 *    本模块只负责"给用户看的那张表"与冲突判定，**不接管按下**（那是各端的事）。
 * ③ 冲突 = 同一 surface 上两条条目占用同一键串——必须在保存前挡下（服务端也校验），
 *    否则用户会拿到一张"看着对、按下去两件事同时发生"的表。
 */
export const KeyOverrideSchema = z.strictObject({
  /** 被改的语义条目（须是 KEYMAP 里的 action 原文；未知键保存时拒） */
  action: z.string().min(1).max(120),
  /** 新键串（如 'Ctrl+G'）；空串 = 解除绑定（该条目在各端表上标"未绑定"） */
  keys: z.string().max(60),
})
export type KeyOverride = z.infer<typeof KeyOverrideSchema>

export const KeymapSettingsSchema = z.strictObject({
  overrides: z.array(KeyOverrideSchema).max(KEYMAP.length).optional(),
})
export type KeymapSettings = z.infer<typeof KeymapSettingsSchema>

/** 合并结果（各端渲染这一份，不再各自拼覆盖） */
export interface EffectiveKeyBinding extends KeyBinding {
  /** true = 用户改过该条目的键位 */
  overridden: boolean
  /** true = 用户解除了绑定（各端应显式标"未绑定"，不得静默回落） */
  unbound: boolean
}

/** 键串归一（比较用）：大小写不敏感、去空白，`Ctrl/Cmd+,` 与 `ctrl + ,` 视为一键 */
function normalizeKeys(keys: string): string {
  return keys.toLowerCase().replace(/\s+/g, '')
}

/** 两条目是否共享生效面（both 与任意一端都算共享） */
function sharesSurface(a: KeyBinding['surface'], b: KeyBinding['surface']): boolean {
  if (a === 'both' || b === 'both') return true
  return a === b
}

/**
 * 内置表 + 用户覆盖 → 生效表；同时给出冲突清单（`键串 → 撞车的动作们`）。
 * 未知 `action` 的覆盖项**丢弃并回传**（不静默生效在别的条目上），
 * 由调用方（web 设置页）如实提示"该条目已不存在于内置表"。
 */
export function mergeKeymap(overrides: readonly KeyOverride[] | undefined): {
  entries: EffectiveKeyBinding[]
  unknownActions: string[]
  conflicts: { keys: string; actions: string[] }[]
} {
  const unknownActions: string[] = []
  const byAction = new Map<string, string>()
  for (const o of overrides ?? []) {
    if (!KEYMAP.some((k) => k.action === o.action)) {
      unknownActions.push(o.action)
      continue
    }
    byAction.set(o.action, o.keys)
  }
  const entries = KEYMAP.map<EffectiveKeyBinding>((k) => {
    const next = byAction.get(k.action)
    if (next === undefined) return { ...k, overridden: false, unbound: false }
    const keys = next.trim()
    return keys === ''
      ? { ...k, keys: k.keys, overridden: true, unbound: true }
      : { ...k, keys, overridden: true, unbound: false }
  })
  const grouped = new Map<string, string[]>()
  for (const e of entries) {
    if (e.unbound) continue
    // 归一键串作分组键：'Ctrl+G' 与 'ctrl + g' 是同一个键，两套写法也判冲突
    const nk = normalizeKeys(e.keys)
    const hits = entries.filter(
      (other) =>
        !other.unbound &&
        sharesSurface(e.surface, other.surface) &&
        normalizeKeys(other.keys) === nk,
    )
    if (hits.length < 2) continue
    const list = grouped.get(nk)
    if (list === undefined) grouped.set(nk, hits.map((h) => h.action))
    else for (const h of hits) if (!list.includes(h.action)) list.push(h.action)
  }
  const conflicts = [...grouped.values()].map((actions) => ({
    keys: actions.length > 0 ? (entries.find((e) => e.action === actions[0])?.keys ?? '') : '',
    actions,
  }))
  return { entries, unknownActions, conflicts }
}

/** 保存前判据：有冲突或全是未知条目 → 调用方拒存（服务端同样校） */
export function keymapRejected(
  overrides: readonly KeyOverride[] | undefined,
): { conflicts: { keys: string; actions: string[] }[]; unknownActions: string[] } | null {
  const merged = mergeKeymap(overrides)
  if (merged.conflicts.length === 0 && merged.unknownActions.length === 0) return null
  return { conflicts: merged.conflicts, unknownActions: merged.unknownActions }
}
