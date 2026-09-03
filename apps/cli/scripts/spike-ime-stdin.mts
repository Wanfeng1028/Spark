// IME 组字 stdin 原始序列探测脚本（工单 10.50 spike）。
// 口径依 doc/spike-ink7.md §7：ink 7 升级（10.56）本身可能消解大部分组字/宽字符症状，
// 本脚本在 ink 7 底座上记录真实 ConPTY 组字序列，据产物判定是否仍需 InputBox 深层防御。
// 纯 Node——不引依赖、不进 TUI、不连 server；只把 stdin 每个 data 事件的原始字节落盘。
//
// 运行（真实终端，需 TTY + 中文输入法；tsx 为 apps/cli devDependency）：
//   pnpm -C apps/cli exec tsx scripts/spike-ime-stdin.mts [输出文件]
// 缺省输出 <repo>/_scratch/ime-spike-<时间戳>.log（.gitignore 已忽略 _scratch/，不入库）。
//
// 用法：启动后切到中文输入法，逐字输入若干中文（如「中文测试输入法组字」），
// 也可夹杂英文 / emoji / 退格 / 方向键，观察每次 data 事件收到的原始字节序列。
// 结束：Ctrl+C 或 Ctrl+D（TTY 下）保存退出；管道输入则以 EOF 结束（便于非交互自检）。
//
// 每行记录格式：
//   #序号 +相对毫秒 len=字节数 hex=空格分隔十六进制 esc=控制字符转义 txt=UTF-8 解码
// 其中 hex 是权威字节视图、esc 让 ConPTY 组字标志序列（ESC[?... 一类）肉眼可辨。
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 缺省输出锚定仓库根 _scratch/（不论从哪个 cwd 调用——`pnpm -C apps/cli` 的 cwd 是 apps/cli）
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const outPath = resolve(process.argv[2] ?? `${repoRoot}/_scratch/ime-spike-${Date.now()}.log`)
mkdirSync(dirname(outPath), { recursive: true })

/** 写一行到日志文件（appendFileSync 即时落盘——崩溃不丢已录序列）并回显到屏幕（stderr 保持 stdout 干净） */
function log(line: string): void {
  appendFileSync(outPath, `${line}\n`)
  process.stderr.write(`${line}\n`)
}

/** 字节转义：可打印 ASCII 原样，其余 \xHH——让组字标志/控制序列肉眼可辨 */
function escapeBytes(buf: Buffer): string {
  let s = ''
  for (const b of buf) {
    s += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, '0')}`
  }
  return s
}

/** 十六进制空格分隔（权威字节视图） */
function hexDump(buf: Buffer): string {
  const parts: string[] = []
  for (const b of buf) parts.push(b.toString(16).padStart(2, '0'))
  return parts.join(' ')
}

const env = process.env
log(`# IME stdin spike — ${new Date().toISOString()}`)
log(`# platform=${process.platform} node=${process.version} tty=${process.stdin.isTTY === true}`)
log(
  `# WT_SESSION=${env.WT_SESSION ?? ''} TERM=${env.TERM ?? ''} TERM_PROGRAM=${env.TERM_PROGRAM ?? ''} ConEmuPID=${env.ConEmuPID ?? ''}`,
)
log(`# 输出文件: ${outPath}`)
log('# 用法: 切中文输入法逐字输入(如「中文测试输入法组字」), 可夹杂英文/emoji/退格/方向键。')
log('# 结束: Ctrl+C 或 Ctrl+D 保存退出(管道输入以 EOF 结束)。')
log('# 每行: #序号 +相对毫秒 len=字节数 hex=... esc=... txt=UTF-8解码')
log('')

const stdin = process.stdin
// 原始模式: 逐键不缓冲、不做行处理——才能捕获 ConPTY 组字期间的原始字节（非 TTY 管道输入跳过）
if (stdin.isTTY === true) stdin.setRawMode(true)
stdin.resume()

let count = 0
let done = false
const t0 = Date.now()

/** 收尾: 复位 raw mode + 落盘总结 + 退出（done 卫防 end/error/按键多路径重复触发） */
function finish(reason: string): void {
  if (done) return
  done = true
  log('')
  log(`# 结束(${reason}): 共 ${count} 个 data 事件, 已保存 ${outPath}`)
  if (stdin.isTTY === true) stdin.setRawMode(false)
  process.exit(0)
}

// chunk 类型标注为 Buffer（未设 encoding 时 Node 恒发 Buffer）——显式类型避开 stdin data 的 any 逃逸
stdin.on('data', (chunk: Buffer) => {
  // Ctrl+C(0x03) / Ctrl+D(0x04) 单字节 => 结束（raw 模式下 Ctrl+C 不再触发 SIGINT，须手动识别）
  if (chunk.length === 1 && (chunk[0] === 0x03 || chunk[0] === 0x04)) {
    finish(chunk[0] === 0x03 ? 'Ctrl+C' : 'Ctrl+D')
    return
  }
  count += 1
  const t = Date.now() - t0
  const idx = `#${String(count).padStart(4, '0')}`
  const hex = hexDump(chunk)
  const esc = escapeBytes(chunk)
  const txt = JSON.stringify(chunk.toString('utf8'))
  log(`${idx} +${String(t).padStart(6, '0')}ms len=${String(chunk.length).padStart(3, ' ')} hex=${hex} esc=${esc} txt=${txt}`)
})

stdin.on('end', () => finish('EOF'))
stdin.on('error', () => finish('stdin error'))
