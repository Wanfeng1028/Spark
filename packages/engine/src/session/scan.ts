/**
 * 会话磁盘扫描与定位（工单 R-D 第③刀：自 engine.ts 拆出的纯逻辑层——
 * 只依赖文件系统与 SessionStore 读路径，不持有引擎状态）。
 * 状态相关判定（运行中子会话的实时 status）经回调注入。
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { EventId, SessionId, SessionStatus, SparkEventEnvelope } from '@spark/protocol'
import { SessionStore } from './store.js'
import type { ForkChildInfo, SessionMeta } from '../engine-types.js'

/** `<ts>_<id>.jsonl` → id；非会话文件（无时间戳前缀 / 双分隔）→ null */
export function idOfFileName(file: string): SessionId | null {
  if (!file.endsWith('.jsonl')) return null
  const stem = file.slice(0, -'.jsonl'.length)
  const sep = stem.indexOf('_')
  // ISO 时间戳含 '-' 不含 '_'；首个 '_' 即分隔（ses_id 本身无 '_'）
  if (sep <= 0 || sep === stem.length - 1) return null
  return stem.slice(sep + 1) as SessionId
}

/** 路径上 session.created/session.title 的最新标题（无 → 空字符串） */
export function titleOf(events: readonly SparkEventEnvelope[]): string {
  let title = ''
  for (const e of events) {
    if (e.type === 'session.created' || e.type === 'session.title') {
      title = (e.data as { title?: string }).title ?? ''
    }
  }
  return title
}

/** 遍历 sessions 目录下的 `<ts>_<id>.jsonl` 定位会话文件；未找到 → null */
export async function findSessionFile(sessionsRoot: string, id: SessionId): Promise<string | null> {
  let dirs: string[]
  try {
    dirs = await readdir(sessionsRoot)
  } catch {
    return null
  }
  const suffix = `_${id}.jsonl`
  for (const dir of dirs) {
    const files = await readdir(join(sessionsRoot, dir))
    const hit = files.find((f) => f.endsWith(suffix))
    if (hit !== undefined) return join(sessionsRoot, dir, hit)
  }
  return null
}

/**
 * 磁盘全量扫描（§5.2.1 v1 路径）：boot 索引重建与索引不可用降级共用。
 * 单用户本地量级全量读即可；文件名即 id（列表排序免读 header，pi 做法）。
 */
export async function scanDiskSessions(sessionsRoot: string): Promise<SessionMeta[]> {
  const out: SessionMeta[] = []
  try {
    const dirs = await readdir(sessionsRoot, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      for (const file of await readdir(join(sessionsRoot, dir.name))) {
        if (!file.endsWith('.jsonl')) continue
        const path = join(sessionsRoot, dir.name, file)
        const id = idOfFileName(file)
        if (id === null) continue
        const file_ = await SessionStore.read(path)
        const events = file_.events
        const last = events[events.length - 1]
        out.push({
          id,
          title: titleOf(events),
          model: file_.header.model,
          cwd: file_.header.cwd,
          createdAt: file_.header.createdAt,
          updatedAt: last?.time ?? file_.header.createdAt,
          lastSeq: last?.seq ?? 0,
        })
      }
    }
  } catch {
    // sessions 目录缺失 = 空列表（首次运行）
  }
  return out
}

/** 磁盘扫描 header.parentSession === id 的会话 → 边界事件 + 子会话信息（标题须读事件） */
export async function scanForkChildren(
  sessionsRoot: string,
  id: SessionId,
  statusOf: (id: SessionId) => SessionStatus,
): Promise<{ fromEventId: EventId; child: ForkChildInfo }[]> {
  const out: { fromEventId: EventId; child: ForkChildInfo }[] = []
  try {
    const dirs = await readdir(sessionsRoot, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      for (const file of await readdir(join(sessionsRoot, dir.name))) {
        if (!file.endsWith('.jsonl')) continue
        const childId = idOfFileName(file)
        if (childId === null) continue
        const file_ = await SessionStore.read(join(sessionsRoot, dir.name, file))
        const h = file_.header
        if (h.parentSession !== id || h.parentEventId === undefined) continue
        out.push({
          fromEventId: h.parentEventId,
          child: {
            sessionId: childId,
            title: titleOf(file_.events),
            createdAt: h.createdAt,
            status: statusOf(childId),
          },
        })
      }
    }
  } catch {
    // sessions 目录缺失 = 无分叉（首次运行）
  }
  return out
}
