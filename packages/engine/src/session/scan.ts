/**
 * 会话磁盘扫描与定位（工单 R-D 第③刀：自 engine.ts 拆出的纯逻辑层——
 * 只依赖文件系统与 SessionStore 读路径，不持有引擎状态）。
 * 状态相关判定（运行中子会话的实时 status）经回调注入。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EventId, SessionId, SessionStatus, SparkEventEnvelope } from '@spark/protocol'
import { SessionStore } from './store.js'
import { errText } from '../errs.js'
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

/** 全量会话文件定位（工单 19.11 索引重建用）：id 与路径成对返回，读事件交给调用方 */
export async function scanSessionFilePaths(
  sessionsRoot: string,
): Promise<{ id: SessionId; path: string }[]> {
  const out: { id: SessionId; path: string }[] = []
  try {
    const dirs = await readdir(sessionsRoot, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      for (const file of await readdir(join(sessionsRoot, dir.name))) {
        if (!file.endsWith('.jsonl')) continue
        const id = idOfFileName(file)
        if (id === null) continue
        out.push({ id, path: join(sessionsRoot, dir.name, file) })
      }
    }
  } catch {
    // sessions 目录缺失 = 无会话（首次运行）
  }
  return out
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
        // LA-38：坏文件不静默截断列表——per-file 容错（否则单文件损坏被外层 catch
        // 放大成"全部会话消失"）。装载路径 fail-closed 语义不变：resume 仍拒载，
        // 这里只是让列表对好文件保持可见。
        let file_: Awaited<ReturnType<typeof SessionStore.read>>
        try {
          file_ = await SessionStore.read(path)
        } catch (err) {
          process.stderr.write(`E_SESSION_SCAN_SKIP: ${path} 读取失败，已跳过：${errText(err)}\n`)
          continue
        }
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

/**
 * 归档标记扫描（工单 12.4）：`<file>.archived` 标记 = 归档状态的单一事实源
 * （不入事件流——管理面 REST；内容为归档时刻 ISO 串）。
 */
export async function scanArchivedMarkers(
  sessionsRoot: string,
): Promise<{ ids: SessionId[]; at: Map<SessionId, string> }> {
  const ids: SessionId[] = []
  const at = new Map<SessionId, string>()
  try {
    const dirs = await readdir(sessionsRoot, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      for (const file of await readdir(join(sessionsRoot, dir.name))) {
        if (!file.endsWith('.jsonl.archived')) continue
        const id = idOfFileName(file.slice(0, -'.archived'.length))
        if (id === null) continue
        try {
          at.set(id, (await readFile(join(sessionsRoot, dir.name, file), 'utf8')).trim())
        } catch {
          at.set(id, new Date().toISOString())
        }
        ids.push(id)
      }
    }
  } catch {
    // sessions 目录缺失 = 无归档
  }
  return { ids, at }
}

/**
 * 置顶标记扫描（工单 19.41 / V2-23 置顶半边）：`<file>.pinned` 标记 = 置顶的事实源。
 * 与归档同口径——管理面 REST、不入事件流（置顶对模型不可见，不触 surface 纪律），
 * 且旧会话文件无需迁移即可回落未置顶。
 */
export async function scanPinnedMarkers(sessionsRoot: string): Promise<SessionId[]> {
  const ids: SessionId[] = []
  try {
    const dirs = await readdir(sessionsRoot, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      for (const file of await readdir(join(sessionsRoot, dir.name))) {
        if (!file.endsWith('.jsonl.pinned')) continue
        const id = idOfFileName(file.slice(0, -'.pinned'.length))
        if (id !== null) ids.push(id)
      }
    }
  } catch {
    // sessions 目录缺失 = 无置顶
  }
  return ids
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
        // LA-38：同 scanDiskSessions——坏子会话文件跳过并告警，不截断其余子会话
        let file_: Awaited<ReturnType<typeof SessionStore.read>>
        try {
          file_ = await SessionStore.read(join(sessionsRoot, dir.name, file))
        } catch (err) {
          process.stderr.write(
            `E_SESSION_SCAN_SKIP: ${join(sessionsRoot, dir.name, file)} 读取失败，已跳过：${errText(err)}\n`,
          )
          continue
        }
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
