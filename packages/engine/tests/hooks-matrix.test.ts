/**
 * CK-2 批 1 挂点矩阵单测：
 * A. fireBlocking 裁决语义（exit 2 deny + stderr 首行 reason / exit 0 与异常不拦截 /
 *    超时不拦截——防 hung hook DoS / skill 触发器跳过 / 先到先裁短路）。
 * B. Engine 端到端：pre_tool_use 拒绝闭合（E_HOOK_BLOCKED、不进审批门）与
 *    user_prompt_submit / stop / post_tool_use / post_tool_use_failure / session.start
 *    标记触发（appendCmd 写 HOOK_OUT）。
 * pre/post_compact 的端到端触发需要真实水位越阈（ScriptedLlm 造大 usage 不经济）——
 * 发射点为 run-loop 直调（代码路径唯一），登记留用户走查。
 */
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope, type SparkEventType } from '@spark/protocol'
import { Engine } from '../src/engine.js'
import { EventBus, type EventSink } from '../src/bus.js'
import { UserHookRunner } from '../src/hooks/runner.js'
import type { UserHooksConfig } from '../src/hooks/runner.js'
import type { EngineConfig } from '../src/config.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

// ---------- A. fireBlocking 裁决语义 ----------

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

const SILENT = { warn() {} }

function makeRunner(defs: UserHooksConfig): UserHookRunner {
  return new UserHookRunner(defs, {
    bus: new EventBus({ sink: new MemSink() }),
    logger: SILENT,
    skills: () => [],
    defaultTimeoutMs: 3000,
  })
}

const SID = ids.session('ses_hookmatrix0000000000000')

/** 信封谓词（permission.test 同款）：SparkEventEnvelope 缺省实例化 data 为全集，
 * 唯有经 K 泛型谓词才能把 data 收窄到具体事件载荷 */
function isEvent<K extends SparkEventType>(
  e: SparkEventEnvelope,
  type: K,
): e is SparkEventEnvelope<K> {
  return e.type === type
}

function payload() {
  return { sessionId: SID, cwd: process.cwd(), sourceEventId: null, data: {} }
}

/** node -e 退出码 + stderr 一行（引号在 shell:true 下由 cmd/bash 兼容的单层双引号包裹） */
const exitWith = (code: number, stderr = ''): string =>
  `node -e "process.stderr.write(${JSON.stringify(stderr)});process.exit(${code})"`

const sleepMs = (ms: number): string => `node -e "setTimeout(()=>{},${ms})"`

describe('fireBlocking（CK-2 批 1：pre_tool_use 裁决）', () => {
  test('exit 2 → 拦截，stderr 首行为 reason', async () => {
    const r = makeRunner({ pre_tool_use: [{ command: exitWith(2, '禁止 rm\n第二行') }] })
    const v = await r.fireBlocking('pre_tool_use', payload())
    expect(v.blocked).toBe(true)
    expect(v.reason).toBe('禁止 rm')
  })

  test('exit 0 → 不拦截；exit 1 → warn 不拦截', async () => {
    const r = makeRunner({ pre_tool_use: [{ command: exitWith(0) }] })
    expect((await r.fireBlocking('pre_tool_use', payload())).blocked).toBe(false)
    const r2 = makeRunner({ pre_tool_use: [{ command: exitWith(1) }] })
    expect((await r2.fireBlocking('pre_tool_use', payload())).blocked).toBe(false)
  })

  test('超时 → 不拦截（防 hung hook 变相 DoS 拒绝所有工具）', async () => {
    const r = makeRunner({ pre_tool_use: [{ command: sleepMs(5000), timeoutMs: 80 }] })
    const v = await r.fireBlocking('pre_tool_use', payload())
    expect(v.blocked).toBe(false)
  }, 10_000)

  test('skill 触发器在阻塞点跳过（无裁决语义）；先到先裁短路', async () => {
    const r = makeRunner({
      pre_tool_use: [{ skill: 'demo', emit: 'demo.x' }],
    })
    expect((await r.fireBlocking('pre_tool_use', payload())).blocked).toBe(false)

    const r2 = makeRunner({
      pre_tool_use: [{ command: exitWith(0) }, { command: exitWith(2, 'second blocks') }],
    })
    expect((await r2.fireBlocking('pre_tool_use', payload())).blocked).toBe(true)
  })

  test('未注册挂点 → 不拦截； disposed 后不拦截', async () => {
    const r = makeRunner({})
    expect((await r.fireBlocking('pre_tool_use', payload())).blocked).toBe(false)
    const r2 = makeRunner({ pre_tool_use: [{ command: exitWith(2, 'x') }] })
    r2.dispose()
    expect((await r2.fireBlocking('pre_tool_use', payload())).blocked).toBe(false)
  })
})

