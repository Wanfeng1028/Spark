/**
 * 自动归档策略（阶段十九 19.13）：空闲会话超期自动归档。
 * 判据（纯函数，单测直打）：**空闲**（idle）且最后 durable 事件时间早于
 * now - afterDays×86400000 → 应归档。running / waiting-approval 永不自动归档
 * （会话还在工作——"自动归档进行中的会话"会把它从用户眼前藏掉）。
 * 归档动作本身走 Engine.archiveSession（`<jsonl>.archived` 标记，与手动归档同一事实源）。
 */
import type { SessionId, SessionStatus } from '@spark/protocol'
import type { SessionMeta } from '../engine-types.js'

const DAY_MS = 86_400_000

/** 默认超期天数（spark.json archive.afterDays 缺省） */
export const DEFAULT_AFTER_DAYS = 30

/** 可自动归档的状态封闭集（idle 才归档；其余两态是"还在工作"） */
const ARCHIVABLE: ReadonlySet<SessionStatus> = new Set<SessionStatus>(['idle'])

/** 单条会话是否到期应归档（纯函数——不碰文件系统，测试不需要夹具） */
export function dueForAutoArchive(
  meta: { id: string; status: SessionStatus; updatedAt: number; pinned?: boolean | undefined },
  afterDays: number,
  now: number,
): boolean {
  if (!ARCHIVABLE.has(meta.status)) return false
  // 置顶 = 用户显式"别把它藏起来"，永不被自动归档（工单 19.41 / DESIGN §13 自动归档排除项）
  if (meta.pinned === true) return false
  if (!Number.isFinite(afterDays) || afterDays <= 0) return false
  return meta.updatedAt <= now - afterDays * DAY_MS
}

/**
 * 从清单筛出应归档集合（保持入序——批量归档按列表序执行，日志可预期）。
 * 状态由调用方注入：`SessionMeta` 是磁盘元数据、不含运行态（三态在
 * `SessionHandle.status()` / `Engine.statusOf` 上），故走访问器——与
 * `scan.scanForkChildren` 的 `statusOf` 入参同款口径。
 */
export function selectDueForAutoArchive(
  sessions: readonly SessionMeta[],
  statusOf: (id: SessionId) => SessionStatus,
  afterDays: number,
  now: number,
): SessionMeta[] {
  return sessions.filter((m) =>
    dueForAutoArchive(
      { id: String(m.id), status: statusOf(m.id), updatedAt: m.updatedAt, pinned: m.pinned },
      afterDays,
      now,
    ),
  )
}
