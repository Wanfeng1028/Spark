/**
 * 判分函数确定性冒烟（工单 13.1 第三批 / doc/08 §13.1 验收第 1 条）：ScriptedLlm 驱动同一份
 * taskDefs——无 key、无网络，随 core 套件在 CI 恒跑。每场景两次判分：
 * ① 未修状态 judge 必须 fail（判分函数不能恒 pass）；
 * ② 预录终态工具调用走完整引擎链路（run-loop → 工具管线 → 权限规则 → 事件流）后 judge 必须 pass。
 * 两向都成立才说明"场景装配 + 判分"本身是确定的；真实模型下的通过率另由 --suite tasks 度量。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SparkEventEnvelope } from '@spark/protocol'
import { Engine } from '@spark/engine'
import { ScriptedLlm } from '@spark/engine/internal'
import { fail, findEvent, makeConfig, pass, waitFor, type EvalOutcome, type EvalScenario } from '../harness.js'
import { makeFixtureRepo } from './fixtures.js'
import { collectAnswerText, fixtureRules, taskDefs, type TaskDef } from './defs.js'

async function runSmoke(def: TaskDef): Promise<EvalOutcome> {
  const repo = makeFixtureRepo('spark-eval-smoke-')
  const dataRoot = mkdtempSync(join(tmpdir(), 'spark-eval-smoke-data-'))
  let engine: Engine | undefined
  try {
    def.seed(repo)
    // ① 未修状态必须判 fail——判分函数过宽（恒 pass）在此暴露
    const before = def.judge(repo, '')
    if (before.status !== 'fail') {
      return fail(`${def.name}：未修状态判分为 ${before.status}（判分函数过宽）`)
    }

    const gateway = new ScriptedLlm()
    for (const step of def.scripted()) gateway.scriptStep(step)
    const config = makeConfig()
    config.permissions = { version: 1, rules: fixtureRules() }
    engine = new Engine({ root: dataRoot, gateway, config })
    const events: SparkEventEnvelope[] = []
    engine.subscribe((e) => {
      events.push(e)
    })
    await engine.ready()

    const h = await engine.createSession({ cwd: repo.root })
    await h.send(def.prompt)
    await waitFor(
      () => events.some((e) => e.type === 'turn.completed'),
      `turn.completed（冒烟 ${def.name}）`,
      20_000,
    )
    const completed = findEvent(events, 'turn.completed')
    if (completed?.data.finish !== 'stop') {
      return fail(`${def.name}：预录链路未正常收尾（finish=${completed?.data.finish ?? '未知'}）`)
    }

    // ② 预录终态经真实工具管线落盘后必须判 pass
    const after = def.judge(repo, collectAnswerText(events))
    if (after.status !== 'pass') {
      return fail(`${def.name}：预录终态后判分未通过——${after.notes.join('；')}`)
    }
    return pass('未修→fail、预录终态→pass（判分双向确定）')
  } catch (err) {
    return fail(`${def.name}：冒烟异常——${String(err)}`)
  } finally {
    if (engine !== undefined) {
      try {
        await engine.shutdown()
      } catch {
        // 已失败的引擎关闭异常不影响结论
      }
    }
    for (const dir of [repo.root, dataRoot]) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // 句柄未释放的目录跳过清理（交系统临时目录回收）
      }
    }
  }
}

export const taskSmokeScenarios: EvalScenario[] = taskDefs.map((def) => ({
  name: `task-smoke/${def.name.slice('task/'.length)}`,
  run: () => runSmoke(def),
}))
