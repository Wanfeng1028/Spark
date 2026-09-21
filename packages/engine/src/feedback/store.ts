/**
 * 反馈存储（阶段十九 19.19 / 消解 V2-25）：~/.spark/feedback.db——
 * 会话/回合级 👍👎 + 可选备注。node:sqlite 零新依赖（同 memory/search 口径）。
 *
 * 纪律：
 * - **不造事件**：反馈是用户侧评价，不是会话状态机的一部分——不进事件流、不进回放
 *   （回放重建的是模型可见历史，评价混进去会污染 surface 纪律）。
 * - 同一 (sessionId, eventId, vote) 重复提交幂等（改备注走更新，不堆重复行）——
 *   用户改主意的常见路径，堆行会让统计虚高。
 * - 库打不开 = 反馈不可用（调用方拒执 E_FEEDBACK_UNAVAILABLE，禁假状态）。
 */
import { DatabaseSync } from 'node:sqlite'
import type { FeedbackEntryDto, FeedbackInput, FeedbackVote } from '@spark/protocol'

interface FeedbackRowRaw {
  id: number
  session_id: string
  event_id: string
  vote: string
  note: string
  created_at: number
}

export class FeedbackStore {
  private readonly db: DatabaseSync

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        vote TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback (session_id, id)')
  }

  /** 提交/更新反馈（同 session+event+vote 幂等——改备注不堆行）；返回落库条目 */
  submit(input: FeedbackInput, now: number): FeedbackEntryDto {
    const existing = this.db
      .prepare('SELECT id FROM feedback WHERE session_id = ? AND event_id = ? AND vote = ?')
      .get(input.sessionId, input.eventId, input.vote) as { id: number } | undefined
    if (existing !== undefined) {
      this.db
        .prepare('UPDATE feedback SET note = ? WHERE id = ?')
        .run(input.note ?? '', existing.id)
      const row = this.byId(existing.id)
      if (row !== null) return row
    }
    const info = this.db
      .prepare(
        'INSERT INTO feedback (session_id, event_id, vote, note, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.sessionId, input.eventId, input.vote, input.note ?? '', now)
    const row = this.byId(Number(info.lastInsertRowid))
    if (row === null) throw new Error('E_FEEDBACK_WRITE: 反馈写入后读回失败')
    return row
  }

  /** 列表（新→旧；sessionId/vote 可选过滤） */
  list(
    query: { sessionId?: string | undefined; vote?: FeedbackVote | undefined },
    limit: number,
  ): FeedbackEntryDto[] {
    const where: string[] = []
    const args: (string | number)[] = []
    if (query.sessionId !== undefined) {
      where.push('session_id = ?')
      args.push(query.sessionId)
    }
    if (query.vote !== undefined) {
      where.push('vote = ?')
      args.push(query.vote)
    }
    const sql =
      `SELECT id, session_id, event_id, vote, note, created_at FROM feedback` +
      (where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '') +
      ' ORDER BY id DESC LIMIT ?'
    args.push(limit)
    const rows = this.db.prepare(sql).all(...args) as unknown as FeedbackRowRaw[]
    return rows.map(toDto)
  }

  /** 取消反馈（同 session+event+vote 删行——用户撤回；不存在 = 幂等空操作） */
  withdraw(sessionId: string, eventId: string, vote: FeedbackVote): boolean {
    const info = this.db
      .prepare('DELETE FROM feedback WHERE session_id = ? AND event_id = ? AND vote = ?')
      .run(sessionId, eventId, vote)
    return info.changes > 0
  }

  /** 某条消息的当前反馈态（web 操作行回显：已点赞/已点踩） */
  stateOf(sessionId: string, eventId: string): FeedbackVote | null {
    const row = this.db
      .prepare('SELECT vote FROM feedback WHERE session_id = ? AND event_id = ? LIMIT 1')
      .get(sessionId, eventId) as { vote: string } | undefined
    if (row === undefined) return null
    return row.vote === 'up' || row.vote === 'down' ? row.vote : null
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number }
    return Number(row.n)
  }

  close(): void {
    this.db.close()
  }

  private byId(id: number): FeedbackEntryDto | null {
    const row = this.db
      .prepare('SELECT id, session_id, event_id, vote, note, created_at FROM feedback WHERE id = ?')
      .get(id) as FeedbackRowRaw | undefined
    return row === undefined ? null : toDto(row)
  }
}

function toDto(r: FeedbackRowRaw): FeedbackEntryDto {
  return {
    id: r.id,
    sessionId: r.session_id as FeedbackEntryDto['sessionId'],
    eventId: r.event_id as FeedbackEntryDto['eventId'],
    vote: r.vote === 'up' ? 'up' : 'down',
    note: r.note,
    createdAt: r.created_at,
  }
}
