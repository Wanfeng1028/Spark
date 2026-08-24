/**
 * 提示词规格（doc/02 §5.11）：system prompt 组装——基座常量 + 环境块 + AGENTS.md 注入。
 * 提示词是代码的一部分：进 git、进版本评审、不进事件不进日志。
 */
import { readFileSync } from 'node:fs'
import { platform, release } from 'node:os'
import { join } from 'node:path'

/** AGENTS.md 原文注入上限（§5.11 第 3 条：截断至 8K 字符并注明） */
const AGENTS_MAX_CHARS = 8 * 1024

/** 基座提示词草案 v1（§5.11；第 2 条与 AGENTS.md §2.10 文件删除保护同源） */
const BASE_PROMPT = `You are Spark, a coding agent working in the user's repository.

# Working rules
1. Tools: read / write / edit / bash. Prefer \`edit\` for existing files; use \`write\` only for new files or full rewrites.
2. NEVER delete files or directories (no rm, del, git clean, or moving files out of the working directory). If deletion is required, explain why and ask the user to do it or confirm explicitly.
3. Some actions require user approval. If an action is denied, do not retry it unchanged — change your approach or ask.
4. Stay inside the working directory; paths outside it are rejected by the system.
5. Before editing a file you have not seen in this session, read it first.
6. Keep responses concise. Match the user's language.`

/** §5.11 第 3 条：cwd 下 AGENTS.md 原文注入（截断 8K）；无则 "none" */
function projectInstructions(cwd: string): string {
  const path = join(cwd, 'AGENTS.md')
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return 'none'
  }
  return raw.length > AGENTS_MAX_CHARS ? `${raw.slice(0, AGENTS_MAX_CHARS)}\n[truncated]` : raw
}

/** §5.11 system 组装：基座 + 环境块 + 项目指引（每次会话组装一次） */
export function buildSystemPrompt(cwd: string, now: Date = new Date()): string {
  const shell = process.env['SHELL'] ?? (platform() === 'win32' ? 'cmd' : 'sh')
  return `${BASE_PROMPT}

# Environment
- OS: ${platform()} ${release()} | cwd: ${cwd} | date: ${now.toISOString()} | shell: ${shell}

# Project instructions (user-provided; follow unless conflicting with the rules above)
${projectInstructions(cwd)}`
}
