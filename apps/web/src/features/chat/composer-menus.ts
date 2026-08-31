/**
 * Composer 菜单纯逻辑（DESIGN §13.E，工单 6.3）：@ 菜单与 / 菜单的触发检测、
 * 命令基线与过滤、权限档位表。无 React 依赖——单测直接覆盖（tests/composer-menus.test.ts）。
 *
 * - @ 菜单：光标所在词以 @ 开头即触发（可位于句中——文件提及常在中段）；
 *   分组=文件 / 技能。文件列表来源（引擎目录 API）与技能清单接口未接入
 *   （阶段七 7.4 命令注册表），先以空分组壳落地——菜单结构/键盘导航真实可用。
 * - / 菜单：仅行首的 / 词触发（避免路径误触发）；分组=命令 / 技能。
 *   命令基线 = DESIGN §13.E 内置六条（完整命令面 = 阶段七工单 7.4）；
 *   技能行用 $ 前缀与 / 命令区分（实测 ZCode 同款）。
 */
import { FileEdit, ListTodo, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react'
import { BUILTIN_COMMANDS } from '@spark/protocol'
import type { CommandDto, Delivery, PermissionPreset } from '@spark/protocol'
import { CLIENT_ACTIONS } from './client-commands'

// ---- 触发检测 ----

export interface MenuQuery {
  kind: 'at' | 'slash'
  /** 触发符后的过滤词（不含 @ 或 /） */
  query: string
  /** 触发符在草稿中的下标（选中后回写替换的起点） */
  start: number
}

/**
 * 光标处是否处于菜单触发词：从 caret 回溯到最近空白取当前词——
 * 词首为 @ → at 菜单；词首为 / 且位于行首（start=0 或前一字符为换行）→ slash 菜单。
 */
export function detectMenu(text: string, caret: number): MenuQuery | null {
  let start = caret
  while (start > 0 && !isWhitespace(text.charAt(start - 1))) start -= 1
  const word = text.slice(start, caret)
  if (word.startsWith('@') && word.length >= 1) {
    return { kind: 'at', query: word.slice(1), start }
  }
  if (word.startsWith('/') && (start === 0 || text.charAt(start - 1) === '\n')) {
    return { kind: 'slash', query: word.slice(1), start }
  }
  return null
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch)
}

// ---- / 菜单：命令注册表（工单 7.4 / H04——基线 + 自定义合并） ----

export interface SlashCommand {
  name: string
  description: string
  kind: CommandDto['kind']
}

/**
 * web 端显示基线（工单 10.18②：协议描述符单一来源派生，删平行表）——
 * surface 含 web 才进清单；client 命令本端未实现其 clientAction 则不显示（禁假状态）。
 */
export const SLASH_COMMANDS: readonly SlashCommand[] = BUILTIN_COMMANDS.filter((c) => {
  if (!c.surface.includes('web')) return false
  if (c.kind === 'client') {
    return c.clientAction !== undefined && c.clientAction in CLIENT_ACTIONS
  }
  return true
}).map((c) => ({ name: c.name, description: c.description, kind: c.kind }))

/** 基线 + 引擎动态清单合并（内置优先，重名自定义丢弃——与引擎加载纪律一致） */
export function mergeSlashCommands(dynamic: readonly CommandDto[]): readonly SlashCommand[] {
  const customs = dynamic
    .filter((c) => !SLASH_COMMANDS.some((b) => b.name === c.name))
    .map((c) => ({ name: c.name, description: c.description, kind: c.kind }))
  return [...SLASH_COMMANDS, ...customs]
}

/** 名称/描述包含过滤词（大小写不敏感） */
export function filterCommands(
  query: string,
  commands: readonly SlashCommand[] = SLASH_COMMANDS,
): readonly SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (q === '') return commands
  return commands.filter(
    (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
  )
}

/**
 * 输入首词的 / 命令解析（工单 7.4）：整条文本首词以 / 开头且命中清单 →
 * {name, args}（args = 首词后的剩余文本，可为空）；未命中返回 null（走普通发送）。
 */
export function parseCommandInput(
  text: string,
  commands: readonly SlashCommand[],
): { name: string; args: string } | null {
  const m = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (m === null) return null
  const name = m[1] ?? ''
  const args = (m[2] ?? '').trim()
  if (!commands.some((c) => c.name === name)) return null
  return { name, args }
}

// ---- 权限档位（DESIGN §13.E 四档 / ADR D7 补记） ----

export interface PermissionTier {
  id: PermissionPreset
  label: string
  description: string
  icon: LucideIcon
  /** 完全访问：图标转 warn 琥珀色警示（实测 ZCode） */
  warn: boolean
}

/** 缺省档（表首；tierOf 未知值回落） */
const CONFIRM_EACH: PermissionTier = {
  id: 'confirm-each',
  label: '逐项确认',
  description: '改文件前先问我',
  icon: ShieldCheck,
  warn: false,
}

export const PERMISSION_TIERS: readonly PermissionTier[] = [
  CONFIRM_EACH,
  {
    id: 'auto-edit',
    label: '自动编辑',
    description: '自动编辑文件，其余照旧审批',
    icon: FileEdit,
    warn: false,
  },
  {
    id: 'plan',
    label: '计划模式',
    description: '先编制并确认计划，再执行',
    icon: ListTodo,
    warn: false,
  },
  {
    id: 'full-access',
    label: '完全访问',
    description: '减少确认次数',
    icon: ShieldAlert,
    warn: true,
  },
]

export function tierOf(preset: PermissionPreset): PermissionTier {
  return PERMISSION_TIERS.find((t) => t.id === preset) ?? CONFIRM_EACH
}

// ---- 提交模式分段（§13.E：默认档取常规页「交互行为」） ----

/**
 * 分段控件显示值：空闲恒为 now（steer/queue 无活动轮可注入，禁用）；
 * 运行中 now 不可选（轮已在跑），回落到设置默认档（now 视作 steer——§6.2.2 原语义）。
 */
export function segmentDisplay(
  selected: Delivery,
  busy: boolean,
  defaultDelivery: Delivery,
): Delivery {
  if (!busy) return 'now'
  if (selected !== 'now') return selected
  return defaultDelivery === 'queue' ? 'queue' : 'steer'
}
