/**
 * 命令注册表（阶段七工单 7.4 / H04 / doc/02 §8.6）：/命令 解析框架。
 * 命令面基线对齐 Claude Code（compact/model/mcp/skills/usage/resume）。
 * - action：引擎动作（compact——手动压缩，§5.8.5）；
 * - client：前端 UI 动作（model/mcp/skills/usage/resume——导航/打开面板，
 *   引擎只声明清单不执行；统一经 GET /api/commands 下发保证两端清单同源）；
 * - prompt：~/.spark/commands/*.md 自定义命令（文件名即命令名，frontmatter
 *   可选 description；正文为 prompt 模板，$ARGUMENTS 占位符替换用户补充文本，
 *   无占位符则追加——Claude Code 自定义命令同语义）。展开后走正常 turn 通道
 *   （user.message 事件落盘，UI 状态来自事件流，无假状态）。
 * 加载纪律同 skills loader：目录不存在 = 零自定义命令；坏文件/名字非法/与内置
 * 重名 warn 跳过，不阻塞引擎启动。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandDto } from '@spark/protocol'

/** 命令名约束（同 skill name：小写字母/数字/连字符，防路径与注入花样） */
export const COMMAND_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

/** 内置基线（Claude Code 命令面下限；client 命令的执行体在 web/CLI 各端） */
export const BUILTIN_COMMANDS: readonly CommandDto[] = [
  { name: 'compact', description: '压缩上下文（保留摘要，释放窗口）', kind: 'action' },
  { name: 'model', description: '查看或切换会话模型', kind: 'client' },
  { name: 'mcp', description: '查看 MCP 服务器与工具', kind: 'client' },
  { name: 'skills', description: '查看已加载技能', kind: 'client' },
  { name: 'usage', description: '查看本轮与累计用量', kind: 'client' },
  { name: 'resume', description: '恢复历史会话', kind: 'client' },
]

/** 已加载的自定义命令（prompt 正文随行携带——执行时无需再读盘） */
export interface LoadedCommand {
  name: string
  description: string
  prompt: string
}

export interface CommandLogger {
  warn(msg: string, fields?: Record<string, unknown>): void
}

/**
 * 扫描 `<root>/commands/*.md`。frontmatter 仅支持 `description: 一行文本`
 * （key: value 简单解析——boring，不引 YAML 依赖）；无 frontmatter 时
 * description 取正文首行截 60 字符。
 */
export async function loadCommands(
  dir: string,
  logger?: CommandLogger,
): Promise<LoadedCommand[]> {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return [] // 目录不存在 = 零自定义命令（首次运行）
  }
  const out: LoadedCommand[] = []
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const name = file.slice(0, -'.md'.length)
    if (!COMMAND_NAME_RE.test(name)) {
      logger?.warn('commands.load.skip', { file, reason: '名字须匹配 ^[a-z0-9][a-z0-9-]*$' })
      continue
    }
    if (BUILTIN_COMMANDS.some((c) => c.name === name)) {
      logger?.warn('commands.load.skip', { file, reason: '与内置命令重名（内置优先）' })
      continue
    }
    try {
      const raw = await readFile(join(dir, file), 'utf8')
      out.push({ name, ...parseFrontmatter(raw) })
    } catch (err) {
      logger?.warn('commands.load.skip', { file, err })
    }
  }
  return out
}

/** frontmatter 解析：首行 `---` 到次个 `---` 之间逐行 `key: value`（只认 description） */
function parseFrontmatter(raw: string): { description: string; prompt: string } {
  if (!raw.startsWith('---\n')) {
    return { description: firstLineSummary(raw), prompt: raw.trim() }
  }
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return { description: firstLineSummary(raw), prompt: raw.trim() }
  const header = raw.slice(4, end)
  const body = raw.slice(end + 5)
  let description = ''
  for (const line of header.split('\n')) {
    const m = /^description:\s*(.*)$/.exec(line)
    if (m !== null && m[1] !== undefined && m[1].trim() !== '') {
      description = m[1].trim()
    }
  }
  return {
    description: description === '' ? firstLineSummary(body) : description,
    prompt: body.trim(),
  }
}

/** 无 description 时以正文首行作摘要（截 60 字符，命令菜单一行可读） */
function firstLineSummary(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > 60 ? `${line.slice(0, 60)}…` : line
}

/** $ARGUMENTS 展开语义（Claude Code 自定义命令同款）：占位符替换；无占位符追加 */
export function expandCommandPrompt(prompt: string, args: string | undefined): string {
  if (prompt.includes('$ARGUMENTS')) {
    return prompt.replaceAll('$ARGUMENTS', args ?? '')
  }
  const a = args?.trim()
  return a === undefined || a === '' ? prompt : `${prompt}\n\n${a}`
}
