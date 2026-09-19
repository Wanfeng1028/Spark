/**
 * bash 常驻 shell 会话池（阶段十九工单 19.3 / ADR D45，翻案"v1 不做常驻"判决）：
 * 每会话（sessionId）一个长驻 bash 进程——cwd/环境变量/函数定义跨调用保持。
 * 协议：命令后追加 `; __SPARK_RC=$?; printf "__SPARK_DONE__%d\\n" "$__SPARK_RC"`
 * 哨兵行（stdout 按行扫描定界）——命令本体经 POSIX 单引号安全编码整行写入，
 * 免注入面。约束（ADR D45 如实登记）：读标准输入的命令会吞哨兵 → 超时整 shell
 * 重建（fail-closed）；`exit`/`set -e` 同样以"shell 死亡 → 下一调用自动重建"收场。
 * 回收：空闲 idleMs 杀进程除名；池超 maxEntries 按 lastUsed LRU 逐出（进程树杀）。
 * 写入面单一来源 = spark.json engine.bashPersistent（工具执行期读，热生效）。
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

const PROGRESS_CHUNK_BYTES = 16 * 1024
const KILL_GRACE_MS = process.platform === 'win32' ? 1000 : 5000

export interface ShellPoolOpts {
  /** 池容量上限（按 lastUsed LRU 逐出） */
  maxEntries: number
  /** 空闲回收毫秒 */
  idleMs: number
  /** 时间源（测试注入） */
  now: () => number
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
  cwd: string
  lastUsed: number
  idleTimer: ReturnType<typeof setTimeout> | null
  busy: boolean
}

/** POSIX 单引号安全编码（' → '\'' 惯用法），零注入面 */
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
    this.clearIdle(entry)
    treeKill(entry.proc.pid, 'SIGTERM')
    this.entries.delete(key)
  }

  /** 全池回收（引擎 shutdown / 主开关关闭排水用） */
  drain(): void {
    for (const key of [...this.entries.keys()]) {
      this.drop(key)
    }
  }

  /**
   * 在 key 会话的常驻 shell 里执行一条命令。workDir 为 null = 保持当前目录；
   * 与条目记录不同则先发 cd（单引号安全编码）。
   */
  async run(
    key: string,
    file: string,
    command: string,
    workDir: string | null,
    timeoutMs: number,
    signal: AbortSignal,
    onOutput: (text: string) => void,
  ): Promise<PersistentResult> {
    let entry = this.entries.get(key)
    if (entry !== undefined && entry.busy) {
      // parallelizable:false 保证同会话无并发——防御性兜底：状态可疑即弃旧重建
      this.drop(key)
      entry = undefined
    }
    let cdLine = ''
    if (entry === undefined) {
      const proc = spawn(file, [], {
        ...(workDir !== null ? { cwd: workDir } : {}),
        ...(process.platform === 'win32' ? {} : { detached: true }),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      entry = { proc, seq: 0, cwd: workDir ?? '', lastUsed: this.opts.now(), idleTimer: null, busy: false }
      this.entries.set(key, entry)
      this.evictIfNeeded(key)
    } else if (workDir !== null && workDir !== entry.cwd) {
      cdLine = `cd ${shellQuote(workDir)}\n`
      entry.cwd = workDir
    }
    const live = entry
    live.busy = true
    this.clearIdle(live)

    const seq = (live.seq += 1)
    const line = `${cdLine}${command}\n__SPARK_RC=$?; printf "__SPARK_DONE__${seq}_%d\\n" "$__SPARK_RC"\n`

    return await new Promise<PersistentResult>((resolve) => {
      const chunks: string[] = []
      let collected = 0
      let stdoutBuf = ''
      let settled = false
      let timedOut = false
      let aborted = false
      let exitCode: number | null = null

      const emit = (text: string): void => {
        chunks.push(text)
        collected += text.length
        for (let i = 0; i < text.length; i += PROGRESS_CHUNK_BYTES) {
          onOutput(text.slice(i, i + PROGRESS_CHUNK_BYTES))
        }
      }

      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (killTimer !== null) clearTimeout(killTimer)
        signal.removeEventListener('abort', onAbort)
        live.proc.stdout?.off('data', onStdout)
        live.proc.stderr?.off('data', onStderr)
        live.proc.off('close', onClose)
        // 归还池：busy 清位 + 重新计时空闲回收
        live.busy = false
        live.lastUsed = this.opts.now()
        this.clearIdle(live)
        live.idleTimer = setTimeout(() => this.drop(key), this.opts.idleMs)
        live.idleTimer.unref()
        resolve({ exitCode, output: chunks.join(''), timedOut, aborted })
      }

      const onStdout = (b: Buffer): void => {
        stdoutBuf += b.toString('utf8')
        let idx: number
        while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
          const lineStr = stdoutBuf.slice(0, idx)
          stdoutBuf = stdoutBuf.slice(idx + 1)
          const m = new RegExp(`^__SPARK_DONE__${seq}_(\\d+)$`).exec(lineStr)
          if (m !== null) {
            exitCode = Number(m[1])
            // 哨兵行不算输出；残余 stdoutBuf 属于下一命令（常驻串行下应为空）
            finish()
            return
          }
          emit(lineStr + '\n')
        }
      }
      const onStderr = (b: Buffer): void => {
        emit(b.toString('utf8'))
      }
      const onClose = (code: number | null): void => {
        // shell 死亡（用户 exit / set -e / 被外部杀）：状态已失，出池
        exitCode = code
        this.drop(key)
        finish()
      }
      const killTree = (): void => {
        treeKill(live.proc.pid, 'SIGTERM')
        killTimer = setTimeout(() => treeKill(live.proc.pid, 'SIGKILL'), KILL_GRACE_MS)
      }
      const timer = setTimeout(() => {
        timedOut = true
        this.drop(key)
        killTree()
      }, timeoutMs)
      let killTimer: ReturnType<typeof setTimeout> | null = null
      const onAbort = (): void => {
        aborted = true
        this.drop(key)
        killTree()
      }
      signal.addEventListener('abort', onAbort, { once: true })
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
        if (k === protectKey) continue
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
