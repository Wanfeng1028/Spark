/**
 * 子代理预设档装载与收窄派生（工单 13.5）：`~/.spark/agents/<name>.json` 声明式预设——
 * 模型覆盖 / 工具面收窄 / system 附加段 / 缺省标题。
 *
 * 纪律：
 * - **声明式文件，不执行代码**（D18 skills 同哲学）；形状 schema 单一来源 = protocol
 *   `AgentPresetSchema`（文件 schema 与 GET /api/agents 的 DTO 共用一份，R-B.4 纪律）。
 * - 加载同 skills/commands loader：目录不存在 = 零预设；坏文件 / 名字非法 / 形状非法 →
 *   warn 跳过，不阻塞引擎启动（逐档失败闭合）。
 * - 工具面收窄**不新建拦截机制**：allow/deny（工具名 pattern，deny 胜出）派生成两件事——
 *   ① 广告面隐藏集（模型看不到）② 会话级 deny 规则（模型仍调用则走既有权限门 →
 *   E_PERMISSION + 审计流归因 rule:session）。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AgentPresetSchema } from '@spark/protocol'
import type { AgentPreset, AgentPresetDto } from '@spark/protocol'
import type { PermissionRule } from '../config.js'
import { errText } from '../errs.js'
import { patternMatches } from '../permission/rules.js'
import type { ToolRegistry } from '../tools/registry.js'

/** 预设档名纪律（同 commands/skills：小写字母数字连字符——防路径与注入花样） */
const AGENT_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

export interface AgentPresetLogger {
  warn(msg: string, fields?: Record<string, unknown>): void
}

/** 单层扫描 `<dir>/agents/*.json`（name = 文件名去扩展名）；逐档失败闭合，带层归属标记 */
async function scanAgentsDir(
  dir: string,
  source: 'project' | 'user',
  logger?: AgentPresetLogger,
): Promise<Map<string, AgentPresetDto>> {
  const agentsDir = join(dir, 'agents')
  let files: string[]
  try {
    files = await readdir(agentsDir)
  } catch {
    return new Map() // 目录不存在 = 零预设（与 commands/skills 缺省同语义）
  }
  const out = new Map<string, AgentPresetDto>()
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const name = file.slice(0, -'.json'.length)
    if (!AGENT_NAME_RE.test(name)) {
      logger?.warn('agents.load.skip', { file, reason: '名字须匹配 ^[a-z0-9][a-z0-9-]*$' })
      continue
    }
    try {
      const raw: unknown = JSON.parse(await readFile(join(agentsDir, file), 'utf8'))
      const preset: AgentPreset = AgentPresetSchema.parse(raw)
      out.set(name, { name, source, ...preset })
    } catch (err) {
      logger?.warn('agents.load.skip', { file, err: errText(err) })
    }
  }
  return out
}

/**
 * 两层加载（工单 16.2 / ADR D36）：用户层 `<root>/agents/*.json`（13.5 既有）+
 * 项目层 `<projectCwd>/.spark/agents/*.json`（相对引擎 defaultCwd）——**项目层覆盖
 * 用户层同名档**（session>project 分层语义对齐 qwen subagent-manager，格式统一 JSON：
 * 本仓配置面 models/settings/mcp/lsp.json 全族一致，不引入 MD+frontmatter 双格式）。
 * projectCwd 缺省 = 仅用户层（13.5 行为逐字节不变）。
 */
export async function loadAgentPresets(
  root: string,
  logger?: AgentPresetLogger,
  projectCwd?: string,
): Promise<AgentPresetDto[]> {
  const merged = await scanAgentsDir(root, 'user', logger)
  if (projectCwd !== undefined) {
    const project = await scanAgentsDir(join(projectCwd, '.spark'), 'project', logger)
    for (const [name, dto] of project) merged.set(name, dto)
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** 被预设排除的工具名：allow 未设 = 全允许；设了则须命中其一；deny 胜出（同审批规则方向） */
export function excludedTools(names: readonly string[], tools: AgentPreset['tools']): string[] {
  if (tools === undefined) return []
  return names.filter((name) => {
    if (tools.allow !== undefined && !tools.allow.some((p) => patternMatches(p, name))) return true
    if (tools.deny !== undefined && tools.deny.some((p) => patternMatches(p, name))) return true
    return false
  })
}

/**
 * 收窄派生：广告面隐藏集 + 会话级 deny 规则（按工具声明的 `permission.action` 合成，
 * resource `**` 跨段全匹配）。同一 action 覆盖多个工具时（write/edit 同为 fs.write）
 * 会一并收窄——这是 action 粒度的必然结果；工具级精确收窄需另立工单（doc/02 §5.6.3 已注明）。
 */
export function presetToolEffects(
  registry: ToolRegistry,
  tools: AgentPreset['tools'],
): { hiddenTools: Set<string>; rules: PermissionRule[] } {
  const names = registry.materialize().map((t) => t.name)
  const excluded = excludedTools(names, tools)
  const actions = new Set<string>()
  for (const name of excluded) {
    const def = registry.resolve(name)
    if (def !== undefined) actions.add(def.permission.action)
  }
  return {
    hiddenTools: new Set(excluded),
    rules: [...actions].map((action) => ({ action, resource: '**', effect: 'deny' as const })),
  }
}
