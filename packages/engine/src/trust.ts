/**
 * 文件夹信任（工单 16.4，消解 V2-31；qwen-code trustedFolders/trust-precedence 参考设计，
 * 只参考算法不移植）：`~/.spark/trusted.json` 存 path → trusted/untrusted 两档；
 * **未信任 cwd 下，shell.exec 与 mcp.call 的规则层自动放行（allow）收紧为 ask**——
 * 只降级自动放行，deny/ask 不变（"收紧审批而非扩权"的精确语义）。
 *
 * 判定算法（qwen trust-precedence 精华，顺序无关）：
 * - 路径归一化：path.resolve + Windows 大小写不敏感（分隔符由 resolve 统一）；
 * - 沿 cwd 祖先链**从最深到最浅**找 folders 命中——最深者胜（父目录信任覆盖子目录）；
 * - 无命中 = none（未信任）。结果只依赖 folders 内容与 cwd——与插入顺序无关。
 *
 * v1 边界（ADR D37 登记）：信任档按引擎 defaultCwd 全局判定（单工作区直觉——
 * "打开陌生仓库"即 spark up 的 cwd；会话级 cwd 差异留后续工单）；不引 proper-lockfile
 * （trusted.json 唯一写者是引擎进程，原子写已覆盖完整性——无跨进程并发写者）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { atomicWriteJson } from './fsutil.js'
import { errText } from './errs.js'
import { sparkFile } from './storage/paths.js'

export type FolderTrust = 'trusted' | 'untrusted'

export interface TrustDoc {
  version: 1
  folders: Record<string, FolderTrust>
}

/**
 * 收紧面（16.4 产出② + LA-02 扩容）：bash、外部 MCP、写盘、子代理、电脑控制——
 * 未信任目录下这五类动作的规则层 allow 降级为 ask（deny/ask 不变）。
 * fs.write / agent.task / computer.use 纳入的因由：项目级 permissions.json 可随仓库
 * 传播（19.9 / D48），这三类在不可信仓库里的危害与 shell.exec 同级
 * （写任意文件 / 派子代理跑任意提示 / 控制本机键鼠截屏）。
 */
const TIGHTENED_ACTIONS = new Set(['shell.exec', 'mcp.call', 'fs.write', 'agent.task', 'computer.use'])

/** 路径归一化键（判定与存储共用——Windows 大小写不敏感，其余平台敏感） */
export function trustKey(p: string): string {
  const resolved = p.replace(/[/\\]+/g, '/')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** cwd 祖先链（深 → 浅；归一化键） */
export function ancestorKeys(cwd: string): string[] {
  const resolved = trustKey(cwd)
  const parts = resolved.split('/').filter((s) => s !== '')
  const keys: string[] = []
  // Windows 盘符段（c:）与根拼接时保留前导 /
  for (let i = parts.length; i >= 1; i--) {
    const key = (resolved.startsWith('/') ? '/' : '') + parts.slice(0, i).join('/')
    keys.push(key)
  }
  return keys
}

/**
 * 信任档判定（纯函数，顺序无关）：祖先链最深命中胜；无命中 = none。
 * 同路径不可能同时有两档（folders 键唯一）——"同深度 untrusted 压过 trusted"
 * 的 qwen 语义在本仓键唯一化后自然成立。
 */
export function trustLevelOf(cwd: string, folders: Record<string, FolderTrust>): FolderTrust | 'none' {
  const normalized = new Map<string, FolderTrust>()
  for (const [p, level] of Object.entries(folders)) {
    if (level !== 'trusted' && level !== 'untrusted') continue
    normalized.set(trustKey(p), level)
  }
  for (const key of ancestorKeys(cwd)) {
    const hit = normalized.get(key)
    if (hit !== undefined) return hit
  }
  return 'none'
}

/** 读 trusted.json（不存在 = 空表；坏 JSON/形状 → 空表 + 由调用方告警——不阻塞引擎启动） */
export function loadTrustDoc(root: string, onError?: (err: string) => void): TrustDoc {
  const path = sparkFile(root, 'trusted')
  if (!existsSync(path)) return { version: 1, folders: {} }
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    // in-narrowing：folders 段存在且为对象才收进返回值（非法形状按空表降级）
    const folders =
      typeof raw === 'object' && raw !== null && 'folders' in raw && typeof raw.folders === 'object' && raw.folders !== null
        ? (raw.folders as Record<string, FolderTrust>)
        : null
    if (folders === null) throw new Error('缺合法 folders 段')
    return { version: 1, folders }
  } catch (err) {
    onError?.(errText(err))
    return { version: 1, folders: {} }
  }
}

/** 原子写 trusted.json（单写者纪律：引擎进程是唯一写者，无需跨进程锁——ADR D37） */
export function saveTrustDoc(root: string, doc: TrustDoc): void {
  atomicWriteJson(sparkFile(root, 'trusted'), doc)
}

/** 未信任目录下该 action 是否收紧（allow → ask） */
export function tightens(action: string, level: FolderTrust | 'none'): boolean {
  return level !== 'trusted' && TIGHTENED_ACTIONS.has(action)
}
