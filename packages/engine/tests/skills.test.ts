/**
 * skills/插件单测（阶段五工单 5.5 / ADR D18 / doc/02 §4.3 merge-extensible）：
 * loader（清单校验/词表注册/坏 skill 跳过/类型冲突/钩子非法）+
 * EventBus.emitExtended（durable 落盘 + liveOnly 直播 + ignorable 信封）+
 * 引擎端到端（示例插件 hook：session.created → plugin.*.ping 落盘可回放，
 * 插件"卸载"（clearExtendedEvents）后旧会话仍可加载——ignorable 跳过占行号）。
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { z } from 'zod'
import { clearExtendedEvents, eventSchemaOf, ids, registerEventType } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import { EventBus } from '../src/bus.js'
import { Engine } from '../src/engine.js'
import { loadSkills } from '../src/skills/loader.js'
import { SessionStore } from '../src/session/store.js'

// ---------- 夹具 ----------

const PING_DATA_SCHEMA = {
  type: 'object',
  properties: {
    skill: { type: 'string' },
    sourceEventId: { type: 'string' },
    sourceType: { type: 'string' },
  },
  required: ['skill', 'sourceEventId', 'sourceType'],
  additionalProperties: false,
} as const

function skillJson(events: Record<string, unknown>, hooks?: unknown[]): string {
  return JSON.stringify({ version: 1, name: 'demo', events, ...(hooks !== undefined ? { hooks } : {}) })
}

async function makeSkillsDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'spark-skills-'))
}

async function writeSkill(
  root: string,
  name: string,
  manifest: string,
): Promise<string> {
  const dir = join(root, 'skills', name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'skill.json'), manifest, 'utf8')
  return dir
}

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
        checkpoints: false,
        bashSandbox: 'off',
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

/** 收集 warn 的假 logger（断言跳过路径有日志，不吞） */
function collectingLogger(): {
  logger: { warn: (m: string, f?: Record<string, unknown>) => void; info: () => void }
  warns: string[]
} {
  const warns: string[] = []
  return { logger: { warn: (m) => { warns.push(m) }, info: () => {} }, warns }
}

afterEach(() => {
  clearExtendedEvents() // 测试隔离：清扩展注册表，防跨用例类型冲突
})

// ---------- loader ----------

describe('loadSkills（声明式清单 → 词表注册）', () => {
  test('合法清单：事件注册进扩展表，hooks 原样带回', async () => {
    const root = await makeSkillsDir()
    await writeSkill(
      root,
      'demo',
      skillJson(
        { 'plugin.a.hello': { data: { type: 'object', properties: { x: { type: 'number' } } } } },
        [{ on: 'session.created', emit: 'plugin.a.hello' }],
      ),
    )
    const { logger, warns } = collectingLogger()
    const skills = await loadSkills(join(root, 'skills'), logger)
    expect(skills).toHaveLength(1)
    expect(skills[0]?.hooks).toEqual([{ on: 'session.created', emit: 'plugin.a.hello' }])
    expect(eventSchemaOf('plugin.a.hello')).toBeDefined()
    expect(eventSchemaOf('plugin.a.hello')?.safeParse({ x: 1 }).success).toBe(true)
    expect(eventSchemaOf('plugin.a.hello')?.safeParse({ x: 's' }).success).toBe(false)
    expect(warns).toEqual([])
  })

  test('目录不存在 = 零插件；非目录项忽略；坏清单 warn 跳过', async () => {
    expect(await loadSkills(join(await makeSkillsDir(), 'skills', '不存在'))).toEqual([])
    const root = await makeSkillsDir()
    const dir = join(root, 'skills')
    await mkdir(join(dir, 'notaskill'), { recursive: true }) // 无 skill.json 的目录
    await writeSkill(root, 'bad-version', JSON.stringify({ version: 2, name: 'x', events: {} }))
    const { logger, warns } = collectingLogger()
    const skills = await loadSkills(dir, logger)
    expect(skills).toEqual([])
    expect(warns).toEqual(['skills.load.skip', 'skills.load.skip']) // notaskill + bad-version
    expect(eventSchemaOf('plugin.any.thing')).toBeUndefined()
  })

  test('事件类型冲突（跨 skill 重复）：后到者整包跳过，先到者注册生效', async () => {
    const root = await makeSkillsDir()
    await writeSkill(
      root,
      'first',
      skillJson({ 'plugin.dup.x': { data: { type: 'object' } } }),
    )
    await writeSkill(
      root,
      'second',
      skillJson({ 'plugin.dup.x': { data: { type: 'object' } } }),
    )
    const { logger, warns } = collectingLogger()
    const skills = await loadSkills(join(root, 'skills'), logger)
    // readdir 目录序不保证：恰一个成功注册、另一个 warn 跳过即可
    expect(skills).toHaveLength(1)
    expect(warns).toEqual(['skills.load.skip'])
    expect(eventSchemaOf('plugin.dup.x')).toBeDefined()
  })

  test('钩子非法（on 非内置类型 / emit 未声明）：warn 跳过，不留半注册', async () => {
    const root = await makeSkillsDir()
    await writeSkill(
      root,
      'bad-on',
      skillJson({ 'plugin.b.one': { data: { type: 'object' } } }, [
        { on: 'plugin.b.one', emit: 'plugin.b.one' },
      ]),
    )
    await writeSkill(
      root,
      'bad-emit',
      skillJson({ 'plugin.b.two': { data: { type: 'object' } } }, [
        { on: 'session.created', emit: 'plugin.b.missing' },
      ]),
    )
    const { logger, warns } = collectingLogger()
    const skills = await loadSkills(join(root, 'skills'), logger)
    expect(skills).toEqual([])
    expect(warns).toEqual(['skills.load.skip', 'skills.load.skip'])
    expect(eventSchemaOf('plugin.b.one')).toBeUndefined()
    expect(eventSchemaOf('plugin.b.two')).toBeUndefined()
  })
})

