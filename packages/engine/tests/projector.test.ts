/**
 * Projector 单测（doc/02 §5.8.3 / §8.6）：无/有 compaction 分支 × reasoning 配置、
 * 逐字直通、空内容不进转录、非 surface 事件不投影、token 字符近似、
 * SessionStore 真实装配（含 resume）投影一致性。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { estimateTokens, ProjectorImpl, reasoningIncluded } from '../src/projector.js'
import type { LlmMessage } from '../src/llm-gateway.js'
import { SessionStore } from '../src/session/store.js'
import { EventTree } from '../src/session/tree.js'
import { newIds } from '../src/ulid.js'

/** 镜像 SessionStore.append 行为的内存 sink：填 parentId 并进树 */
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

const SID = ids.session('ses_projector_test')

function makeFixture(): { sink: TreeSink; bus: EventBus } {
  const sink = new TreeSink()
  const bus = new EventBus({ sink })
  return { sink, bus }
}

function makeProjector(tree: EventTree, includeReasoning: boolean): ProjectorImpl {
  return new ProjectorImpl({ tree, includeReasoning })
}

/** text 项拼接（结构项另行断言）；role 序列 */
function roles(messages: readonly LlmMessage[]): string[] {
  return messages.map((m) => m.role)
}

function texts(messages: readonly LlmMessage[]): string[] {
  return messages.flatMap((m) =>
    m.content.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.text : '')),
  )
}

function types(messages: readonly LlmMessage[]): string[] {
  return messages.flatMap((m) => m.content.map((c) => c.type))
}

describe('无 compaction 分支（§5.8.3 第 4 步）', () => {
  test('surface 事件投影；turn/tool/reasoning.ended/error 等非 surface 事件不进上下文', async () => {
    const f = makeFixture()
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '读一下 src/index.ts' })
    await f.bus.emit(SID, 'turn.started', { turnId: trn, delivery: 'now', userEventId: newIds.event() })
    await f.bus.emit(SID, 'reasoning.ended', { turnId: trn, text: '思考内容' })
    await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [{ type: 'text', text: '我先读取文件' }],
    })
    await f.bus.emit(SID, 'tool.started', { turnId: trn, callId: newIds.call(), name: 'read', input: {} })
    await f.bus.emit(SID, 'error', { scope: 'engine', message: '噪音' })

    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(roles(ctx.messages)).toEqual(['user', 'assistant'])
    expect(texts(ctx.messages)).toEqual(['读一下 src/index.ts', '我先读取文件'])
  })

  test('content 逐字直通：toolCall/toolResult 项原样进投影（dsh：framing is caller-owned）', async () => {
    const f = makeFixture()
    const trn = newIds.turn()
    const callId = newIds.call()
    await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [
        { type: 'text', text: '调用工具' },
        { type: 'toolCall', callId, name: 'read', input: { path: 'src/index.ts' } },
      ],
    })
    await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [{ type: 'toolResult', callId, output: { lines: 42 }, isError: false }],
    })

    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(ctx.messages[0]?.content[1]).toEqual({
      type: 'toolCall',
      callId,
      name: 'read',
      input: { path: 'src/index.ts' },
    })
    expect(ctx.messages[1]?.content[0]).toEqual({
      type: 'toolResult',
      callId,
      output: { lines: 42 },
      isError: false,
    })
  })

  test('空 content 的 assistant.message 不进转录（dsh：仅承载 usage 的 max-tokens step）', async () => {
    const f = makeFixture()
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '问题' })
    await f.bus.emit(SID, 'assistant.message', { turnId: trn, content: [], usage: { inputTokens: 10, outputTokens: 0 } })
    await f.bus.emit(SID, 'assistant.message', { turnId: trn, content: [{ type: 'text', text: '回答' }] })

    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(roles(ctx.messages)).toEqual(['user', 'assistant'])
  })
})

