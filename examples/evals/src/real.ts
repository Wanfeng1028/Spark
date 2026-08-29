/**
 * 可选真实模型评分（--real，工单 7.11「可选真实模型评分」）：
 * 模型配置走用户 ~/.spark（loadConfig 缺省目录），会话落临时 root 不污染真实数据。
 * 密钥经环境变量注入（secrets 仓绑 ~/.spark root，eval 不启用——本地真评请配 env）。
 * Fail-soft：配置/凭据/传输类问题 → skip（不计红灯）；仅应答内容错 → fail。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SparkEventEnvelope } from '@spark/protocol'
import { Engine, loadConfig } from '@spark/engine'
import {
  fail,
  findEvent,
  pass,
  skip,
  waitFor,
  type EvalOutcome,
  type EvalScenario,
} from './harness.js'

async function withRealEngine(
  run: (engine: Engine, events: SparkEventEnvelope[]) => Promise<EvalOutcome>,
): Promise<EvalOutcome> {
  const root = mkdtempSync(join(tmpdir(), 'spark-eval-real-'))
  let engine: Engine | undefined
  try {
    engine = new Engine({ root, config: loadConfig() })
    const events: SparkEventEnvelope[] = []
    engine.subscribe((e) => {
      events.push(e)
    })
    await engine.ready()
    return await run(engine, events)
  } catch (err) {
    return skip(`真实模型环境不可用：${String(err)}`)
  } finally {
    if (engine !== undefined) {
      try {
        await engine.shutdown()
      } catch {
        // 已失败的引擎关闭异常不影响结论
      }
    }
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      // 句柄未释放的目录跳过清理（交系统临时目录回收）
    }
  }
}

export const realScenarios: EvalScenario[] = [
  {
    name: 'real/basic-qa',

    run: () =>
      withRealEngine(async (engine, events) => {
        const h = await engine.createSession()
        await h.send('用一句中文回答：2+2 等于几？')
        await waitFor(
          () => events.some((e) => e.type === 'turn.completed'),
          'turn.completed（真实模型）',
          60_000,
        )
        const completed = findEvent(events, 'turn.completed')
        if (completed?.data.finish === 'error') {
          return skip('provider 错误（turn finish=error）——不计 eval 红灯')
        }
        const msg = findEvent(events, 'assistant.message')
        const text = msg?.data.content.map((c) => (c.type === 'text' ? c.text : '')).join('') ?? ''
        if (!text.includes('4')) {
          return fail(`应答内容错（未含 4）：${text.slice(0, 120)}`)
        }
        return pass('2+2 → 应答含 4')
      }),
  },
]
