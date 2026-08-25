/**
 * Compactor 单测（doc/02 §5.8.5 / §8.6）：事件时序（started→completed）、
 * generateOnce 调用形状（压缩提示词+转录 / maxTokens 2000）、keptFromEventId
 * 尾部预算反推（最新一条必保/不越旧锚点）、二次压缩锚点级联、LLM 失败不杀
 * turn、run-loop 集成（触发→压缩→重投影→采样看到摘要上下文）。
 */
import { describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import { CompactorImpl, COMPACTION_PROMPT } from '../src/compaction.js'
import { ProjectorImpl } from '../src/projector.js'
import { runTurn, type RunLoopDeps } from '../src/run-loop.js'
import { SessionRuntime } from '../src/session/runtime.js'
import { EventTree } from '../src/session/tree.js'
import { newIds } from '../src/ulid.js'

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

const SID = ids.session('ses_compaction_test')

interface Fixture {
  sink: TreeSink
  bus: EventBus
  gateway: ScriptedLlm
  projector: ProjectorImpl
  compactor: CompactorImpl
  events: SparkEventEnvelope[]
}

function makeFixture(opts?: { keepTokens?: number }): Fixture {
  const sink = new TreeSink()
  const bus = new EventBus({ sink })
  const gateway = new ScriptedLlm()
  const projector = new ProjectorImpl({ tree: sink.tree, includeReasoning: false })
  const compactor = new CompactorImpl({
    sessionId: SID,
    bus,
    gateway,
    projector,
    tree: sink.tree,
    model: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
    keepTokens: opts?.keepTokens ?? 100_000,
  })
  const events: SparkEventEnvelope[] = []
  bus.subscribe((e) => {
    events.push(e)
  })
  return { sink, bus, gateway, projector, compactor, events }
}

function typesOf(f: Fixture): string[] {
  return f.sink.events.map((e) => e.type)
}

function lastEvent(f: Fixture, type: string): SparkEventEnvelope | undefined {
  return [...f.sink.events].reverse().find((e) => e.type === type)
}

/** 第 n 条 user.message 事件的 id（keptFromEventId 断言用） */
function surfaceIdAt(f: Fixture, n: number): string {
  const msgs = f.sink.events.filter((e) => e.type === 'user.message')
  const e = msgs[n - 1]
  if (e === undefined) throw new Error(`no user.message #${n}`)
  return e.id
}

describe('compact 基本流程（§5.8.5）', () => {
  test('事件时序 started → completed；summary/tokensBefore 落事件；generateOnce 收到压缩提示词+转录', async () => {
    const f = makeFixture()
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '讨论内容甲' })
    await f.bus.emit(SID, 'assistant.message', { turnId: trn, content: [{ type: 'text', text: '回答内容乙' }] })
    const tokensBefore = f.projector.modelContext().tokens
    f.gateway.scriptOnce('这是摘要')
    await f.compactor.compact()

    expect(typesOf(f)).toContain('compaction.started')
    const completed = lastEvent(f, 'compaction.completed')
    expect(completed?.data).toMatchObject({ summary: '这是摘要', tokensBefore })
    expect(typesOf(f).indexOf('compaction.started')).toBeLessThan(typesOf(f).indexOf('compaction.completed'))

    const once = f.gateway.onceCalls[0]
    expect(once?.system).toBeUndefined()
    expect(once?.maxTokens).toBe(2000)
    expect(once?.prompt.startsWith(COMPACTION_PROMPT)).toBe(true)
    expect(once?.prompt).toContain('user: 讨论内容甲')
    expect(once?.prompt).toContain('assistant: 回答内容乙')
  })

  test('压缩后 Projector 重投影生效：摘要为首条消息，锚点后事件保留', async () => {
    const f = makeFixture({ keepTokens: 6 }) // 只保留最后一条 surface（旧回答）
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '旧问题' })
    await f.bus.emit(SID, 'assistant.message', { turnId: trn, content: [{ type: 'text', text: '旧回答' }] })
    f.gateway.scriptOnce('压缩摘要')
    await f.compactor.compact()
    await f.bus.emit(SID, 'user.message', { text: '新问题' })

    const ctx = f.projector.modelContext()
    const texts = ctx.messages.flatMap((m) =>
      m.content.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.text : '')),
    )
    expect(texts).toEqual(['压缩摘要', '旧回答', '新问题'])
  })

  test('压缩后重投影 × reasoning=true（Anthropic 形态）：锚点后 reasoning 项保留进模型上下文', async () => {
    // 独立 fixture：includeReasoning=true 的 Projector（压缩器复用同一投影）
    const sink = new TreeSink()
    const bus = new EventBus({ sink })
    const gateway = new ScriptedLlm()
    const projector = new ProjectorImpl({ tree: sink.tree, includeReasoning: true })
    const compactor = new CompactorImpl({
      sessionId: SID,
      bus,
      gateway,
      projector,
      tree: sink.tree,
      model: { provider: 'anthropic', model: 'claude-x', contextWindow: 200_000 },
      keepTokens: 100_000,
    })
    const trn = newIds.turn()
    await bus.emit(SID, 'user.message', { text: '旧问题' })
    await bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [
        { type: 'reasoning', text: '旧思考' },
        { type: 'text', text: '旧回答' },
      ],
    })
    gateway.scriptOnce('压缩摘要')
    await compactor.compact()
    await bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [
        { type: 'reasoning', text: '新思考' },
        { type: 'text', text: '新回答' },
      ],
    })

    const ctx = projector.modelContext()
    const flat = ctx.messages.flatMap((m) => m.content)
    // 预算充足 → 锚点=首条 surface（旧问题）：全部事件保留，reasoning 项原样进上下文
    expect(flat.map((c) => (c.type === 'text' || c.type === 'reasoning' ? c.text : ''))).toEqual([
      '压缩摘要',
      '旧问题',
      '旧思考',
      '旧回答',
      '新思考',
      '新回答',
    ])
  })
})

