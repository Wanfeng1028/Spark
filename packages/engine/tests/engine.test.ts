/**
 * Engine 门面单测（doc/02 §5.2 / §5.2.1 / §8.6 engine/session 行）：
 * createSession 落盘与事件、ScriptedLlm 全链路 turn、resume 补闭合与 resumed、
 * listSessions 磁盘扫描、replyPermission 三态、shutdown 拒新/幂等/审批 fail-closed。
 */
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import type { SubscribeHandle } from '../src/bus.js'
import { Engine } from '../src/engine.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

function makeConfig(): EngineConfig {
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
      },
    },
    models: {
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
    },
    permissions: { version: 1, rules: [] },
  }
}

interface Fixture {
  root: string
  engine: Engine
  gateway: ScriptedLlm
  events: SparkEventEnvelope[]
  sub: SubscribeHandle
}

let fixtures: Fixture[] = []

async function makeEngine(opts?: { rules?: EngineConfig['permissions']['rules'] }): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'spark-engine-'))
  const gateway = new ScriptedLlm()
  const config = makeConfig()
  if (opts?.rules !== undefined) config.permissions.rules = opts.rules
  const engine = new Engine({ root, gateway, config })
  const events: SparkEventEnvelope[] = []
  const sub = engine.subscribe((e) => {
    events.push(e)
  })
  const f: Fixture = { root, engine, gateway, events, sub }
  fixtures.push(f)
  return f
}

/** 等 turn 闭合（轮询事件流出现 turn.completed；上限 2s） */
async function waitForTurnDone(f: Fixture): Promise<void> {
  const deadline = Date.now() + 2000
  for (;;) {
    if (f.events.some((e) => e.type === 'turn.completed')) return
    if (Date.now() > deadline) throw new Error('等待 turn.completed 超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

/** durable（有 seq）事件类型序列 */
function durableTypes(f: Fixture): string[] {
  return f.events.filter((e) => e.seq !== undefined).map((e) => e.type)
}

beforeEach(() => {
  fixtures = []
})

afterEach(async () => {
  for (const f of fixtures) {
    f.sub.unsubscribe()
    await f.engine.shutdown()
  }
})

describe('createSession', () => {
  test('落盘 header + session.created 事件 + meta 字段', async () => {
    const f = await makeEngine()
    const handle = await f.engine.createSession({ title: '测试会话' })
    expect(handle.meta.title).toBe('测试会话')
    expect(handle.meta.model).toBe('fake/fake-chat')
    expect(handle.meta.cwd).toBe(process.cwd())
    expect(handle.status()).toBe('idle')

    const dirs = await readdir(join(f.root, 'sessions'))
    expect(dirs).toHaveLength(1)
    const files = await readdir(join(f.root, 'sessions', dirs[0] as string))
    expect(files[0]).toContain(handle.id)

    const raw = await readFile(
      join(f.root, 'sessions', dirs[0] as string, files[0] as string),
      'utf8',
    )
    const header = JSON.parse(raw.split('\n')[0] as string) as Record<string, unknown>
    expect(header['sparkVersion']).toBe('0.1.0')
    expect(header['model']).toBe('fake/fake-chat')

    const created = f.events.find((e) => e.type === 'session.created')
    expect(created).toBeDefined()
    expect(created?.seq).toBe(1)
    expect(handle.meta.lastSeq).toBe(1)
  })

  test('自定义 model 须为已配置 provider；未知 provider 拒绝', async () => {
    const f = await makeEngine()
    const h = await f.engine.createSession({ model: 'fake/other-model' })
    expect(h.meta.model).toBe('fake/other-model')
    await expect(f.engine.createSession({ model: 'nope/x' })).rejects.toThrow('E_CONFIG')
    await expect(f.engine.createSession({ model: 'badformat' })).rejects.toThrow('E_CONFIG')
  })
})

describe('send 全链路（ScriptedLlm）', () => {
  test('started 三态直通；turn 事件序列闭合落盘', async () => {
    const f = await makeEngine()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '你好' }] })
    const handle = await f.engine.createSession()
    const r = await handle.send('读一下文件')
    expect(r.result).toBe('started')
    expect(r.turnId).toBeDefined()
    await waitForTurnDone(f)
    expect(durableTypes(f)).toEqual([
      'session.created',
      'user.message',
      'turn.started',
      'assistant.message',
      'turn.completed',
    ])
    // 落盘与广播一致：文件行数 = header + 5 durable
    const dirs = await readdir(join(f.root, 'sessions'))
    const files = await readdir(join(f.root, 'sessions', dirs[0] as string))
    const raw = await readFile(
      join(f.root, 'sessions', dirs[0] as string, files[0] as string),
      'utf8',
    )
    expect(raw.trim().split('\n')).toHaveLength(6)
    expect(handle.meta.lastSeq).toBe(5)
  })

  test('running 期间 now 提交 → steered；status 反映 running', async () => {
    const f = await makeEngine()
    f.gateway.scriptStep({
      deltas: [{ kind: 'text', text: '长回复' }],
      hangMs: 300,
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '插话应答' }] })
    const handle = await f.engine.createSession()
    await handle.send('第一句')
    // 等 turn.started（run-loop 已拾取输入）
    const deadline = Date.now() + 2000
    while (!f.events.some((e) => e.type === 'turn.started')) {
      if (Date.now() > deadline) throw new Error('等待 turn.started 超时')
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(handle.status()).toBe('running')
    const r2 = await handle.send('插一句')
    expect(r2.result).toBe('steered')
    await waitForTurnDone(f)
    // steer 注入为第二条 user.message（下一 step 前生效）
    const userMsgs = f.events.filter((e) => e.type === 'user.message')
    expect(userMsgs).toHaveLength(2)
  })

  test('interrupt 幂等：idle 会话同样成功且不产生事件', async () => {
    const f = await makeEngine()
    const handle = await f.engine.createSession()
    await expect(handle.interrupt()).resolves.toBeUndefined()
    expect(f.events.filter((e) => e.type === 'turn.completed')).toHaveLength(0)
  })
})

