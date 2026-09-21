/**
 * 会话索引（doc/02 §5.10 / 工单 4.8）：node:sqlite 单表索引，服务列表/搜索加速。
 * **JSONL 恒为权威**：启动时从磁盘全量重建（与旧扫描同价），运行期经 durable 事件
 * 增量维护（touch/setTitle）与会话装载点 upsert；索引损坏/不可用 → 降级回磁盘扫描，
 * 不影响引擎主流程。同步 API（DatabaseSync）——本地单用户量级，语句均走主键/单列。
 */
import { DatabaseSync } from 'node:sqlite'
import type { SessionId } from '@spark/protocol'

/** 索引行（SessionMeta 的静态子集；status 等实时量由调用方另行注入） */
export interface SessionIndexRow {
  id: SessionId
  title: string
  model: string
  cwd: string
  createdAt: number
  updatedAt: number
  lastSeq: number
  /** 置顶（工单 19.41）：列表排序第一键——旧库无此列时由迁移补 0 */
  pinned: boolean
}

/** node:sqlite 行（列类型与建表 DDL 一一对应；prepare.all 实际返回 unknown，需收窄） */
interface IndexRow {
  id: string
  title: string
  model: string
  cwd: string
  created_at: number
  updated_at: number
  last_seq: number
  pinned: number
}

export class SessionIndex {
  private readonly db: DatabaseSync

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        cwd TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_seq INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0
      )
    `)
    this.migratePinnedColumn()
  }

  /**
   * 老库补列（工单 19.41）：`CREATE TABLE IF NOT EXISTS` 对已存在的表不加新列，
   * 缺列时 INSERT 会整语句失败 → boot 重建失败 → 索引永久降级。故先探测再 ALTER，
   * 幂等；boot 随后全量 rebuild 会把 pinned 对齐磁盘标记（JSONL/标记文件才是权威）。
   */
  private migratePinnedColumn(): void {
    const cols = this.db.prepare('PRAGMA table_info(sessions)').all() as unknown as {
      name: string
    }[]
    if (cols.some((c) => c.name === 'pinned')) return
    this.db.exec('ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
  }

  /** 启动重建：清表后按磁盘扫描结果全量写入（JSONL 权威的对齐点） */
  rebuild(rows: readonly SessionIndexRow[]): void {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO sessions (id, title, model, cwd, created_at, updated_at, last_seq, pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    this.db.exec('BEGIN')
    try {
      this.db.exec('DELETE FROM sessions')
      for (const r of rows) {
        insert.run(
          r.id,
          r.title,
          r.model,
          r.cwd,
          r.createdAt,
          r.updatedAt,
          r.lastSeq,
          r.pinned ? 1 : 0,
        )
      }
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** 会话装载点（create/resume/fork/rollback 重载共用 wireSession 单点）同步 */
  upsert(row: SessionIndexRow): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions (id, title, model, cwd, created_at, updated_at, last_seq, pinned)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.title,
        row.model,
        row.cwd,
        row.createdAt,
        row.updatedAt,
        row.lastSeq,
        row.pinned ? 1 : 0,
      )
  }

  /** durable 事件增量：水位前进（仅前进——rollback 截断由重载 upsert 覆盖整行） */
  touch(id: SessionId, seq: number, time: number): void {
    this.db
      .prepare('UPDATE sessions SET last_seq = ?, updated_at = ? WHERE id = ? AND last_seq < ?')
      .run(seq, time, id, seq)
  }

  /** 标题更新（session.title / 自动标题落地） */
  setTitle(id: SessionId, title: string): void {
    this.db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id)
  }

  /** 置顶更新（工单 19.41；PUT /api/sessions/:id/pin 的索引侧同步） */
  setPinned(id: SessionId, pinned: boolean): void {
    this.db.prepare('UPDATE sessions SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
  }

  /** 单会话标题（全文搜索命中标注用；无此行 → null） */
  titleOf(id: SessionId): string | null {
    const row = this.db.prepare('SELECT title FROM sessions WHERE id = ?').get(id) as
      | { title: string }
      | undefined
    return row === undefined ? null : row.title
  }

  /**
   * 列表（置顶优先 → updatedAt 倒序 → id 倒序稳定并列）；q 非空 → 标题子串过滤（LIKE，%/_ 转义）。
   * v1 内存分页切片在 server 层做（§7.2 GET /api/sessions 行）。
   */
  list(q?: string): SessionIndexRow[] {
    const base =
      'SELECT id, title, model, cwd, created_at, updated_at, last_seq, pinned FROM sessions'
    if (q === undefined || q === '') {
      return this.all(`${base} ORDER BY pinned DESC, updated_at DESC, id DESC`)
    }
    const escaped = q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
    return this.all(
      `${base} WHERE title LIKE ? ESCAPE '\\' ORDER BY pinned DESC, updated_at DESC, id DESC`,
      `%${escaped}%`,
    )
  }

  /** 删除索引行（工单 12.4 两段式删除：JSONL 已移入 trash 后调） */
  remove(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  close(): void {
    this.db.close()
  }

  private all(sql: string, ...params: (string | number)[]): SessionIndexRow[] {
    return (this.db.prepare(sql).all(...params) as unknown as IndexRow[]).map((r) => ({
      id: r.id as SessionId,
      title: r.title,
      model: r.model,
      cwd: r.cwd,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      lastSeq: Number(r.last_seq),
      pinned: Number(r.pinned) === 1,
    }))
  }
}
