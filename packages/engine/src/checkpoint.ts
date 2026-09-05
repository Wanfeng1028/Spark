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
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CheckpointId, SessionId, TurnId } from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { SparkLogger } from './logger.js'
import { errText } from './errs.js'
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
      await writeFile(this.deps.sessionPath, blob)
    } catch (err) {
      throw new Error(`E_CHECKPOINT_ROLLBACK: ${errText(err)}`)
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

  /** 工作区命令统一入口（--git-dir/--work-tree 双旗标；cwd 落在工作区） */
  private git(args: string[]): Promise<string> {
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
    await writeFile(this.indexPath, JSON.stringify(records, null, 2), 'utf8')
  }
}
