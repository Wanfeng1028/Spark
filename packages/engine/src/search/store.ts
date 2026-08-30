/**
 * 会话全文搜索索引（阶段七工单 7.13 / H12）：~/.spark/search.db（node:sqlite）。
 * - 索引范围 = 用户消息 / 助手消息 / 会话标题三类事件文本；行以（session_id, event_id）
 *   为主键（fork 复制事件沿用原 event id——单列 event_id 会跨会话碰撞），
 *   （session_id, seq）二级索引服务回滚截断（删 seq 界外行）。
 * - 检索走 FTS5 trigram 虚表（中文子串可命中，外容表 + 触发器同步——同 MemoryStore
 *   先例）；建表失败降级 LIKE 子串（功能等价、量级退化全表扫，引擎照常启动）。
 * - 水位表（session_id → 已索引最大 seq）：会话装载点幂等同步——水位持平跳过，
 *   水位倒退（回滚截断）先删界外行再补差量。
 * - JSONL 恒为权威（同 SessionIndex 纪律）：本索引只加速检索，坏/缺不阻塞主流程。
 */
import { DatabaseSync } from 'node:sqlite'
import type { EventId, SessionId } from '@spark/protocol'

export type SearchEntryType = 'user.message' | 'assistant.message' | 'session.title'

export interface SearchEntry {
  sessionId: SessionId
  eventId: EventId
  seq: number
  type: SearchEntryType
  time: number
  content: string
}

/** node:sqlite 行（列名与 DDL 一致；prepare.all 返回 unknown 需收窄） */
interface EntryRowRaw {
  session_id: string
  event_id: string
  seq: number
  type: string
  time: number
  content: string
}

/** 按空白拆词取最长词（≥2 字符；自然语句兜底召回——整串不命中时句中主词 LIKE） */
function longestToken(q: string): string | null {
  let best: string | null = null
  for (const t of q.split(/\s+/)) {
    if (t.length >= 2 && (best === null || t.length > best.length)) best = t
  }
  return best
}

/** FTS trigram 可用的最短查询长度（<3 字符走 LIKE——trigram 语义要求） */
const TRIGRAM_MIN = 3

export class SearchStore {
  private readonly db: DatabaseSync
  /** FTS5 可用 = true；建表失败降级 LIKE（warn 由调用方落日志） */
  readonly fts: boolean

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath)
    // WAL + synchronous=NORMAL：索引是派生缓存（JSONL 恒为权威，丢行由装载点
    // 水位重建补齐），逐条 upsert 免每次 fsync——慢盘上批量入库吞吐差异显著。
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_entries (
        session_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        time INTEGER NOT NULL,
        content TEXT NOT NULL,
        PRIMARY KEY (session_id, event_id)
      )
    `)
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_search_session_seq ON search_entries (session_id, seq)',
    )
    // 水位表：会话装载点幂等同步的判据（持平跳过 / 倒退先截断）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_watermark (
        session_id TEXT PRIMARY KEY,
        last_seq INTEGER NOT NULL
      )
    `)
    let fts = true
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
          content, tokenize='trigram', content='search_entries', content_rowid='rowid'
        )
      `)
      // 外容表同步触发器（REPLACE = delete + insert，两个触发器依次生效）
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS search_ai AFTER INSERT ON search_entries BEGIN
          INSERT INTO search_fts(rowid, content) VALUES (new.rowid, new.content);
        END
      `)
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS search_ad AFTER DELETE ON search_entries BEGIN
          INSERT INTO search_fts(search_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
        END
      `)
    } catch {
      // FTS5 不可用（编译开关/版本差异）：LIKE 子串降级——引擎照常启动
      fts = false
    }
    this.fts = fts
  }

  /** 追加/覆盖一条（复合主键幂等；触发器同步倒排） */
  upsert(entry: SearchEntry): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO search_entries (event_id, session_id, seq, type, time, content)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(entry.eventId, entry.sessionId, entry.seq, entry.type, entry.time, entry.content)
  }

  /** 回滚截断：删除会话 seq 界外行（触发器同步倒排） */
  removeAfter(sessionId: SessionId, seq: number): void {
    this.db
      .prepare('DELETE FROM search_entries WHERE session_id = ? AND seq > ?')
      .run(sessionId, seq)
  }

  /** 已索引水位（无记录 = 从未索引） */
  watermark(sessionId: SessionId): number | null {
    const row = this.db
      .prepare('SELECT last_seq FROM search_watermark WHERE session_id = ?')
      .get(sessionId) as { last_seq: number } | undefined
    return row === undefined ? null : Number(row.last_seq)
  }

  setWatermark(sessionId: SessionId, lastSeq: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO search_watermark (session_id, last_seq) VALUES (?, ?)')
      .run(sessionId, lastSeq)
  }

  /**
   * 检索（新→旧）。召回链同 MemoryStore 先例：
   * ① 整串 FTS trigram MATCH（查询 ≥3 字符）；② 整串 LIKE 子串（短查询或 ① 空命中）；
   * ③ 拆词最长词 LIKE（自然语句兜底）。中文整句语义召回是已知限制。
   */
  search(query: string, limit: number): SearchEntry[] {
    const q = query.trim()
    if (q === '' || limit <= 0) return []
    let rows = this.matchFts(q, limit)
    if (rows.length === 0) rows = this.matchLike(q, limit)
    if (rows.length === 0) {
      const token = longestToken(q)
      if (token !== null && token !== q) rows = this.matchLike(token, limit)
    }
    return rows.map((r) => ({
      sessionId: r.session_id as SessionId,
      eventId: r.event_id as EventId,
      seq: Number(r.seq),
      type: r.type as SearchEntryType,
      time: Number(r.time),
      content: r.content,
    }))
  }

  close(): void {
    this.db.close()
  }

  private matchFts(q: string, limit: number): EntryRowRaw[] {
    if (!this.fts || q.length < TRIGRAM_MIN) return []
    try {
      const stmt = this.db.prepare(
        `SELECT e.event_id, e.session_id, e.seq, e.type, e.time, e.content
         FROM search_fts f JOIN search_entries e ON e.rowid = f.rowid
         WHERE search_fts MATCH ? ORDER BY e.time DESC LIMIT ?`,
      )
      return stmt.all(q, limit) as unknown as EntryRowRaw[]
    } catch {
      // MATCH 语法字符（引号等）抛错 → LIKE 兜底（词法层等价降级）
      return []
    }
  }

  private matchLike(q: string, limit: number): EntryRowRaw[] {
    const escaped = q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
    const stmt = this.db.prepare(
      `SELECT event_id, session_id, seq, type, time, content FROM search_entries
       WHERE content LIKE ? ESCAPE '\\' ORDER BY time DESC LIMIT ?`,
    )
    return stmt.all(`%${escaped}%`, limit) as unknown as EntryRowRaw[]
  }
}
