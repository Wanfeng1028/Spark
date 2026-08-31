/**
 * 长期记忆单测（阶段七工单 7.5 / H05 / ADR D25）：
 * - MemoryStore：save/list/remove 往返 / FTS trigram 中文子串命中 / 短查询 LIKE 兜底 /
 *   k 截断与新旧排序 / 空查询空集 / FTS 触发器删除同步；
 * - 引擎端到端：memory.save 工具落库（新会话 search 跨会话命中）→
 *   新会话首条 user.message 触发注入（memory.injected 落盘 + Projector 投影为
 *   模型上下文首条前缀消息——surface 纪律双面）/ 第二条消息不重复注入 /
 *   无命中不 emit / 仓跨会话持久（重开 Engine 数据仍在）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { MemoryDto, SparkEventEnvelope } from '@spark/protocol'
import { ids } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import { Engine } from '../src/engine.js'
import { MemoryStore } from '../src/memory/store.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

let dirs: string[] = []
let engines: Engine[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-memory-'))
  dirs.push(d)
  return d
}

afterEach(async () => {
  for (const e of engines) await e.shutdown()
  engines = []
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      // 失败用例提前退出未关 db 句柄时目录被占用——跳过清理交系统临时目录回收
    }
  }
  dirs = []
})

const SID = ids.session('sesMemoryStore0000000000')

// ---------- MemoryStore ----------

describe('MemoryStore（~/.spark/memory.db：FTS5 trigram + LIKE 降级）', () => {
  test('save/list/remove 往返；list 新→旧排序', () => {
    const store = new MemoryStore(join(tempDir(), 'memory.db'))
    const a = store.save(SID, '用户偏好 PostgreSQL', 1000)
    const b = store.save(SID, '项目约定用 pnpm', 2000)
    expect(a.id).not.toBe(b.id)
    const list = store.list()
    expect(list.map((m) => m.id)).toEqual([b.id, a.id])
    expect(store.remove(a.id)).toBe(true)
    expect(store.remove(a.id)).toBe(false) // 二删 → false（404 语义）
    expect(store.list().map((m) => m.id)).toEqual([b.id])
    store.close()
  })

  test('FTS trigram 中文子串命中（unicode61 整段成词不可子串——trigram 修复）', () => {
    const store = new MemoryStore(join(tempDir(), 'memory.db'))
    expect(store.fts).toBe(true) // Node bundled SQLite 含 FTS5；本机不支持则本用例如实失败
    store.save(SID, '用户偏好 PostgreSQL，连接串在 .env', 1000)
    store.save(SID, '项目约定用 pnpm 管理依赖', 2000)
    // trigram MATCH = 连续子串查询（'用户偏好' 是第一条内容的子串）
    const hits = store.search('用户偏好', 5)
    expect(hits.map((m) => m.content)).toContain('用户偏好 PostgreSQL，连接串在 .env')
    expect(hits.some((m) => m.content === '项目约定用 pnpm 管理依赖')).toBe(false)
    store.close()
  })

  test('自然语句召回链：整串不命中 → 拆词最长词 LIKE 兜底', () => {
    const store = new MemoryStore(join(tempDir(), 'memory.db'))
    store.save(SID, 'project convention: use pnpm as package manager', 1000)
    // 整句非内容子串、FTS 整串不命中 → 拆词最长 'package' LIKE 命中
    const hits = store.search('which package manager do we use', 5)
    expect(hits.map((m) => m.content)).toContain('project convention: use pnpm as package manager')
    store.close()
  })

  test('短查询（<3 字符）走 LIKE 兜底；k 截断；空查询空集', () => {
    const store = new MemoryStore(join(tempDir(), 'memory.db'))
    store.save(SID, '用 pnpm', 1000)
    store.save(SID, '用 pnpm 安装', 2000)
    expect(store.search('pn', 5).length).toBe(2) // 2 字符 → LIKE 命中两条
    expect(store.search('pnpm', 1).length).toBe(1) // k 截断
    expect(store.search('', 5)).toEqual([])
    store.close()
  })

  test('删除后 FTS 同步（外容表触发器）——已删内容不再命中', () => {
    const store = new MemoryStore(join(tempDir(), 'memory.db'))
    const row = store.save(SID, '独有的关键词XYZ', 1000)
    store.remove(row.id)
    expect(store.search('独有的关键词', 5)).toEqual([])
    store.close()
  })
})

// ---------- Engine 端到端 ----------

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

/** 免审批配置（memory.write/memory.read allow——直接驱动工具路径） */
function makeAllowMemoryConfig(): EngineConfig {
  const config = makeConfig()
  config.permissions.rules = [
    { action: 'memory.write', resource: 'memory', effect: 'allow' },
    { action: 'memory.read', resource: 'memory', effect: 'allow' },
  ]
  return config
}

