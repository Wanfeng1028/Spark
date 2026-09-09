/**
 * exit_plan_mode 工具与 /plan 命令（工单 16.3 第二批）。
 *
 * 覆盖 new-tool 的四路径中适用于本工具的三条：
 * - **成功**：计划模式下模型提交计划 → 审批放行 → 模式回 default（+ tool.completed 非 error）；
 * - **审批拒绝**：reject → 留在计划模式（isError，模型收到拒绝文案后可改计划重试）；
 * - **业务失败**：不在计划模式却调用 → E_NOT_IN_PLAN（如实报错，不静默成功）；
 * - 中断路径不适用：本工具无可中断的长任务（只切一次模式），管线的通用 abort 补事件对
 *   已由既有 pipeline 测试覆盖——不为凑四路径写一个假的中断用例。
 * 另附：未注入钩子时的 E_UNSUPPORTED（禁假实现）、`/plan` 与 `/plan exit` 命令路径。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { RequestId, SparkEventEnvelope } from '@spark/protocol'
import { Engine } from '../src/engine.js'
import type { EngineConfig } from '../src/config.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import { exitPlanModeTool } from '../src/tools/builtin/exit-plan-mode.js'
import type { ToolContext } from '../src/tools/definition.js'

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

async function makeEngine(): Promise<{ engine: Engine; gateway: ScriptedLlm; events: SparkEventEnvelope[] }> {
  const root = mkdtempSync(join(tmpdir(), 'spark-exit-plan-'))
  roots.push(root)
  const gateway = new ScriptedLlm()
  gateway.scriptOnce('标题')
  const engine = new Engine({ root, gateway, config: makeConfig() })
  engines.push(engine)
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    events.push(e)
  })
  await engine.ready()
  return { engine, gateway, events }
}

async function waitFor(what: string, predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (predicate()) return
    if (Date.now() > deadline) throw new Error(`等待超时：${what}`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

/** 取第一条 permission.asked 的 requestId（审批应答用） */
function askedRequestId(events: readonly SparkEventEnvelope[]): RequestId {
  const asked = events.find((e) => e.type === 'permission.asked')
  if (asked === undefined) throw new Error('未出现 permission.asked')
  return (asked.data as { requestId: RequestId }).requestId
}

