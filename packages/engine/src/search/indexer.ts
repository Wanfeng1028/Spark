/**
 * 全文搜索索引器（工单 R-D 第②刀：自 engine.ts 拆出）——SearchStore 的生命周期、
 * 事件文本抽取、水位幂等同步与检索命中组装的单点。降级纪律同 SessionIndexMaintainer：
 * 打开失败 / 写失败只 warn（旁路），关闭后增量写全部短路；JSONL 恒为权威。
 * 命中行会话标题经 titleOf 回调注入（引擎侧：已装载 meta → 会话索引 → 空串）。
 */
import { statSync } from 'node:fs'
import type { SessionId, SparkEventEnvelope, SparkEventMap } from '@spark/protocol'
import { SearchStore, type SearchEntry, type SearchEntryType } from './store.js'
import { scanSessionFilePaths } from '../session/scan.js'
import { SessionStore } from '../session/store.js'
import type { SparkLogger } from '../logger.js'
import type { SearchHit, SearchIndexStats } from '../engine-types.js'
import { longestToken } from '../db/fts-recall.js'
import { sparkDir, sparkFile } from '../storage/paths.js'

/**
 * 命中摘要（工单 7.13）：整串命中取命中处窗口（前 30 / 后 90 字符，越界加省略号）；
 * 整串不中退最长词（≥2 字符）同法开窗；全不中取前 120 字符。只做展示截断，不改索引。
 */