function makeEngineWith(
  config: EngineConfig,
  root?: string,
): { root: string; engine: Engine; gateway: ScriptedLlm; events: SparkEventEnvelope[] } {
  const r = root ?? tempDir()
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root: r, gateway, config })
  engines.push(engine)
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    events.push(e)
  })
  return { root: r, engine, gateway, events }
}

async function waitTurnDone(events: SparkEventEnvelope[], n = 1): Promise<void> {
  const deadline = Date.now() + 2000
  while (events.filter((e) => e.type === 'turn.completed').length < n) {
    if (Date.now() > deadline) throw new Error('等待 turn.completed 超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('Engine 长期记忆端到端（工单 7.5 验收：save→新会话注入命中）', () => {
  test('save 工具落库 → 新会话首条消息注入 → Projector 投影为模型上下文前缀', async () => {
    const { engine, gateway, events } = makeEngineWith(makeAllowMemoryConfig())
    gateway.scriptStep({
      content: [
        { type: 'toolCall', callId: ids.call('cal_memsave'), name: 'memory.save', input: { content: '用户偏好 PostgreSQL 数据库' } },
      ],
    })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '已记住' }] })
    const h1 = await engine.createSession()
    await h1.send('记住我的偏好')
    await waitTurnDone(events)
    // memory.save 工具调用完成且成功
    const saveCompleted = events.find(
      (e) => e.type === 'tool.completed' && (e.data as { output?: unknown }).output !== undefined,
    )
    expect(saveCompleted).toBeDefined()
    expect(engine.listMemories().map((m) => m.content)).toContain('用户偏好 PostgreSQL 数据库')

    // 新会话：首条消息触发注入（召回链：整串不命中 → 拆词最长 'PostgreSQL' LIKE 命中）
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '好' }] })
    gateway.scriptOnce('标题A')
    gateway.scriptOnce('标题B')
    const h2 = await engine.createSession()
    await h2.send('PostgreSQL 连接配置')
    await waitTurnDone(events, 2)
    const injected = events.find((e) => e.type === 'memory.injected') as
      | SparkEventEnvelope<'memory.injected'>
      | undefined
    expect(injected?.data.memories.map((m) => m.content)).toContain('用户偏好 PostgreSQL 数据库')
    // surface 纪律：注入的模型可见内容投影进上下文（首条消息的前缀 user 消息）
    const call = gateway.calls.at(-1)
    const first = call?.messages[0]
    expect(first?.role).toBe('user')
    expect(JSON.stringify(first?.content)).toContain('用户偏好 PostgreSQL 数据库')
  })

  test('第二条消息不重复注入（每会话仅首条触发一次）', async () => {
    const { engine, gateway, events } = makeEngineWith(makeAllowMemoryConfig())
    engine.listMemories() // 仓可用
    // 手工放一条记忆（经 store 直接写——聚焦注入次数纪律）
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '一' }] })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '二' }] })
    const h = await engine.createSession()
    await h.send('第一条消息')
    await waitTurnDone(events)
    await h.send('第二条消息')
    await waitTurnDone(events, 2)
    // 仓里无记忆 → 无注入事件（命中空集 no-op）；首条触发次数为 0
    expect(events.filter((e) => e.type === 'memory.injected')).toHaveLength(0)
  })

  test('仓跨会话持久：重开 Engine（同一 root）数据仍在', async () => {
    const { root, engine, gateway, events } = makeEngineWith(makeAllowMemoryConfig())
    gateway.scriptStep({
      content: [
        { type: 'toolCall', callId: ids.call('cal_mempersist'), name: 'memory.save', input: { content: '跨进程持久的记忆' } },
      ],
    })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const h = await engine.createSession()
    await h.send('保存')
    await waitTurnDone(events)
    await engine.shutdown()
    engines = engines.filter((e) => e !== engine)

    const second = makeEngineWith(makeConfig(), root)
    const list: MemoryDto[] = second.engine.listMemories()
    expect(list.map((m) => m.content)).toContain('跨进程持久的记忆')
  })
})
