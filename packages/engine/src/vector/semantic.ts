/**
 * 语义检索编排（阶段十九 19.8 / ADR D51，翻案 D25"向量后置" + 消解 V2-18 RAG）：
 * 补嵌（backfill）+ 检索（memory 召回 / 会话事件搜索）两步，全部经注入的
 * EmbeddingClient 与 VectorStore（**引擎不直连 HTTP/SQLite——可单测，假 client 即可跑**）。
 *
 * 降级纪律（fail-soft，禁假状态）：
 * - 无提供方 / 向量库不可用 / 总开关关 → 调用方走关键词 FTS（本类不构造）；
 * - 嵌入失败（网络/形状/超时）→ 该批跳过并记 reason，**不阻塞检索主链**——
 *   已嵌条目照常语义命中，缺向量条目仍可由 FTS 兜底；
 * - 维度不一致（换模型后旧向量长度不同）→ 该批拒嵌并如实报，旧向量留待重建。
 */
import type { MemoryDto } from '@spark/protocol'
import type { SearchHit } from '../engine-types.js'
import type { EmbeddingClient } from '../embedding/client.js'
import { type VectorHit, type VectorKind, VectorStore } from './store.js'

/** 补嵌源（引擎装配时接 MemoryStore.all 与 SearchStore.all） */
export interface SemanticSources {
  memories(): { id: number; content: string; createdAt: number; sessionId: string }[]
  events(): { sessionId: string; eventId: string; seq: number; type: string; time: number; content: string }[]
}

export interface SemanticIndexerOptions {
  client: EmbeddingClient
  store: VectorStore
  sources: SemanticSources
  /** 会话标题解析（事件命中回填 SearchHitDto.sessionTitle；同 SearchIndexer 手法） */
  titleOf: (sessionId: string) => string
  /** 测试注入：时间源 */
  now?: () => number
}

/** 单次补嵌上限（防首次全量补嵌把请求拖死；剩余如实回 remaining，可再次点） */
export const BACKFILL_LIMIT = 200

export interface BackfillResult {
  embedded: number
  remaining: number
}

/** 语义检索不可用的具体原因（设置面/日志如实呈现） */
export type SemanticUnavailableReason = 'no-provider' | 'store-unavailable' | 'disabled' | 'dimension-mismatch'

export class SemanticIndexer {
  private readonly client: EmbeddingClient
  private readonly store: VectorStore
  private readonly sources: SemanticSources
  private readonly titleOf: (sessionId: string) => string
  private readonly now: () => number

  constructor(opts: SemanticIndexerOptions) {
    this.client = opts.client
    this.store = opts.store
    this.sources = opts.sources
    this.titleOf = opts.titleOf
    this.now = opts.now ?? Date.now
  }

  get dimensions(): number | undefined {
    return this.client.dimensions
  }

  /** 已嵌条目数（两类合计） */
  embeddedCount(): number {
    return this.store.count()
  }

  /** 仍缺向量的条目数（补嵌进度展示） */
  missingCount(): number {
    return this.pendingMemories().length + this.pendingEvents().length
  }

