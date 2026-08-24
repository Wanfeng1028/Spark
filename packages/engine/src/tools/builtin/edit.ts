/**
 * edit 工具（doc/02 §5.6.3）：字符串替换 + 唯一性校验，返回 unified diff。
 * 0 命中 → E_NOT_FOUND；多命中未 replaceAll → E_AMBIGUOUS。
 * diff 用公共前后缀法生成单 hunk（多处 replaceAll 时合成一个大 hunk——
 * 正确性优先，紧凑度次之；单处替换场景即标准小 diff）。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'

const EditInput = z.strictObject({
  path: z.string().min(1),
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
})

type EditInput = z.infer<typeof EditInput>

function countMatches(text: string, needle: string): number {
  let count = 0
  let pos = text.indexOf(needle)
  while (pos !== -1) {
    count += 1
    pos = text.indexOf(needle, pos + needle.length)
  }
  return count
}

function unifiedDiff(before: string, after: string, path: string): string {
  const a = before.split('\n')
  const b = after.split('\n')
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const aMid = a.slice(prefix, a.length - suffix)
  const bMid = b.slice(prefix, b.length - suffix)
  if (aMid.length === 0 && bMid.length === 0) return ''

  const ctx = 3
  const head = a.slice(Math.max(0, prefix - ctx), prefix)
  const tail = a.slice(a.length - suffix, Math.min(a.length, a.length - suffix + ctx))
  const startA = Math.max(0, prefix - ctx) + 1
  const startB = startA
  const countA = head.length + aMid.length + tail.length
  const countB = head.length + bMid.length + tail.length

  const lines = [`@@ -${startA},${countA} +${startB},${countB} @@`]
  for (const l of head) lines.push(` ${l}`)
  for (const l of aMid) lines.push(`-${l}`)
  for (const l of bMid) lines.push(`+${l}`)
  for (const l of tail) lines.push(` ${l}`)
  return `--- a/${path}\n+++ b/${path}\n${lines.join('\n')}`
}

export const editTool: ToolDefinition<EditInput> = {
  name: 'edit',
  description:
    '精确字符串替换（非正则）。oldString 必须在文件中唯一，多处命中需显式 replaceAll。' +
    '返回 unified diff。oldString 与 newString 相同时报错。',
  inputSchema: EditInput,
  permission: {
    action: 'fs.write',
    resourceOf: (input, ctx) => `file:${resolveInRoot(ctx.cwd, input.path)}`,
  },
  parallelizable: false,

  async execute(ctx: ToolContext, input: EditInput): Promise<ToolOutput> {
    const abs = resolveInRoot(ctx.cwd, input.path)
    const before = await readFile(abs, 'utf8').catch(() => {
      throw new Error(`E_NOT_FOUND: 文件不存在 ${input.path}`)
    })
    const count = countMatches(before, input.oldString)
    if (count === 0) {
      throw new Error(`E_NOT_FOUND: oldString 在 ${input.path} 中 0 命中`)
    }
    if (count > 1 && input.replaceAll !== true) {
      throw new Error(`E_AMBIGUOUS: oldString 在 ${input.path} 中 ${count} 处命中，需 replaceAll`)
    }
    const after =
      input.replaceAll === true
        ? before.split(input.oldString).join(input.newString)
        : before.replace(input.oldString, input.newString)
    await writeFile(abs, after, 'utf8')
    return { output: unifiedDiff(before, after, input.path), isError: false }
  },
}
