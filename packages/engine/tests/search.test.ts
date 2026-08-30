/**
 * 会话全文搜索单测（阶段七工单 7.13 / H12）：
 * - SearchStore：upsert/search 往返（新→旧、limit 截断）/ FTS trigram 中文子串 /
 *   短查询 LIKE 兜底 / 自然语句最长词召回 / removeAfter 截断 + FTS 同步 /
 *   水位读写 / 复合主键（fork 同 event id 跨会话不碰撞）/ LIKE 通配转义 /
 *   千事件检索 <500ms（DoD 性能线）；
 * - 引擎端到端：增量索引（user/assistant/title 三类命中 + 标题填充 + 摘要含命中词）/
 *   重启持久（水位持平跳同步）/ 删库后装载点增量重建（水位缺失全量补）。
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { SparkEventEnvelope } from '@spark/protocol'
import { ids } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import { Engine } from '../src/engine.js'
import { SearchStore } from '../src/search/store.js'
import type { SearchEntry } from '../src/search/store.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

let dirs: string[] = []
let engines: Engine[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-search-'))
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
      // 句柄未释放的目录跳过清理（交系统临时目录回收）
    }
  }
  dirs = []
})

const SID = ids.session('sesSearchStore000000000')

function entry(over: Partial<SearchEntry> & Pick<SearchEntry, 'eventId' | 'content'>): SearchEntry {
  return {
    sessionId: SID,
    seq: 1,
    type: 'user.message',
    time: 1000,
    ...over,
  }
}

// ---------- SearchStore ----------

describe('SearchStore（~/.spark/search.db：FTS5 trigram + LIKE 降级）', () => {
  test('upsert/search 往返：新→旧排序；limit 截断；复合主键幂等覆盖', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    store.upsert(entry({ eventId: ids.event('evt_search_a'), content: '第一条内容', time: 1000 }))
    store.upsert(entry({ eventId: ids.event('evt_search_b'), content: '第二条内容', time: 2000 }))
    const hits = store.search('内容', 10)
    expect(hits.map((h) => h.eventId)).toEqual([
      ids.event('evt_search_b'),
      ids.event('evt_search_a'),
    ])
    expect(store.search('内容', 1)).toHaveLength(1)
    // 复合主键幂等：同 (session,event) 覆盖不重复
    store.upsert(entry({ eventId: ids.event('evt_search_a'), content: '改写后的内容', time: 3000 }))
    expect(store.search('改写后', 10)).toHaveLength(1)
    expect(store.search('第一条', 10)).toEqual([])
    store.close()
  })

  test('FTS trigram 中文子串命中（≥3 字符走 MATCH）', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    expect(store.fts).toBe(true) // Node bundled SQLite 含 FTS5；本机不支持则本用例如实失败
    store.upsert(entry({ eventId: ids.event('evt_search_fts1'), content: '会话全文搜索索引落地' }))
    store.upsert(entry({ eventId: ids.event('evt_search_fts2'), content: '与本条无关的文本' }))
    const hits = store.search('全文搜索', 10)
    expect(hits.map((h) => h.content)).toEqual(['会话全文搜索索引落地'])
    store.close()
  })

  test('短查询（<3 字符）走 LIKE 兜底；空查询空集', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    store.upsert(entry({ eventId: ids.event('evt_search_s1'), content: 'pnpm 管理依赖' }))
    expect(store.search('pn', 10)).toHaveLength(1)
    expect(store.search('', 10)).toEqual([])
    expect(store.search('   ', 10)).toEqual([])
    store.close()
  })

  test('自然语句召回链：整串不命中 → 拆词最长词 LIKE 兜底', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    store.upsert(
      entry({ eventId: ids.event('evt_search_t1'), content: 'convention: use pnpm as package manager' }),
    )
    const hits = store.search('which package manager do we use', 10)
    expect(hits.map((h) => h.content)).toEqual(['convention: use pnpm as package manager'])
    store.close()
  })

  test('removeAfter 截断 + FTS 同步：界外行删除后不再命中', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    store.upsert(entry({ eventId: ids.event('evt_search_r1'), seq: 1, content: '保留的关键词甲' }))
    store.upsert(entry({ eventId: ids.event('evt_search_r2'), seq: 5, content: '被截断的关键词乙' }))
    store.removeAfter(SID, 2)
    expect(store.search('关键词甲', 10)).toHaveLength(1)
    expect(store.search('关键词乙', 10)).toEqual([])
    store.close()
  })

  test('水位读写（无记录 null；覆盖写）', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    expect(store.watermark(SID)).toBeNull()
    store.setWatermark(SID, 42)
    expect(store.watermark(SID)).toBe(42)
    store.setWatermark(SID, 7)
    expect(store.watermark(SID)).toBe(7)
    store.close()
  })

  test('复合主键：fork 复制事件同 event id 跨会话不碰撞', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    const shared = ids.event('evt_search_shared000')
    const s2 = ids.session('sesSearchStore000000001')
    store.upsert(entry({ eventId: shared, content: '源会话的内容甲' }))
    store.upsert(entry({ eventId: shared, sessionId: s2, content: '分叉会话的内容乙' }))
    const hits = store.search('内容', 10)
    expect(hits).toHaveLength(2)
    expect(hits.map((h) => h.sessionId).sort()).toEqual([SID, s2].sort())
    store.close()
  })

  test('LIKE 通配符转义：% 与 _ 按字面值匹配', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    store.upsert(entry({ eventId: ids.event('evt_search_w1'), content: 'a_b 与 100% 的字面量' }))
    store.upsert(entry({ eventId: ids.event('evt_search_w2'), content: 'axb 与 1000 的干扰项' }))
    // 未转义时 'a_b' 会 LIKE 命中 'axb'；'100%' 会命中 '1000'
    expect(store.search('a_b', 10).map((h) => h.content)).toEqual(['a_b 与 100% 的字面量'])
    expect(store.search('100%', 10).map((h) => h.content)).toEqual(['a_b 与 100% 的字面量'])
    store.close()
  })

  test('千事件检索 <500ms（DoD 性能线）', () => {
    const store = new SearchStore(join(tempDir(), 'search.db'))
    for (let i = 0; i < 1000; i++) {
      store.upsert(
        entry({
          eventId: ids.event(`evt_search_perf${String(i).padStart(4, '0')}`),
          seq: i + 1,
          time: 1000 + i,
          content: i === 500 ? '唯一的关键词 PERFORMANCE_MARKER 在此' : `普通会话内容行 ${i}`,
        }),
      )
    }
    const started = performance.now()
    const hits = store.search('PERFORMANCE_MARKER', 20)
    const elapsed = performance.now() - started
    expect(hits).toHaveLength(1)
    expect(elapsed).toBeLessThan(500)
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

async function waitForEvent(
  events: SparkEventEnvelope[],
  pred: (e: SparkEventEnvelope) => boolean,
): Promise<void> {
  const deadline = Date.now() + 2000
  while (!events.some(pred)) {
    if (Date.now() > deadline) throw new Error('等待目标事件超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('Engine 全文搜索端到端（工单 7.13 验收）', () => {
  test('增量索引：user/assistant/title 三类命中 + 标题填充 + 摘要含命中词', async () => {
    const { engine, gateway, events } = makeEngineWith(makeConfig())
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'Spark 是一个 Agent 工作台' }] })
    gateway.scriptOnce('聊聊 Spark 的架构')
    const h = await engine.createSession()
    await h.send('介绍一下 Spark 的定位')
    await waitTurnDone(events)
    await waitForEvent(events, (e) => e.type === 'session.title')

    const userHits = engine.searchSessions('定位', 10)
    expect(userHits.some((r) => r.type === 'user.message')).toBe(true)
    const first = userHits.find((r) => r.type === 'user.message')
    expect(first?.sessionTitle).toBe('聊聊 Spark 的架构')
    expect(first?.snippet).toContain('定位')

    const asstHits = engine.searchSessions('工作台', 10)
    expect(asstHits.some((r) => r.type === 'assistant.message')).toBe(true)

    const titleHits = engine.searchSessions('架构', 10)
    expect(titleHits.some((r) => r.type === 'session.title')).toBe(true)
  })

  test('重启持久：同 root 重开 Engine（水位持平）命中仍在', async () => {
    const { root, engine, gateway, events } = makeEngineWith(makeConfig())
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '跨进程持久检索词' }] })
    gateway.scriptOnce('标题甲')
    const h = await engine.createSession()
    const sid = h.meta.id
    await h.send('记录一条消息')
    await waitTurnDone(events)
    await waitForEvent(events, (e) => e.type === 'session.title')
    expect(engine.searchSessions('跨进程持久', 10)).toHaveLength(1)
    await engine.shutdown()
    engines = engines.filter((e) => e !== engine)

    const second = makeEngineWith(makeConfig(), root)
    await second.engine.resumeSession(sid) // 装载点：水位持平跳过同步
    expect(second.engine.searchSessions('跨进程持久', 10)).toHaveLength(1)
  })

  test('删库后装载点增量重建：search.db 缺失由 JSONL 全量补回', async () => {
    const { root, engine, gateway, events } = makeEngineWith(makeConfig())
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '重建验证检索词' }] })
    gateway.scriptOnce('标题乙')
    const h = await engine.createSession()
    const sid = h.meta.id
    await h.send('记录另一条消息')
    await waitTurnDone(events)
    await waitForEvent(events, (e) => e.type === 'session.title')
    await engine.shutdown()
    engines = engines.filter((e) => e !== engine)

    const dbPath = join(root, 'search.db')
    expect(existsSync(dbPath)).toBe(true)
    rmSync(dbPath) // 测试自建临时文件——模拟索引损坏/缺失

    const second = makeEngineWith(makeConfig(), root)
    expect(second.engine.searchSessions('重建验证', 10)).toEqual([]) // 未装载：水位缺失且未同步
    await second.engine.resumeSession(sid) // 装载点全量重建
    const hits = second.engine.searchSessions('重建验证', 10)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.sessionId).toBe(sid)
  })
})
