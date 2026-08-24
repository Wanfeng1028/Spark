/**
 * write 工具（doc/02 §5.6.3）：整文件写入；自动建父目录；返回写入字节数。
 * 路径硬边界先行（E_PATH_OUTSIDE）；OS 权限拒绝 → E_WRITE_DENIED。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'

const WriteInput = z.strictObject({
  path: z.string().min(1),
  content: z.string(),
})

type WriteInput = z.infer<typeof WriteInput>

export const writeTool: ToolDefinition<WriteInput> = {
  name: 'write',
  description:
    '写入整个文件（覆盖式）。相对路径基于工作目录；父目录不存在时自动创建。' +
    '覆盖已有文件前请先 read 确认内容。返回写入的字节数。',
  inputSchema: WriteInput,
  permission: {
    action: 'fs.write',
    resourceOf: (input, ctx) => `file:${resolveInRoot(ctx.cwd, input.path)}`,
  },
  parallelizable: false,

  async execute(ctx: ToolContext, input: WriteInput): Promise<ToolOutput> {
    const abs = resolveInRoot(ctx.cwd, input.path)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, input.content, 'utf8').catch((err: NodeJS.ErrnoException) => {
      if (
        err.code === 'EACCES' ||
        err.code === 'EROFS' ||
        err.code === 'EPERM' ||
        err.code === 'EISDIR'
      ) {
        throw new Error(`E_WRITE_DENIED: 写入被 OS 拒绝 ${input.path}（${err.code}）`)
      }
      throw err
    })
    return { output: { bytes: Buffer.byteLength(input.content, 'utf8') }, isError: false }
  },
}