function makeCtx(over: Partial<ToolContext>): ToolContext {
  return {
    sessionId: ids.session('ses_exitplan000000000001'),
    turnId: ids.turn('trn_exitplan000000000001'),
    callId: ids.call('cal_exitplan000000000001'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd: process.cwd(),
    ...over,
  }
}

describe('exit_plan_mode 工具（单元面）', () => {
  test('未注入钩子 → E_UNSUPPORTED（禁假实现：不假装已切模式）', async () => {
    const out = await exitPlanModeTool.execute(makeCtx({}), { plan: '步骤一' })
    expect(out.isError).toBe(true)
    expect(JSON.stringify(out.output)).toContain('E_UNSUPPORTED')
  })

  test('注入钩子 → 调用钩子并回计划原文（供审批卡与 transcript 呈现）', async () => {
    let called = 0
    const out = await exitPlanModeTool.execute(
      makeCtx({
        // 不用 async：桩里没 await（写了会触发 require-await）
        exitPlanMode: () => {
          called += 1
          return Promise.resolve()
        },
      }),
      { plan: '步骤一：读配置' },
    )
    expect(called).toBe(1)
    expect(out.isError).toBe(false)
    expect(out.output).toEqual({ ok: true, plan: '步骤一：读配置' })
  })

  test('permission 映射：action=plan.exit（plan 档预置 ask，模型不能自批）', () => {
    expect(exitPlanModeTool.permission.action).toBe('plan.exit')
    expect(exitPlanModeTool.permission.resourceOf({ plan: 'x' }, { cwd: '/repo' })).toBe('plan')
    expect(exitPlanModeTool.parallelizable).toBe(false) // 有副作用 → 串行
  })
})

describe('/plan 命令与退出审批链（引擎面）', () => {
  test('/plan 进入、/plan exit 退出并恢复原档位', async () => {
    const { engine } = await makeEngine()
    const handle = await engine.createSession()
    await engine.setPermissionPreset(handle.id, 'auto-edit')

    await engine.executeCommand(handle.id, 'plan')
    expect(engine.sessionModeOf(handle.id)).toBe('plan')

    await engine.executeCommand(handle.id, 'plan', 'exit')
    expect(engine.sessionModeOf(handle.id)).toBe('default')
    expect(engine.permissionPresetOf(handle.id)).toBe('auto-edit')
  })

  test('成功路径：计划模式下提交计划 → 审批放行 → 回 default', async () => {
    const { engine, gateway, events } = await makeEngine()
    gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_exitplanok0000000001'),
          name: 'exit_plan_mode',
          input: { plan: '步骤一：读；步骤二：改；验证：跑测试' },
        },
      ],
    })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '计划已批准，开始执行' }] })
    const handle = await engine.createSession()
    await engine.setSessionMode(handle.id, 'plan')

    await handle.send('出个计划')
    await waitFor('permission.asked', () => events.some((e) => e.type === 'permission.asked'))
    // 审批面确实带 plan.exit（而不是别的 action 蒙混过关）
    const asked = events.find((e) => e.type === 'permission.asked')
    expect(JSON.stringify(asked?.data)).toContain('plan.exit')

    await engine.replyPermission(askedRequestId(events), 'once')
    await waitFor('turn.completed', () => events.some((e) => e.type === 'turn.completed'))

    expect(engine.sessionModeOf(handle.id)).toBe('default')
    const completed = events.filter((e) => e.type === 'tool.completed').at(-1)
    expect((completed?.data as { isError?: boolean }).isError).toBe(false)
  })

  test('审批拒绝：留在计划模式（模型可改计划重试）', async () => {
    const { engine, gateway, events } = await makeEngine()
    gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_exitplanno0000000001'),
          name: 'exit_plan_mode',
          input: { plan: '太粗的计划' },
        },
      ],
    })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '收到，我细化计划' }] })
    const handle = await engine.createSession()
    await engine.setSessionMode(handle.id, 'plan')

    await handle.send('出个计划')
    await waitFor('permission.asked', () => events.some((e) => e.type === 'permission.asked'))
    await engine.replyPermission(askedRequestId(events), 'reject', '计划不够细')
    await waitFor('turn.completed', () => events.some((e) => e.type === 'turn.completed'))

    expect(engine.sessionModeOf(handle.id)).toBe('plan') // 未批准 = 不退出（fail-closed）
    const completed = events.filter((e) => e.type === 'tool.completed').at(-1)
    expect((completed?.data as { isError?: boolean }).isError).toBe(true)
  })

  test('业务失败：不在计划模式却调用 → E_NOT_IN_PLAN（不静默成功）', async () => {
    const { engine, gateway, events } = await makeEngine()
    // 非计划模式下工具不在广告面（hiddenTools getter），但模型仍可能"幻觉"调用——
    // 权限门此时是缺省 ask，用户放行后由钩子如实报错，不假装切了模式
    gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_exitplanbad000000001'),
          name: 'exit_plan_mode',
          input: { plan: '并不在计划模式' },
        },
      ],
    })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '好' }] })
    const handle = await engine.createSession()

    await handle.send('退出计划')
    await waitFor('permission.asked', () => events.some((e) => e.type === 'permission.asked'))
    await engine.replyPermission(askedRequestId(events), 'once')
    await waitFor('turn.completed', () => events.some((e) => e.type === 'turn.completed'))

    expect(engine.sessionModeOf(handle.id)).toBe('default')
    const completed = events.filter((e) => e.type === 'tool.completed').at(-1)
    expect((completed?.data as { isError?: boolean }).isError).toBe(true)
    expect(JSON.stringify(completed?.data)).toContain('E_NOT_IN_PLAN')
  })
})
