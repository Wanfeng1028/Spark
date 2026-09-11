/**
 * lsp 工具（阶段十六工单 16.9）：语言服务器查询的一等公民入口——定义跳转/引用查找/
 * 诊断等 12 操作统一单工具（qwen-code tools/lsp.ts 枚举设计照抄）。只读：走 fs.read
 * 审批域（与 read/grep 同域——plan 档放行只读，规则通配原样生效）；文档内容仅从
 * cwd 允许根内读取（resolveInRoot 硬边界先于审批——越界 E_PATH_OUTSIDE）。
 * 连接/诊断缓存语义在 engine/src/lsp/manager.ts（config hash 不变不重启、敏感 env 剥离）。
 * 输出为紧凑结构化结果（uri 转路径、1-based 行列），限界与溢写由管线 OutputStore 统一处理。
 */
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'

/** 12 操作封闭枚举（与 manager LspOperation 同源；zod 层独立声明词面） */
const LSP_OPERATIONS = [
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls',
  'diagnostics',
  'workspaceDiagnostics',
  'codeActions',
] as const

/** 需 path+line 的位置操作（qwen LOCATION_REQUIRED_OPERATIONS 同集合） */
const LOCATION_OPS: ReadonlySet<string> = new Set([
  'goToDefinition',
  'findReferences',
  'hover',
  'goToImplementation',
  'prepareCallHierarchy',
])
/** 只需 path 的文件操作（qwen FILE_REQUIRED_OPERATIONS 同集合；codeActions 额外要 range） */
const FILE_OPS: ReadonlySet<string> = new Set(['documentSymbol', 'diagnostics', 'codeActions'])
/** 需 query 的工作区操作 */
const QUERY_OPS: ReadonlySet<string> = new Set(['workspaceSymbol'])
/** 需回传 callHierarchy 条目的操作 */
const ITEM_OPS: ReadonlySet<string> = new Set(['incomingCalls', 'outgoingCalls'])

/** 缺省引用/符号返回条数上限（上限 200——防一次巨响应挤占上下文） */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * 扩展名 → 语言 id（v1 内置表；配置键即语言 id，缺 language 显式入参时按此派生）。
 * js 家族归 typescript——typescript-language-server 同管 JS，是事实上的通行做法。
 */
const EXT_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'typescript',
  jsx: 'typescript',
  mjs: 'typescript',
  cjs: 'typescript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  java: 'java',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  swift: 'swift',
  kt: 'kotlin',
  json: 'json',
  css: 'css',
  html: 'html',
}

/** LSP SymbolKind → 人话标签（LSP 3.17 规范 1-26） */
const SYMBOL_KIND_LABELS: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
}

const LspToolInput = z.strictObject({
  operation: z.enum(LSP_OPERATIONS),
  /** 文件路径（相对 cwd 或绝对路径，须在 cwd 允许根内）——位置/文件类操作必填 */
  path: z.string().optional(),
  /** 1-based 行号（发送给 LSP 前转 0-based） */
  line: z.number().int().positive().optional(),
  /** 1-based 列号 */
  character: z.number().int().positive().optional(),
  /** 范围操作（codeActions）结束行/列（1-based） */
  endLine: z.number().int().positive().optional(),
  endCharacter: z.number().int().positive().optional(),
  /** findReferences 是否含声明（缺省 false） */
  includeDeclaration: z.boolean().optional(),
  /** workspaceSymbol 查询词 */
  query: z.string().optional(),
  /** 语言 id 覆盖（缺省按扩展名派生；无 path 的操作必填） */
  language: z.string().min(1).optional(),
  /** 返回条数上限（缺省 50，封顶 200） */
  limit: z.number().int().positive().max(MAX_LIMIT).optional(),
  /** prepareCallHierarchy 的返回条目原样回传（incomingCalls/outgoingCalls 必带） */
  item: z.record(z.string(), z.unknown()).optional(),
})

type LspToolInput = z.infer<typeof LspToolInput>

function extLanguageOf(path: string): string | undefined {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return EXT_LANGUAGE[ext]
}

function symbolKindLabel(kind: unknown): string {
  return typeof kind === 'number' ? (SYMBOL_KIND_LABELS[kind] ?? String(kind)) : ''
}

/** uri → 展示路径（非 file: 协议原样保留——不猜不编） */
function displayPath(uri: unknown): string {
  if (typeof uri !== 'string') return ''
  if (!uri.startsWith('file:')) return uri
  try {
    return fileURLToPath(uri)
  } catch {
    return uri
  }
}

