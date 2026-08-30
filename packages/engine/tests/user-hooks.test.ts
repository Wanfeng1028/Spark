/**
 * 用户侧 hooks 单测（阶段七工单 7.3 / H03 / doc/02 §8.6）：
 * - UserHookRunner：command 触发（stdin 收完整 JSON 载荷）/ 超时 warn /
 *   skill 触发（emitExtended 落盘 + 广播，data 形状同 ADR D18）/
 *   skill 未加载与 emit 未声明 warn 闭合；
 * - Engine 端到端：spark.json hooks 四挂点真实触发（turn.before/after +
 *   tool.completed（未知工具 E_NOT_FOUND 路径）+ permission.resolved（bash
 *   审批 once 答复）），触发次数闭合（fire-and-forget 下子进程 append 的
 *   文件级先后顺序取决于 OS 调度，不作顺序断言——CI run 33291296064 曾因此翻车）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { z } from 'zod'
import { clearExtendedEvents, ids, registerEventType } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import { EventBus } from '../src/bus.js'
import { Engine } from '../src/engine.js'
import { DEFAULT_HOOK_TIMEOUT_MS, UserHookRunner } from '../src/hooks/runner.js'
import type { HookLogger, UserHooksConfig } from '../src/hooks/runner.js'
import type { LoadedSkill } from '../src/skills/loader.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

// ---------- 公共夹具 ----------

let dirs: string[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-userhooks-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  // 先清扩展注册表（rmSync 在 Windows 上可能因孤儿子进程占用目录而 EPERM，
  // 不得因清理失败跳过隔离步骤）
  clearExtendedEvents()
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      // 超时 kill 只杀 shell（cmd.exe）不杀孙进程（Windows 经典行为）——
      // 目录被孤儿 node 占用时跳过清理，交给系统临时目录回收
    }
  }
  dirs = []
  delete process.env.HOOK_OUT
})

/** 收集 warn 的假 logger（断言跳过路径有日志，不吞） */
function collectingLogger(): { logger: HookLogger; warns: string[] } {
  const warns: string[] = []
  return { logger: { warn: (m) => { warns.push(m) } }, warns }
}

