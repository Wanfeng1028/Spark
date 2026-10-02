/**
 * edit 工具（doc/02 §5.6.3）：字符串替换 + 唯一性校验，返回 unified diff。
 * 0 命中 → E_NOT_FOUND；多命中未 replaceAll → E_AMBIGUOUS。
 * read-state 守卫（ZC-5 / ADR D55）：未 read → E_NOT_READ；read 后被外部改动
 * （用户/linter/bash）→ E_STALE——重新 read 即解，防按过期快照覆盖（丢失更新）。
 * diff 用公共前后缀法生成单 hunk（多处 replaceAll 时合成一个大 hunk——
 * 正确性优先，紧凑度次之；单处替换场景即标准小 diff）。
 * 容错匹配（CK-10，pi edit-diff 同思路）：精确 indexOf → 逐行 trimEnd 行对齐 →
 * 全归一（NFKC + 智能引号/连字符/NBSP）行对齐，三级渐进；CRLF 文件行尾保持
 * （oldString 给 LF 在 CRLF 文件由行对齐命中，newString 裸 
 回写前转 CRLF）；
 * output 为 { diff, path, replaced, isExact, strategy }——非精确命中前端可提示
 * （DiffViewer 既有形状补齐 isExact/strategy 两字段）。
 */
import { readFile, stat } from 'node:fs/promises'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'
import { atomicWriteFile } from '../../fsutil.js'
import { isFresh, latestRead, recordWritten } from '../read-state.js'

const EditInput = z.strictObject({
  path: z.string().min(1),
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
})

type EditInput = z.infer<typeof EditInput>

// ---- CK-10 容错匹配（三级渐进；pi edit-diff normalizeForFuzzyMatch 同思路） ----

type MatchStrategy = 'exact' | 'line-trim' | 'normalized'

interface MatchSet {
  /** 每处命中的 [start, end) 区间（替换切片用；升序不相交） */
  ranges: Array<{ start: number; end: number }>
  exact: boolean
  strategy: MatchStrategy
}

/** 全归一：NFKC + 智能引号→ASCII + 常见连字符族 + NBSP/全角空格 */
function normalizeFuzzy(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−﹘﹣]/g, '-')
    .replace(/[\u00A0\u2007\u202F\u3000]/g, ' ')
}

/** 精确匹配（原 indexOf 语义） */
function matchExact(text: string, old: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  let pos = text.indexOf(old)
  while (pos !== -1) {
    out.push({ start: pos, end: pos + old.length })
    pos = text.indexOf(old, pos + old.length)
  }
  return out
}

/**
 * 行对齐匹配（level：'line-trim' 只剥行尾空白；'normalized' 再过全归一）。
 * 语义：old 首行在 text 某行内命中（行内 indexOf），后续行与 text 后续行**整行**
 * 归一相等（跨行边界只有行对齐可校验）；末行匹配止于行内段末（不含行尾换行）。
 * 返回升序不相交区间；任何一行归一后为空串则要求双侧行均空（空行对齐）。
 */
function matchLineAligned(
  text: string,
  old: string,
  level: 'line-trim' | 'normalized',
): Array<{ start: number; end: number }> {
  const norm = (line: string): string => {
    const t = line.trimEnd()
    return level === 'normalized' ? normalizeFuzzy(t) : t
  }
  const oldLines = old.split('\n')
  const textLines = text.split('\n')
  // 行起始偏移表（textLines[i] 起点在 text 中的下标）
  const starts: number[] = []
  let acc = 0
  for (const line of textLines) {
    starts.push(acc)
    acc += line.length + 1
  }
  const n = oldLines.length
  const out: Array<{ start: number; end: number }> = []
  for (let i = 0; i + n <= textLines.length; i++) {
    const first = textLines[i] ?? ''
    // normalized 级：首行匹配在归一串上进行（本层映射均为 1:1 字符替换——index 对齐原文）
    const firstNorm = level === 'normalized' ? normalizeFuzzy(first) : first
    const oldFirst = oldLines[0] ?? ''
    const at = firstNorm.indexOf(level === 'normalized' ? normalizeFuzzy(oldFirst) : oldFirst)
    if (at === -1) continue
    if (norm(first.slice(at)) !== norm(oldLines[0] ?? '')) continue
    let ok = true
    for (let j = 1; j < n; j++) {
      if (norm(textLines[i + j] ?? '') !== norm(oldLines[j] ?? '')) {
        ok = false
        break
      }
    }
    if (!ok) continue
    // 区间：首行 [i 行内 at, at + oldLines[0].length)，末行为 oldLines[n-1] 匹配段止于其归一长度
    const start = (starts[i] ?? 0) + at
    const lastText = textLines[i + n - 1] ?? ''
    const lastOld = oldLines[n - 1] ?? ''
    // 末行实际原文长度：归一相等下的原文段——取首段使 norm(原文段)===norm(lastOld)；
    // trimEnd/NFKC 只收缩不改写长度序，取 lastText 归一后与 lastOld 归一相等的最短前缀
    let endRel = lastText.length
    if (level === 'line-trim') {
      endRel = lastOld.length // trimEnd 语义下原文末行去掉行尾空白即等长
      // 修正：lastText 的行尾空白长度
      const trimmed = lastText.replace(/\s+$/, '')
      endRel = trimmed.length === lastOld.length ? trimmed.length : lastText.trimEnd().length
    } else {
      // normalized：原文段长度不可由归一长度反推——按"取原文前缀 k 使其归一等于 lastOld 归一"
      // 线性扫描（old 末行通常短，代价可忽略）
      endRel = lastText.length
      for (let k = 1; k <= lastText.length; k++) {
        if (normalizeFuzzy(lastText.slice(0, k).replace(/\s+$/, '')) === normalizeFuzzy(lastOld)) {
          endRel = k
          break
        }
      }
    }
    const startOfLast = starts[i + n - 1] ?? 0
    const end = n === 1 ? start + (oldLines[0] ?? '').length : startOfLast + endRel
    out.push({ start, end })
    i += n - 1 // 不相交：跳过已命中窗口
  }
  return out
}