// ---------- EventBus.emitExtended ----------

describe('EventBus.emitExtended（durable/live 双路 + ignorable 信封）', () => {
  test('durable：校验 → 落盘 → 广播，seq 递增，信封 ignorable:true', async () => {
    registerEventType('plugin.c.durable', {
      schema: z.object({ skill: z.string(), sourceEventId: z.string(), sourceType: z.string() }),
    })
    const appended: SparkEventEnvelope[] = []
    const bus = new EventBus({
      sink: { append: (e) => { appended.push(e); return Promise.resolve(e) } },
    })
    const sid = ids.session('sesSkiDurable0000000000')
    bus.restoreSeq(sid, 0)
    const seen: SparkEventEnvelope[] = []
    bus.subscribe((e) => { seen.push(e) })

    const env = await bus.emitExtended(sid, 'plugin.c.durable', { skill: 'c', sourceEventId: 'evt_x', sourceType: 'session.created' })
    expect(env.seq).toBe(1)
    expect(env.ignorable).toBe(true)
    expect(appended).toHaveLength(1)
    expect(seen).toHaveLength(1)
  })

  test('liveOnly：不落盘不计数，直播广播', async () => {
    registerEventType('plugin.c.live', {
      schema: z.object({ skill: z.string(), sourceEventId: z.string(), sourceType: z.string() }),
      liveOnly: true,
    })
    const appended: SparkEventEnvelope[] = []
    const bus = new EventBus({
      sink: { append: (e) => { appended.push(e); return Promise.resolve(e) } },
    })
    const sid = ids.session('sesSkiLiveonly000000000')
    const seen: SparkEventEnvelope[] = []
    bus.subscribe((e) => { seen.push(e) })

    const env = await bus.emitExtended(sid, 'plugin.c.live', { skill: 'c', sourceEventId: 'evt_y', sourceType: 'session.created' })
    expect(env.seq).toBeUndefined()
    expect(env.ignorable).toBe(true)
    expect(appended).toEqual([])
    expect(seen).toHaveLength(1)
  })

  test('未注册类型 / data 校验失败：抛错闭合', async () => {
    registerEventType('plugin.c.bad', { schema: z.object({ x: z.number() }) })
    const bus = new EventBus({ sink: { append: (e) => Promise.resolve(e) } })
    const sid = ids.session('sesSkiInvalid000000000')
    await expect(bus.emitExtended(sid, 'plugin.nope.x', {})).rejects.toThrow(/E_BUS_UNKNOWN_TYPE/)
    await expect(bus.emitExtended(sid, 'plugin.c.bad', { x: '不是数字' })).rejects.toThrow(/E_BUS_INVALID_DATA/)
  })
})

// ---------- 引擎端到端（示例插件演示路径） ----------

describe('skills 端到端（hook 触发 → 落盘 → 卸载后可加载）', () => {
  test('session.created → plugin.demo.ping 落盘；卸载插件后旧会话仍可加载', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-skills-e2e-'))
    // 示例插件（与 examples/skills/demo-ping 同形状）：hook 在 session.created
    await writeSkill(
      root,
      'demo-ping',
      JSON.stringify({
        version: 1,
        name: 'demo-ping',
        events: { 'plugin.demo.ping': { description: '示例', data: PING_DATA_SCHEMA } },
        hooks: [{ on: 'session.created', emit: 'plugin.demo.ping' }],
      }),
    )
    const engine = new Engine({ root, config: makeConfig() })
    await engine.ready()
    const events: SparkEventEnvelope[] = []
    const sub = engine.subscribe((e) => { events.push(e) })
    try {
      const session = await engine.createSession({ title: '插件演示' })
      // hook 事件已广播（emitExtended 挂在 session tail 上，createSession 返回后需等微任务排空）
      const deadline = Date.now() + 2000
      while (!events.some((e) => (e.type as string) === 'plugin.demo.ping')) {
        if (Date.now() > deadline) throw new Error('等待 plugin.demo.ping 超时')
        await new Promise((r) => setTimeout(r, 10))
      }
      const ping = events.find((e) => (e.type as string) === 'plugin.demo.ping')
      expect(ping?.sessionId).toBe(session.id)
      expect(ping?.seq).toBe(2) // session.created=1 之后
      expect(ping?.ignorable).toBe(true)
      expect(ping?.data).toMatchObject({ skill: 'demo-ping', sourceType: 'session.created' })

      // 落盘可回放（插件在注册表内：正常解析）
      const path = join(root, 'sessions')
      // 定位会话文件（目录下唯一 jsonl）
      const { readdir } = await import('node:fs/promises')
      const cwdDir = await readdir(path)
      const files = await readdir(join(path, cwdDir[0]!))
      const file = files.find((f) => f.endsWith('.jsonl'))
      expect(file).toBeDefined()
      const fileEvents = await SessionStore.read(join(path, cwdDir[0]!, file!))
      expect(fileEvents.events.map((e) => e.type)).toEqual([
        'session.created',
        'plugin.demo.ping',
      ])

      // “卸载”插件（清扩展注册表）后重读：ignorable 未知行跳过但占行号，会话可加载
      clearExtendedEvents()
      const afterUnload = await SessionStore.read(join(path, cwdDir[0]!, file!))
      expect(afterUnload.events.map((e) => e.type)).toEqual(['session.created'])
    } finally {
      sub.unsubscribe()
      await engine.shutdown()
    }
  })
})
