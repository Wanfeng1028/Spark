/**
 * 会话模式（工单 16.3 /plan 计划模式）——引擎侧单测。
 *
 * 设计口径：**mode 与 plan 档是同一件事的两个面**（mode = 可见/可回放的 durable 状态，
 * plan 档 = 审批规则引擎的 enforcement 层 + 系统提示的 PLAN_MODE_DIRECTIVE）。
 * 所以这里钉住三件事：
 * ① 切模式 emit **durable** 事件 `session.mode.changed`（有 seq → 进回放，冷启动可重建）；
 * ② 幂等（重复切不产生噪声行）；
 * ③ 退出恢复进入前的档位（prePlanMode），且"直接设 plan 档"与"setSessionMode('plan')"
 *    走同一条出口（两个入口不分叉，否则事件会漏发）。
 * 规则 enforcement（写类全拒 / 只读放行 / 模式转换走审批）在 permission.test.ts。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { SparkEventEnvelope } from '@spark/protocol'
import { Engine } from '../src/engine.js'
import type { EngineConfig } from '../src/config.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

const roots: string[] = []
const engines: Engine[] = []

afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.shutdown()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function makeConfig(): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 8,
        maxToolParallel: 4,
        toolTimeoutMs: 30_000,
        permissionTimeoutMs: 5_000,
        progressThrottleMs: 200,
        toolOutputLimitKB: 32,
        compactionThreshold: 0.8,
        checkpoints: false,
        bashSandbox: 'off',
      },
    },
    models: {
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      fallbacks: [],
      titleModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      subagentModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      costLimitUsd: undefined,
      defaultEffort: undefined,
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
    },
    permissions: { version: 1, rules: [] },
  }
}

async function makeEngine(): Promise<{ engine: Engine; events: SparkEventEnvelope[] }> {
  const root = mkdtempSync(join(tmpdir(), 'spark-session-mode-'))
  roots.push(root)
  const gateway = new ScriptedLlm()
  gateway.scriptOnce('标题') // 自动标题后台任务（shutdown 会等它，预录免得出错）
  const engine = new Engine({ root, gateway, config: makeConfig() })
  engines.push(engine)
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    events.push(e)
  })
  await engine.ready()
  return { engine, events }
}

function modeEvents(events: readonly SparkEventEnvelope[]): readonly SparkEventEnvelope[] {
  return events.filter((e) => e.type === 'session.mode.changed')
}

describe('会话模式（工单 16.3）', () => {
  test('进入 plan：emit durable 事件 + 档位同步为 plan（单一 enforcement 路径）', async () => {
    const { engine, events } = await makeEngine()
    const handle = await engine.createSession({ title: '计划会话' })

    await engine.setSessionMode(handle.id, 'plan')

    expect(engine.sessionModeOf(handle.id)).toBe('plan')
    expect(engine.permissionPresetOf(handle.id)).toBe('plan') // mode 就是档位，不存第二份状态
    const emitted = modeEvents(events)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.data).toEqual({ mode: 'plan', previous: 'default' })
    expect(emitted[0]?.seq).toBeDefined() // 有 seq = durable，回放可重建模式
  })

  test('幂等：重复进 plan 不再发事件（重复点击/回放不产生噪声行）', async () => {
    const { engine, events } = await makeEngine()
    const handle = await engine.createSession()

    await engine.setSessionMode(handle.id, 'plan')
    await engine.setSessionMode(handle.id, 'plan')

    expect(modeEvents(events)).toHaveLength(1)
  })

  test('退出 plan：恢复进入前的档位（prePlanMode）并 emit 回 default', async () => {
    const { engine, events } = await makeEngine()
    const handle = await engine.createSession()
    await engine.setPermissionPreset(handle.id, 'auto-edit') // 进 plan 前的档位

    await engine.setSessionMode(handle.id, 'plan')
    await engine.setSessionMode(handle.id, 'default')

    expect(engine.permissionPresetOf(handle.id)).toBe('auto-edit')
    expect(engine.sessionModeOf(handle.id)).toBe('default')
    expect(modeEvents(events).map((e) => e.data)).toEqual([
      { mode: 'plan', previous: 'default' },
      { mode: 'default', previous: 'plan' },
    ])
  })

  test('直接设 plan 档也发事件（档位与模式两个入口不分叉，否则事件会漏发）', async () => {
    const { engine, events } = await makeEngine()
    const handle = await engine.createSession()

    await engine.setPermissionPreset(handle.id, 'plan')

    expect(engine.sessionModeOf(handle.id)).toBe('plan')
    expect(modeEvents(events)).toHaveLength(1)
  })

  test('非 plan 档之间切换不发模式事件（模式只有两态，档位有四档）', async () => {
    const { engine, events } = await makeEngine()
    const handle = await engine.createSession()

    await engine.setPermissionPreset(handle.id, 'auto-edit')
    await engine.setPermissionPreset(handle.id, 'full-access')

    expect(engine.sessionModeOf(handle.id)).toBe('default')
    expect(modeEvents(events)).toHaveLength(0)
  })
})
