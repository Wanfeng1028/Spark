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
  /**
   * 机器可读键规格（阶段十九 19.39 第二批）：**有 spec 的条目才是真能被覆盖层改动的**——
   * 端侧物理层按它比对按键；无 spec 的条目 `keys` 只是给人看的描述（如
   * 'Home / End / Ctrl+A / Ctrl+E'、'Ctrl+C ×2' 这类多键/计数写法无从比对），
   * 编辑面对它们只读并如实说明，不给一个改了不生效的输入框。
   */
  spec?: KeySpec
}

/** 机器可读键规格：与 KeyboardEvent 的字段一一对应，但不依赖 DOM 类型（protocol 零平台依赖）。
 * 三个修饰位缺省即 false，故内置表能写成 `{ key: 'k', ctrlOrMeta: true }` 而不必逐位补 false。 */
export interface KeySpec {
  /** `KeyboardEvent.key`；单字符统一小写比对（'K' 与 'k' 同键），'Enter'/',' 等原样 */
  key: string
  /** true = Ctrl 或 Cmd 任一即算（'Ctrl/Cmd+K' 的跨平台写法） */
  ctrlOrMeta?: boolean
  shift?: boolean
  alt?: boolean
}

/** 物理按键快照：各端从自己的事件对象抽出这一份，protocol 不认识 KeyboardEvent */
export interface KeyStroke {
  key: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

const MOD_CTRL = new Set(['ctrl', 'control', 'cmd', 'command', 'meta', 'win'])
const MOD_SHIFT = new Set(['shift'])
const MOD_ALT = new Set(['alt', 'option'])

/**
 * 具名键 → `KeyboardEvent.key` 的实际取值。列这张表是为了**拒绝解析不出按键的键串**：
 * 若只按 '+' 切分取末段，'Ctrl+C ×2' 会解析成 key='C ×2'——一个永不匹配任何真实按键的规格，
 * 端侧比对不到就等于静默解绑，而 UI 上还显示着用户写的那串字（比直接拒存坏得多）。
 */
const NAMED_KEY_CANON: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  space: ' ',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}
for (let i = 1; i <= 24; i += 1) NAMED_KEY_CANON[`f${i}`] = `F${i}`

/** 主键规范形：单字符取小写，具名键查表；查不到即 null（调用方据此拒存） */
function canonicalKey(raw: string): string | null {
  if (raw.length === 1) return raw.toLowerCase()
  return NAMED_KEY_CANON[raw.toLowerCase()] ?? null
}

/**
 * 键串 → 规格。覆盖层要真生效就必须解析用户写的那串字，认 'Ctrl+G' / 'Ctrl/Cmd+K' /
 * 'Shift+Enter' / '/' 这几类写法；**解析不出一律回 null**（多主键、空串、只有修饰键、
 * 'Ctrl+C ×2' 这类计数写法、以及任何不是合法 `KeyboardEvent.key` 的主键），
 * 由调用方拒存并说明原因——静默当成"没改"或"死绑定"都会让用户以为改成功了。
 */
export function parseKeySpec(raw: string): KeySpec | null {
  const text = raw.trim()
  if (text === '') return null
  let ctrlOrMeta = false
  let shift = false
  let alt = false
  const mains: string[] = []
  for (const part of text.split('+')) {
    const token = part.trim().toLowerCase()
    if (token === '') return null
    // 'ctrl/cmd' 这类斜杠并列写法：每段都命中同一类修饰词才算修饰键，否则当主键
    const words = token.split('/')
    if (words.every((w) => MOD_CTRL.has(w))) {
      ctrlOrMeta = true
    } else if (words.every((w) => MOD_SHIFT.has(w))) {
      shift = true
    } else if (words.every((w) => MOD_ALT.has(w))) {
      alt = true
    } else {
      mains.push(part.trim())
    }
  }
  if (mains.length !== 1) return null
  const key = canonicalKey(mains[0] as string)
  if (key === null) return null
  return { key, ctrlOrMeta, shift, alt }
}