describe('手动压缩（§5.8.5 手动 /compact）', () => {
  test('idle 时 compact：emit started→completed 落盘并广播；摘要进 generateOnce', async () => {
    const f = await makeEngine()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复' }] })
    const handle = await f.engine.createSession()
    await handle.send('讨论内容')
    await waitForTurnDone(f)

    f.gateway.scriptOnce('手动摘要')
    await handle.compact()

    const types = durableTypes(f)
    expect(types).toContain('compaction.started')
    expect(types.indexOf('compaction.started')).toBeLessThan(types.indexOf('compaction.completed'))
    const completed = f.events.find((e) => e.type === 'compaction.completed')
    expect(completed?.data).toMatchObject({ summary: '手动摘要' })
    // 压缩后的下一 turn 上下文以摘要开头（Projector 锚点分支生效）
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '续答' }] })
    await handle.send('继续')
    // 等第二个 turn 闭合（waitForTurnDone 只认首个 completed）
    const deadline2 = Date.now() + 2000
    while (f.events.filter((e) => e.type === 'turn.completed').length < 2) {
      if (Date.now() > deadline2) throw new Error('等待第二个 turn 完成超时')
      await new Promise((r) => setTimeout(r, 10))
    }
    const firstMessage = f.gateway.calls.at(-1)?.messages[0]
    expect(firstMessage).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: '手动摘要' }],
    })
  })

  test('turn 进行中 compact → E_TURN_ACTIVE 拒绝；不产生 compaction 事件', async () => {
    const f = await makeEngine()
    f.gateway.scriptStep({
      deltas: [{ kind: 'text', text: '长回复' }],
      hangMs: 300,
    })
    const handle = await f.engine.createSession()
    await handle.send('第一句')
    const deadline = Date.now() + 2000
    while (!f.events.some((e) => e.type === 'turn.started')) {
      if (Date.now() > deadline) throw new Error('等待 turn.started 超时')
      await new Promise((r) => setTimeout(r, 5))
    }
    await expect(handle.compact()).rejects.toThrow('E_TURN_ACTIVE')
    expect(f.events.filter((e) => e.type.startsWith('compaction.'))).toHaveLength(0)
    await waitForTurnDone(f)
  })
})

