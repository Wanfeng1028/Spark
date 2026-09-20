/**
 * 向量存储（阶段十九 19.8 / ADR D51，翻案 D25"向量后置"）：~/.spark/vectors.db——
 * 派生缓存（JSONL/记忆库恒为权威，丢向量只丢语义检索不丢数据），node:sqlite 零新依赖。
 * 一条目一行：kind（'memory' | 'event'）+ ref（记忆 id / sessionId:eventId）+ content +
 * embedding BLOB（Float32Array 小端原样）+ meta JSON（回填 DTO 用的字段）。
 * 相似度 = 暴力余弦（本地量级：单用户记忆与会话事件在千级，全表扫描毫秒级——
 * 不引 sqlite-vec：本机禁下载依赖，且 ANN 索引在千级规模是负优化）。
 */
import { statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/** 向量条目类别（memory = 长期记忆；event = 会话 durable 事件） */
export type VectorKind = 'memory' | 'event'

/** 检索命中（content/meta 随行存——回填 DTO 不必回源查询） */
export interface VectorHit {
  kind: VectorKind
  ref: string
  score: number
  content: string
  meta: Record<string, unknown>
}

/** 余弦相似度（纯函数，单测直打）：零向量 → 0（无方向即无相似，不除零） */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] as number
    const y = b[i] as number
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Float32Array → BLOB（Buffer 视图原样拷贝；小端与平台无关——Float32Array 布局固定） */
export function vecToBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}

/** BLOB → Float32Array（共享底层缓冲的只读视图——调用方不得改写） */
export function blobToVec(b: Buffer): Float32Array {
  const copy = new ArrayBuffer(b.byteLength)
  Buffer.from(copy).set(b)
  return new Float32Array(copy)
}

interface VecRowRaw {
  kind: string
  ref: string
  content: string
  embedding: Buffer
  meta: string
}

/**
 * 向量库。打开失败 → 构造抛错（调用方降级：语义不可用，关键词照常——禁假状态）。
 * WAL + synchronous=NORMAL：派生缓存，upsert 免每次 fsync（同 search.db 口径）。
 */
export class VectorStore {
  private readonly db: DatabaseSync
  private readonly dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        meta TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (kind, ref)
      )
    `)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vectors_kind ON vectors (kind)')
  }

  get path(): string {
    return this.dbPath
  }

  /** 条目数（kind 省略 = 两类合计） */
  count(kind?: VectorKind): number {
    const row =
      kind === undefined
        ? (this.db.prepare('SELECT COUNT(*) AS n FROM vectors').get() as { n: number })
        : (this.db.prepare('SELECT COUNT(*) AS n FROM vectors WHERE kind = ?').get(kind) as { n: number })
    return Number(row.n)
  }

  /** 库文件体积（主库 + WAL/SHM；索引库页统计同口径） */
  sizeBytes(): number {
    let total = 0
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        total += statSize(this.dbPath + suffix)
      } catch {
        // 文件不存在（无 WAL）：跳过
      }
    }
    return total
  }

  /** 写入/更新一条向量（同 kind+ref 覆盖——幂等，重复补嵌零副作用） */
  upsert(
    kind: VectorKind,
    ref: string,
    content: string,
    vec: Float32Array,
    meta: Record<string, unknown>,
    now: number,
  ): void {
    this.db
      .prepare(
        `INSERT INTO vectors (kind, ref, content, embedding, meta, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (kind, ref) DO UPDATE SET
           content = excluded.content, embedding = excluded.embedding,
           meta = excluded.meta, updated_at = excluded.updated_at`,
      )
      .run(kind, ref, content, vecToBlob(vec), JSON.stringify(meta), now)
  }

  /** 删除一条（记忆删除/会话删除时调用；不存在 = 幂等空操作） */
  remove(kind: VectorKind, ref: string): void {
    this.db.prepare('DELETE FROM vectors WHERE kind = ? AND ref = ?').run(kind, ref)
  }

  /** 某类已嵌 ref 集合（补嵌筛"缺向量"用；一次读出，避免逐条查询） */
  refs(kind: VectorKind): Set<string> {
    const rows = this.db.prepare('SELECT ref FROM vectors WHERE kind = ?').all(kind) as unknown as {
      ref: string
    }[]
    return new Set(rows.map((r) => r.ref))
  }

  /** 全表清空（kind 省略 = 两类；rebuild 用） */
  clear(kind?: VectorKind): void {
    if (kind === undefined) this.db.exec('DELETE FROM vectors')
    else this.db.prepare('DELETE FROM vectors WHERE kind = ?').run(kind)
  }

  /** top-k 暴力余弦（全表扫；k<=0 → 空）。**维度不符的行跳过**——换 embedding 模型后
   *  的旧向量若参与比较只会得到无意义的分数（cosine 取较短长度），跳过比误判诚实；
   *  旧行留待重建（rebuildVectors 清表重嵌）。 */
  topK(kind: VectorKind, query: Float32Array, k: number): VectorHit[] {
    if (k <= 0) return []
    const qLen = query.byteLength
    const rows = this.db
      .prepare('SELECT kind, ref, content, embedding, meta FROM vectors WHERE kind = ?')
      .all(kind) as unknown as VecRowRaw[]
    const scored: VectorHit[] = []
    for (const r of rows) {
      if (r.embedding.byteLength !== qLen) continue
      const vec = blobToVec(r.embedding)
      const score = cosine(query, vec)
      scored.push({ kind: r.kind as VectorKind, ref: r.ref, score, content: r.content, meta: parseMeta(r.meta) })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, k)
  }

  close(): void {
    this.db.close()
  }
}

function parseMeta(raw: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(raw)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function statSize(path: string): number {
  // 懒 require 形状：node:fs statSync 抛错即文件不存在（调用方 catch）
  return statSync(path).size
}
