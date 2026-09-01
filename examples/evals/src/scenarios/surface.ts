/**
 * 基线回归：单工具 turn 的事件流纪律——durable seq 单调、started/completed 配对、
 * turn 时序（started→tool→assistant→completed）、工具输出真实回传。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { fail, makeFixture, pass, waitFor, type EvalScenario } from '../harness.js'

export const surfaceScenario: EvalScenario = {
  name: 'surface/tool-pair-and-seq',

  async run() {
    const f = makeFixture({
      rules: [{ action: 'fs.read', resource: 'file:**', effect: 'allow' }],
    })
    try {
      const target = join(f.root, 'eval-surface.txt')
      writeFileSync(target, '表面纪律探针内容\n')
      f.gateway.scriptStep({
        content: [
          {
            type: 'toolCall',
            callId: ids.call('cal_evalread0000000000000'),
            name: 'read',
            input: { path: target },
          },
        ],
      })
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '读完了' }] })
      // 会话 cwd = 夹具根（工单 10.31）：read 的路径硬边界以会话 cwd 为允许根——
      // 夹具在 tmpdir 而会话用缺省 cwd（examples/evals）时探针文件必然被 E_PATH_OUTSIDE 拒读
      const h = await f.engine.createSession({ cwd: f.root })
      await h.send('读文件')
      await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn.completed')

      // durable seq 单调（live 事件无 seq，不参与）
      const seqs = f.events.map((e) => e.seq).filter((s): s is number => s !== undefined)
      if (!seqs.every((v, i) => i === 0 || v > (seqs[i - 1] ?? 0))) {
        return fail(`durable seq 非单调：${seqs.join(',')}`)
      }
      // started/completed 按 callId 严格配对
      const started = f.events.filter((e) => e.type === 'tool.started')
      const completed = f.events.filter((e) => e.type === 'tool.completed')
      if (started.length !== 1 || completed.length !== 1) {
        return fail(`工具事件数错（started=${started.length} completed=${completed.length}）`)
      }
      const startedData = started[0]?.data as { callId: string }
      const completedData = completed[0] as SparkEventEnvelope<'tool.completed'> | undefined
      if (completedData?.data.callId !== startedData.callId) {
        return fail('started/completed callId 不配对')
      }
      if (completedData.data.isError === true) {
        return fail(`read 工具出错：${JSON.stringify(completedData.data.output)}`)
      }
      if (!JSON.stringify(completedData.data.output).includes('表面纪律探针内容')) {
        return fail('工具输出未回传文件内容')
      }
      // turn 时序：started → assistant.message → completed
      const types = f.events.map((e) => e.type)
      const ti = types.indexOf('turn.started')
      const ai = types.indexOf('assistant.message')
      const ci = types.indexOf('turn.completed')
      if (ti === -1 || ai === -1 || ci === -1 || !(ti < ai && ai < ci)) {
        return fail(
          `turn 时序错（turn.started=${ti} assistant.message=${ai} turn.completed=${ci}）`,
        )
      }
      return pass('durable seq 单调', 'started/completed 配对且输出真实', 'turn 时序正确')
    } finally {
      await f.cleanup()
    }
  },
}