describe('keptFromEventId 尾部预算反推（§5.8.5 "N 由 token 预算反推"）', () => {
  /** 5 条 user 消息（路径序 1..5），每条 data 序列化长度相同 */
  async function fiveMessages(f: Fixture): Promise<void> {
    for (let i = 1; i <= 5; i++) {
      await f.bus.emit(SID, 'user.message', { text: `消息零一二三四五六七八九${i}` })
    }
  }

  test('预算充足：全部保留（keptFromEventId=首条事件 id）', async () => {
    const f = makeFixture({ keepTokens: 100_000 })
    await fiveMessages(f)
    f.gateway.scriptOnce('S')
    await f.compactor.compact()
    expect(lastEvent(f, 'compaction.completed')?.data).toMatchObject({
      keptFromEventId: surfaceIdAt(f, 1),
    })
  })

  test('预算只够尾部：keptFromEventId=尾部首条事件 id（投影只剩尾部+摘要）', async () => {
    // 每条消息 data JSON ≈ {"text":"消息零一二三四五六七八九N"} ≈ 22 字节 → ~6 token
    const f = makeFixture({ keepTokens: 12 }) // ≈ 最近 2 条
    await fiveMessages(f)
    f.gateway.scriptOnce('S')
    await f.compactor.compact()
    expect(lastEvent(f, 'compaction.completed')?.data).toMatchObject({
      keptFromEventId: surfaceIdAt(f, 4),
    })

    const ctx = f.projector.modelContext()
    const texts = ctx.messages.flatMap((m) =>
      m.content.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.text : '')),
    )
    expect(texts).toEqual(['S', '消息零一二三四五六七八九4', '消息零一二三四五六七八九5'])
  })

  test('预算极小：最新一条无条件保留（不把当前上下文全部摘要掉）', async () => {
    const f = makeFixture({ keepTokens: 0 })
    await fiveMessages(f)
    f.gateway.scriptOnce('S')
    await f.compactor.compact()
    expect(lastEvent(f, 'compaction.completed')?.data).toMatchObject({
      keptFromEventId: surfaceIdAt(f, 5),
    })
  })

  test('二次压缩：预算再大也不越过旧锚点（已摘要事件不复活）；旧摘要不重复出现', async () => {
    // 第一次压缩：预算 12 → 只保留尾部（锚定第 4 条）
    const f = makeFixture({ keepTokens: 12 })
    await fiveMessages(f)
    f.gateway.scriptOnce('S1')
    await f.compactor.compact()
    expect(lastEvent(f, 'compaction.completed')?.data).toMatchObject({
      keptFromEventId: surfaceIdAt(f, 4),
    })

    // 第二次压缩：预算放大到全量——边界仍被旧锚点卡住（事件 1-3 已被摘要）
    f.compactor = new CompactorImpl({
      sessionId: SID,
      bus: f.bus,
      gateway: f.gateway,
      projector: f.projector,
      tree: f.sink.tree,
      model: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
      keepTokens: 100_000,
    })
    await f.bus.emit(SID, 'user.message', { text: '第六条' })
    f.gateway.scriptOnce('S2')
    await f.compactor.compact()
    expect(lastEvent(f, 'compaction.completed')?.data).toMatchObject({
      keptFromEventId: surfaceIdAt(f, 4),
    })

    // 投影：新摘要 S2 + 锚点事件之后的事件（S1 不是 surface 事件，不重复出现）
    const ctx = f.projector.modelContext()
    const texts = ctx.messages.flatMap((m) =>
      m.content.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.text : '')),
    )
    expect(texts).toEqual(['S2', '消息零一二三四五六七八九4', '消息零一二三四五六七八九5', '第六条'])
  })
})

