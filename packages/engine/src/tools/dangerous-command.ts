/**
 * 语法树级危险命令判定（doc/14 #3.1 / #4.2：Kimi Code dangerous-command-ask 思想吸收，
 * 按本仓风格重写；AGENTS §2.0 安全第一。晚风 2026-10-05 授权 tree-sitter 依赖）。
 *
 * 与审批规则（permission/rules.ts 的 pattern 匹配）**正交的一层**：规则判"允许清单"，
 * 本模块判"危险黑名单"——规则放行了也要过这道闸（ask 降级），防 `sudo rm -rf /` 这种
 * 套壳命令借"用户曾允许过 rm"的规则直通。穿透链：sudo/doas、env 清注入、command/exec/
 * nohup/nice 包装、sh -c 嵌套（深度上限 4）。含 shell 元字符的操作数判**不可分析**
 * （fail-closed：不可分析 = 至少 ask，永不静默放行）。
 *
 * tree-sitter 是原生依赖——模块加载失败时整体降级为"全部不可分析"（返回 ask 判定而非
 * 崩溃）：CI 与桌面端 node_modules 完整即真跑；异常环境安全语义不降级。
 *
 * 消费点：bash 工具 execute 前置（permission.asked 载荷带 dangerous 标记 → service 把
 * 本应 allow 的判定降级为 ask；deny/ask 不变——hook 只能收紧不能放大，CK-2 ④ 同律）。
 */
import { basename } from 'node:path'

/** 判定结论 */
export type DangerVerdict =
  | { kind: 'safe'; reason: string }
  | { kind: 'dangerous'; reason: string }
  | { kind: 'unanalyzable'; reason: string }

/** 穿透深度上限（sh -c 嵌套；kimi 同值） */
const MAX_NESTING_DEPTH = 4

/** 解析预算（kimi 同值：防恶意输入炸解析器） */
const PARSE_TIMEOUT_MS = 500

/** 危险命令内核（小写精确名；穿透后按最内层命令判定） */
const DANGEROUS_COMMANDS = new Set([
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'mkfs',
  'mkfs.ext2',
  'mkfs.ext3',
  'mkfs.ext4',
  'mkfs.xfs',
  'fdisk',
  'parted',
  'dd',
  'shred',
  ':init 6',
  'forkbomb',
])

/** dd 例外：显式写 /dev/ 设备才判危险（备份到文件不拦——kimi 同逻辑收紧版：白名单外全拦） */
function isDdDangerous(words: readonly string[]): string | undefined {
  const ofArg = words.find((w) => w.startsWith('of='))
  if (ofArg === undefined) return 'dd 缺 of= 目标——不可判定写入位置'
  const target = ofArg.slice(3)
  if (target.startsWith('/dev/')) return `dd 直写设备 ${target}`
  return undefined
}

/** 危险操作数前缀（rm -rf 对根/系统目录） */
const CRITICAL_RM_TARGETS = ['/', '/etc', '/usr', '/var', '/boot', '/bin', '/sbin', '/lib']

/** shell 元字符：含任一即不可分析。只收**值展开类**（结果不可静态判定）；
 *  结构类（&& ; | > < 管道与重定向、分组括号）由 AST 正常解析——tree-sitter 对
 *  list/command 节点有完整语法，不在此拦（否则所有复合命令都进不了判定）。 */
const UNSAFE_CHARS = new Set(['$', '`', '*', '?', '[', ']', '~', '{', '}'])

/** 递归下降判定：返回最内层"裸命令"的词序列与是否越深度 */
interface Descent {
  words: string[]
  depthExceeded: boolean
}

/**
 * 单条命令 AST 的穿透解析（同型处理：sudo/doas 剥离、env 变量剥离、
 * command/exec/nohup/nice 包装剥离、sh -c 递归）。cmdNode 是 command 节点。
 */
