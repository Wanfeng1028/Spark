/**
 * 向量存储与语义检索单测（阶段十九 19.8 / ADR D51，翻案 D25"向量后置"）：
 * ① 纯函数——cosine（含零向量/维度不齐）、vecToBlob/blobToVec 往返、hostAllowed 无关；
 * ② VectorStore——upsert/topK/refs/remove/clear/count/sizeBytes（真实 node:sqlite 临时库）；
 * ③ SemanticIndexer——**假 embedding client**（确定性哈希向量，免网络免 key）：
 *    补嵌只嵌缺向量条目、检索 top-k 排序、merge 合流去重、维度不一致拒嵌。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { EmbeddingClient, EmbeddingProviderInfo } from '../src/embedding/client.js'
import { ids } from '@spark/protocol'
import { blobToVec, cosine, VectorStore, vecToBlob } from '../src/vector/store.js'
import {
  BACKFILL_LIMIT,
  SemanticDimensionError,
  SemanticIndexer,
  mergeEvents,
  mergeMemories,
  snippetOf,
} from '../src/vector/semantic.js'
import type { SearchHit } from '../src/engine-types.js'

/** 确定性假 embedding：按字符码和取模造向量——同文本恒同向量，不同文本大概率不同 */
class FakeEmbeddingClient implements EmbeddingClient {
  readonly provider: EmbeddingProviderInfo
  calls = 0
  constructor(
    private readonly dims = 8,
    provider: EmbeddingProviderInfo = { providerId: 'fake', model: 'fake-embed', dimensions: dims },
  ) {
    // provider.dimensions 是"声称维度"，dims 是"实际返回维度"——两者可故意不一致（维度守卫用例）
    this.provider = provider
  }

  embed(texts: string[]): Promise<Float32Array[]> {
    this.calls += 1
    return Promise.resolve(
      texts.map((t) => {
        const v = new Float32Array(this.dims)
        for (let i = 0; i < t.length; i++) v[i % this.dims] = (v[i % this.dims] as number) + t.charCodeAt(i)
        return v
      }),
    )
  }

  get dimensions(): number | undefined {
    return this.provider.dimensions
  }
}

async function tempStore(): Promise<{ store: VectorStore; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'spark-vec-'))
  return { store: new VectorStore(join(dir, 'vectors.db')), dir }
}

describe('cosine / blob 往返（向量纯函数）', () => {
  test('余弦：同向 1、正交 0、反向 -1、零向量 0（不除零）', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([2, 0]))).toBeCloseTo(1, 5)
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 3]))).toBeCloseTo(0, 5)
    expect(cosine(new Float32Array([1, 0]), new Float32Array([-5, 0]))).toBeCloseTo(-1, 5)
    expect(cosine(new Float32Array([0, 0]), new Float32Array([1, 1]))).toBe(0)
  })

  test('维度不齐取较短长度（不越界；调用方维度守卫在语义层）', () => {
    expect(cosine(new Float32Array([1, 1, 1]), new Float32Array([1, 0]))).toBeCloseTo(1, 5)
  })

  test('Float32Array ↔ BLOB 往返逐字节一致', () => {
    const v = new Float32Array([0.5, -1.25, 3.14159, 0])
    const back = blobToVec(vecToBlob(v))
    expect(Array.from(back)).toEqual(Array.from(v))
    expect(vecToBlob(v).byteLength).toBe(v.byteLength)
  })
})

describe('VectorStore（node:sqlite 临时库）', () => {
  test('upsert → topK 按余弦排序；refs/count 反映已嵌集合', async () => {
    const { store } = await tempStore()
    const q = new Float32Array([1, 0, 0])
    store.upsert('memory', '1', '甲 内容', new Float32Array([1, 0, 0]), { id: 1 }, 1000)
    store.upsert('memory', '2', '乙 内容', new Float32Array([0.9, 0.1, 0]), { id: 2 }, 1000)
    store.upsert('memory', '3', '丙 内容', new Float32Array([0, 1, 0]), { id: 3 }, 1000)
    const hits = store.topK('memory', q, 2)
    expect(hits.map((h) => h.ref)).toEqual(['1', '2'])
    expect(hits[0]?.score).toBeCloseTo(1, 5)
    expect(store.refs('memory')).toEqual(new Set(['1', '2', '3']))
    expect(store.count('memory')).toBe(3)
    expect(store.count()).toBe(3)
    store.close()
  })

  test('同 kind+ref 覆盖（幂等——重复补嵌零副作用）；remove 幂等', async () => {
    const { store } = await tempStore()
    store.upsert('event', 's:e1', 'v1', new Float32Array([1, 0]), {}, 1)
    store.upsert('event', 's:e1', 'v2', new Float32Array([0, 1]), {}, 2)
    expect(store.count('event')).toBe(1)
    expect(store.topK('event', new Float32Array([0, 1]), 1)[0]?.content).toBe('v2')
    store.remove('event', 's:e1')
    store.remove('event', 's:e1') // 幂等
    expect(store.count('event')).toBe(0)
    store.close()
  })

  test('两类条目互不串（kind 隔离）；clear(kind) 只清指定类', async () => {
    const { store } = await tempStore()
    store.upsert('memory', '1', 'm', new Float32Array([1]), {}, 1)
    store.upsert('event', 's:e', 'e', new Float32Array([1]), {}, 1)
    store.clear('memory')
    expect(store.count('memory')).toBe(0)
    expect(store.count('event')).toBe(1)
    expect(store.sizeBytes()).toBeGreaterThan(0)
    store.close()
  })
})

