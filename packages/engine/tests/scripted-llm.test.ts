/**
 * ScriptedLlm 单测（doc/02 §8 阶段三清单 ScriptedLlm 行）：假 provider 自身的
 * 行为守护——步骤回放/回调顺序/定稿汇总、abort 前缀语义、序列耗尽 fail-fast。
 * （run-loop 全链路测试在后续工单，依赖本类作为 LlmGateway 假实现。）
 */
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import type { ContentItem } from '@spark/protocol'
import type { LlmMessage, ToolSpec } from '../src/llm-gateway.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import type { ScriptedStep } from '../src/scripted-llm.js'

const MODEL = { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 }

function req(overrides: Partial<Parameters<ScriptedLlm['stream']>[0]> = {}) {
  const controller = new AbortController()
  const deltas: string[] = []
  const thinkings: string[] = []
  return {
    controller,
    deltas,
    thinkings,
    base: {
      model: MODEL,
      system: 'sys',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      ] as LlmMessage[],
      tools: [] as ToolSpec[],
      signal: controller.signal,
      onDelta: (t: string): void => {
        deltas.push(t)
      },
      onThinking: (t: string): void => {
        thinkings.push(t)
      },
      ...overrides,
    },
  }
}

describe('步骤回放与定稿', () => {
  it('deltas 依序触发 onDelta/onThinking；content 缺省由 deltas 汇总', async () => {
    const llm = new ScriptedLlm()
    llm.scriptStep({
      deltas: [
        { kind: 'thinking', text: '想' },
        { kind: 'text', text: '你' },
        { kind: 'text', text: '好' },
      ],
    })
    const r = req()
    const result = await llm.stream(r.base)

    expect(r.thinkings).toEqual(['想'])
    expect(r.deltas).toEqual(['你', '好'])
    expect(result.stopReason).toBe('stop')
    expect(result.content).toEqual([
      { type: 'reasoning', text: '想' },
      { type: 'text', text: '你好' },
    ])
  })

  it('显式 content/stopReason/usage/error 原样透传', async () => {
    const llm = new ScriptedLlm()
    const content: ContentItem[] = [
      { type: 'text', text: '调用工具' },
      { type: 'toolCall', callId: ids.call('cal_x000000000000000000000001'), name: 'read', input: { path: '/a' } },
    ]
    llm.scriptStep({
      content,
      stopReason: 'length',
      usage: { inputTokens: 10, outputTokens: 5 },
    })
    const r = req()
    const result = await llm.stream(r.base)

    expect(result.content).toBe(content)
    expect(result.stopReason).toBe('length')
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
  })

  it('错误步骤：stopReason error + error 描述（错误进结果不抛）', async () => {
    const llm = new ScriptedLlm()
    llm.scriptStep({ stopReason: 'error', error: 'E_LLM_TIMEOUT' })
    const r = req()
    const result = await llm.stream(r.base)
    expect(result.stopReason).toBe('error')
    expect(result.error).toBe('E_LLM_TIMEOUT')
  })

  it('步骤按序消费；calls 记录请求快照', async () => {
    const llm = new ScriptedLlm()
    llm.scriptStep({ deltas: [{ kind: 'text', text: '一' }] })
    llm.scriptStep({ deltas: [{ kind: 'text', text: '二' }] })
    const r = req()
    expect((await llm.stream(r.base)).content).toEqual([{ type: 'text', text: '一' }])
    expect((await llm.stream(r.base)).content).toEqual([{ type: 'text', text: '二' }])

    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[0]?.system).toBe('sys')
    expect(llm.calls[0]?.messages[0]?.content[0]).toEqual({ type: 'text', text: 'hi' })
  })
})

describe('abort 语义（interrupt 级联测试的基座）', () => {
  it('入口已 abort：不消耗步骤，返回空 aborted', async () => {
    const llm = new ScriptedLlm()
    llm.scriptStep({ deltas: [{ kind: 'text', text: 'x' }] })
    const r = req()
    r.controller.abort()

    const result = await llm.stream(r.base)
    expect(result.stopReason).toBe('aborted')
    expect(result.content).toEqual([])
    expect(r.deltas).toEqual([])

    // 步骤未被消耗：下一次调用正常回放
    const r2 = req()
    expect((await llm.stream(r2.base)).content).toEqual([{ type: 'text', text: 'x' }])
  })

  it('挂起期间 abort：已交付前缀定稿为截断 content', async () => {
    const llm = new ScriptedLlm()
    llm.scriptStep({
      deltas: [
        { kind: 'thinking', text: '前' },
        { kind: 'text', text: 'prefix-' },
      ],
      hangMs: 10_000,
    })
    const r = req()
    const p = llm.stream(r.base)
    setTimeout(() => r.controller.abort(), 20)
    const result = await p

    expect(result.stopReason).toBe('aborted')
    expect(result.content).toEqual([
      { type: 'reasoning', text: '前' },
      { type: 'text', text: 'prefix-' },
    ])
  })

  it('挂起自然结束：正常定稿', async () => {
    const llm = new ScriptedLlm()
    const step: ScriptedStep = { deltas: [{ kind: 'text', text: 'ok' }], hangMs: 10 }
    llm.scriptStep(step)
    const r = req()
    const result = await llm.stream(r.base)
    expect(result.stopReason).toBe('stop')
    expect(result.content).toEqual([{ type: 'text', text: 'ok' }])
  })
})

describe('序列耗尽与 generateOnce', () => {
  it('stream 序列耗尽：fail-fast 抛错', async () => {
    const llm = new ScriptedLlm()
    const r = req()
    await expect(llm.stream(r.base)).rejects.toThrow(/E_SCRIPTED_EXHAUSTED/)
  })

  it('generateOnce：按序返回预录应答并记录调用；耗尽抛错', async () => {
    const llm = new ScriptedLlm()
    llm.scriptOnce('摘要 A')
    llm.scriptOnce('摘要 B')

    expect(await llm.generateOnce({ model: MODEL, prompt: '压缩' })).toBe('摘要 A')
    expect(await llm.generateOnce({ model: MODEL, system: 's', prompt: '起标题' })).toBe('摘要 B')
    expect(llm.onceCalls).toEqual([
      { system: undefined, prompt: '压缩' },
      { system: 's', prompt: '起标题' },
    ])
    await expect(llm.generateOnce({ model: MODEL, prompt: '再要' })).rejects.toThrow(
      /E_SCRIPTED_EXHAUSTED/,
    )
  })
})