function searchSnippet(content: string, q: string): string {
  const query = q.trim()
  let idx = query === '' ? -1 : content.indexOf(query)
  let needleLen = query.length
  if (idx === -1) {
    const best = longestToken(query)
    if (best !== null) {
      idx = content.indexOf(best)
      needleLen = best.length
    }
  }
  if (idx === -1) return content.length <= 120 ? content : `${content.slice(0, 120)}…`
  const start = Math.max(0, idx - 30)
  const end = Math.min(content.length, idx + needleLen + 90)
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`
}

/** 库文件磁盘占用（工单 19.11）：主库 + WAL/SHM 旁文件求和——WAL 未合入时只 stat 主库
 * 会低估真实占用；旁文件不存在（已 checkpoint）按 0 计。 */
function dbFileBytesOf(dbPath: string): number {
  let total = 0
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      total += statSync(`${dbPath}${suffix}`).size
    } catch {
      // 旁文件不存在 = 该文件无占用（不是吞异常：存在性即语义）
    }
  }
  return total
}

export class SearchIndexer {
  private store: SearchStore | null
  private closed = false
  /** 库文件绝对路径（stats/vacuum 的 stat 对象；工单 19.11） */
  private readonly dbPath: string
  /** 会话 JSONL 根目录（rebuild 全量重扫入口；工单 19.11） */
  private readonly sessionsRoot: string

  constructor(
    root: string,
    private readonly logger: SparkLogger,
    private readonly titleOf: (id: SessionId) => string,
  ) {
    this.dbPath = sparkFile(root, 'searchDb')
    this.sessionsRoot = sparkDir(root, 'sessions')
    try {
      this.store = new SearchStore(this.dbPath)
      if (!this.store.fts) {
        this.logger.warn('search.fts.unavailable', { path: this.dbPath })
      }
    } catch (err) {
      this.logger.warn('search.store.error', { err })
      this.store = null
    }
  }

  /** 索引库统计（工单 19.11 / GET /api/index/stats）：条目 = SQLite COUNT，体积 = 库文件占用。
   * 打开失败降级时如实 available:false + entries 0（禁假数据；JSONL 权威不受影响）。 */
  stats(): SearchIndexStats {
    if (this.store === null || this.closed) {
      return { entries: 0, sizeBytes: 0, path: this.dbPath, available: false }
    }
    return { entries: this.store.count(), sizeBytes: dbFileBytesOf(this.dbPath), path: this.dbPath }
  }

  /**
   * 全量重建（工单 19.11 / POST /api/index/rebuild）：清表后重扫 sessions JSONL——
   * 装载点水位增量同步（sync）的兜底动作；单用户本地量级全量读（同 boot 扫描纪律）。
   * 坏文件逐个跳过只 warn（旁路纪律：JSONL 恒为权威，重建失败不阻塞主流程）。
   */
  async rebuild(): Promise<{ entries: number }> {
    if (this.store === null || this.closed) return { entries: 0 }
    this.store.clearAll()
    const files = await scanSessionFilePaths(this.sessionsRoot)
    for (const { id, path } of files) {
      try {
        const file = await SessionStore.read(path)
        this.sync(id, file.events)
      } catch (err) {
        this.logger.warn('search.rebuild.file.error', { sid: id, err })
      }
    }
    return { entries: this.store.count() }
  }

  /** 空间回收（工单 19.11 / POST /api/index/vacuum）：度量在 store 内做（WAL 先截断
   * checkpoint 再 stat——避免未合入 WAL 导致的"回收后变大"统计失真） */
  vacuum(): { sizeBytesBefore: number; sizeBytesAfter: number } {
    if (this.store === null || this.closed) return { sizeBytesBefore: 0, sizeBytesAfter: 0 }
    return this.store.vacuum()
  }

  /** GET /api/search 的引擎数据源（新→旧）；索引不可用 → 空数组（不阻塞主流程） */
  search(q: string, limit: number): SearchHit[] {
    if (this.store === null || this.closed) return []
    return this.store.search(q, limit).map((r) => ({
      sessionId: r.sessionId,
      sessionTitle: this.titleOf(r.sessionId),
      eventId: r.eventId,
      seq: r.seq,
      type: r.type,
      time: r.time,
      snippet: searchSnippet(r.content, q),
    }))
  }

  /** 全量已索引条目（阶段十九 19.8 / ADR D51：向量补嵌源；索引不可用 → 空数组） */
  allEntries(): SearchEntry[] {
    if (this.store === null || this.closed) return []
    return this.store.all()
  }

  /** durable 事件增量入索引（bus 钩子；旁路——失败只 warn，不碰事件流） */
  indexEvent(e: SparkEventEnvelope): void {
    if (this.store === null || this.closed || e.seq === undefined) return
    let content: string | null = null
    let type: SearchEntryType | null = null
    if (e.type === 'user.message') {
      content = (e.data as SparkEventMap['user.message']).text
      type = 'user.message'
    } else if (e.type === 'assistant.message') {
      // 只索引 text 块（reasoning/工具调用输出不入全文索引——噪声远大于召回价值）
      const blocks = (e.data as SparkEventMap['assistant.message']).content
      const text = blocks
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      if (text !== '') {
        content = text
        type = 'assistant.message'
      }
    } else if (e.type === 'session.title') {
      const title = (e.data as SparkEventMap['session.title']).title
      if (title !== '') {
        content = title
        type = 'session.title'
      }
    }
    if (content === null || type === null) return
    const entry: SearchEntry = {
      sessionId: e.sessionId,
      eventId: e.id,
      seq: e.seq,
      type,
      time: e.time,
      content,
    }
    try {
      this.store.upsert(entry)
    } catch (err) {
      this.logger.warn('search.index.error', { sid: e.sessionId, eid: e.id, err })
    }
  }

  /**
   * 装载点同步（create/resume/fork/rollback 重载共用单点）：水位幂等——
   * 持平跳过；水位 > 当前尾（回滚截断）先删界外行再补差量；水位 < 当前尾只补增量。
   */
  sync(sessionId: SessionId, events: readonly SparkEventEnvelope[]): void {
    if (this.store === null || this.closed) return
    try {
      const lastSeq = events.length === 0 ? 0 : (events[events.length - 1]?.seq ?? 0)
      const wm = this.store.watermark(sessionId)
      if (wm !== null && wm === lastSeq) return
      if (wm !== null && wm > lastSeq) this.store.removeAfter(sessionId, lastSeq)
      const from = wm !== null && wm <= lastSeq ? wm : 0
      for (const e of events) {
        if (e.seq !== undefined && e.seq > from) this.indexEvent(e)
      }
      this.store.setWatermark(sessionId, lastSeq)
    } catch (err) {
      this.logger.warn('search.sync.error', { sid: sessionId, err })
    }
  }

  /** shutdown 收尾：closed 先行置位——迟到的 bus 增量写全部短路 */
  close(): void {
    this.closed = true
    if (this.store === null) return
    try {
      this.store.close()
    } catch (err) {
      this.logger.warn('search.close.error', { err })
    }
  }
}