/** Location/LocationLink 混合结果 → 紧凑位置列表（1-based 行列） */
function locationsOf(raw: unknown, limit: number): Array<{ path: string; line: number; character: number }> {
  const arr = Array.isArray(raw) ? raw : raw === null || raw === undefined ? [] : [raw]
  const out: Array<{ path: string; line: number; character: number }> = []
  for (const item of arr.slice(0, limit)) {
    if (item === null || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const link = obj.targetUri !== undefined
    const uri = link ? obj.targetUri : obj.uri
    const rangeRaw = link ? (obj.targetSelectionRange ?? obj.targetRange) : obj.range
    const start = (rangeRaw as Record<string, unknown> | undefined)?.start as
      | Record<string, unknown>
      | undefined
    if (typeof uri !== 'string' || start === undefined) continue
    out.push({
      path: displayPath(uri),
      line: typeof start.line === 'number' ? start.line + 1 : 0,
      character: typeof start.character === 'number' ? start.character + 1 : 0,
    })
  }
  return out
}

/** Hover.contents（MarkupContent/MarkedString/数组三态）→ 纯文本 */
function hoverTextOf(raw: unknown): string {
  if (raw === null || typeof raw !== 'object') return ''
  const contents = (raw as Record<string, unknown>).contents
  const one = (c: unknown): string => {
    if (typeof c === 'string') return c
    if (c !== null && typeof c === 'object' && typeof (c as Record<string, unknown>).value === 'string') {
      return (c as Record<string, unknown>).value as string
    }
    return ''
  }
  if (Array.isArray(contents)) return contents.map(one).filter((s) => s !== '').join('\n')
  return one(contents)
}

interface SymbolLine {
  name: string
  kind: string
  path?: string
  line?: number
}

/** DocumentSymbol（层级）与 SymbolInformation（扁平）双形状 → 拍平的紧凑行 */
function symbolsOf(raw: unknown, limit: number): SymbolLine[] {
  const out: SymbolLine[] = []
  const visit = (items: unknown[], container: string | undefined): void => {
    for (const item of items) {
      if (out.length >= limit) return
      if (item === null || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      if (typeof obj.name !== 'string') continue
      const location = obj.location as Record<string, unknown> | undefined
      const range = (obj.range ?? location?.range) as Record<string, unknown> | undefined
      const start = range?.start as Record<string, unknown> | undefined
      out.push({
        name: container === undefined ? obj.name : `${container}::${obj.name}`,
        kind: symbolKindLabel(obj.kind),
        ...(location !== undefined && typeof location.uri === 'string'
          ? { path: displayPath(location.uri) }
          : {}),
        ...(start !== undefined && typeof start.line === 'number' ? { line: start.line + 1 } : {}),
      })
      if (Array.isArray(obj.children)) visit(obj.children, obj.name)
    }
  }
  visit(Array.isArray(raw) ? raw : [], undefined)
  return out
}

/** incoming/outgoing calls → [{name, kind, path, line}] */
function callsOf(raw: unknown, limit: number): SymbolLine[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: SymbolLine[] = []
  for (const item of arr.slice(0, limit)) {
    if (item === null || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const from = (obj.from ?? obj.to) as Record<string, unknown> | undefined
    if (from === undefined || typeof from.name !== 'string') continue
    const uri = typeof from.uri === 'string' ? from.uri : undefined
    const start = (from.selectionRange as Record<string, unknown> | undefined)?.start as
      | Record<string, unknown>
      | undefined
    out.push({
      name: from.name,
      kind: symbolKindLabel(from.kind),
      ...(uri !== undefined ? { path: displayPath(uri) } : {}),
      ...(start !== undefined && typeof start.line === 'number' ? { line: start.line + 1 } : {}),
    })
  }
  return out
}

/** prepareCallHierarchy 条目：回传给模型供 incoming/outgoing 复用（uri 转路径展示） */
function callHierarchyItemsOf(raw: unknown, limit: number): unknown[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr.slice(0, limit).map((item) => {
    if (item === null || typeof item !== 'object') return item
    const obj = item as Record<string, unknown>
    return { ...obj, ...(typeof obj.uri === 'string' ? { uri: displayPath(obj.uri) } : {}) }
  })
}

export const lspTool: ToolDefinition<LspToolInput> = {
  name: 'lsp',
  description:
    '语言服务器查询（只读）：goToDefinition（跳定义）/ findReferences（查引用）/ hover（悬浮信息）/' +
    'documentSymbol（文件符号）/ workspaceSymbol（全仓符号，需 query）/ goToImplementation（跳实现）/' +
    'prepareCallHierarchy + incomingCalls + outgoingCalls（调用层级，item 由 prepare 返回）/' +
    'diagnostics（单文件诊断）/ workspaceDiagnostics（全部缓存诊断）/ codeActions（范围修复建议，需 line+endLine）。' +
    'path 相对当前目录，line/character 为 1-based。语言须已在 ~/.spark/lsp.json 配置' +
    '（如 typescript/pyright）；首次查询会启动对应 server（秒级预热属正常，诊断可能稍后到达）。' +
    '查定义/引用/诊断优先用本工具而非靠读文件猜测。',
  inputSchema: LspToolInput,
  permission: {
    action: 'fs.read',
    resourceOf: (input, ctx) => `file:${resolveInRoot(ctx.cwd, input.path ?? '.')}`,
  },
  parallelizable: true,

  async execute(ctx: ToolContext, input: LspToolInput): Promise<ToolOutput> {
    if (ctx.lsp === undefined) {
      throw new Error('E_LSP_UNAVAILABLE: LSP 未接入（引擎未装配 LspManager）')
    }

    // 参数按操作分组校验（qwen 同集合：位置/文件/查询/条目四组）——缺参如实报，不猜
    const op = input.operation
    const limit = input.limit ?? DEFAULT_LIMIT
    const needsPath = LOCATION_OPS.has(op) || FILE_OPS.has(op)
    if (needsPath && input.path === undefined) {
      throw new Error(`E_LSP_ARGS: 操作 ${op} 需要 path`)
    }
    if (LOCATION_OPS.has(op) && (input.line === undefined || input.character === undefined)) {
      throw new Error(`E_LSP_ARGS: 操作 ${op} 需要 line 与 character（1-based）`)
    }
    if (op === 'codeActions' && input.endLine === undefined) {
      throw new Error('E_LSP_ARGS: 操作 codeActions 需要 endLine（与 line 构成范围）')
    }
    if (QUERY_OPS.has(op) && (input.query === undefined || input.query === '')) {
      throw new Error('E_LSP_ARGS: 操作 workspaceSymbol 需要 query')
    }
    if (ITEM_OPS.has(op) && input.item === undefined) {
      throw new Error(`E_LSP_ARGS: 操作 ${op} 需要 item（先 prepareCallHierarchy 取回）`)
    }

    // 语言解析：显式 language > 扩展名派生；两者皆无（无 path 的操作）→ 如实拒绝
    const language =
      input.language ??
      (input.path !== undefined ? extLanguageOf(input.path) : undefined)
    if (language === undefined) {
      throw new Error(`E_LSP_ARGS: 无法确定语言——为 ${op} 提供 path 或 language`)
    }

    // 路径硬边界先于一切（越界 E_PATH_OUTSIDE——与 grep/read 同一口径）
    const abs = resolveInRoot(ctx.cwd, input.path ?? '.')

    let result: unknown
    try {
      result = await ctx.lsp.request(
        op,
        {
          language,
          ...(input.path !== undefined ? { abs } : {}),
          ...(input.line !== undefined ? { line: input.line - 1 } : {}),
          ...(input.character !== undefined ? { character: input.character - 1 } : {}),
          ...(input.endLine !== undefined ? { endLine: input.endLine - 1 } : {}),
          ...(input.endCharacter !== undefined ? { endCharacter: input.endCharacter - 1 } : {}),
          ...(input.includeDeclaration !== undefined
            ? { includeDeclaration: input.includeDeclaration }
            : {}),
          ...(input.query !== undefined ? { query: input.query } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.item !== undefined ? { item: input.item } : {}),
        },
        { sessionId: ctx.sessionId, cwd: ctx.cwd, signal: ctx.signal },
      )
    } catch (err) {
      // 中断按 mcp 同款折为 isError 结果（started+completed 对重放合法）；其余如实上抛闭合
      if (ctx.signal.aborted) {
        return { output: { code: 'E_ABORTED' }, isError: true }
      }
      throw err
    }

    // 结果按操作归一为紧凑结构（未命中如实空集——不编造）
    switch (op) {
      case 'goToDefinition':
      case 'goToImplementation':
        return { output: { locations: locationsOf(result, limit) }, isError: false }
      case 'findReferences':
        return { output: { references: locationsOf(result, limit) }, isError: false }
      case 'hover':
        return { output: { contents: hoverTextOf(result) }, isError: false }
      case 'documentSymbol':
      case 'workspaceSymbol':
        return { output: { symbols: symbolsOf(result, limit) }, isError: false }
      case 'prepareCallHierarchy':
        return { output: { items: callHierarchyItemsOf(result, limit) }, isError: false }
      case 'incomingCalls':
      case 'outgoingCalls':
        return { output: { calls: callsOf(result, limit) }, isError: false }
      case 'codeActions': {
        const arr = Array.isArray(result) ? result : []
        const actions = arr.slice(0, limit).map((a) => {
          if (a === null || typeof a !== 'object') return { title: '' }
          const obj = a as Record<string, unknown>
          return {
            title: typeof obj.title === 'string' ? obj.title : '',
            ...(typeof obj.kind === 'string' ? { kind: obj.kind } : {}),
          }
        })
        return { output: { actions }, isError: false }
      }
      case 'diagnostics':
      case 'workspaceDiagnostics':
        // 管理器已返回 wire 形状（诊断缓存快照；空 = 该文件当前无诊断）
        return { output: result, isError: false }
      default:
        // 词表穷尽不可达（12 操作封闭枚举）——保险丝保持失败闭合
        throw new Error(`E_LSP_ARGS: 未知操作 ${String(op)}`)
    }
  },
}