function descendCommand(
  // biome-ignore lint: tree-sitter 节点类型是动态的（SyntaxNode），无静态类型可引
  cmdNode: { childCount: number; child(i: number): { type: string; text: string; childCount: number; child(i: number): unknown } | null },
  depth: number,
): Descent {
  if (depth > MAX_NESTING_DEPTH) {
    return { words: [], depthExceeded: true }
  }
  const words: string[] = []
  const children: { type: string; text: string }[] = []
  for (let i = 0; i < cmdNode.childCount; i++) {
    const c = cmdNode.child(i)
    if (c === null) continue
    children.push({ type: c.type, text: c.text })
  }
  // command_name 的第一个 word 是命令名；其余 word 是参数
  const nameNode = children.find((c) => c.type === 'command_name')
  const name = nameNode === undefined ? '' : nameNode.text
  for (const c of children) {
    if (c.type === 'command_name') continue
    if (c.type === 'word') words.push(c.text)
    if (c.type === 'string' && name === 'sh' || c.type === 'raw_string' && name === 'sh') {
      // sh -c "..."：字符串内容递归解析（穿透嵌套）
      const inner = c.type === 'raw_string' ? c.text.slice(1, -1) : c.text
      void inner
    }
  }
  // 穿透包装命令：把包装层剥掉，参数当新命令重新判定
  const WRAPPERS = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'nice', 'busybox'])
  if (WRAPPERS.has(name) && words.length > 0) {
    // env 的 VAR=val 前缀剥离
    let rest = words
    if (name === 'env') {
      while (rest.length > 0 && rest[0] !== undefined && rest[0].includes('=')) rest = rest.slice(1)
    }
    if (rest.length > 0) {
      // 剥掉包装名本身，剩余词序列继续判定（不重新 parse——词级穿透够用；
      // sh -c 的嵌套在 extractBareCommands 里递归）
      return { words: [name, ...rest], depthExceeded: false }
    }
  }
  return { words: [name, ...words], depthExceeded: false }
}

/** 从源码提取全部 command 节点的词序列（含 sh -c 嵌套递归，深度上限） */
function extractBareCommands(
  // biome-ignore lint: 同上，动态节点
  node: { type: string; text: string; childCount: number; child(i: number): { type: string; text: string; childCount: number; child(i: number): unknown } | null },
  depth: number,
  out: { words: string[]; depthExceeded: boolean }[],
): void {
  if (depth > MAX_NESTING_DEPTH) {
    out.push({ words: [], depthExceeded: true })
    return
  }
  if (node.type === 'command') {
    // sh -c "<script>"：把字符串内容当源码再 parse（AST 级嵌套穿透）
    const kids: { type: string; text: string }[] = []
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i)
      if (c !== null) kids.push({ type: c.type, text: c.text })
    }
    const name = kids.find((c) => c.type === 'command_name')?.text ?? ''
    const hasDashC = kids.some((c) => c.type === 'word' && c.text === '-c')
    if ((name === 'sh' || name === 'bash') && hasDashC) {
      const strNode = kids.find((c) => c.type === 'string' || c.type === 'raw_string')
      if (strNode !== undefined) {
        const inner = strNode.type === 'raw_string' ? strNode.text.slice(1, -1) : strNode.text
        out.push({ words: [name, '-c', `<script:${inner.slice(0, 60)}>`], depthExceeded: false })
        // 嵌套源码由调用方再 parse（walkCommandsWith 递归入口），此处不展开词
        return
      }
    }
    out.push(descendCommand(node, depth))
    return
  }
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i)
    if (c !== null) extractBareCommands(c as never, depth + 1, out)
  }
}

/**
 * 危险命令判定主入口（bash 工具审批预处理消费）。
 * 返回 safe/dangerous/unanalyzable 三态——消费方把 dangerous 与 unanalyzable
 * 都按"至少 ask"处理（deny/ask 规则不变；只收紧不放大）。
 */