describe('SemanticIndexer（假 embedding，免网络）', () => {
  function makeIndexer(opts: { store: VectorStore; dims?: number; client?: FakeEmbeddingClient }) {
    const client = opts.client ?? new FakeEmbeddingClient(opts.dims ?? 8)
    const memories = [
      { id: 1, content: '用户偏好中文回复', createdAt: 10, sessionId: 'ses_a' },
      { id: 2, content: '项目用 pnpm 管理依赖', createdAt: 20, sessionId: 'ses_a' },
    ]
    const events = [
      { sessionId: 'ses_a', eventId: 'e1', seq: 1, type: 'user.message', time: 5, content: '帮我把接口加上分页' },
      { sessionId: 'ses_a', eventId: 'e2', seq: 2, type: 'assistant.message', time: 6, content: '已加上 limit 参数' },
    ]
    const idx = new SemanticIndexer({
      client,
      store: opts.store,
      sources: { memories: () => memories, events: () => events },
      titleOf: () => '会话标题',
      now: () => 1000,
    })
    return { idx, client, memories, events }
  }

  test('补嵌只嵌缺向量条目；两类都补；重复补嵌零新增', async () => {
    const { store } = await tempStore()
    const { idx, client } = makeIndexer({ store })
    const r1 = await idx.backfill()
    expect(r1).toEqual({ embedded: 4, remaining: 0 })
    expect(store.count('memory')).toBe(2)
    expect(store.count('event')).toBe(2)
    const callsAfter = client.calls
    const r2 = await idx.backfill()
    expect(r2).toEqual({ embedded: 0, remaining: 0 })
    expect(client.calls).toBe(callsAfter) // 无缺失 → 不再调 embedding
    expect(idx.embeddedCount()).toBe(4)
    expect(idx.missingCount()).toBe(0)
    store.close()
  })

  test('补嵌上限：超出预算的进 remaining（可再次点补嵌）', async () => {
    const { store } = await tempStore()
    const { idx } = makeIndexer({ store })
    const r = await idx.backfill(3)
    expect(r.embedded).toBe(3)
    expect(r.remaining).toBe(1)
    expect(store.count()).toBe(3)
    store.close()
  })

  test('记忆语义检索：top-k 且 DTO 形状（id/content/createdAt）', async () => {
    const { store } = await tempStore()
    const { idx } = makeIndexer({ store })
    await idx.backfill()
    const hits = await idx.searchMemories('中文', 2)
    expect(hits.length).toBe(2)
    expect(hits[0]?.content).toBe('用户偏好中文回复') // 同文本恒同向量 → 余弦 1 居首
    expect(typeof hits[0]?.id).toBe('number')
    store.close()
  })

  test('事件语义检索：ref = sessionId:eventId，snippet 截断 + 标题回填', async () => {
    const { store } = await tempStore()
    const { idx } = makeIndexer({ store })
    await idx.backfill()
    const hits = await idx.searchEvents('分页', 1)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.eventId).toBe('e1')
    expect(hits[0]?.sessionTitle).toBe('会话标题')
    expect(hits[0]?.snippet.length).toBeLessThanOrEqual(121)
    store.close()
  })

  test('embedOne 维度不符 → SemanticDimensionError（换模型后拒混嵌）', async () => {
    const { store } = await tempStore()
    // 声称 8 维的提供方，实际返回 4 维向量
    const bad = new FakeEmbeddingClient(4, { providerId: 'fake', model: 'm', dimensions: 8 })
    const { idx } = makeIndexer({ store, client: bad })
    await expect(idx.embedOne('任意文本')).rejects.toBeInstanceOf(SemanticDimensionError)
    store.close()
  })

  test('BACKFILL_LIMIT 常量存在且为正（首次全量补嵌的单次上限）', () => {
    expect(BACKFILL_LIMIT).toBeGreaterThan(0)
  })
})

describe('合流与摘要（纯函数）', () => {
  test('mergeMemories：语义优先、关键词兜底去重、截到 k', () => {
    const sem = [{ id: 2, content: 'b', createdAt: 2 }]
    const kw = [
      { id: 2, content: 'b', createdAt: 2 },
      { id: 1, content: 'a', createdAt: 1 },
      { id: 3, content: 'c', createdAt: 3 },
    ]
    expect(mergeMemories(sem, kw, 2).map((m) => m.id)).toEqual([2, 1])
    expect(mergeMemories([], kw, 10).map((m) => m.id)).toEqual([2, 1, 3]) // 语义空 = 旧行为
  })

  test('mergeEvents：按 sessionId:eventId 去重，语义在前', () => {
    const mk = (id: string): SearchHit => ({
      sessionId: ids.session('ses_a'),
      sessionTitle: 't',
      eventId: ids.event(id),
      seq: 1,
      type: 'user.message',
      time: 1,
      snippet: 's',
    })
    const merged = mergeEvents([mk('e2')], [mk('e1'), mk('e2')], 5)
    expect(merged.map((h) => h.eventId)).toEqual(['e2', 'e1'])
  })

  test('snippetOf：压空白 + 120 字截断如实标注', () => {
    expect(snippetOf('  a\n\nb  ')).toBe('a b')
    const long = snippetOf('x'.repeat(200))
    expect(long.length).toBe(121)
    expect(long.endsWith('…')).toBe(true)
  })
})
