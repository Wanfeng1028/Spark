/**
 * TitleGenerator 单测（doc/02 §5.11 辅助提示词 / 阶段四工单 4.4）：
 * generateOnce 调用形状（标题提示词+转录 / maxTokens 50）、回串修剪与截断、
 * 空串不发、generateOnce 失败向上抛（引擎层记日志不 emit error）。
 */
import { describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import { ProjectorImpl } from '../src/projector.js'
import { TitleGenerator, TITLE_PROMPT } from '../src/title.js'
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

const SID = ids.session('ses_title_test')

interface Fixture {
  sink: TreeSink
  bus: EventBus
  gateway: ScriptedLlm
  titler: TitleGenerator
}

function makeFixture(): Fixture {
  const sink = new TreeSink()
  const bus = new EventBus({ sink })
  const gateway = new ScriptedLlm()
  const projector = new ProjectorImpl({ tree: sink.tree, includeReasoning: false })
  const titler = new TitleGenerator({
    sessionId: SID,
    bus,
    gateway,
    projector,
    model: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
  })
  return { sink, bus, gateway, titler }
}

describe('TitleGenerator（§5.11 会话标题）', () => {
  test('generateOnce 收到标题提示词+转录 / maxTokens 50；emit session.title', async () => {
    const f = makeFixture()
    const trn = newIds.turn()
    await f.bus.emit(SID, 'user.message', { text: '帮我修登录超时' })
    await f.bus.emit(SID, 'assistant.message', {
      turnId: trn,
      content: [{ type: 'text', text: '已修复' }],
    })
    f.gateway.scriptOnce('修复登录超时')
    await f.titler.generate()

    const once = f.gateway.onceCalls[0]
    expect(once?.system).toBeUndefined()
    expect(once?.maxTokens).toBe(50)
    expect(once?.prompt.startsWith(TITLE_PROMPT)).toBe(true)
    expect(once?.prompt).toContain('user: 帮我修登录超时')
    expect(once?.prompt).toContain('assistant: 已修复')

    const title = f.sink.events.find((e) => e.type === 'session.title')
    expect(title?.data).toEqual({ title: '修复登录超时' })
  })

  test('回串修剪：首尾空白剥离；超 80 字符截断', async () => {
    const f = makeFixture()
    await f.bus.emit(SID, 'user.message', { text: '问题' })
    f.gateway.scriptOnce('  长标题  ')
    await f.titler.generate()
    expect(f.sink.events[f.sink.events.length - 1]?.data).toEqual({ title: '长标题' })

    const long = 'x'.repeat(120)
    f.gateway.scriptOnce(long)
    await f.titler.generate()
    expect(f.sink.events[f.sink.events.length - 1]?.data).toEqual({
      title: 'x'.repeat(80),
    })
  })

  test('修剪后空串：不 emit（保持"新会话"）', async () => {
    const f = makeFixture()
    await f.bus.emit(SID, 'user.message', { text: '问题' })
    f.gateway.scriptOnce('   ')
    await f.titler.generate()
    expect(f.sink.events.some((e) => e.type === 'session.title')).toBe(false)
  })

  test('generateOnce 失败：向上抛（引擎层 catch 记日志，不 emit error）', async () => {
    const f = makeFixture()
    await f.bus.emit(SID, 'user.message', { text: '问题' })
    // 不 scriptOnce → E_SCRIPTED_EXHAUSTED
    await expect(f.titler.generate()).rejects.toThrow('E_SCRIPTED_EXHAUSTED')
    expect(f.sink.events.some((e) => e.type === 'error')).toBe(false)
  })
})
