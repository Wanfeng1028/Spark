/**
 * Checkpointer（doc/02 §5.8.7 / 阶段四工单 4.6）：turn 边界 git 快照——两域简化。
 *
 * 两域 → 一棵树：工作区（--work-tree 全量 add，.gitignore 生效）+ 会话文件
 * （hash-object 后以固定别名 .spark-checkpoint/session.jsonl 入索引）同仓提交；
 * 仓库位于 <会话目录>/checkpoints/<sessionId>/.git（与 JSONL 同级，不进工作区）。
 *
 * 回滚 = reset --hard <commit> + clean -fd（ignored 不动）+ 会话文件用快照 blob
 * 覆写（调用方 Engine 负责先停 run-loop、关 store——单写者纪律）。
 * reset 会把别名物化进工作区，回滚后删除该文件（目录保留：可能是用户自己的）。
 *
 * 失败语义：turn 已闭合，快照失败不推翻 turn——error{io} 事件如实上报（失败闭合：
 * 可见、可 grep），不吞、不重试。
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CheckpointId, ReviewDto, ReviewFileDto, ReviewPatchDto, SessionId, TurnId } from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { SparkLogger } from './logger.js'
import { errText } from './errs.js'
import { atomicWriteFile } from './fsutil.js'
import { newIds } from './ulid.js'

const execFileAsync = promisify(execFile)

/** 会话文件在快照树内的固定别名（前缀目录进 info/exclude，add -A 永不吸入工作区同名目录） */
export const SESSION_ALIAS = '.spark-checkpoint/session.jsonl'

/** git 子进程输出上限（会话文件/文件列表；128MB 与超长会话兜底一致） */
const MAX_BUFFER = 128 * 1024 * 1024

/** 快照索引记录（<repo>/.git/spark-checkpoints.json 数组元素） */
export interface CheckpointRecord {
  checkpointId: CheckpointId
  turnId: TurnId
  /** git commit sha（两域快照树） */
  commit: string
  createdAt: number
  /** 本快照相对上一快照变更的路径（含会话文件别名） */
  files: string[]
}

export interface GitCheckpointerDeps {
  sessionId: SessionId
  /** 工作区（快照域 ①） */
  cwd: string
  /** 会话 JSONL（快照域 ②；回滚时被覆写——须先停止单写者） */
  sessionPath: string
  /** 快照仓根目录（<会话目录>/checkpoints） */
  checkpointRoot: string
  bus: EventBus
  logger: SparkLogger
  now?: () => number
  newCheckpointId?: () => CheckpointId
}

/** WO-044：index.lock mtime 超过该值视为陈旧锁（正常 git 操作远快于此） */
const STALE_LOCK_MS = 30_000

/** git 的 index.lock 冲突报错特征（exit 128 + "Unable to create ... index.lock"） */
function isIndexLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('index.lock')
}

export class GitCheckpointer {
  private readonly repoDir: string
  private readonly gitDir: string
  private readonly indexPath: string
  private ready = false

  constructor(private readonly deps: GitCheckpointerDeps) {
    this.repoDir = join(deps.checkpointRoot, deps.sessionId)
    this.gitDir = join(this.repoDir, '.git')
    this.indexPath = join(this.gitDir, 'spark-checkpoints.json')
  }