function matchOccurrences(text: string, old: string): MatchSet {
  const exact = matchExact(text, old)
  if (exact.length > 0) return { ranges: exact, exact: true, strategy: 'exact' }
  const lineTrim = matchLineAligned(text, old, 'line-trim')
  if (lineTrim.length > 0) return { ranges: lineTrim, exact: false, strategy: 'line-trim' }
  const normalized = matchLineAligned(text, old, 'normalized')
  if (normalized.length > 0) return { ranges: normalized, exact: false, strategy: 'normalized' }
  return { ranges: [], exact: false, strategy: 'normalized' }
}

/** 文件行尾探测（CK-10：CRLF 保持——pi detectLineEnding 同思路，首现 CRLF 行尾即判 CRLF） */
function detectCrlf(text: string): boolean {
  const at = text.search(/\r?\n/)
  return at !== -1 && text[at] === '\r'
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
    '返回 unified diff。oldString 与 newString 相同时报错。' +
    '必须先 read 同一文件：未 read 报 E_NOT_READ；read 后文件被外部修改（用户或 linter）报 E_STALE——重新 read 后再编辑。',
  inputSchema: EditInput,
  permission: {
    action: 'fs.write',
    resourceOf: (input, ctx) => `file:${resolveInRoot(ctx.cwd, input.path)}`,
  },
  // ZC-4：审批看到的就是执行用的——路径归一化为绝对路径后四处分发
  resolveInput: (input, ctx) => ({ ...input, path: resolveInRoot(ctx.cwd, input.path) }),
  parallelizable: false,
  safety: { sideEffectScope: 'workspace', riskLevel: 'medium' },

  async execute(ctx: ToolContext, input: EditInput): Promise<ToolOutput> {
    const abs = resolveInRoot(ctx.cwd, input.path)
    const before = await readFile(abs, 'utf8').catch(() => {
      throw new Error(`E_NOT_FOUND: 文件不存在 ${input.path}`)
    })
    // ZC-5 read-state 守卫：注入了基线才启用（未注入 = 直接驱动/旧行为不变）
    if (ctx.readFileState !== undefined) {
      const entry = latestRead(ctx.readFileState, abs)
      if (entry === undefined) {
        throw new Error(`E_NOT_READ: 文件尚未 read，先 read 再 edit（${input.path}）`)
      }
      const info = await stat(abs)
      if (!isFresh(entry, { mtimeMs: info.mtimeMs, size: info.size }, before)) {
        throw new Error(
          `E_STALE: 文件在 read 之后被外部修改（用户或 linter）——重新 read 后再改（${input.path}）`,
        )
      }
    }
    // CK-10：三级渐进匹配（精确 → 逐行 trimEnd → 全归一），失败时错误信息带尝试口径
    const matches = matchOccurrences(before, input.oldString)
    if (matches.ranges.length === 0) {
      throw new Error(
        `E_NOT_FOUND: oldString 在 ${input.path} 中 0 命中（已尝试精确 / 行尾空白 / 全归一三级匹配）`,
      )
    }
    if (matches.ranges.length > 1 && input.replaceAll !== true) {
      throw new Error(
        `E_AMBIGUOUS: oldString 在 ${input.path} 中 ${matches.ranges.length} 处命中，需 replaceAll`,
      )
    }
    // CK-10：CRLF 保持——文件为 CRLF 且 newString 只带裸 \n 时，回写前统一为 \r\n
    const newString =
      detectCrlf(before) && !input.newString.includes('\r\n') && input.newString.includes('\n')
        ? input.newString.replace(/\n/g, '\r\n')
        : input.newString
    // 从后往前逐区间替换（不相交；精确单命中等价原语义）
    let after = before
    for (let i = matches.ranges.length - 1; i >= 0; i--) {
      const range = matches.ranges[i]
      if (range === undefined) continue
      after = after.slice(0, range.start) + newString + after.slice(range.end)
    }
    // AUD-03：原子写（tmp+rename，fsutil 单源）——进程崩溃半写不再损坏用户文件
    atomicWriteFile(abs, after)
    // ZC-5：编辑结果即新的全量基线（连续编辑不需重读）
    const written = await stat(abs)
    recordWritten(
      ctx.readFileState,
      abs,
      { mtimeMs: written.mtimeMs, size: written.size },
      after,
      'edit',
    )
    return {
      output: {
        diff: unifiedDiff(before, after, input.path),
        path: input.path,
        replaced: matches.ranges.length,
        isExact: matches.exact,
        strategy: matches.strategy,
      },
      isError: false,
    }
  },
}
