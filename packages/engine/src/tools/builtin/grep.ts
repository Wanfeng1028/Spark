/**
 * grep 工具（阶段十二工单 12.1）：结构化检索一等公民——模型查代码不经 bash 审批。
 * 纯 Node 递归遍历（cwd 内，resolveInRoot 硬边界先于审批——越界 E_PATH_OUTSIDE）；
 * 逐行正则匹配；输出 {matches, truncated} 交给管线限界（OutputStore 溢写纪律不变）。
 * 二进制文件跳过（NUL 采样判定，同 read 工具口径）；跳过 node_modules/.git 目录。
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'

/** 缺省命中上限；上限封顶 200（防一次巨响应挤占上下文） */
const DEFAULT_MAX_RESULTS = 50
const MAX_MAX_RESULTS = 200
/** 逐文件字节上限（同 read 工具 MAX_FILE_BYTES 口径——超大文件跳过不读） */
const MAX_FILE_BYTES = 2 * 1024 * 1024
const BINARY_SAMPLE_BYTES = 8 * 1024
/** 递归跳过目录（依赖与版本控制内容对模型无检索价值） */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build'])

const GrepInput = z.strictObject({
  /** 正则表达式（JavaScript RegExp 语法；非法表达式报 E_BAD_PATTERN） */
  pattern: z.string().min(1),
  /** 起始目录（相对 cwd；缺省 = cwd 根；可为单文件） */
  path: z.string().optional(),
  /** 文件名 glob 片段（如 "*.ts"——仅对文件名做后缀/通配匹配，简化实现） */
  glob: z.string().optional(),
  maxResults: z.number().int().positive().max(MAX_MAX_RESULTS).optional(),
})

type GrepInput = z.infer<typeof GrepInput>

export interface GrepMatch {
  file: string
  line: number
  text: string
}

export interface GrepResult {
  matches: GrepMatch[]
  truncated: boolean
}

/** glob 片段 → 文件名判定：`*.ts` 后缀匹配；其余按子串匹配（简化实现，够用） */
function nameMatches(fileName: string, glob: string): boolean {
  if (glob.startsWith('*')) return fileName.endsWith(glob.slice(1))
  return fileName.includes(glob)
}

function toPosix(p: string): string {
  return p.replaceAll('\\', '/')
}

export const grepTool: ToolDefinition<GrepInput> = {
  name: 'grep',
  description:
    '在工作目录内做结构化文本检索（正则逐行匹配），返回 {file, line, text} 命中列表。' +
    '无需审批 bash 即可用（fs.read 同域只读）；默认最多 50 条命中（上限 200），' +
    '自动跳过 node_modules/.git/dist/build 与二进制、超 2MB 文件。查代码优先用本工具而非 bash grep。',
  inputSchema: GrepInput,
  permission: {
    action: 'fs.read',
    resourceOf: (input, ctx) => `file:${resolveInRoot(ctx.cwd, input.path ?? '.')}`,
  },
  parallelizable: true,

  async execute(ctx: ToolContext, input: GrepInput): Promise<ToolOutput> {
    let regex: RegExp
    try {
      regex = new RegExp(input.pattern)
    } catch {
      throw new Error(`E_BAD_PATTERN: 非法正则表达式 ${input.pattern}`)
    }
    const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS
    const rootRel = input.path ?? '.'
    // 硬边界先于审批：越界（../ 逃逸/绝对路径出根）直接拒绝
    const absRoot = resolveInRoot(ctx.cwd, rootRel)
    const rootInfo = await stat(absRoot).catch(() => {
      throw new Error(`E_NOT_FOUND: 路径不存在 ${rootRel}`)
    })

    const matches: GrepMatch[] = []
    let truncated = false

    const scanFile = async (absFile: string, relFile: string): Promise<void> => {
      if (truncated) return
      const info = await stat(absFile)
      if (!info.isFile() || info.size > MAX_FILE_BYTES) return
      const raw = await readFile(absFile, 'utf8')
      if (raw.slice(0, BINARY_SAMPLE_BYTES).includes('\0')) return // 二进制跳过
      const lines = raw.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i]
        if (text === undefined) continue
        if (ctx.signal.aborted) {
          throw new Error('E_ABORTED: 检索被中断')
        }
        if (regex.test(text)) {
          if (matches.length >= maxResults) {
            truncated = true
            return
          }
          matches.push({ file: relFile, line: i + 1, text: text.slice(0, 500) })
        }
      }
    }

    const scanDir = async (absDir: string, relDir: string): Promise<void> => {
      if (truncated) return
      const entries = await readdir(absDir, { withFileTypes: true })
      for (const entry of entries) {
        if (ctx.signal.aborted) {
          throw new Error('E_ABORTED: 检索被中断')
        }
        const abs = join(absDir, entry.name)
        const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue
          await scanDir(abs, rel)
        } else if (entry.isFile()) {
          if (input.glob !== undefined && !nameMatches(entry.name, input.glob)) continue
          await scanFile(abs, rel)
        }
      }
    }

    if (rootInfo.isFile()) {
      await scanFile(absRoot, toPosix(rootRel))
    } else {
      await scanDir(absRoot, toPosix(rootRel === '.' ? '' : rootRel))
    }

    return { output: { matches, truncated } satisfies GrepResult, isError: false }
  },
}