describe('resumeSession', () => {
  test('重启后恢复 meta 与历史；emit session.resumed{fromSeq}', async () => {
    const f = await makeEngine()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复' }] })
    const h1 = await f.engine.createSession({ title: '旧会话' })
    await h1.send('问题')
    await waitForTurnDone(f)
    const lastSeq = h1.meta.lastSeq
    f.sub.unsubscribe()
    await f.engine.shutdown()

    // 新引擎实例读同一 root（进程重启语义）
    const gateway2 = new ScriptedLlm()
    const engine2 = new Engine({ root: f.root, gateway: gateway2, config: makeConfig() })
    fixtures.push({ root: f.root, engine: engine2, gateway: gateway2, events: [], sub: { unsubscribe: () => {}, resume: () => {} } })
    const seen: SparkEventEnvelope[] = []
    engine2.subscribe((e) => {
      seen.push(e)
    })
    const h2 = await engine2.resumeSession(h1.id)
    expect(h2.meta.title).toBe('旧会话')
    expect(h2.meta.lastSeq).toBeGreaterThanOrEqual(lastSeq)
    expect(h2.events().map((e) => e.type)).toContain('turn.completed')
    const resumed = seen.find((e) => e.type === 'session.resumed')
    expect(resumed).toBeDefined()
    // resume 后可继续对话（seq 从恢复点前进，无断洞）
    gateway2.scriptStep({ deltas: [{ kind: 'text', text: '续答' }] })
    await h2.send('继续')
    const deadline = Date.now() + 2000
    while (seen.filter((e) => e.type === 'turn.completed').length < 1) {
      if (Date.now() > deadline) throw new Error('等待续答 turn 完成超时')
      await new Promise((r) => setTimeout(r, 10))
    }
    const seqs = h2.events().map((e) => e.seq)
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBe((seqs[i - 1] as number) + 1)
    }
  })

  test('悬挂 turn 补闭合：手造无 completed 的文件 → resumed 时补 aborted', async () => {
    const f = await makeEngine()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复' }] })
    const h = await f.engine.createSession()
    await h.send('问题')
    await waitForTurnDone(f)
    f.sub.unsubscribe()
    await f.engine.shutdown()

    // 篡改文件：删除最后两行（turn.completed 与 assistant.message），制造悬挂 turn.started
    const dirs = await readdir(join(f.root, 'sessions'))
    const files = await readdir(join(f.root, 'sessions', dirs[0] as string))
    const path = join(f.root, 'sessions', dirs[0] as string, files[0] as string)
    const lines = (await readFile(path, 'utf8')).trim().split('\n')
    await import('node:fs/promises').then((fs) => fs.writeFile(path, `${lines.slice(0, -2).join('\n')}\n`))

    const gateway2 = new ScriptedLlm()
    const engine2 = new Engine({ root: f.root, gateway: gateway2, config: makeConfig() })
    fixtures.push({ root: f.root, engine: engine2, gateway: gateway2, events: [], sub: { unsubscribe: () => {}, resume: () => {} } })
    const seen: SparkEventEnvelope[] = []
    engine2.subscribe((e) => {
      seen.push(e)
    })
    const h2 = await engine2.resumeSession(h.id)
    const aborted = seen.filter((e) => e.type === 'turn.completed')
    expect(aborted).toHaveLength(1)
    expect((aborted[0] as SparkEventEnvelope<'turn.completed'>).data.finish).toBe('aborted')
    expect(h2.events().every((e) => e.seq === undefined || e.seq > 0)).toBe(true)
  })

  test('未知会话 → E_NOT_FOUND；重复 resume 同一实例幂等', async () => {
    const f = await makeEngine()
    await expect(f.engine.resumeSession(ids.session('ses_missing'))).rejects.toThrow('E_NOT_FOUND')
    const h = await f.engine.createSession()
    const again = await f.engine.resumeSession(h.id)
    expect(again.id).toBe(h.id)
  })
})

