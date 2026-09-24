/**
 * 竞答记录落盘（工单 19.10，翻案 ADR D42"竞答记录仅内存（重启丢失）"登记限制）：
 * 每场竞答一个 JSON 文件 `~/.spark/arena/<arenaId>.json`（arenaId 由 manager 生成，
 * 自带时间戳与随机尾——文件名安全；目录下另有 worktree 子目录，读取只认 *.json 文件）。
 * 写入时机由 manager 决定：发起（running）/ contender 完成（更新）/ 胜者应用·取消（终态）。
 * 读取按文件 mtime 降序取最近 N 场；单文件损坏或形状不对跳过（fail-soft，同索引纪律——
 * 历史旁路不阻塞主流程）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJson } from '../fsutil.js'
import type { ArenaRun } from './manager.js'
import { sparkDir } from '../storage/paths.js'

/** 单场竞答的落盘记录：快照全量 + 起止时间（startedAt 供历史排序展示；completedAt = 终态时间） */
export interface ArenaRunRecord {
  run: ArenaRun
  startedAt: number
  completedAt: number | null
}

/** 解析后最小形状校验（不引 zod——落盘形状由 manager 唯一写入者保证，此处只防半截/异质文件） */
function isRecord(value: unknown): value is ArenaRunRecord {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as { run?: { arenaId?: unknown; sessionId?: unknown; status?: unknown } }
  return (
    typeof rec.run === 'object' &&
    rec.run !== null &&
    typeof rec.run.arenaId === 'string' &&
    typeof rec.run.sessionId === 'string' &&
    (rec.run.status === 'running' || rec.run.status === 'done' || rec.run.status === 'cancelled')
  )
}

function safeMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0 // stat 不动（坏 symlink 等）当最旧处理，不阻塞其余条目
  }
}

export class ArenaStore {
  constructor(private readonly root: string) {}

  private get dir(): string {
    return sparkDir(this.root, 'arena')
  }

  private fileOf(arenaId: string): string {
    return join(this.dir, `${arenaId}.json`)
  }

  /** 原子写单场记录（目录懒创建——无竞答的安装不预建目录） */
  save(record: ArenaRunRecord): void {
    mkdirSync(this.dir, { recursive: true })
    atomicWriteJson(this.fileOf(record.run.arenaId), record)
  }

  /** 竞答中途失败撤记录（start 半途抛错——竞答从未成立，不留幻影 running 记录） */
  remove(arenaId: string): void {
    const file = this.fileOf(arenaId)
    if (!existsSync(file)) return
    try {
      unlinkSync(file)
    } catch {
      // 尽力而为——撤记录失败不改变 start 的失败路径
    }
  }

  /** 最近 N 场记录（文件 mtime 降序；损坏/形状不对的单文件跳过） */
  loadHistory(limit: number): ArenaRunRecord[] {
    const out: ArenaRunRecord[] = []
    if (!existsSync(this.dir)) return out
    const files = readdirSync(this.dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => join(this.dir, d.name))
      .map((path) => ({ path, mtimeMs: safeMtimeMs(path) }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (const { path } of files) {
      if (out.length >= limit) break
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
        if (isRecord(parsed)) out.push(parsed)
      } catch {
        // 损坏单文件跳过（fail-soft 同索引纪律）
      }
    }
    return out
  }
}
