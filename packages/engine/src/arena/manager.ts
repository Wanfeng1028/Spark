/**
 * 多模型竞答（工单 16.8，消解 V2-29；qwen ArenaManager 参考设计大幅裁剪——
 * InProcess 路线：每个 contender 是真实子会话（Engine.createSession parentId+model），
 * cwd = 主仓 worktree（文件级隔离），qwen 的 PTY 后端不进（Spark headless））：
 *
 * - `start`：主会话 cwd 须为 git 仓（否 E_CONFIG）；为每个模型 `git worktree add`
 *   到 `~/.spark/arena/<sid>/<seq>-<modelSafe>/` 并并发 send(prompt)；
 * - 用量归并：contender 完成后从其 durable 事件流聚合 turn.completed usage；
 * - diff 统计：完成后 `git -C worktree diff --numstat`（对基线 HEAD——文件级增删行）；
 * - 胜者应用（applyWinner）：worktree 改动逐文件写回主会话 cwd——**删除类改动跳过**
 *   （§2.10 AI 无权删文件，如实登记到结果）；应用前整体一次 permission.asked
 *   （action 'fs.write'，patterns = 文件清单——"逐文件过审批"的用户知情面；
 *   N 次逐文件确认是交互灾难，裁决写 ADR D42）；
 * - 清理：无论成败 worktree remove --force + branch -D（~/.spark/arena 下引擎自管，
 *   非仓库文件）。
 *
 * 状态面：**零新事件词表条目**（ADR D42）——各 contender 是真实会话（自身事件流
 * 天然实时），聚合状态走 GET /api/sessions/:id/arena 快照轮询；竞答记录仅内存
 * （重启丢失登记限制——验收不含回放）。
 */
import { simpleGit } from 'simple-git'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { ids } from '@spark/protocol'
import type { SessionId, Usage } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import { errText } from '../errs.js'

/** 竞答规模上限（qwen ARENA_MAX_AGENTS 同值） */
const ARENA_MAX_CONTENDERS = 5

export interface ArenaContender {
  sessionId: SessionId
  model: string
  worktree: string
  status: 'running' | 'done' | 'error'
  usage: Usage
  durationMs: number | null
  diffStat: { files: number; additions: number; deletions: number } | null
}

export interface ArenaRun {
  arenaId: string
  sessionId: SessionId
  prompt: string
  status: 'running' | 'done' | 'cancelled'
  contenders: ArenaContender[]
  winner: SessionId | null
  applied: { files: string[]; skippedDeletions: string[] } | null
}

function modelSafe(model: string): string {
  return model.replace(/[^a-z0-9-]/gi, '-')
}

/** numstat 行解析："add\tdel\tpath"；二进制行 add/del 为 '-' 计 0 */
function parseNumstat(stdout: string): { files: number; additions: number; deletions: number } {
  let files = 0
  let additions = 0
  let deletions = 0
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue
    const [a, d] = line.split('\t')
    files += 1
    additions += a !== undefined && a !== '-' ? Number.parseInt(a, 10) : 0
    deletions += d !== undefined && d !== '-' ? Number.parseInt(d, 10) : 0
  }
  return { files, additions, deletions }
}

/** Arena 对 contender 会话句柄的窄视图（SessionHandle 的结构子集） */
interface ArenaHandleLike {
  meta: { cwd: string }
  status(): string
  events(): SparkEventEnvelope[]
  interrupt(): Promise<void>
  send(text: string): Promise<unknown>
}

/** Arena 对 Engine 的窄依赖面（结构类型——只消费既有公共方法 + 三个新增面） */
interface ArenaEngine {
  getSession(id: SessionId): ArenaHandleLike | undefined
  resumeSession(id: SessionId): Promise<ArenaHandleLike & { id: SessionId }>
  createSession(opts: { cwd: string; parentId: SessionId; model?: string; title?: string }): Promise<{ id: SessionId; meta: { cwd: string } }>
  requestApproval(sessionId: SessionId, action: string, reason: string, patterns: string[]): Promise<boolean>
  writeFileInCwd(sessionId: SessionId, relPath: string, bytes: Buffer): Promise<void>
  interruptSession(id: SessionId): Promise<void>
}

export interface ArenaDeps {
  engine: ArenaEngine
  /** 引擎 root（~/.spark）——worktree 根 `<root>/arena/<sid>/` */
  sparkRoot: string
}

export class ArenaManager {
  private readonly runs = new Map<SessionId, ArenaRun>()

  constructor(private readonly deps: ArenaDeps) {}

  /** 快照（GET 数据源；无竞答回 null） */
  snapshot(sessionId: SessionId): ArenaRun | null {
    return this.runs.get(sessionId) ?? null
  }