describe('listSessions', () => {
  test('磁盘扫描 + updatedAt 倒序；已加载用内存态', async () => {
    const f = await makeEngine()
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'b' }] })
    const older = await f.engine.createSession({ title: '先建' })
    // 第二个会话 updatedAt 更新（后发事件）
    const newer = await f.engine.createSession({ title: '后建' })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'a' }] })
    await newer.send('hi')
    await waitForTurnDone(f)
    const list = await f.engine.listSessions()
    expect(list.map((m) => m.id)).toEqual([newer.id, older.id])
    expect(list[0]?.title).toBe('后建')
    expect(list[0]?.lastSeq).toBeGreaterThan(list[1]?.lastSeq ?? 0)
  })

  test('空目录 → 空列表（不抛）', async () => {
    const f = await makeEngine()
    expect(await f.engine.listSessions()).toEqual([])
  })
})

describe('replyPermission 三态', () => {
  test('unknown → 404 语义；ok 后重复 reply → already-resolved', async () => {
    const f = await makeEngine()
    const out = await f.engine.replyPermission(ids.request('req_none'), 'once')
    expect(out).toBe('unknown')
    // 直接驱动 PermissionService 层：经 engine 的事件流路径（审批挂起在 pipeline 测试覆盖）
    // 此处验证已决区分逻辑：构造一次真实审批（bash 默认 ask）
    f.gateway.scriptStep({
      content: [
        { type: 'toolCall', callId: ids.call('cal_permtest'), name: 'bash', input: { command: 'echo hi' } },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const handle = await f.engine.createSession()
    await handle.send('跑个命令')
    const deadline = Date.now() + 2000
    while (!f.events.some((e) => e.type === 'permission.asked')) {
      if (Date.now() > deadline) throw new Error('等待 permission.asked 超时')
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(handle.status()).toBe('waiting-approval')
    const asked = f.events.find((e) => e.type === 'permission.asked') as SparkEventEnvelope<'permission.asked'>
    const r1 = await f.engine.replyPermission(asked.data.requestId, 'once')
    expect(r1).toBe('ok')
    const r2 = await f.engine.replyPermission(asked.data.requestId, 'once')
    expect(r2).toBe('already-resolved')
    await waitForTurnDone(f)
    expect(handle.status()).toBe('idle')
  })
})

describe('shutdown', () => {
  test('拒新 + 幂等 + 空会话正常退出', async () => {
    const f = await makeEngine()
    const handle = await f.engine.createSession()
    await f.engine.shutdown()
    await expect(f.engine.createSession()).rejects.toThrow('E_SHUTTING_DOWN')
    await expect(handle.send('x')).rejects.toThrow('E_SHUTTING_DOWN')
    await expect(f.engine.shutdown()).resolves.toBeUndefined()
  })

  test('挂起审批在 shutdown 时 fail-closed 拒绝', async () => {
    const f = await makeEngine()
    f.gateway.scriptStep({
      content: [
        { type: 'toolCall', callId: ids.call('cal_sdtest'), name: 'bash', input: { command: 'echo x' } },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '收尾' }] })
    const handle = await f.engine.createSession()
    await handle.send('跑命令')
    const deadline = Date.now() + 2000
    while (!f.events.some((e) => e.type === 'permission.asked')) {
      if (Date.now() > deadline) throw new Error('等待 permission.asked 超时')
      await new Promise((r) => setTimeout(r, 5))
    }
    await f.engine.shutdown()
    const asked = f.events.find((e) => e.type === 'permission.asked') as SparkEventEnvelope<'permission.asked'>
    const resolved = f.events
      .filter((e): e is SparkEventEnvelope<'permission.resolved'> => e.type === 'permission.resolved')
      .find((e) => e.data.requestId === asked.data.requestId)
    expect(resolved?.data.reply).toBe('reject')
  })
})
