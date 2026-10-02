/**
 * CK-12 批 1 单测：压缩后状态复灌——rebuildState 端口注入后 summary 尾部含状态块；
 * 未注入时 summary 逐字节不变；todo/deferred 均空时端口返回 undefined（不加块）。
 */
import { describe, expect, test, vi } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { CompactorImpl } from '../src/compaction.js'
import { TodoBoard, type TodoItem } from '../src/tools/builtin/todo.js'
import { DeferredToolIndex } from '../src/tools/builtin/tool-search.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'
import type { SessionId } from '@spark/protocol'

const SID = ids.session('ses_rebuildtest000000000000')

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

async function makeFixture(opts?: {
  todos?: TodoItem[]
  deferred?: string[]
  rebuildState?: () => string | undefined
}): { sink: MemSink; compact: () => Promise<boolean> } {
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const board = new TodoBoard({ emit: async () => undefined })
  if (opts?.todos !== undefined) {
    await board.write(SID, opts.todos)
  }
  const idx = new DeferredToolIndex()
  for (const d of opts?.deferred ?? []) idx.defer(d)
  const compactor = new CompactorImpl({
    sessionId: SID,
    bus,
    gateway: {
      stream: () => Promise.resolve({ content: [], stopReason: 'aborted', usage: ZERO_USAGE }),
      generateOnce: () => Promise.resolve('压缩摘要正文'),
    },
    projector: {
      modelContext: () => ({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tokens: 10 }),
    },
    // 合成一条 surface 事件（空路径会触发 E_COMPACTION_EMPTY_PATH——compact 的失败闭合）
    tree: {
      pathToRoot: () => [
        {
          id: ids.event('evt_rebuild000000000000001'),
          sessionId: SID,
          type: 'user.message',
          time: Date.now(),
          parentId: null,
          seq: 1,
          data: { text: 'hi' },
        },
      ],
    } as never,
    model: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
    keepTokens: 1000,
    ...(opts?.rebuildState !== undefined ? { rebuildState: opts.rebuildState } : {}),
  })
  return { sink, compact: () => compactor.compact() }
}

function completedSummary(sink: MemSink): string {
  const done = sink.events.findLast(
    (e): e is SparkEventEnvelope<'compaction.completed'> => e.type === 'compaction.completed',
  )
  if (done === undefined) {
    const err = sink.events.find((e) => e.type === 'error')
    throw new Error(`compaction.completed 缺失${err !== undefined ? `（error: ${JSON.stringify(err.data)}）` : ''}`)
  }
  return done.data.summary
}

describe('压缩后状态复灌（CK-12 批 1）', () => {
  test('rebuildState 注入：summary 尾部含状态块（原文在前）', async () => {
    const { sink, compact } = await makeFixture({
      rebuildState: () => '## 进行中任务\n- [×] 修复投影层',
    })
    await compact()
    const summary = completedSummary(sink)
    expect(summary.startsWith('压缩摘要正文')).toBe(true)
    expect(summary).toContain('## 进行中任务')
    expect(summary).toContain('- [×] 修复投影层')
  })

  test('未注入 rebuildState：summary 逐字节不变（零回归）', async () => {
    const { sink, compact } = await makeFixture()
    await compact()
    expect(completedSummary(sink)).toBe('压缩摘要正文')
  })

  test('todo/deferred 均空：装配层端口返回 undefined，summary 不加块', async () => {
    const board = new TodoBoard({ emit: async () => undefined })
    const idx = new DeferredToolIndex()
    const { sink, compact } = await makeFixture({
      todos: [],
      deferred: [],
      rebuildState: () => {
        const openTodos = board.get(SID).filter((t) => t.status !== 'completed')
        const deferred = idx.list()
        if (openTodos.length === 0 && deferred.length === 0) return undefined
        return '不应出现'
      },
    })
    void board
    void idx
    await compact()
    expect(completedSummary(sink)).toBe('压缩摘要正文')
  })
})
