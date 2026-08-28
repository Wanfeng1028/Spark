/**
 * 中断回归（工单 7.11 场景集要求：中断）：
 * LLM 挂起途中 interrupt → turn.completed finish='aborted'，已交付前缀定稿落盘
 * （dsh 截断定稿语义），失败闭合不悬空。
 */
import type { SparkEventEnvelope } from '@spark/protocol'
import { fail, makeFixture, pass, waitFor, type EvalScenario } from '../harness.js'

export const interruptScenario: EvalScenario = {
  name: 'interrupt/mid-stream-abort',

  async run() {
    const f = makeFixture()
    try {
      f.gateway.scriptStep({
        deltas: [{ kind: 'text', text: '已交付前缀' }],
        hangMs: 5000,
      })
      const h = await f.engine.createSession()
      void h.send('长任务')
      await waitFor(() => f.events.some((e) => e.type === 'turn.started'), 'turn.started')
      // deltas 在 stream 入口同步回放，短驻留确保前缀已交付再中断
      await new Promise((r) => setTimeout(r, 100))
      await h.interrupt()
      await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn.completed')

      const completed = f.events.find((e) => e.type === 'turn.completed') as
        SparkEventEnvelope<'turn.completed'> | undefined
      if (completed === undefined) return fail('缺 turn.completed（失败闭合被破坏）')
      if (completed.data.finish !== 'aborted') {
        return fail(`finish=${String(completed.data.finish)}，期望 aborted`)
      }
      const msg = f.events.find((e) => e.type === 'assistant.message') as
        SparkEventEnvelope<'assistant.message'> | undefined
      const text = msg?.data.content.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? ''
      if (text !== '已交付前缀') {
        return fail(`中断定稿内容=${JSON.stringify(text)}，期望已交付前缀（dsh 截断定稿）`)
      }
      return pass('挂起途中 interrupt → finish=aborted', '已交付前缀定稿落盘，事件流闭合')
    } finally {
      await f.cleanup()
    }
  },
}
