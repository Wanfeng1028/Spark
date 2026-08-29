/**
 * 审批回归（工单 7.11 场景集要求：审批）：
 * 缺省 ask 全链路——permission.asked 形状（action/resource）→ reply once → 执行落库；
 * reject → E_PERMISSION fail-closed 零副作用。载体取 memory.save（副作用限临时 root）。
 */
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { fail, makeFixture, pass, waitFor, type EvalScenario } from '../harness.js'

export const approvalScenario: EvalScenario = {
  name: 'approval/default-ask-and-reject',

  async run() {
    const f = makeFixture()
    try {
      // 路径一：缺省 ask → 答复 once → 执行并落记忆库
      f.gateway.scriptStep({
        content: [
          {
            type: 'toolCall',
            callId: ids.call('cal_evalmemsave00000000000'),
            name: 'memory.save',
            input: { content: 'eval-approval-memory' },
          },
        ],
      })
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '已保存' }] })
      const h = await f.engine.createSession()
      await h.send('记住一件事')
      await waitFor(() => f.events.some((e) => e.type === 'permission.asked'), 'permission.asked')
      const asked = f.events.find(
        (e) => e.type === 'permission.asked',
      ) as SparkEventEnvelope<'permission.asked'>
      if (asked.data.action !== 'memory.write') {
        return fail(`asked.action=${asked.data.action}，期望 memory.write`)
      }
      if (asked.data.resource !== 'memory') {
        return fail(`asked.resource=${asked.data.resource}，期望 memory`)
      }
      if ((await f.engine.replyPermission(asked.data.requestId, 'once')) !== 'ok') {
        return fail('replyPermission(once) 未返回 ok')
      }
      await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn.completed')
      const completed = f.events.filter(
        (e): e is SparkEventEnvelope<'tool.completed'> => e.type === 'tool.completed',
      )
      if (completed.length !== 1 || completed[0]?.data.isError === true) {
        return fail('once 后应有且仅有一条非错 tool.completed')
      }
      if (!f.engine.listMemories().some((m) => m.content === 'eval-approval-memory')) {
        return fail('once 后记忆未落库')
      }

      // 路径二：拒绝 → E_PERMISSION 闭合、零副作用
      f.gateway.scriptStep({
        content: [
          {
            type: 'toolCall',
            callId: ids.call('cal_evalmemdeny00000000000'),
            name: 'memory.save',
            input: { content: '不应被保存' },
          },
        ],
      })
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '好的' }] })
      await h.send('再记一件事')
      await waitFor(
        () => f.events.filter((e) => e.type === 'permission.asked').length === 2,
        '第二次 permission.asked',
      )
      const asked2 = f.events.filter((e) => e.type === 'permission.asked')[1] as
        SparkEventEnvelope<'permission.asked'> | undefined
      if (asked2 === undefined) return fail('第二次 permission.asked 缺失')
      if ((await f.engine.replyPermission(asked2.data.requestId, 'reject')) !== 'ok') {
        return fail('replyPermission(reject) 未返回 ok')
      }
      await waitFor(
        () => f.events.filter((e) => e.type === 'turn.completed').length === 2,
        '第二个 turn.completed',
      )
      const denied = f.events
        .filter((e): e is SparkEventEnvelope<'tool.completed'> => e.type === 'tool.completed')
        .at(-1)
      if (denied?.data.isError !== true) return fail('拒绝后 tool.completed 未 isError')
      if ((denied.data.output as { code?: string }).code !== 'E_PERMISSION') {
        return fail('拒绝后错误码非 E_PERMISSION')
      }
      if (f.engine.listMemories().some((m) => m.content === '不应被保存')) {
        return fail('拒绝后记忆仍被保存（副作用泄漏）')
      }
      return pass('缺省 ask 形状正确，once 后执行落库', 'reject → E_PERMISSION 闭合、零副作用')
    } finally {
      await f.cleanup()
    }
  },
}