describe('reasoning 配置（§5.8.3 第 5 步）', () => {
  async function reasoningFixture(): Promise<{ sink: TreeSink; bus: EventBus }> {
    const f = makeFixture()
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '问题' })
    await f.bus.emit(SID, 'reasoning.ended', { turnId: trn, text: '思考' })
    await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [
        { type: 'reasoning', text: '思考' },
        { type: 'text', text: '回答' },
      ],
    })
    await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [{ type: 'reasoning', text: '只有思考' }],
    })
    return f
  }

  test('includeReasoning=false（非 Anthropic）：reasoning 项被滤除；滤空的消息整条跳过', async () => {
    const f = await reasoningFixture()
    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(roles(ctx.messages)).toEqual(['user', 'assistant'])
    expect(types(ctx.messages)).toEqual(['text', 'text'])
    expect(texts(ctx.messages)).toEqual(['问题', '回答'])
  })

  test('includeReasoning=true（Anthropic thinking 块）：reasoning 项原样保留', async () => {
    const f = await reasoningFixture()
    const ctx = makeProjector(f.sink.tree, true).modelContext()
    expect(roles(ctx.messages)).toEqual(['user', 'assistant', 'assistant'])
    expect(types(ctx.messages)).toEqual(['text', 'reasoning', 'text', 'reasoning'])
  })

  test('reasoningIncluded：anthropic 保留，其他丢弃', () => {
    expect(reasoningIncluded('anthropic')).toBe(true)
    expect(reasoningIncluded('deepseek')).toBe(false)
    expect(reasoningIncluded('openai')).toBe(false)
  })
})

describe('有 compaction 分支（§5.8.3 第 2/3 步）', () => {
  test('摘要为首条 user 消息；锚点事件（含）之后进上下文、之前的被滤除', async () => {
    const f = makeFixture()
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '被摘要的旧问题' })
    // 锚点 = 保留的最老 surface 事件（真实 Compactor 输出形态；含边界保留）
    const oldAnswer = await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [{ type: 'text', text: '被保留的旧回答' }],
    })
    await f.bus.emit(SID, 'compaction.completed', {
      summary: '此前的讨论摘要',
      keptFromEventId: oldAnswer.id,
      tokensBefore: 100,
    })
    await f.bus.emit(SID, 'user.message', { text: '新问题' })
    await f.bus.emit(SID, 'assistant.message', { turnId: trn, content: [{ type: 'text', text: '新回答' }] })

    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(roles(ctx.messages)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(texts(ctx.messages)).toEqual(['此前的讨论摘要', '被保留的旧回答', '新问题', '新回答'])
  })

  test('多个 compaction.completed 取最新锚点', async () => {
    const f = makeFixture()
    await f.bus.emit(SID, 'user.message', { text: 'A' })
    await f.bus.emit(SID, 'compaction.completed', { summary: '旧摘要', keptFromEventId: newIds.event(), tokensBefore: 10 })
    const b = await f.bus.emit(SID, 'user.message', { text: 'B' })
    await f.bus.emit(SID, 'compaction.completed', { summary: '新摘要', keptFromEventId: b.id, tokensBefore: 20 })
    await f.bus.emit(SID, 'user.message', { text: 'C' })

    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(texts(ctx.messages)).toEqual(['新摘要', 'B', 'C'])
  })

  test('锚点（非 surface 事件）后无 surface 事件：仅摘要消息', async () => {
    const f = makeFixture()
    await f.bus.emit(SID, 'user.message', { text: '旧' })
    // 锚点 = 路径上真实存在的非 surface durable 事件（锚点语义是位置而非类型）
    const boundary = await f.bus.emit(SID, 'error', { scope: 'engine', message: '边界' })
    await f.bus.emit(SID, 'compaction.completed', {
      summary: 'S',
      keptFromEventId: boundary.id,
      tokensBefore: 5,
    })

    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(texts(ctx.messages)).toEqual(['S'])
  })

  test('锚点 id 不在路径（数据损坏兜底）：摘要与全部事件保留（不丢数据，可再压缩自愈）', async () => {
    const f = makeFixture()
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '问题一' })
    await f.bus.emit(SID, 'assistant.message', { turnId: trn, content: [{ type: 'text', text: '回答一' }] })
    await f.bus.emit(SID, 'compaction.completed', {
      summary: '悬空摘要',
      keptFromEventId: newIds.event(),
      tokensBefore: 5,
    })
    await f.bus.emit(SID, 'user.message', { text: '问题二' })

    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(texts(ctx.messages)).toEqual(['悬空摘要', '问题一', '回答一', '问题二'])
  })

  test('悬空锚点触发 onDanglingAnchor 告警；同一锚点只报一次（modelContext 高频去重）', async () => {
    const f = makeFixture()
    await f.bus.emit(SID, 'user.message', { text: '问题一' })
    await f.bus.emit(SID, 'compaction.completed', {
      summary: '悬空摘要',
      keptFromEventId: newIds.event(),
      tokensBefore: 5,
    })
    await f.bus.emit(SID, 'user.message', { text: '问题二' })

    const seen: string[] = []
    const p = new ProjectorImpl({
      tree: f.sink.tree,
      includeReasoning: false,
      onDanglingAnchor: (id) => seen.push(id),
    })
    p.modelContext()
    p.modelContext()
    p.modelContext()
    expect(seen).toHaveLength(1)

    // 路径上无 compaction：不告警
    const f2 = makeFixture()
    await f2.bus.emit(SID, 'user.message', { text: '无压缩' })
    let fired = false
    new ProjectorImpl({
      tree: f2.sink.tree,
      includeReasoning: false,
      onDanglingAnchor: () => {
        fired = true
      },
    }).modelContext()
    expect(fired).toBe(false)
  })

  test('有 compaction × includeReasoning=true（四象限补全）：锚点后 reasoning 项保留、锚点前滤除', async () => {
    const f = makeFixture()
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '被摘要的旧问题' })
    await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [
        { type: 'reasoning', text: '被摘要的旧思考' },
        { type: 'text', text: '被摘要的旧回答' },
      ],
    })
    const anchor = await f.bus.emit(SID, 'user.message', { text: '锚点问题' })
    await f.bus.emit(SID, 'compaction.completed', {
      summary: '摘要',
      keptFromEventId: anchor.id,
      tokensBefore: 50,
    })
    await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [
        { type: 'reasoning', text: '锚点后的思考' },
        { type: 'text', text: '锚点后的回答' },
      ],
    })

    const ctx = makeProjector(f.sink.tree, true).modelContext()
    // 摘要 + 锚点事件（含）之后：reasoning 项原样保留；锚点前（含其 reasoning）不出现
    expect(roles(ctx.messages)).toEqual(['user', 'user', 'assistant'])
    expect(types(ctx.messages)).toEqual(['text', 'text', 'reasoning', 'text'])
    expect(texts(ctx.messages)).toEqual(['摘要', '锚点问题', '锚点后的回答'])
  })
})