  /**
   * 增量补嵌：只嵌缺向量条目（不清表——已嵌条目零重复计费）。
   * 维度不一致（换了 embedding 模型）→ 抛 EmbeddingError，调用方如实呈现；
   * 单批失败 → 已成功的批次保留，剩余进 remaining。
   */
  async backfill(limit: number = BACKFILL_LIMIT): Promise<BackfillResult> {
    const budget = Math.max(0, limit)
    let embedded = 0
    let remaining = 0
    for (const [kind, items] of this.pendingBuckets()) {
      const room = budget - embedded
      if (room <= 0) {
        remaining += items.length
        continue
      }
      const batch = items.slice(0, room)
      const vecs = await this.client.embed(batch.map((i) => i.content))
      this.assertDimensions(vecs)
      const ts = this.now()
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i] as (typeof batch)[number]
        const vec = vecs[i] as Float32Array
        this.store.upsert(kind, item.ref, item.content, vec, item.meta, ts)
        embedded++
      }
      remaining += items.length - batch.length
    }
    return { embedded, remaining }
  }

  /** 单条嵌入（memory.save 即时补嵌用；维度不符抛 SemanticDimensionError） */
  async embedOne(text: string): Promise<Float32Array | undefined> {
    const [v] = await this.client.embed([text])
    if (v === undefined) return undefined
    this.assertDimensions([v])
    return v
  }

  /** 长期记忆语义检索（top-k；FTS 之外的语义通道，由调用方决定合并策略） */
  async searchMemories(query: string, k: number): Promise<MemoryDto[]> {
    const hits = await this.search('memory', query, k)
    return hits.map((h) => {
      const id = typeof h.meta['id'] === 'number' ? h.meta['id'] : Number(h.ref)
      const createdAt = typeof h.meta['createdAt'] === 'number' ? h.meta['createdAt'] : 0
      return { id, content: h.content, createdAt }
    })
  }

  /** 会话事件语义检索（top-k；snippet 取内容前缀——语义命中没有关键词高亮位） */
  async searchEvents(query: string, k: number): Promise<SearchHit[]> {
    const hits = await this.search('event', query, k)
    return hits.map((h) => {
      const sessionId = typeof h.meta['sessionId'] === 'string' ? h.meta['sessionId'] : ''
      const eventId = typeof h.meta['eventId'] === 'string' ? h.meta['eventId'] : h.ref
      const seq = typeof h.meta['seq'] === 'number' ? h.meta['seq'] : 0
      const type = typeof h.meta['type'] === 'string' ? h.meta['type'] : 'assistant.message'
      const time = typeof h.meta['time'] === 'number' ? h.meta['time'] : 0
      return {
        sessionId: sessionId as SearchHit['sessionId'],
        sessionTitle: this.titleOf(sessionId),
        eventId: eventId as SearchHit['eventId'],
        seq,
        type: type as SearchHit['type'],
        time,
        snippet: snippetOf(h.content),
      }
    })
  }

  private async search(kind: VectorKind, query: string, k: number): Promise<VectorHit[]> {
    if (k <= 0 || query.trim() === '') return []
    const [qv] = await this.client.embed([query])
    if (qv === undefined) return []
    return this.store.topK(kind, qv, k)
  }

  /** 维度守卫：同一库里混维度向量会让余弦比较失真——首条定标，不一致即拒 */
  private assertDimensions(vecs: Float32Array[]): void {
    const want = this.client.dimensions
    if (want === undefined || vecs.length === 0) return
    for (const v of vecs) {
      if (v.length !== want) {
        throw new SemanticDimensionError(`embedding 维度不一致：期望 ${String(want)}，实得 ${String(v.length)}`)
      }
    }
  }

  /** 待补嵌条目（内存筛缺向量；两类合并成桶） */
  private pendingBuckets(): { kind: VectorKind; items: { ref: string; content: string; meta: Record<string, unknown> }[] }[] {
    return [
      { kind: 'memory' as const, items: this.pendingMemories() },
      { kind: 'event' as const, items: this.pendingEvents() },
    ]
  }

  private pendingMemories(): { ref: string; content: string; meta: Record<string, unknown> }[] {
    const have = this.store.refs('memory')
    return this.sources
      .memories()
      .filter((m) => !have.has(String(m.id)))
      .map((m) => ({
        ref: String(m.id),
        content: m.content,
        meta: { id: m.id, createdAt: m.createdAt, sessionId: m.sessionId },
      }))
  }

  private pendingEvents(): { ref: string; content: string; meta: Record<string, unknown> }[] {
    const have = this.store.refs('event')
    return this.sources
      .events()
      .map((e) => ({ ref: `${e.sessionId}:${e.eventId}`, content: e.content, meta: { ...e } }))
      .filter((e) => !have.has(e.ref))
  }
}

/** 维度不一致（换 embedding 模型后的既有向量）——调用方如实报"需重建" */
export class SemanticDimensionError extends Error {
  readonly code = 'E_EMBEDDING_DIMENSION'
  constructor(message: string) {
    super(message)
    this.name = 'SemanticDimensionError'
  }
}

/** 语义命中摘要（无关键词高亮位——取内容前 120 字，截断如实标注） */
export function snippetOf(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat
}

/**
 * 合流（语义优先，关键词兜底去重）：语义命中可能漏掉精确关键词（同义词命中不了字面），
 * 关键词命中可能漏掉语义相关（中文整句 FTS trigram 不命中）——两路都跑、按 id/ref
 * 去重、语义在前，截到 k。任一路为空即另一路原样（旧行为不变）。
 */
export function mergeMemories(semantic: MemoryDto[], keyword: MemoryDto[], k: number): MemoryDto[] {
  const seen = new Set<number>()
  const out: MemoryDto[] = []
  for (const m of [...semantic, ...keyword]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
    if (out.length >= k) break
  }
  return out
}

/** 事件合流（同 mergeMemories；去重键 = sessionId:eventId） */
export function mergeEvents(semantic: SearchHit[], keyword: SearchHit[], k: number): SearchHit[] {
  const seen = new Set<string>()
  const out: SearchHit[] = []
  for (const h of [...semantic, ...keyword]) {
    const key = `${h.sessionId}:${h.eventId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
    if (out.length >= k) break
  }
  return out
}
