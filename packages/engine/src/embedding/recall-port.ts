/**
 * 语义检索端口（阶段十九 19.8 / ADR D51；自 engine.ts 门面拆出——doc/13 §5.4 第一步）：
 * memory 工具与记忆注入共用一份装配。
 * searchMemories = 语义优先 + 关键词兜底去重合流（嵌入失败 fail-soft 回关键词）；
 * indexMemory = 新存记忆即时补嵌（fire-and-forget，失败只 warn 不抛——
 * 保存已成功，向量是派生缓存）。
 */
import type { SparkLogger } from '../logger.js'
import type { MemoryStore } from '../memory/store.js'
import type { SemanticRecallPort } from '../tools/definition.js'
import type { VectorStore } from '../vector/store.js'
import { mergeMemories, type SemanticIndexer } from '../vector/semantic.js'

export function makeSemanticRecallPort(
  deps: {
    semantic: SemanticIndexer
    memory: MemoryStore | null
    vectors: VectorStore | null
    now: () => number
    logger: SparkLogger
  },
): SemanticRecallPort {
  const sem = deps.semantic
  const m = deps.memory
  return {
    searchMemories: async (query, k) => {
      const keyword = m?.search(query, k) ?? []
      try {
        const semantic = await sem.searchMemories(query, k)
        return mergeMemories(semantic, keyword, k)
      } catch (err) {
        deps.logger.warn('semantic.search_memories.error', { err })
        return keyword
      }
    },
    indexMemory: (id, content) => {
      void (async () => {
        try {
          const vec = await sem.embedOne(content)
          if (vec === undefined) return
          deps.vectors?.upsert('memory', String(id), content, vec, { id }, deps.now())
        } catch (err) {
          deps.logger.warn('semantic.index_memory.error', { id, err })
        }
      })()
    },
  }
}
