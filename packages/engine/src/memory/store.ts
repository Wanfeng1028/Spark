/**
 * 长期记忆存储（阶段七工单 7.5 / H05 / ADR D25）：~/.spark/memory.db（node:sqlite）。
 * - 表 memories（id 自增、content、created_at、来源 session_id）；检索走 FTS5
 *   trigram 虚表（中文子串可命中——unicode61 对连续 CJK 整段成词不可子串匹配）。
 * - 降级纪律（同 SessionIndex 先例）：FTS5 建表失败 → LIKE 子串检索（功能等价，
 *   量级退化为全表扫——本地单用户记忆量级可接受），引擎照常启动。
 * - save/search 同步 API（DatabaseSync 主线程——本地量级，语句均走主键/FTS）。
 * 注入语义不在本模块：检索命中 → run-loop emit memory.injected（surface 纪律），
 * Projector 投影为模型上下文首条前缀消息（见 projector.ts）。
 */
import { DatabaseSync } from 'node:sqlite'
import type { MemoryDto, SessionId } from '@spark/protocol'
import { escapeLike, longestToken, TRIGRAM_MIN } from '../db/fts-recall.js'

/** node:sqlite 行（列名与 DDL 一致；prepare.all 返回 unknown 需收窄） */
interface MemoryRowRaw {
  id: number
  content: string
  created_at: number
  session_id: string
}

function toDto(r: MemoryRowRaw): MemoryDto {
  return { id: r.id, content: r.content, createdAt: r.created_at }
}

export class MemoryStore {
  private readonly db: DatabaseSync
  /** FTS5 可用 = true；建表失败降级 LIKE（warn 由调用方落日志） */
  readonly fts: boolean

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        session_id TEXT NOT NULL
      )
    `)
    let fts = true
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          content, tokenize='trigram', content='memories', content_rowid='id'
        )
      `)
      // 外容表同步触发器（save/删除时维护倒排——外容模式不自动同步）
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
        END
      `)
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
        END
      `)
    } catch {
      // FTS5 不可用（编译开关/版本差异）：LIKE 子串降级——引擎照常启动
      fts = false
    }
    this.fts = fts
  }

  save(sessionId: SessionId, content: string, now: number): MemoryDto {
    const insert = this.db.prepare(
      'INSERT INTO memories (content, created_at, session_id) VALUES (?, ?, ?)',
    )
    const info = insert.run(content, now, sessionId)
    return { id: Number(info.lastInsertRowid), content, createdAt: now }
  }

  /**
   * top-k 检索（新→旧）。召回链（工单 7.5：向量检索后置前的词法召回）：
   * ① 整串 FTS trigram MATCH（查询 ≥3 字符）——关键词/连续子串查询；
   * ② 整串 LIKE 子串——短查询（<3 字符）或 ① 空命中；
   * ③ 按空白拆词取最长词 LIKE——自然语句查询（如注入端口拿整条 user.message
   *    作 query：整串不命中时句中最长词兜底召回）。
   * 中文整句的语义召回是已知限制（向量检索后置解决，ADR D25）。
   */
  search(query: string, k: number): MemoryDto[] {
    const q = query.trim()
    if (q === '' || k <= 0) return []
    let rows = this.matchFts(q, k)
    if (rows.length === 0) rows = this.matchLike(q, k)
    if (rows.length === 0) {
      const token = longestToken(q)
      if (token !== null && token !== q) rows = this.matchLike(token, k)
    }
    return rows.map(toDto)
  }

  private matchFts(q: string, k: number): MemoryRowRaw[] {
    if (!this.fts || q.length < TRIGRAM_MIN) return []
    try {
      const stmt = this.db.prepare(
        `SELECT m.id, m.content, m.created_at, m.session_id
         FROM memories_fts f JOIN memories m ON m.id = f.rowid
         WHERE memories_fts MATCH ? ORDER BY m.created_at DESC LIMIT ?`,
      )
      return stmt.all(q, k) as unknown as MemoryRowRaw[]
    } catch {
      // MATCH 语法字符（引号等）抛错 → LIKE 兜底（词法层等价降级）
      return []
    }
  }

  private matchLike(q: string, k: number): MemoryRowRaw[] {
    const escaped = escapeLike(q)
    const stmt = this.db.prepare(
      `SELECT id, content, created_at, session_id FROM memories
       WHERE content LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?`,
    )
    return stmt.all(`%${escaped}%`, k) as unknown as MemoryRowRaw[]
  }

  list(): MemoryDto[] {
    const stmt = this.db.prepare(
      'SELECT id, content, created_at, session_id FROM memories ORDER BY created_at DESC',
    )
    return (stmt.all() as unknown as MemoryRowRaw[]).map(toDto)
  }

  remove(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?')
    return stmt.run(id).changes > 0
  }

  close(): void {
    this.db.close()
  }
}