describe('失败语义', () => {
  test('generateOnce 失败：emit error{llm}、无 completed、不抛（旧上下文继续可用）', async () => {
    const f = makeFixture()
    await f.bus.emit(SID, 'user.message', { text: '问题' })
    const before = f.projector.modelContext()
    // 不 scriptOnce → E_SCRIPTED_EXHAUSTED
    await expect(f.compactor.compact()).resolves.toBeUndefined()

    expect(typesOf(f)).toContain('compaction.started')
    expect(typesOf(f)).not.toContain('compaction.completed')
    const err = lastEvent(f, 'error')
    expect((err?.data as { scope: string }).scope).toBe('llm')
    expect((err?.data as { message: string }).message).toMatch(/^E_LLM_COMPACTION:/)
    expect(f.projector.modelContext()).toEqual(before)
  })
})

describe('run-loop 集成（§5.5 step ② 真组件接线）', () => {
  test('tokens 超阈值 → compact → 重投影 → stream 收到摘要上下文；turn 正常闭合', async () => {
    const sink = new TreeSink()
    const bus = new EventBus({ sink })
    const gateway = new ScriptedLlm()
    const projector = new ProjectorImpl({ tree: sink.tree, includeReasoning: false })
    const compactor = new CompactorImpl({
      sessionId: SID,
      bus,
      gateway,
      projector,
      tree: sink.tree,
      model: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
      keepTokens: 100_000,
    })
    const rt = new SessionRuntime(SID)
    const deps: RunLoopDeps = {
      sessionId: SID,
      bus,
      gateway,
      projector,
      compactor,
      tools: {
        materialize: () => [],
        runAll: () => Promise.resolve([]),
      },
      model: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 1 }, // 任意非空上下文必超阈值
      system: 'sys',
      maxStepsPerTurn: 40,
      compactionThreshold: 0.8,
    }

    gateway.scriptOnce('集成摘要')
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const input = {
      id: newIds.event(),
      turnId: newIds.turn(),
      text: '集成问题',
      delivery: 'now' as const,
      admittedAt: Date.now(),
    }
    await runTurn(rt, deps, input)

    // 压缩对先于 assistant.message；stream 首条消息为摘要
    const seqTypes = sink.events.map((e) => e.type)
    expect(seqTypes).toContain('compaction.started')
    expect(seqTypes).toContain('compaction.completed')
    expect(seqTypes.indexOf('compaction.completed')).toBeLessThan(seqTypes.indexOf('assistant.message'))
    const first = gateway.calls[0]?.messages[0]
    expect(first?.role).toBe('user')
    expect(first?.content).toEqual([{ type: 'text', text: '集成摘要' }])
    // turn 失败闭合
    expect(seqTypes[seqTypes.length - 1]).toBe('turn.completed')
  })
})
