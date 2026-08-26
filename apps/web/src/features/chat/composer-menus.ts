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
import type { Delivery, PermissionPreset } from '@spark/protocol'

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

// ---- / 菜单：命令基线（完整命令面 = 阶段七工单 7.4） ----

export interface SlashCommand {
  name: string
  description: string
  /** false = 7.4 前仅列出不可执行（选中给出提示，不假装执行） */
  available: boolean
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: 'compact', description: '压缩上下文（保留摘要，释放窗口）', available: true },
  { name: 'model', description: '查看或切换会话模型', available: false },
  { name: 'mcp', description: '查看 MCP 服务器与工具', available: false },
  { name: 'skills', description: '查看已加载技能', available: false },
  { name: 'usage', description: '查看本轮与累计用量', available: false },
  { name: 'resume', description: '恢复历史会话', available: false },
]

/** 名称/描述包含过滤词（大小写不敏感） */
export function filterCommands(query: string): readonly SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (q === '') return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
  )
}

/** 7.4 前不可执行命令的选中提示（人话，不留悬空反馈） */
export const COMMAND_PENDING_HINT =
  '该命令将在阶段七工单 7.4（命令注册表）提供完整能力，当前可先正常对话描述需求'

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
