/**
 * 压缩回归（工单 7.11 场景集要求：压缩）：
 * 手动 /compact——compaction.started→completed 时序、摘要落事件、压缩提示词形状
 * （COMPACTION_PROMPT + 转录）、压缩后下一 turn 模型上下文首条 = 摘要（重投影）。
 */
import type { SparkEventEnvelope } from '@spark/protocol'
import { COMPACTION_PROMPT } from '@spark/engine'
import { fail, makeFixture, pass, waitFor, type EvalScenario } from '../harness.js'

export const compactionScenario: EvalScenario = {
  name: 'compaction/manual-compact-reprojection',

  async run() {
    const f = makeFixture()
    try {
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '第一轮答复' }] })
      const h = await f.engine.createSession()
      await h.send('讨论内容')
      await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn.completed')

      f.gateway.scriptOnce('eval-压缩摘要')
      await h.compact()
      const types = f.events.map((e) => e.type)
      const si = types.indexOf('compaction.started')
      const ci = types.indexOf('compaction.completed')
      if (si === -1 || ci === -1 || si > ci) {
        return fail(`压缩事件时序错（started=${si} completed=${ci}）`)
      }
      const completed = f.events.find((e) => e.type === 'compaction.completed') as
        SparkEventEnvelope<'compaction.completed'> | undefined
      if (completed?.data.summary !== 'eval-压缩摘要') {
        return fail(`摘要未落事件：${JSON.stringify(completed?.data)}`)
      }
      const once = f.gateway.onceCalls[0]
      if (once === undefined || !once.prompt.startsWith(COMPACTION_PROMPT)) {
        return fail('压缩提示词形状错（未经 COMPACTION_PROMPT 起手）')
      }
      if (!once.prompt.includes('讨论内容')) return fail('转录未进压缩提示词')

      // 压缩后重投影：下一 turn 模型上下文首条消息 = 摘要
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '续答' }] })
      await h.send('继续')
      await waitFor(
        () => f.events.filter((e) => e.type === 'turn.completed').length === 2,
        '第二个 turn.completed',
      )
      const first = f.gateway.calls.at(-1)?.messages[0]
      const firstText = first?.content.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? ''
      if (firstText !== 'eval-压缩摘要') {
        return fail(`压缩后上下文首条=${JSON.stringify(firstText)}，期望摘要`)
      }
      return pass(
        'started→completed 时序与摘要落事件',
        '压缩提示词形状正确',
        '下一 turn 上下文首条 = 摘要',
      )
    } finally {
      await f.cleanup()
    }
  },
}