// ---------- B. Engine 端到端 ----------

const dirs: string[] = []
let hookEngines: { engine: Engine }[] = []

afterEach(async () => {
  for (const e of hookEngines) await e.engine.shutdown()
  hookEngines = []
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  delete process.env.HOOK_OUT
})

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-hookmatrix-'))
  dirs.push(d)
  return d
}

function appendCmd(marker: string): string {
  return `node -e "require('fs').appendFileSync(process.env.HOOK_OUT,'${marker}\\n')"`
}

function makeConfig(hooks: UserHooksConfig, permissions: EngineConfig['permissions']): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 40,
        maxToolParallel: 8,
        toolTimeoutMs: 120_000,
        permissionTimeoutMs: 300_000,
        progressThrottleMs: 200,
        toolOutputLimitKB: 32,
        compactionThreshold: 0.8,
        checkpoints: false,
        bashSandbox: 'off',
        computerUseEnabled: false,
        bashPersistent: false,
      },
      hooks,
    },
    models: {
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      fallbacks: [],
      titleModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      subagentModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      costLimitUsd: undefined,
      costLimitTokens: undefined,
      defaultEffort: undefined,
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
    },
    permissions,
  }
}

function hookLog(): string {
  const path = process.env.HOOK_OUT
  return path !== undefined && existsSync(path) ? readFileSync(path, 'utf8') : ''
}