  /**
   * 发起竞答：models 2~5 个（重复去重）；主会话 cwd 非 git 仓 → E_CONFIG；
   * 已有运行中竞答 → E_ARENA_ACTIVE。返回 arenaId。
   */
  async start(sessionId: SessionId, prompt: string, models: string[]): Promise<string> {
    if (models.length < 2 || models.length > ARENA_MAX_CONTENDERS) {
      throw new Error(`E_ARENA_ARGS: 竞答需要 2~${ARENA_MAX_CONTENDERS} 个模型（去重后 ${models.length} 个）`)
    }
    const unique = [...new Set(models)]
    if (unique.length !== models.length) {
      throw new Error('E_ARENA_ARGS: 模型列表有重复（竞答模型须互异）')
    }
    const existing = this.runs.get(sessionId)
    if (existing !== undefined && existing.status === 'running') {
      throw new Error('E_ARENA_ACTIVE: 本会话已有运行中的竞答（先 cancel 或等待完成）')
    }
    const handle0 = this.deps.engine.getSession(sessionId)
    if (handle0 === undefined) throw new Error('E_NOT_FOUND: 主会话未装载')
    const git = simpleGit({ baseDir: handle0.meta.cwd })
    const isRepo = await git.checkIsRepo().catch(() => false)
    if (!isRepo) {
      throw new Error(`E_CONFIG: 竞答要求主会话工作目录是 git 仓库（当前 ${handle0.meta.cwd}）——worktree 隔离依赖 git`)
    }

    const arenaId = ids.session(`ses_arena_${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
    const run: ArenaRun = {
      arenaId,
      sessionId,
      prompt,
      status: 'running',
      contenders: [],
      winner: null,
      applied: null,
    }
    this.runs.set(sessionId, run)

    const base = join(this.deps.sparkRoot, 'arena', sessionId)
    for (const [i, model] of unique.entries()) {
      const wt = join(base, `${i + 1}-${modelSafe(model)}`)
      try {
        await git.raw(['worktree', 'add', wt, '-b', `spark-arena-${sessionId}-${i + 1}`])
      } catch (err) {
        await this.cleanup(run)
        throw new Error(`E_ARENA_CONNECT: worktree 创建失败（${modelSafe(model)}）：${errText(err)}`)
      }
      let child: SessionId
      try {
        const handle = await this.deps.engine.createSession({
          cwd: wt,
          parentId: sessionId,
          model,
          title: `arena: ${model}`,
        })
        child = handle.id
      } catch (err) {
        await this.cleanup(run)
        throw new Error(`E_ARENA_CONNECT: 子会话创建失败（${model}）：${errText(err)}`)
      }
      run.contenders.push({
        sessionId: child,
        model,
        worktree: wt,
        status: 'running',
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: null,
        diffStat: null,
      })
      // 并发 send（同一 tick 全部入队——各自会话独立 turn 管线并行跑）
      void this.drive(run, run.contenders[i] as ArenaContender, prompt)
    }
    return arenaId
  }

  /** 单 contender 生命周期：send → 等完成 → 聚合用量与 diff（失败闭合不炸整体） */
  private async drive(run: ArenaRun, contender: ArenaContender, prompt: string): Promise<void> {
    const startedAt = Date.now()
    try {
      const handle = await this.deps.engine.resumeSession(contender.sessionId)
      await handle.send(prompt)
      const deadline = Date.now() + 10 * 60_000 // 10min 上限（防 contender 永挂）
      for (;;) {
        const st = handle.status()
        if (st === 'idle' || st === 'error') break
        if (Date.now() > deadline) throw new Error('contender 超时（10min）')
        await new Promise((r) => setTimeout(r, 200))
      }
      contender.durationMs = Date.now() - startedAt
      // 用量归并：durable turn.completed usage 累加
      const done = handle.events()
      for (const e of done) {
        if (e.type === 'turn.completed') {
          const u = (e.data as { usage: Usage }).usage
          contender.usage = {
            inputTokens: contender.usage.inputTokens + u.inputTokens,
            outputTokens: contender.usage.outputTokens + u.outputTokens,
          }
        }
      }
      // diff 统计（对基线 HEAD）
      const git = simpleGit({ baseDir: contender.worktree })
      const numstat = await git.diff(['--numstat']).catch(() => '')
      contender.diffStat = parseNumstat(numstat)
      contender.status = 'done'
    } catch (err) {
      contender.status = 'error'
      contender.durationMs = Date.now() - startedAt
      contender.diffStat = null
      void err
    }
    // 全部收尾 → 竞答整体 done（不自动选胜者——选择是用户的显式动作）
    if (run.contenders.every((c) => c.status !== 'running')) {
      run.status = 'done'
    }
  }

  /**
   * 应用胜者改动：worktree 相对基线的改动逐文件写回主会话 cwd。
   * 删除类改动**跳过并登记**（§2.10：AI 无权删文件——含竞答应用路径）；
   * 新增/修改的文件整体一次审批（fs.write，patterns = 相对路径清单）。
   */
  async applyWinner(sessionId: SessionId, contenderSessionId: SessionId): Promise<void> {
    const run = this.runs.get(sessionId)
    if (run === undefined) throw new Error('E_NOT_FOUND: 本会话没有竞答记录')
    if (run.status !== 'done') throw new Error('E_ARENA_ACTIVE: 竞答尚未全部完成')
    const winner = run.contenders.find((c) => c.sessionId === contenderSessionId)
    if (winner === undefined) throw new Error('E_NOT_FOUND: 该 contender 不在本次竞答中')
    if (winner.status !== 'done') throw new Error('E_ARENA_ARGS: 胜者 contender 未成功完成（error 状态不可应用）')

    const meta = this.deps.engine.getSession(sessionId)
    if (meta === undefined) throw new Error('E_NOT_FOUND: 主会话未装载')
    const git = simpleGit({ baseDir: winner.worktree })
    const numstat = (await git.diff(['--numstat']).catch(() => '')).split('\n').filter((l) => l.trim() !== '')
    const applied: string[] = []
    const skippedDeletions: string[] = []
    const writePaths: string[] = []
    const contents: { rel: string; bytes: Buffer }[] = []
    for (const line of numstat) {
      const [a, d, rel] = line.split('\t')
      if (rel === undefined) continue
      const del = d !== undefined && d !== '-' ? Number.parseInt(d, 10) : 0
      if (del > 0 && (a === '0' || a === '-')) {
        // 纯删除：AI 无权删文件（§2.10）——跳过并登记（用户可手删）
        skippedDeletions.push(rel)
        continue
      }
      try {
        const bytes = await readFile(join(winner.worktree, rel))
        contents.push({ rel, bytes })
        writePaths.push(rel)
      } catch (err) {
        throw new Error(`E_NOT_FOUND: 胜者 worktree 读改动文件失败 ${rel}：${errText(err)}`)
      }
    }
    if (writePaths.length > 0) {
      // 整体一次审批（用户知情面 = 完整文件清单；patterns 逐文件）
      const ok = await this.deps.engine.requestApproval(
        sessionId,
        'fs.write',
        `应用竞答胜者改动（${winner.model}）：${writePaths.length} 个文件`,
        writePaths,
      )
      if (!ok) {
        throw new Error('E_PERMISSION: 应用被拒绝——主工作区未做任何改动')
      }
      for (const { rel, bytes } of contents) {
        await this.deps.engine.writeFileInCwd(sessionId, rel, bytes)
        applied.push(rel)
      }
    }
    run.winner = contenderSessionId
    run.applied = { files: applied, skippedDeletions }
  }

  /** 取消：中断运行中 contenders（interrupt）+ 清 worktree；已完成的保留记录 */
  async cancel(sessionId: SessionId): Promise<void> {
    const run = this.runs.get(sessionId)
    if (run === undefined) throw new Error('E_NOT_FOUND: 本会话没有竞答记录')
    run.status = 'cancelled'
    for (const c of run.contenders) {
      if (c.status === 'running') {
        c.status = 'error'
        await this.deps.engine.interruptSession(c.sessionId).catch(() => {})
      }
    }
    await this.cleanup(run)
  }

  /** worktree 清理（remove --force + branch -D；失败逐个吞——清理尽力而为，不阻塞主流程） */
  private async cleanup(run: ArenaRun): Promise<void> {
    if (run.contenders.length === 0) {
      // start 中途失败：contenders 还没登记，worktree 目录逐个清（base 目录整体删）
      const base = join(this.deps.sparkRoot, 'arena', run.sessionId)
      await rm(base, { recursive: true, force: true }).catch(() => {})
      return
    }
    const handleClean = this.deps.engine.getSession(run.sessionId)
    if (handleClean === undefined) return
    const git = simpleGit({ baseDir: handleClean.meta.cwd })
    for (const [i, c] of run.contenders.entries()) {
      await git.raw(['worktree', 'remove', '--force', c.worktree]).catch(() => {})
      await git.raw(['branch', '-D', `spark-arena-${run.sessionId}-${i + 1}`]).catch(() => {})
    }
    await rm(join(this.deps.sparkRoot, 'arena', run.sessionId), {
      recursive: true,
      force: true,
    }).catch(() => {})
  }

  /** shutdown 收口：全部运行中竞答取消（worktree 清理尽力而为） */
  async shutdownAll(): Promise<void> {
    for (const run of this.runs.values()) {
      if (run.status === 'running') await this.cancel(run.sessionId).catch(() => {})
    }
  }
}
