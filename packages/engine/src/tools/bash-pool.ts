/**
 * bash 常驻 shell 会话池（阶段十九工单 19.3 / ADR D45，翻案"v1 不做常驻"判决）：
 * 每会话（sessionId）一个长驻 bash 进程——cwd/环境变量/函数定义跨调用保持。
 * 协议（LA-13 修订）：命令后追加 `__SPARK_RC=$?; printf "\n__SPARK_DONE__<nonce>_<seq>_%d\n"`
 * ——哨兵 printf 带前导换行（命令无尾换行时也能正确终结残行）+ 每 shell 随机 nonce
 * （命令输出伪造哨兵不致误判）。**命令本体裸写 stdin**（不包引号——包裹会让 heredoc/
 * 多行结构吞掉哨兵行）：未闭合引号、heredoc 未终止等会让哨兵被吞 → 超时整 shell 重建
 * （fail-closed，但该命令输出已失——语义如实登记于 ADR D45，审批面在工具层先行把关）；
 * `exit`/`set -e` 同样以"shell 死亡 → 下一调用自动重建"收场。
 * 回收：空闲 idleMs 杀进程除名；池超 maxEntries 按 lastUsed LRU 逐出（busy 条目豁免，
 * LA-15）；drop/逐出按**条目身份**比对（防旧条目的迟到定时器杀到重建后的新 shell）。
 * 输出面（LA-14）：StringDecoder 跨块解码 + 收集上限（超限截断标记）+ 残行缓冲上限
 * （防单条无换行巨行撑爆内存）。写入面单一来源 = spark.json engine.bashPersistent
 * （工具执行期读，热生效）。
 */
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

const PROGRESS_CHUNK_BYTES = 16 * 1024
const KILL_GRACE_MS = process.platform === 'win32' ? 1000 : 5000
/** 残行缓冲上限（单条无换行巨行；冲刷时保留尾部 64 字符防哨兵被截断） */
const LINE_BUF_CAP = 1024 * 1024

/** 收集截断标记（bash.ts 独立 shell 路径同源引用——两路输出口径一致） */
export const COLLECT_TRUNCATION_MARK = '\n[输出超过收集上限，已截断]\n'

export interface ShellPoolOpts {
  /** 池容量上限（按 lastUsed LRU 逐出） */
  maxEntries: number
  /** 空闲回收毫秒 */
  idleMs: number
  /** 时间源（测试注入） */
  now: () => number
  /** 收集上限（字符数；超限截断 + 标记。缺省不设限——bash.ts 传入与独立 shell 同口径的值） */
  collectCapChars?: number
}

export interface PersistentResult {
  /** 哨兵回读的命令退出码；null = shell 中途死亡/被杀（状态已失） */
  exitCode: number | null
  output: string
  timedOut: boolean
  aborted: boolean
}

interface PoolEntry {
  proc: ChildProcess
  /** 哨兵单号（防上一条命令的迟滞输出误判——每命令递增） */
  seq: number
  /** 每 shell 随机 nonce（LA-13：命令输出伪造哨兵行不致误判） */
  nonce: string
  /** shell 起始目录（LA-12：显式落死在 spawn，绝不落引擎进程 cwd） */
  homeCwd: string
  cwd: string
  lastUsed: number
  idleTimer: ReturnType<typeof setTimeout> | null
  busy: boolean
}