/** 轮询等待谓词成立（上限 5s——子进程 spawn 有调度延迟） */
async function waitFor(pred: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000
  for (;;) {
    if (pred()) return
    if (Date.now() > deadline) throw new Error(`等待 ${what} 超时`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** 读 hook 输出文件全文（不存在 → ''） */
function hookLog(): string {
  const path = process.env.HOOK_OUT
  if (path === undefined || !existsSync(path)) return ''
  return readFileSync(path, 'utf8')
}

/** 追加标记到 HOOK_OUT 的命令（跨平台：node -e，经 shell 解释） */
function appendCmd(marker: string): string {
  return `node -e "require('fs').appendFileSync(process.env.HOOK_OUT,'${marker}\\n')"`
}

/** 把 stdin 收到的载荷 JSON 原样写入 HOOK_OUT 的命令 */
const STDIN_RELAY_CMD =
  `node -e "let d='';process.stdin.setEncoding('utf8');` +
  `process.stdin.on('data',(c)=>{d+=c});` +
  `process.stdin.on('end',()=>{require('fs').writeFileSync(process.env.HOOK_OUT,d)})"`

const SID = ids.session('sesUserHooksUnit0000000')

function makeRunner(
  defs: UserHooksConfig,
  skills: readonly LoadedSkill[] = [],
): { runner: UserHookRunner; warns: string[]; appended: SparkEventEnvelope[]; broadcast: SparkEventEnvelope[] } {
  const { logger, warns } = collectingLogger()
  const appended: SparkEventEnvelope[] = []
  const broadcast: SparkEventEnvelope[] = []
  const bus = new EventBus({ sink: { append: (e) => { appended.push(e); return Promise.resolve(e) } } })
  bus.restoreSeq(SID, 0)
  bus.subscribe((e) => { broadcast.push(e) })
  const runner = new UserHookRunner(defs, {
    bus,
    logger,
    skills: () => skills,
    defaultTimeoutMs: DEFAULT_HOOK_TIMEOUT_MS,
  })
  return { runner, warns, appended, broadcast }
}

// ---------- UserHookRunner：command 触发 ----------

describe('UserHookRunner：command 触发', () => {
  beforeEach(() => {
    process.env.HOOK_OUT = join(tempDir(), 'hook.log')
  })

  test('stdin 收到完整 JSON 载荷（point/sessionId/cwd/sourceEventId/data）', async () => {
    const { runner, warns } = makeRunner({ 'turn.after': [{ command: STDIN_RELAY_CMD }] })
    runner.fire('turn.after', {
      sessionId: SID,
      cwd: process.cwd(),
      sourceEventId: ids.event('evt_after_000000000000000'),
      data: { turnId: 'tur_x', finish: 'stop' },
    })
    await waitFor(() => hookLog() !== '', '载荷落盘')
    const payload = JSON.parse(hookLog()) as {
      point: string
      sessionId: string
      cwd: string
      sourceEventId: string
      data: Record<string, unknown>
    }
    expect(payload).toEqual({
      point: 'turn.after',
      sessionId: SID,
      cwd: process.cwd(),
      sourceEventId: 'evt_after_000000000000000',
      data: { turnId: 'tur_x', finish: 'stop' },
    })
    expect(warns).toEqual([]) // 退出码 0：无 warn
  })

  test('超时 kill + warn（userhook.timeout），不抛错不阻断', async () => {
    const { runner, warns } = makeRunner({
      'turn.before': [{ command: 'node -e "setTimeout(()=>{},8000)"', timeoutMs: 150 }],
    })
    runner.fire('turn.before', {
      sessionId: SID,
      cwd: process.cwd(),
      sourceEventId: null,
      data: {},
    })
    await waitFor(() => warns.includes('userhook.timeout'), '超时 warn')
  })

  test('非零退出码 warn（userhook.exit）', async () => {
    const { runner, warns } = makeRunner({ 'turn.after': [{ command: 'node -e "process.exit(3)"' }] })
    runner.fire('turn.after', { sessionId: SID, cwd: process.cwd(), sourceEventId: null, data: {} })
    await waitFor(() => warns.includes('userhook.exit'), '非零退出 warn')
  })

  test('不读 stdin 的命令先行退出：EPIPE 吞掉不产生 error warn（退出码语义已由 close 承担）', async () => {
    const { runner, warns } = makeRunner({
      'turn.after': [{ command: `node -e "require('fs').appendFileSync(process.env.HOOK_OUT,'ok\\n')"` }],
    })
    runner.fire('turn.after', {
      sessionId: SID,
      cwd: process.cwd(),
      sourceEventId: null,
      data: { big: 'x'.repeat(64 * 1024) }, // 大载荷写入已退出的 stdin → EPIPE
    })
    await waitFor(() => hookLog() === 'ok\n', '命令执行')
    expect(warns).toEqual([])
  })

  test('spawn 同步抛错（cwd 不存在）：warn 闭合不抛出', () => {
    const { runner, warns } = makeRunner({ 'turn.before': [{ command: 'echo hi' }] })
    expect(() =>
      runner.fire('turn.before', {
        sessionId: SID,
        cwd: 'Z:\\不存在的目录\\子目录',
        sourceEventId: null,
        data: {},
      }),
    ).not.toThrow()
    // Windows 上 spawn 带 shell 时 cwd 非法走异步 error 事件；两种路径都是 warn 闭合
    return waitFor(
      () => warns.includes('userhook.error') || warns.includes('userhook.exit'),
      'spawn 失败 warn',
    )
  })
})

// ---------- UserHookRunner：skill 触发 ----------

describe('UserHookRunner：skill 触发', () => {
  const SKILL: LoadedSkill = { name: 'demo', dir: '', events: ['plugin.demo.ping'], hooks: [] }

  beforeEach(() => {
    registerEventType('plugin.demo.ping', {
      schema: z.object({
        skill: z.string(),
        sourceEventId: z.string(),
        sourceType: z.string(),
      }),
    })
  })

  test('合法 skill+emit：emitExtended 落盘 + 广播，data 形状同 ADR D18', async () => {
    const { runner, warns, appended, broadcast } = makeRunner(
      { 'tool.completed': [{ skill: 'demo', emit: 'plugin.demo.ping' }] },
      [SKILL],
    )
    runner.fire('tool.completed', {
      sessionId: SID,
      cwd: process.cwd(),
      sourceEventId: ids.event('evt_tool_0000000000000000'),
      data: { callId: 'cal_x' },
    })
    await waitFor(() => appended.length === 1, '插件事件落盘')
    expect(appended[0]?.type).toBe('plugin.demo.ping')
    expect(appended[0]?.ignorable).toBe(true)
    expect(appended[0]?.data).toEqual({
      skill: 'demo',
      sourceEventId: 'evt_tool_0000000000000000',
      sourceType: 'tool.completed',
    })
    expect(broadcast.map((e) => e.type)).toEqual(['plugin.demo.ping'])
    expect(warns).toEqual([])
  })

  test('skill 未加载：warn（userhook.skill.unknown）', () => {
    const { runner, warns } = makeRunner({ 'turn.after': [{ skill: 'nope', emit: 'plugin.demo.ping' }] })
    runner.fire('turn.after', { sessionId: SID, cwd: '', sourceEventId: null, data: {} })
    expect(warns).toEqual(['userhook.skill.unknown'])
  })

  test('emit 未在该 skill 清单声明：warn（userhook.emit.unknown）', () => {
    const { runner, warns } = makeRunner(
      { 'turn.after': [{ skill: 'demo', emit: 'plugin.demo.notdeclared' }] },
      [SKILL],
    )
    runner.fire('turn.after', { sessionId: SID, cwd: '', sourceEventId: null, data: {} })
    expect(warns).toEqual(['userhook.emit.unknown'])
  })

  test('未注册挂点的 defs：fire 无操作', () => {
    const { runner, warns, appended } = makeRunner({ 'turn.before': [{ command: 'echo x' }] })
    runner.fire('turn.after', { sessionId: SID, cwd: '', sourceEventId: null, data: {} })
    expect(warns).toEqual([])
    expect(appended).toEqual([])
  })
})

// ---------- Engine 端到端：四挂点真实触发 ----------

interface EngineFixture {
  root: string
  engine: Engine
  gateway: ScriptedLlm
  events: SparkEventEnvelope[]
}

let engineFixtures: EngineFixture[] = []

afterEach(async () => {
  for (const f of engineFixtures) await f.engine.shutdown()
  engineFixtures = []
})

function makeConfig(hooks: UserHooksConfig): EngineConfig {
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
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
    },
    permissions: { version: 1, rules: [] },
  }
}

function makeHookEngine(hooks: UserHooksConfig): EngineFixture {
  const root = tempDir()
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeConfig(hooks) })
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => { events.push(e) })
  const f: EngineFixture = { root, engine, gateway, events }
  engineFixtures.push(f)
  return f
}

