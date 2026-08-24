/**
 * read 工具（doc/02 §5.6.3）：路径硬边界 + 二进制拒读 + 行号前缀 + 窗口截取。
 * 「超大返回尾部+头部提示」实现取：行数超 limit → 返回尾部窗口并在头部加提示行；
 * 字节数超 2MB → E_TOO_LARGE 拒读（防一次性载入巨型文件）。
 */
import { readFile, stat } from 'node:fs/promises'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const BINARY_SAMPLE_BYTES = 8 * 1024

const ReadInput = z.strictObject({
  path: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(2000).optional(),
})

type ReadInput = z.infer<typeof ReadInput>

export const readTool: ToolDefinition<ReadInput> = {
  name: 'read',
  description:
    '读取文本文件（相对路径基于工作目录）。返回带行号前缀的内容；默认最多 2000 行，' +
    '超出时返回尾部并附提示。二进制文件与超过 2MB 的文件拒绝读取。',
  inputSchema: ReadInput,
  permission: {
    action: 'fs.read',
    resourceOf: (input, ctx) => `file:${resolveInRoot(ctx.cwd, input.path)}`,
  },
  parallelizable: true,

  async execute(ctx: ToolContext, input: ReadInput): Promise<ToolOutput> {
    const abs = resolveInRoot(ctx.cwd, input.path)
    const info = await stat(abs).catch(() => {
      throw new Error(`E_NOT_FOUND: 文件不存在 ${input.path}`)
    })
    if (!info.isFile()) {
      throw new Error(`E_NOT_FOUND: 不是常规文件 ${input.path}`)
    }
    if (info.size > MAX_FILE_BYTES) {
      throw new Error(`E_TOO_LARGE: 文件 ${info.size} 字节超过上限 ${MAX_FILE_BYTES}`)
    }
    const raw = await readFile(abs, 'utf8')
    if (raw.slice(0, BINARY_SAMPLE_BYTES).includes('\0')) {
      throw new Error(`E_BINARY: 文件含 NUL 字节，判定为二进制，拒读 ${input.path}`)
    }

    const limit = input.limit ?? 2000
    const allLines = raw.split('\n')
    if (allLines.at(-1) === '') allLines.pop() // 尾换行不占行号

    const offset = input.offset ?? 0
    let start = offset
    let header = ''
    if (offset === 0 && allLines.length > limit) {
      // 超大：尾部窗口 + 头部提示（最新内容对编辑最有用）
      start = allLines.length - limit
      header = `(文件共 ${allLines.length} 行，仅显示末尾 ${limit} 行；用 offset 从头读)\n`
    }
    const lines = allLines.slice(start, start + limit)
    const width = String(start + lines.length).length
    const numbered = lines
      .map((line, i) => `${String(start + i + 1).padStart(width)}→${line}`)
      .join('\n')
    return { output: header + numbered, isError: false }
  },
}