/** POSIX 单引号安全编码（' → '\'' 惯用法）——仅用于 cd 行 */
function shellQuote(raw: string): string {
  return `'${raw.replaceAll("'", `'\\''`)}'`
}

/** 树杀：Unix 杀进程组（detached 使 child 即组长）；Windows taskkill /T /F（bash.ts 同型） */
function treeKill(pid: number | undefined, sig: 'SIGTERM' | 'SIGKILL'): void {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, sig)
  } catch {
    try {
      process.kill(pid, sig)
    } catch {
      // 进程已退出：无事可做
    }
  }
}

export class BashShellPool {
  private readonly entries = new Map<string, PoolEntry>()

  constructor(private readonly opts: ShellPoolOpts) {}

  /** 池内活跃 shell 数（测试/诊断用） */
  get size(): number {
    return this.entries.size
  }

  /** 指定会话是否持有活跃 shell（测试断言回收用） */
  has(key: string): boolean {
    return this.entries.has(key)
  }

  /** 立即回收指定会话的 shell（测试与关闭路径用） */
  drop(key: string): void {
    const entry = this.entries.get(key)
    if (entry === undefined) return
    this.dropEntry(key, entry)
  }

  /**
   * 按条目身份出池（LA-15）：`entries.get(key) === entry` 比对——旧条目的迟到回调
   * （close/超时/abort/idle 定时器）不得误杀同 key 重建后的新 shell。
   */
  private dropEntry(key: string, entry: PoolEntry): void {
    if (this.entries.get(key) !== entry) return
    this.entries.delete(key)
    this.clearIdle(entry)
    treeKill(entry.proc.pid, 'SIGTERM')
  }

  /** 全池回收（引擎 shutdown / 主开关关闭排水用） */
  drain(): void {
    for (const key of [...this.entries.keys()]) {
      this.drop(key)
    }
  }

  /**
   * 在 key 会话的常驻 shell 里执行一条命令。
   * `spawnCwd` = 新建 shell 的起始目录（LA-12：显式落死，绝不继承引擎进程 cwd）；
   * `changeTo` 为 null = 保持当前目录，非 null 且与条目记录不同则先发 cd（单引号编码）。
   * `maxOutputChars` = 收集上限（LA-14：超限截断 + 标记，执行期即生效不靠事后切片）。
   */
  async run(
    key: string,
    opts: {
      file: string
      command: string
      spawnCwd: string
      changeTo: string | null
      timeoutMs: number
      signal: AbortSignal
      onOutput: (text: string) => void
      maxOutputChars?: number
    },
  ): Promise<PersistentResult> {
    let entry = this.entries.get(key)
    if (entry !== undefined && entry.busy) {
      // parallelizable:false 保证同会话无并发——防御性兜底：状态可疑即弃旧重建
      this.dropEntry(key, entry)
      entry = undefined
    }
    let cdLine = ''
    if (entry === undefined) {
      const proc = spawn(opts.file, [], {
        cwd: opts.spawnCwd, // LA-12：显式起始目录（绝不继承引擎进程 cwd）
        ...(process.platform === 'win32' ? {} : { detached: true }),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      entry = {
        proc,
        seq: 0,
        nonce: randomBytes(4).toString('hex'),
        homeCwd: opts.spawnCwd,
        cwd: opts.spawnCwd,
        lastUsed: this.opts.now(),
        idleTimer: null,
        busy: false,
      }
      this.entries.set(key, entry)
      const created = entry
      // spawn 失败（cwd 不存在等）异步浮出：出池如实报错——下一调用重建（构造期注册一次，
      // 不随 run 叠加监听器，LA-15）
      proc.on('error', () => {
        this.dropEntry(key, created)
      })
      // stdin 写错误（EPIPE：shell 已死）——close/error 路径收口，这里只防未处理异常
      proc.stdin?.on('error', () => {})
      this.evictIfNeeded(key)
    } else if (opts.changeTo !== null && opts.changeTo !== entry.cwd) {
      cdLine = `cd ${shellQuote(opts.changeTo)}\n`
      entry.cwd = opts.changeTo
    }
    const live = entry
    live.busy = true
    this.clearIdle(live)

    const seq = (live.seq += 1)
    const line =
      `${cdLine}${opts.command}\n__SPARK_RC=$?; printf "\\n__SPARK_DONE__${live.nonce}_${seq}_%d\\n" "$__SPARK_RC"\n`
    const sentinelRe = new RegExp(`^__SPARK_DONE__${live.nonce}_${seq}_(\\d+)$`)
    const collectCap = opts.maxOutputChars ?? Number.POSITIVE_INFINITY

    return await new Promise<PersistentResult>((resolve) => {
      const chunks: string[] = []
      let collectedChars = 0
      let collectTruncated = false
      let stdoutBuf = ''
      let prevLineEmpty = false
      let settled = false
      let timedOut = false
      let aborted = false
      let exitCode: number | null = null
      const stdoutDecoder = new StringDecoder('utf8')
      const stderrDecoder = new StringDecoder('utf8')

      const emit = (text: string): void => {
        // progress 流式照发（直播流廉价；截断后也照发）
        for (let i = 0; i < text.length; i += PROGRESS_CHUNK_BYTES) {
          opts.onOutput(text.slice(i, i + PROGRESS_CHUNK_BYTES))
        }
        // LA-14：执行期收集上限——超限停收并落标记（不靠事后切片）
        if (collectTruncated) return
        const room = collectCap - collectedChars
        const piece = text.length > room ? text.slice(0, Math.max(0, room)) : text
        if (piece !== '') {
          chunks.push(piece)
          collectedChars += piece.length
        }
        if (collectedChars >= collectCap) {
          collectTruncated = true
          chunks.push(COLLECT_TRUNCATION_MARK)
        }
      }

      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (killTimer !== null) clearTimeout(killTimer)
        opts.signal.removeEventListener('abort', onAbort)
        live.proc.stdout?.off('data', onStdout)
        live.proc.stderr?.off('data', onStderr)
        live.proc.off('close', onClose)
        // 归还池：仅当条目仍在池中（超时/中断/死亡路径已出池——LA-15：不挂迟到定时器）
        if (this.entries.get(key) === live) {
          live.busy = false
          live.lastUsed = this.opts.now()
          this.clearIdle(live)
          live.idleTimer = setTimeout(() => this.drop(key), this.opts.idleMs)
          live.idleTimer.unref()
        }
        resolve({ exitCode, output: chunks.join(''), timedOut, aborted })
      }

      const onStdout = (b: Buffer): void => {
        stdoutBuf += stdoutDecoder.write(b)
        let idx: number
        while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
          const lineStr = stdoutBuf.slice(0, idx)
          stdoutBuf = stdoutBuf.slice(idx + 1)
          const m = sentinelRe.exec(lineStr)
          if (m !== null) {
            exitCode = Number(m[1])
            // LA-13：哨兵 printf 的前导 \n 在命令有尾换行时会产生一个空行（人工行）——
            // 从已收集输出剥掉这一个换行；命令无尾换行时它只终结残行，无需剥
            if (prevLineEmpty) {
              const out = chunks.join('')
              if (out.endsWith('\n')) {
                chunks.length = 0
                chunks.push(out.slice(0, -1))
              }
            }
            // 哨兵行不算输出；残余 stdoutBuf 属于下一命令（常驻串行下应为空）
            finish()
            return
          }
          emit(lineStr + '\n')
          prevLineEmpty = lineStr === ''
        }
        // LA-14：残行缓冲上限——单条无换行巨行冲成输出（保留尾部 64 字符防哨兵截断）
        if (stdoutBuf.length > LINE_BUF_CAP) {
          emit(stdoutBuf.slice(0, stdoutBuf.length - 64))
          stdoutBuf = stdoutBuf.slice(stdoutBuf.length - 64)
        }
      }
      const onStderr = (b: Buffer): void => {
        emit(stderrDecoder.write(b))
      }
      const onClose = (code: number | null): void => {
        // shell 死亡（用户 exit / set -e / 被外部杀）：状态已失，出池
        // 解码器收尾冲刷（LA-14：跨块多字节字符的收尾恢复）
        const tail = stderrDecoder.end()
        if (tail !== '') emit(tail)
        exitCode = code
        this.dropEntry(key, live)
        finish()
      }
      const killTree = (): void => {
        treeKill(live.proc.pid, 'SIGTERM')
        killTimer = setTimeout(() => treeKill(live.proc.pid, 'SIGKILL'), KILL_GRACE_MS)
      }
      const timer = setTimeout(() => {
        timedOut = true
        this.dropEntry(key, live)
        killTree()
      }, opts.timeoutMs)
      let killTimer: ReturnType<typeof setTimeout> | null = null
      const onAbort = (): void => {
        aborted = true
        this.dropEntry(key, live)
        killTree()
      }
      opts.signal.addEventListener('abort', onAbort, { once: true })
      live.proc.stdout?.on('data', onStdout)
      live.proc.stderr?.on('data', onStderr)
      live.proc.on('close', onClose)
      live.proc.stdin?.write(line)
    })
  }

  private clearIdle(entry: PoolEntry): void {
    if (entry.idleTimer !== null) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = null
    }
  }

  private evictIfNeeded(protectKey: string): void {
    while (this.entries.size > this.opts.maxEntries) {
      let oldestKey: string | null = null
      let oldestUsed = Number.POSITIVE_INFINITY
      for (const [k, e] of this.entries) {
        if (k === protectKey || e.busy) continue // LA-15：busy 条目豁免逐出
        if (e.lastUsed < oldestUsed) {
          oldestUsed = e.lastUsed
          oldestKey = k
        }
      }
      if (oldestKey === null) break
      this.drop(oldestKey)
    }
  }
}