async function waitFor(pred: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 8000
  for (;;) {
    if (await pred()) return
    if (Date.now() > deadline) throw new Error(`等待 ${what} 超时（hook log=${hookLog()}）`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('Engine 端到端（CK-2 批 1 新挂点）', () => {
  test('pre_tool_use exit 2 → bash 以 E_HOOK_BLOCKED 闭合，不进审批门（无 permission.asked）', async () => {
    process.env.HOOK_OUT = join(tempDir(), 'deny.log')
    const root = tempDir()
    const gateway = new ScriptedLlm()
    gateway.scriptStep({
      content: [{ type: 'toolCall', callId: ids.call('cal_denytest0000000000000001'), name: 'bash', input: { command: 'echo hi' } }],
    })
    gateway.scriptStep({
      content: [{ type: 'text', text: 'hook 拒了就收手' }],
    })
    const engine = new Engine({
      root,
      gateway,
      config: makeConfig(
        { pre_tool_use: [{ command: exitWith(2, '本会话禁用 bash') }] },
        { version: 1, rules: [] },
      ),
    })
    hookEngines.push({ engine })
    const handle = await engine.createSession({})
    await handle.send('跑一下 echo', 'now')
    await waitFor(
      () =>
        engine
          .getSession(handle.id)
          ?.events()
          .some((e) => e.type === 'turn.completed') === true,
      'turn.completed',
    )
    const events = engine.getSession(handle.id)?.events() ?? []
    const completed = events.find((e): e is SparkEventEnvelope<'tool.completed'> =>
      isEvent(e, 'tool.completed'),
    )
    if (completed === undefined) {
      throw new Error('tool.completed 缺失')
    }
    expect((completed.data.output as { code?: string }).code).toBe('E_HOOK_BLOCKED')
    expect(completed.data.isError).toBe(true)
    expect(events.some((e) => e.type === 'permission.asked')).toBe(false)
  })

  test('放行路径：session.start / user_prompt_submit / post_tool_use(_failure) / stop 标记齐发', async () => {
    process.env.HOOK_OUT = join(tempDir(), 'markers.log')
    const root = tempDir()
    const gateway = new ScriptedLlm()
    const cal1 = ids.call('cal_hookok0000000000000000001')
    const cal2 = ids.call('cal_hookok0000000000000000002')
    // turn1：bash 成功（post_tool_use）；turn2：bash 失败（post_tool_use_failure）；
    // turn3：纯文本收尾（stop）
    gateway.scriptStep({
      content: [{ type: 'toolCall', callId: cal1, name: 'bash', input: { command: 'echo ok' } }],
    })
    gateway.scriptStep({ content: [{ type: 'text', text: '第一轮完成' }] })
    gateway.scriptStep({
      content: [{ type: 'toolCall', callId: cal2, name: 'bash', input: { command: 'exit 3' } }],
    })
    gateway.scriptStep({ content: [{ type: 'text', text: '第二轮完成' }] })
    gateway.scriptStep({ content: [{ type: 'text', text: '收尾' }] })
    const engine = new Engine({
      root,
      gateway,
      config: makeConfig(
        {
          'session.start': [{ command: appendCmd('session.start') }],
          'user_prompt_submit': [{ command: appendCmd('user_prompt_submit') }],
          'post_tool_use': [{ command: appendCmd('post_tool_use') }],
          'post_tool_use_failure': [{ command: appendCmd('post_tool_use_failure') }],
          'stop': [{ command: appendCmd('stop') }],
        },
        { version: 1, rules: [] },
      ),
    })
    hookEngines.push({ engine })
    const handle = await engine.createSession({})
    const replyPendingAsk = async (): Promise<void> => {
      const asked = [...(engine.getSession(handle.id)?.events() ?? [])]
        .reverse()
        .find((e): e is SparkEventEnvelope<'permission.asked'> => isEvent(e, 'permission.asked'))
      if (asked === undefined) return
      const resolved = engine
        .getSession(handle.id)
        ?.events()
        .some(
          (e) =>
            e.type === 'permission.resolved' &&
            (e.data as { requestId: string }).requestId === asked.data.requestId,
        )
      if (resolved !== true) await engine.replyPermission(asked.data.requestId, 'once')
    }
    // turn1：bash ask → 放行
    await handle.send('跑 echo', 'now')
    await waitFor(async () => {
      await replyPendingAsk()
      return (
        engine
          .getSession(handle.id)
          ?.events()
          .filter((e) => e.type === 'turn.completed').length === 1
      )
    }, 'turn1 completed')
    // turn2：bash exit 3 → post_tool_use_failure
    await handle.send('跑 exit 3', 'now')
    await waitFor(async () => {
      await replyPendingAsk()
      return (
        engine
          .getSession(handle.id)
          ?.events()
          .filter((e) => e.type === 'turn.completed').length === 2
      )
    }, 'turn2 completed')
    // turn3：纯文本收尾 → stop
    await handle.send('收尾', 'now')
    await waitFor(
      () =>
        engine
          .getSession(handle.id)
          ?.events()
          .filter((e) => e.type === 'turn.completed').length === 3,
      'turn3 completed',
    )
    await waitFor(() => {
      // stop 是 finally 里的 fire-and-forget——给子进程一点落地时间
      const log = hookLog()
      return (
        log.includes('session.start') &&
        log.includes('user_prompt_submit') &&
        log.includes('post_tool_use\n') &&
        log.includes('post_tool_use_failure') &&
        log.includes('stop')
      )
    }, '全部标记落盘')
    expect(hookLog().split('user_prompt_submit').length - 1).toBe(3)
  })
})