  /**
   * turn 边界快照：add 工作区 → hash-object 会话文件 → commit → 登记 →
   * emit checkpoint.created。永不抛（失败 → error{io}；turn 已闭合不推翻）。
   */
  async snapshot(turnId: TurnId): Promise<void> {
    const checkpointId = (this.deps.newCheckpointId ?? newIds.checkpoint)()
    try {
      await this.ensure()
      await this.git(['add', '-A'])
      const sha = (await this.git(['hash-object', '-w', this.deps.sessionPath])).trim()
      await this.git(['update-index', '--add', '--cacheinfo', `100644,${sha},${SESSION_ALIAS}`])
      await this.git([
        '-c',
        'user.name=Spark',
        '-c',
        'user.email=spark@local',
        'commit',
        '--allow-empty', // 纯会话推进（无文件变更）也成快照：回滚锚点按 turn 均匀分布
        '-m',
        `checkpoint ${checkpointId} turn ${turnId}`,
      ])
      const commit = (await this.git(['rev-parse', 'HEAD'])).trim()
      const files = (await this.git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', 'HEAD']))
        .split('\n')
        .filter((l) => l !== '')
      await this.appendIndex({
        checkpointId,
        turnId,
        commit,
        createdAt: (this.deps.now ?? Date.now)(),
        files,
      })
      await this.deps.bus.emit(this.deps.sessionId, 'checkpoint.created', {
        checkpointId,
        files,
        turnId,
      })
    } catch (err) {
      // 快照失败不推翻已闭合的 turn；error{io} 如实上报（不吞）
      this.deps.logger.error('checkpoint.snapshot.error', {
        sid: this.deps.sessionId,
        turnId,
        err,
      })
      try {
        await this.deps.bus.emit(this.deps.sessionId, 'error', {
          scope: 'io',
          message: `E_CHECKPOINT_SNAPSHOT: ${errText(err)}`,
        })
      } catch (emitErr) {
        // 连 error 事件都落不了盘（如 shutdown 中 store 已关）：只剩日志
        this.deps.logger.error('checkpoint.error.emit.failed', {
          sid: this.deps.sessionId,
          err: emitErr,
        })
      }
    }
  }

  /** 快照列表（创建序 = 旧→新）；索引缺失 = 无快照 */
  async list(): Promise<CheckpointRecord[]> {
    let raw: string
    try {
      raw = await readFile(this.indexPath, 'utf8')
    } catch {
      return [] // 索引文件不存在 = 尚无快照（首次 turn 前）
    }
    return JSON.parse(raw) as CheckpointRecord[] // 坏索引 fail-closed：向上抛 500
  }

  /**
   * 回滚：工作区 reset --hard + clean -fd → 会话文件覆写为快照 blob。
   * E_NOT_FOUND 快照不存在；git 失败 → E_CHECKPOINT_ROLLBACK。
   * 调用方须保证：会话 idle、run-loop 已停、store 已关（单写者）。
   */
  async rollback(checkpointId: CheckpointId): Promise<void> {
    const record = (await this.list()).find((r) => r.checkpointId === checkpointId)
    if (record === undefined) {
      throw new Error(`E_NOT_FOUND: checkpoint ${checkpointId} 不存在`)
    }
    try {
      await this.git(['reset', '--hard', record.commit])
      await this.git(['clean', '-fd']) // 快照后新增的未跟踪文件（ignored 不动）
      // reset 把会话文件别名物化进工作区——删除文件，目录保留（可能是用户自己的）
      await rm(join(this.deps.cwd, SESSION_ALIAS), { force: true })
      const blob = await this.gitShow(`${record.commit}:${SESSION_ALIAS}`)
      // AUD-03：回滚覆写会话 JSONL 改原子写——中途崩溃不再损坏会话主文件
      atomicWriteFile(this.deps.sessionPath, blob)
    } catch (err) {
      throw new Error(`E_CHECKPOINT_ROLLBACK: ${errText(err)}`)
    }
  }

  /**
   * 审查聚合（19.35）：工作区当前状态相对基准快照的多文件 diff。只读——不写索引
   * （与 snapshot 的 add/commit 序列并发安全：各 git 命令本就经 index.lock 串行，
   * review 全程无写语义，至多 diff 顺带刷新 stat 缓存）。
   * 基准：fromCheckpointId 指定（不存在 → E_NOT_FOUND）或最近一次快照；无任何快照
   * 时 tracked 集必为空（snapshot 总是即席 commit），只聚合未跟踪新增。
   * 未跟踪新增走 ls-files --others --exclude-standard（尊重 .gitignore），patch 手工
   * 合成——`git diff --no-index` 的空设备名跨平台不可靠；二进制判据沿 git（前 8KB 含 NUL）。
   * 会话文件别名（SESSION_ALIAS）是快照记账不是工作区内容，tracked/untracked 两侧都过滤
   * （回滚后别名残留于索引时，diff 会把它显示为删除——不是用户可见的变更）。
   * 限制（登记）：numstat 文本解析不支持路径含 \t 或 \n 的文件（git -z 流可解，本单不引入）。
   */
  async review(fromCheckpointId?: CheckpointId): Promise<Omit<ReviewDto, 'sessionId'>> {
    await this.ensure() // 从未快照过的会话还没有仓（ensure 幂等）；ls-files/diff 均需要
    const records = await this.list()
    let base: CheckpointRecord | undefined
    if (fromCheckpointId !== undefined) {
      base = records.find((r) => r.checkpointId === fromCheckpointId)
      if (base === undefined) {
        throw new Error(`E_NOT_FOUND: checkpoint ${fromCheckpointId} 不存在`)
      }
    } else {
      base = records.at(-1)
    }
    const files: ReviewFileDto[] = []
    const patches: ReviewPatchDto[] = []
    let truncated = false
    let budget = REVIEW_PATCH_BUDGET
    if (base !== undefined) {
      // quotePath 关掉：非 ASCII 路径以原样字节输出，免 C 风格转义解析
      const statusOf = new Map<string, 'added' | 'modified' | 'deleted'>()
      for (const line of splitLines(
        await this.git(['-c', 'core.quotePath=false', 'diff', '--name-status', '--no-renames', base.commit]),
      )) {
        const tab = line.indexOf('\t')
        if (tab <= 0) continue
        const letter = line.slice(0, tab)
        const path = line.slice(tab + 1)
        if (path === SESSION_ALIAS) continue
        const status = letter === 'A' ? 'added' : letter === 'D' ? 'deleted' : 'modified'
        statusOf.set(path, status)
      }
      const numstat = new Map<string, { additions: number; deletions: number; binary: boolean }>()
      for (const line of splitLines(
        await this.git(['-c', 'core.quotePath=false', 'diff', '--numstat', '--no-renames', base.commit]),
      )) {
        // 形如 "12\t3\tpath"（二进制为 "-\t-\tpath"；路径不含 \t 时成立，见头注限制）
        const parts = line.split('\t')
        if (parts.length < 3) continue
        const path = parts.slice(2).join('\t')
        if (path === SESSION_ALIAS) continue
        const [add, del] = parts
        numstat.set(path, {
          additions: add === '-' ? 0 : Number.parseInt(add ?? '0', 10),
          deletions: del === '-' ? 0 : Number.parseInt(del ?? '0', 10),
          binary: add === '-' || del === '-',
        })
      }
      for (const [path, status] of statusOf) {
        const num = numstat.get(path) ?? { additions: 0, deletions: 0, binary: false }
        files.push({ path, status, additions: num.additions, deletions: num.deletions, binary: num.binary })
      }
      // tracked 文件 patch：单文件 diff（维持 worktree 当前态，与上方统计同源）
      for (const file of files) {
        if (file.binary) continue
        const raw = await this.git([
          '-c',
          'core.quotePath=false',
          'diff',
          '--no-renames',
          base.commit,
          '--',
          file.path,
        ])
        const patch = raw.replace(/\n$/, '')
        if (patch === '') continue
        if (patch.length > budget) {
          truncated = true
          continue
        }
        patches.push({ path: file.path, patch })
        budget -= patch.length
      }
    }
    // 未跟踪新增（快照之间 agent 新建的文件；add -A 只发生在 snapshot 内）
    for (const rel of splitLines(
      await this.git(['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard']),
    )) {
      if (rel === SESSION_ALIAS) continue
      let bytes: Buffer
      try {
        bytes = await readFile(join(this.deps.cwd, rel))
      } catch (err) {
        // ls-files 与读取之间文件被删（turn 进行中的工作区搅动是常态）：该文件按
        // 当前实况不存在，跳过——下次审查自然不再列出；非 ENOENT 的失败照常上抛
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw err
      }
      const binary = bytes.subarray(0, 8000).includes(0)
      const text = bytes.toString('utf8')
      const lines = countLines(text)
      files.push({ path: rel, status: 'added', additions: lines, deletions: 0, binary })
      if (binary || budget <= 0) {
        if (!binary) truncated = true
        continue
      }
      const patch = synthAddedPatch(rel, text)
      if (patch.length > budget) {
        truncated = true
        continue
      }
      patches.push({ path: rel, patch })
      budget -= patch.length
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    return {
      baseCheckpointId: base?.checkpointId ?? null,
      baseTurnId: base?.turnId ?? null,
      files,
      patches,
      truncated,
    }
  }

  // ---- 内部 ----

  /** 建仓（幂等：git init 对已存在仓库是 reinit）+ exclude 工作区 .git 目录 */
  private async ensure(): Promise<void> {
    if (this.ready) return
    await mkdir(this.repoDir, { recursive: true })
    await execFileAsync('git', ['init', this.repoDir], { maxBuffer: MAX_BUFFER })
    await mkdir(join(this.gitDir, 'info'), { recursive: true })
    await writeFile(join(this.gitDir, 'info', 'exclude'), '.git/\n', 'utf8')
    this.ready = true
  }

  /**
   * 工作区命令统一入口（--git-dir/--work-tree 双旗标；cwd 落在工作区）。
   * WO-044：进程在 add/commit 中途被杀会残留 .git/index.lock，此后每个 turn 快照
   * 都被 git 拒绝且永不自愈——这里对"锁文件存在且无并发写者"的场景做陈旧锁回收：
   * mtime 超过 30s（远超任何一次正常 git 操作）即认定 stale，删除后重试一次。
   */
  private async git(args: string[]): Promise<string> {
    try {
      return await this.gitRaw(args)
    } catch (err) {
      if (!isIndexLockError(err)) throw err
      const lockPath = join(this.gitDir, 'index.lock')
      let stale = false
      try {
        const st = await stat(lockPath)
        stale = Date.now() - st.mtimeMs > STALE_LOCK_MS
      } catch {
        // 锁已消失（并发写者刚释放）：原样重试
        stale = true
      }
      if (!stale) throw err
      await rm(lockPath, { force: true })
      return await this.gitRaw(args)
    }
  }

  private gitRaw(args: string[]): Promise<string> {
    return execFileAsync(
      'git',
      ['--git-dir', this.gitDir, '--work-tree', this.deps.cwd, ...args],
      { cwd: this.deps.cwd, maxBuffer: MAX_BUFFER },
    ).then(({ stdout }) => stdout)
  }

  /** 读快照 blob（encoding buffer——JSONL 逐字节还原） */
  private gitShow(rev: string): Promise<Buffer> {
    return execFileAsync('git', ['--git-dir', this.gitDir, 'show', rev], {
      maxBuffer: MAX_BUFFER,
      encoding: 'buffer',
    }).then(({ stdout }) => stdout)
  }

  private async appendIndex(record: CheckpointRecord): Promise<void> {
    const records = await this.list()
    records.push(record)
    // AUD-03：快照索引原子写（序列化形状与旧直写逐字节一致）
    atomicWriteFile(this.indexPath, JSON.stringify(records, null, 2))
  }
}

/** 审查聚合 patch 总预算（字节；超出即 truncated=true，剩余文件只给统计不给 patch） */
const REVIEW_PATCH_BUDGET = 256 * 1024

/** git 文本输出按行切分（过滤空尾行） */
function splitLines(out: string): string[] {
  return out.split('\n').filter((l) => l !== '')
}

/** 行数统计（与 git numstat 同口径：末行无换行符也计一行；空文件 0 行） */
function countLines(text: string): number {
  if (text === '') return 0
  const withoutTrailing = text.endsWith('\n') ? text.slice(0, -1) : text
  if (withoutTrailing === '') return 0
  return withoutTrailing.split('\n').length
}

/**
 * 未跟踪新增文件的 patch 合成（unified diff 形状与 git diff --no-index 对齐：
 * 单 hunk 全 `+` 行；末行无换行符带 No newline 标记；空文件只有头没有 hunk）。
 */
function synthAddedPatch(path: string, text: string): string {
  const n = countLines(text)
  const head = [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    'index 0000000..0000000',
    '--- /dev/null',
    `+++ b/${path}`,
  ]
  if (n === 0) return head.join('\n')
  const withoutTrailing = text.endsWith('\n') ? text.slice(0, -1) : text
  const body = withoutTrailing.split('\n').map((l) => `+${l}`)
  if (!text.endsWith('\n')) body.push('\\ No newline at end of file')
  return [...head, `@@ -0,0 +1,${n} @@`, ...body].join('\n')
}
