/**
 * read-state 文件新鲜度基线（ZC 参考工单批次 ZC-5 / ADR D55，设计取参考项目 ZCode 的
 * edit/write read-state 守卫）：read/edit/write 成功后登记「会话对该文件的最近认知」，
 * edit/write 执行前校验——文件已被外部改动（用户 / linter / bash）时拒改并要求重读，
 * 防止模型按过期快照发起覆盖（丢失更新）。
 *
 * 两条判定通道：
 * - 内容通道：整读（full）记录直接比对当前内容——formatter 只 touch 不改内容不误伤，
 *   同毫秒改写也不漏报（内容不同即 stale）；
 * - stat 通道：窗口读记录（或写路径拿不到当前内容时）退化比对 mtime（整数毫秒归一，
 *   避开亚毫秒精度抖动误报）+ size。
 *
 * Map 以归一化绝对路径为键、每会话一份（ToolPipelineImpl 每会话实例持有，经
 * ToolContext.readFileState 注入）；直接驱动工具的测试未注入 = 守卫不启用，旧行为不变。
 */
export interface ReadFileStat {
  mtimeMs: number
  size: number
}

export interface ReadFileStateEntry {
  /** 登记时的词法绝对路径（resolveInRoot 返回值） */
  path: string
  /** stat 通道基线：整数毫秒 mtime（Math.floor 归一） */
  mtimeMs?: number
  sizeBytes?: number
  /** 内容通道基线：仅整读（full=true）记录保存；窗口读不保存 */
  content?: string
  /** 本次 read 是否覆盖全文件（决定内容通道是否可比对） */
  full: boolean
  sourceTool: 'read' | 'edit' | 'write'
}

export type ReadFileStateMap = Map<string, ReadFileStateEntry>

/** 键归一：Windows 大小写不敏感语义，与 resolveInRoot 的 realpath 归一（AUD-04）同判 */
export function readStateKey(abs: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? abs.toLowerCase() : abs
}

/** 取该文件的基线；无基线 = 会话尚未读过（E_NOT_READ 语义由工具层抛） */
export function latestRead(
  map: ReadFileStateMap | undefined,
  abs: string,
): ReadFileStateEntry | undefined {
  return map?.get(readStateKey(abs))
}

/** read 成功后登记：整读保存内容基线，窗口读只保存 stat 基线（最近一次读覆盖旧基线） */
export function recordRead(
  map: ReadFileStateMap | undefined,
  abs: string,
  stat: ReadFileStat,
  content: string,
  full: boolean,
): void {
  if (map === undefined) return
  map.set(readStateKey(abs), {
    path: abs,
    mtimeMs: Math.floor(stat.mtimeMs),
    sizeBytes: stat.size,
    ...(full ? { content } : {}),
    full,
    sourceTool: 'read',
  })
}

/** edit/write 成功后登记：编辑结果即新的全量基线（模型无需重读即可连续编辑） */
export function recordWritten(
  map: ReadFileStateMap | undefined,
  abs: string,
  stat: ReadFileStat,
  content: string,
  sourceTool: 'edit' | 'write',
): void {
  if (map === undefined) return
  map.set(readStateKey(abs), {
    path: abs,
    mtimeMs: Math.floor(stat.mtimeMs),
    sizeBytes: stat.size,
    content,
    full: true,
    sourceTool,
  })
}

/** 新鲜度判定：全读记录优先内容通道（有当前内容时），否则退化 stat 通道 */
export function isFresh(
  entry: ReadFileStateEntry,
  stat: ReadFileStat,
  currentContent?: string,
): boolean {
  if (entry.full && entry.content !== undefined && currentContent !== undefined) {
    return entry.content === currentContent
  }
  if (entry.mtimeMs !== undefined && Math.floor(stat.mtimeMs) !== entry.mtimeMs) return false
  if (entry.sizeBytes !== undefined && stat.size !== entry.sizeBytes) return false
  return true
}