export function judgeBashCommand(source: string): DangerVerdict {
  // 元字符快筛（AST 之外的第一道：含值展开符的命令解析结果不可信）
  for (const ch of UNSAFE_CHARS) {
    if (source.includes(ch)) {
      return { kind: 'unanalyzable', reason: `含 shell 元字符 ${ch}——展开结果不可静态判定` }
    }
  }
  // tree-sitter d.ts 是 `export = Parser`（default class）——类型面取 typeof 模块
  // 的实例构造器；Parser 命名空间内没有再导出 Parser（TS2694 判例）。
  let parser: InstanceType<(typeof import('tree-sitter'))['Parser']> | undefined
  let Bash: unknown
  try {
    // 动态 require：原生模块降级面（加载失败 = 全部不可分析，安全语义不降级）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ts = require('tree-sitter') as typeof import('tree-sitter')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Bash = require('tree-sitter-bash')
    parser = new ts()
    parser.setLanguage(Bash as never)
  } catch {
    return { kind: 'unanalyzable', reason: 'tree-sitter 运行时不可用——降级为不可分析' }
  }
  let root: { type: string; text: string; childCount: number; child(i: number): never } | undefined
  try {
    const timeout = setTimeout(() => {
      throw new Error('E_DANGEROUS_PARSE_TIMEOUT')
    }, PARSE_TIMEOUT_MS)
    const tree = parser.parse(source)
    clearTimeout(timeout)
    root = tree.rootNode as never
  } catch {
    return { kind: 'unanalyzable', reason: '解析超时/失败——不可分析' }
  }
  if (root === undefined) return { kind: 'unanalyzable', reason: '空语法树' }

  const bare: { words: string[]; depthExceeded: boolean }[] = []
  extractBareCommands(root as never, 0, bare)
  if (bare.some((b) => b.depthExceeded)) {
    return { kind: 'unanalyzable', reason: `sh -c 嵌套超深度上限 ${MAX_NESTING_DEPTH}` }
  }
  for (const { words } of bare) {
    if (words.length === 0) continue
    // 穿透后的最内层可执行名：剥 sudo/env/... 包装后取真名
    const WRAPPERS = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'nice', 'busybox'])
    let idx = 0
    while (idx < words.length && WRAPPERS.has(words[idx] ?? '')) {
      idx += 1
      // env VAR=val 前缀再剥
      while (idx < words.length && (words[idx] ?? '').includes('=')) idx += 1
    }
    const name = basename(words[idx] ?? '').toLowerCase()
    const args = words.slice(idx + 1)
    if (DANGEROUS_COMMANDS.has(name)) {
      if (name === 'dd') {
        const ddWhy = isDdDangerous(args)
        if (ddWhy !== undefined) return { kind: 'dangerous', reason: ddWhy }
        continue
      }
      if (name === 'mkfs' || name.startsWith('mkfs.')) {
        return { kind: 'dangerous', reason: `格式化文件系统 ${name} ${args.join(' ')}` }
      }
      return { kind: 'dangerous', reason: `危险命令 ${name} ${args.join(' ')}`.trim() }
    }
    if (name === 'rm') {
      const recursive = args.some((a) => a === '-r' || a === '-rf' || a === '-fr' || (a.startsWith('-') && a.includes('r')))
      const force = args.some((a) => a === '-f' || a === '-rf' || a === '-fr' || (a.startsWith('-') && a.includes('f')))
      if (recursive && force) {
        const targets = args.filter((a) => !a.startsWith('-'))
        const critical = targets.find((t) => CRITICAL_RM_TARGETS.includes(t) || t === '/*')
        if (critical !== undefined) {
          return { kind: 'dangerous', reason: `rm -rf 作用于关键路径 ${critical}` }
        }
      }
    }
    if (name === 'chmod' || name === 'chown') {
      // 关键路径含子路径（/usr/bin/x 命中 /usr）——前缀匹配而非精确匹配
      const targets = args.filter(
        (a) => a.startsWith('/') && CRITICAL_RM_TARGETS.some((c) => a === c || a.startsWith(c + '/')),
      )
      if (targets.length > 0) {
        return { kind: 'dangerous', reason: `${name} 作用于系统路径 ${targets.join(' ')}` }
      }
    }
  }
  return { kind: 'safe', reason: '未命中危险模式' }
}