describe('token 估算（§5.8.3 第 6 步：字符近似）', () => {
  test('文本长度 / 4 向上取整；结构项按 JSON 长度', () => {
    expect(estimateTokens([{ role: 'user', content: [{ type: 'text', text: 'abcd' }] }])).toBe(1)
    expect(estimateTokens([{ role: 'user', content: [{ type: 'text', text: 'abcde' }] }])).toBe(2)
    expect(
      estimateTokens([
        { role: 'user', content: [{ type: 'text', text: 'abcd' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'abcd' }] },
      ]),
    ).toBe(2)
  })

  test('modelContext 的 tokens 即投影消息的估算值', async () => {
    const f = makeFixture()
    await f.bus.emit(SID, 'user.message', { text: 'abcd'.repeat(10) })
    const ctx = makeProjector(f.sink.tree, false).modelContext()
    expect(ctx.tokens).toBe(estimateTokens(ctx.messages))
  })
})

describe('SessionStore 真实装配', () => {
  test('bus+store 落盘 → 投影；close+resume 后投影一致（§5.8.1 同构）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spark-projector-'))
    const path = join(dir, '1761280000000_ses_storeround1.jsonl')
    const store = await SessionStore.create(path, {
      sparkVersion: '0.1.0',
      cwd: dir,
      createdAt: 1761280000000,
      model: 'deepseek/deepseek-chat',
    })
    const sid = ids.session('ses_storeround1')
    const bus = new EventBus({ sink: store })
    await bus.emit(sid, 'user.message', { text: '第一问' })
    const firstAnswer = await bus.emit(sid, 'assistant.message', {
      turnId: newIds.turn(),
      content: [{ type: 'text', text: '第一答' }],
    })
    await bus.emit(sid, 'compaction.completed', {
      summary: '摘要',
      keptFromEventId: firstAnswer.id,
      tokensBefore: 9,
    })
    await bus.emit(sid, 'user.message', { text: '第二问' })
    const before = makeProjector(store.tree, false).modelContext()
    await store.close()

    const resumed = await SessionStore.resume(path)
    const after = makeProjector(resumed.tree, false).modelContext()
    expect(after).toEqual(before)
    expect(texts(after.messages)).toEqual(['摘要', '第一答', '第二问'])
  })
})
