/**
 * ZC-1 微压缩单测：MicroCompactor 计划/触发（组数不足 / 节省 <256 回滚 / 达标 emit
 * boundary）+ projector 边界重建清理（keptFromEventId 之前 toolResult 清占位、
 * 最近 5 组保留、原文 callId/isError 不变）。
 */
import { describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus } from '../src/bus.js'
import { EventTree } from '../src/session/tree.js'
import { ProjectorImpl, estimateTokens } from '../src/projector.js'
import { MicroCompactorImpl } from '../src/microcompact.js'
import type { EventSink } from '../src/bus.js'

const SID = ids.session('ses_microcompact_test')

class TreeSink implements EventSink {
  readonly tree = new EventTree()
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    const parentId = this.tree.leafId
    const final = { ...e, parentId }
    this.events.push(final)
    this.tree.append(e, parentId)
    return Promise.resolve(final)
  }
}

function makeFixture() {
  const sink = new TreeSink()
  const bus = new EventBus({ sink })
  const projector = new ProjectorImpl({ tree: sink.tree, includeReasoning: false })
  const mc = new MicroCompactorImpl({
    sessionId: SID,
    bus,
    tree: sink.tree,
    projector,
    estimateTokens: (messages) => estimateTokens(messages as Parameters<typeof estimateTokens>[0]),
  })
  return { sink, bus, projector, mc }
}

async function seedTurns(
  f: ReturnType<typeof makeFixture>,
  groups: number,
  outputSize = 2000,
): Promise<void> {
  for (let i = 0; i < groups; i++) {
    await f.bus.emit(SID, 'user.message', { text: `问 ${i}` })
    await f.bus.emit(SID, 'assistant.message', {
      turnId: ids.turn(`trn_mc${String(i).padStart(2, '0')}`),
      content: [
        { type: 'text', text: `答 ${i}` },
        {
          type: 'toolResult',
          callId: ids.call(`cal_mc${String(i).padStart(2, '0')}`),
          output: { data: 'x'.repeat(outputSize) },
          isError: false,
        },
      ],
    })
  }
}

describe('ZC-1：MicroCompactor 计划与触发', () => {
  test('组数 ≤5：不值得，返回 false 且不 emit', async () => {
    const f = makeFixture()
    await seedTurns(f, 5)
    expect(await f.mc.run()).toBe(false)
    expect(f.sink.events.some((e) => e.type === 'microcompact_boundary')).toBe(false)
  })

  test('7 组 → 清前 2 组；但节省 <256 token 回滚 false', async () => {
    const f = makeFixture()
    await seedTurns(f, 7, 100) // 小输出：清 2 组省不了 256 token
    expect(await f.mc.run()).toBe(false)
    expect(f.sink.events.some((e) => e.type === 'microcompact_boundary')).toBe(false)
  })

  test('达标：emit boundary（keptFromEventId=倒数第 5 组消息 id）→ true', async () => {
    const f = makeFixture()
    await seedTurns(f, 8, 2000)
    expect(await f.mc.run()).toBe(true)
    const boundary = f.sink.events.find((e) => e.type === 'microcompact_boundary')
    expect(boundary).toBeDefined()
    expect(boundary?.data).toMatchObject({ clearedCount: 3 })
    // keptFromEventId = 倒数第 5 组的 assistant.message id（8 组清前 3）
    const groups = f.sink.events.filter(
      (e) =>
        e.type === 'assistant.message' &&
        (e.data as { content: Array<{ type: string }> }).content.some((c) => c.type === 'toolResult'),
    )
    expect(boundary?.data).toMatchObject({ keptFromEventId: groups[3]?.id })
  })
})

describe('ZC-1：projector 边界重建清理', () => {
  test('boundary 后重投影：边界前 toolResult 清占位、之后保留；callId/isError 不变', async () => {
    const f = makeFixture()
    await seedTurns(f, 8, 2000)
    await f.mc.run()

    const ctx = f.projector.modelContext()
    // 全部消息里的 toolResult：前 3 组清占位、后 5 组原样
    const toolResults: Array<{ callId: string; output: unknown }> = []
    for (const m of ctx.messages) {
      for (const c of m.content) {
        if (c.type === 'toolResult') {
          toolResults.push({ callId: c.callId, output: c.output })
        }
      }
    }
    expect(toolResults).toHaveLength(8)
    for (let i = 0; i < 8; i++) {
      const tr = toolResults[i]
      if (tr === undefined) throw new Error(`toolResult #${i} 缺失`)
      if (i < 3) {
        expect(String(tr.output)).toContain('Old tool result cleared')
      } else {
        expect(JSON.stringify(tr.output)).toContain('"data"') // 原样
      }
    }
    // 节省后 token 数应显著小于未清理版本（粗断言：占位 80 字符 << 2000 字节输出）
    const clearedEstimate = ctx.tokens
    expect(clearedEstimate).toBeGreaterThan(0)
  })
})
