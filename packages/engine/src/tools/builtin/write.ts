/**
 * write 工具（doc/02 §5.6.3）：整文件写入；自动建父目录；返回写入字节数。
 * 路径硬边界先行（E_PATH_OUTSIDE）；OS 权限拒绝 → E_WRITE_DENIED。
 * read-state 守卫（ZC-5 / ADR D55）：覆盖已存在文件必须先 read——未 read →
 * E_NOT_READ，read 后被外部改动 → E_STALE；新建文件不需要。
 */
import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { atomicWriteFile } from '../../fsutil.js'
import { isFresh, latestRead, recordWritten } from '../read-state.js'
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
    '覆盖已存在文件必须先 read（未 read 报 E_NOT_READ；read 后文件被外部修改报 E_STALE），新建文件不需要。' +
    '返回写入的字节数。',
  inputSchema: WriteInput,
  permission: {
    action: 'fs.write',
    resourceOf: (input, ctx) => `file:${resolveInRoot(ctx.cwd, input.path)}`,
  },
  // ZC-4：同 edit——审批与执行同路径字节
  resolveInput: (input, ctx) => ({ ...input, path: resolveInRoot(ctx.cwd, input.path) }),
  parallelizable: false,

  async execute(ctx: ToolContext, input: WriteInput): Promise<ToolOutput> {
    const abs = resolveInRoot(ctx.cwd, input.path)
    // ZC-5 read-state 守卫：覆盖已存在文件必须先 read 且读后未被外部改动（stat 通道，不读旧内容）
    const existing = await stat(abs).catch(() => null)
    if (existing?.isFile() === true && ctx.readFileState !== undefined) {
      const entry = latestRead(ctx.readFileState, abs)
      if (entry === undefined) {
        throw new Error(`E_NOT_READ: 文件尚未 read，先 read 再 write（${input.path}）`)
      }
      if (!isFresh(entry, { mtimeMs: existing.mtimeMs, size: existing.size })) {
        throw new Error(
          `E_STALE: 文件在 read 之后被外部修改（用户或 linter）——重新 read 后再写（${input.path}）`,
        )
      }
    }
    await mkdir(dirname(abs), { recursive: true })
    // AUD-03：原子写（tmp+rename，fsutil 单源）——错误映射保留（OS 拒绝语义不变；
    // rename 落在目标目录，EACCES/EROFS/EPERM/EISDIR 与直写同码暴露）
    try {
      atomicWriteFile(abs, input.content)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM' || code === 'EISDIR') {
        throw new Error(`E_WRITE_DENIED: 写入被 OS 拒绝 ${input.path}（${code}）`)
      }
      throw err
    }
    // ZC-5：写入结果即新的全量基线（连续覆盖不需重读）
    const written = await stat(abs)
    recordWritten(
      ctx.readFileState,
      abs,
      { mtimeMs: written.mtimeMs, size: written.size },
      input.content,
      'write',
    )
    return { output: { bytes: Buffer.byteLength(input.content, 'utf8') }, isError: false }
  },
}