/** 一次按键是否命中某规格（四个修饰位全等 + 主键小写归一后相等） */
export function specMatchesStroke(spec: KeySpec, s: KeyStroke): boolean {
  const key = s.key.length === 1 ? s.key.toLowerCase() : s.key
  return (
    key === spec.key &&
    (spec.ctrlOrMeta ?? false) === (s.ctrl || s.meta) &&
    (spec.shift ?? false) === s.shift &&
    (spec.alt ?? false) === s.alt
  )
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
  { keys: 'Ctrl/Cmd+K', action: '命令面板', surface: 'web', spec: { key: 'k', ctrlOrMeta: true } },
  {
    keys: 'Ctrl/Cmd+,',
    action: '设置面（web 设置中心整页 / CLI 设置面板）',
    surface: 'both',
    note: '工单 19.23 CLI 侧落地',
    spec: { key: ',', ctrlOrMeta: true },
  },
]

/**
 * 端侧物理层查生效规格用的 action 常量（阶段十九 19.39 第二批）。
 * 存在理由：`action` 是覆盖层的身份标识，端侧若各自抄字符串，一个错字就会静默废掉一个快捷键
 * （比对不到 → 按键无反应，且不报错）。keymap.test 有一条断言把本表每个值钉在 KEYMAP 上，
 * 使漂移变成红灯而不是静默故障。**只收已接端侧物理层（有 spec）的条目**——
 * 没接的放进来会诱导消费端以为它可生效。
 */
export const KEYMAP_ACTIONS = {
  /** 命令面板（web AppShell） */
  palette: '命令面板',
  /** 设置面（web AppShell；CLI 侧仍硬编码，见 19.39 登记限制） */
  settings: '设置面（web 设置中心整页 / CLI 设置面板）',
} as const

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
  /**
   * 覆盖后**真正生效**的规格；null = 当前没有机器可比对的键，三种成因要分开看：
   * ① `spec === undefined`（该条目本就没接端侧物理层，改了也不生效）；
   * ② `unbound`（用户主动解绑）；③ `spec` 有但覆盖键串解析不出（`parseKeySpec` 回 null，
   * 保存前必须拒——静默当成解绑会让用户以为改成功了）。区分靠 `spec` 与 `unbound` 两个字段。
   */
  effectiveSpec: KeySpec | null
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
    if (next === undefined) {
      return { ...k, overridden: false, unbound: false, effectiveSpec: k.spec ?? null }
    }
    const keys = next.trim()
    if (keys === '') {
      // 解绑：保留内置键串只为显示"原本是什么"，effectiveSpec 一律 null（无键可按下）
      return { ...k, keys: k.keys, overridden: true, unbound: true, effectiveSpec: null }
    }
    return {
      ...k,
      keys,
      overridden: true,
      unbound: false,
      // 只有本就接了端侧物理层的条目才谈得上"改后生效"；解析不出即 null，由 keymapUnparseable 拒存
      effectiveSpec: k.spec === undefined ? null : parseKeySpec(keys),
    }
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

/**
 * 保存前判据之二（19.39 第二批）：**已接端侧物理层**（有 `spec`）的条目被改成解析不出的键串
 * → 拒存。与 `keymapRejected` 分开是因为语义不同：那边是"这张表不自洽"（撞车/条目已不存在），
 * 这边是"这一行写不出一个能比对的键"——若放行，端侧比对不到任何按键即等于静默解绑，
 * 而 UI 上还显示着用户刚输入的那串字，比拒绝更坏。
 */
export function keymapUnparseable(
  overrides: readonly KeyOverride[] | undefined,
): { action: string; keys: string }[] {
  return mergeKeymap(overrides)
    .entries.filter((e) => e.overridden && !e.unbound && e.spec !== undefined && e.effectiveSpec === null)
    .map((e) => ({ action: e.action, keys: e.keys }))
}

/** 按 action 取生效规格（端侧物理层比对按键走这一条，不自己从表里挑）；未接规格/已解绑 → null */
export function effectiveSpecOf(
  entries: readonly EffectiveKeyBinding[],
  action: string,
): KeySpec | null {
  return entries.find((e) => e.action === action)?.effectiveSpec ?? null
}