async function waitTurnCompleted(f: EngineFixture): Promise<void> {
  await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn.completed')
}

describe('Engine 端到端（工单 7.3：四挂点接线）', () => {
  test('turn.before/after + tool.completed + permission.resolved 全链路触发，次数闭合', async () => {
    process.env.HOOK_OUT = join(tempDir(), 'engine-hook.log')
    const f = makeHookEngine({
      'turn.before': [{ command: appendCmd('turn.before') }],
      'turn.after': [{ command: appendCmd('turn.after') }],
      'tool.completed': [{ command: appendCmd('tool.completed') }],
      'permission.resolved': [{ command: appendCmd('permission.resolved') }],
    })

    // step1：未知工具（E_NOT_FOUND 完成路径——不进审批门）；step2：bash（ask）；
    // step3：收尾文本
    f.gateway.scriptStep({
      content: [
        { type: 'toolCall', callId: ids.call('cal_hookunknown'), name: 'no_such_tool', input: {} },
      ],
    })
    f.gateway.scriptStep({
      content: [
        { type: 'toolCall', callId: ids.call('cal_hookbash'), name: 'bash', input: { command: 'echo hi' } },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })

    const handle = await f.engine.createSession()
    await handle.send('跑一轮')

    // bash 默认 ask → 答复 once（触发 permission.resolved 挂点）
    await waitFor(() => f.events.some((e) => e.type === 'permission.asked'), 'permission.asked')
    const asked = f.events.find((e) => e.type === 'permission.asked') as SparkEventEnvelope<'permission.asked'>
    expect(await f.engine.replyPermission(asked.data.requestId, 'once')).toBe('ok')

    await waitTurnCompleted(f)

    // 四挂点全部落日志，触发次数闭合。hook 为 fire-and-forget（runner.ts 纪律）：
    // 相邻挂点（如 bash 的 tool.completed 与 turn.after）的子进程 append 同一文件，
    // 落盘先后取决于 OS 调度，文件级顺序不是引擎保证的不变量（CI run 33291296064
    // 曾因断言"最后一行是 turn.after"在高负载 CI 上翻车）——触发顺序由事件流承载，
    // 这里只断言各挂点触发次数；等齐计数同时也保证后续读到的是稳态。
    const counts = () => {
      const lines = hookLog().trim().split('\n').filter((l) => l !== '')
      return {
        before: lines.filter((l) => l === 'turn.before').length,
        toolCompleted: lines.filter((l) => l === 'tool.completed').length,
        resolved: lines.filter((l) => l === 'permission.resolved').length,
        after: lines.filter((l) => l === 'turn.after').length,
      }
    }
    await waitFor(
      () => {
        const c = counts()
        return c.before === 1 && c.toolCompleted === 2 && c.resolved === 1 && c.after === 1
      },
      '四挂点全部触发',
    )
    expect(counts()).toEqual({ before: 1, toolCompleted: 2, resolved: 1, after: 1 }) // tool.completed ×2：未知工具 + bash
    expect(handle.status()).toBe('idle')
  })

  test('命令失败（非零退出）不影响 turn 正常闭合：warn 闭合', async () => {
    process.env.HOOK_OUT = join(tempDir(), 'engine-hook-fail.log')
    const f = makeHookEngine({ 'turn.before': [{ command: 'node -e "process.exit(9)"' }] })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '正常' }] })
    const handle = await f.engine.createSession()
    await handle.send('hi')
    await waitTurnCompleted(f)
    expect(handle.status()).toBe('idle')
    expect(hookLog()).toBe('') // hook 未写任何内容，turn 不受影响
  })
})
