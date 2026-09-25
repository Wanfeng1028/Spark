/**
 * 权限子系统 LA-01/02/03 收口单测（doc/11 §4.1 P0 / §6.1 整改批）：
 * - LA-02① evaluate 层间 deny 优先——用户级 deny 不可被项目 allow / 会话 always /
 *   档位放行翻案（推翻旧"扁平化 findLast"语义，doc/02 §5.7.1 规格行同批改写）；
 * - LA-02② TIGHTENED_ACTIONS 扩容——fs.write / agent.task / computer.use 在未信任
 *   目录下与 shell.exec 同样收紧（allow → ask）；
 * - LA-01 项目层信任门（service 侧契约）：sessionProject 提供时 defaultProject
 *   **不再回落**——未信任 cwd 返回 undefined 即整层不进评估；
 * - LA-03① 固化与级联按**会话 cwd 的项目层**走：跨项目不串门；
 * - LA-03② 无项目层（家目录撞用户文件 / 未信任）时 project 作用域如实抛
 *   E_PERMISSION_SCOPE，审批仍挂起可改答 once（fail-closed）。
 * - LA-04 规则可查看/可撤销：listPermissionRules 合成 source 的双层列表；
 *   removePermissionRule 按 scope 删对应层（项目规则同步删盘上文件）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids, type RequestId, type SparkEventEnvelope, type SparkEventType } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import type { EngineConfig, PermissionRule } from '../src/config.js'
import { Engine } from '../src/engine.js'
import { evaluate } from '../src/permission/rules.js'
import { PermissionServiceImpl, type ProjectLayer } from '../src/permission/service.js'
import type { RuleStore } from '../src/permission/store.js'
import { tightens } from '../src/trust.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import type { PermissionCheck } from '../src/tools/permission-port.js'
import { newIds } from '../src/ulid.js'
import { trustKey } from '../src/trust.js'

function isEvent<K extends SparkEventType>(
  e: SparkEventEnvelope,
  type: K,
): e is SparkEventEnvelope<K> {
  return e.type === type
}

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

class MemRuleStore implements RuleStore {
  constructor(public rules: PermissionRule[] = []) {}
  list(): readonly PermissionRule[] {
    return this.rules
  }
  add(rule: PermissionRule): void {
    const idx = this.rules.findIndex(
      (r) => r.action === rule.action && r.resource === rule.resource,
    )
    if (idx >= 0) this.rules[idx] = rule
    else this.rules.push(rule)
  }
  remove(action: string, resource: string): boolean {
    const idx = this.rules.findIndex((r) => r.action === action && r.resource === resource)
    if (idx < 0) return false
    this.rules.splice(idx, 1)
    return true
  }
}

const SID_A = ids.session('seslaatestA00000000000000001')
const SID_B = ids.session('seslaatestB00000000000000001')
const SID_C = ids.session('seslaatestC00000000000000001')

interface ServiceHandle {
  sink: MemSink
  service: PermissionServiceImpl
  /** cwd → 层登记表（测试直接操纵层内容与 store 断言） */
  layers: Map<string, ProjectLayer>
  userStore: MemRuleStore
}

function layerOf(
  key: string,
  rules: PermissionRule[] = [],
  withStore = true,
): ProjectLayer {
  return {
    rules,
    ...(withStore ? { store: new MemRuleStore(rules) } : {}),
    key,
  }
}

function makeService(opts?: {
  /** cwd → 层；缺省全部会话无项目层 */
  sessionLayers?: Map<string, ProjectLayer>
  userRules?: PermissionRule[]
  trust?: { tightens(action: string): boolean }
}): ServiceHandle {
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const userStore = new MemRuleStore(opts?.userRules ?? [])
  const sessionLayers = opts?.sessionLayers
  const service = new PermissionServiceImpl({
    bus,
    ruleStore: userStore,
    // defaultProject 刻意**不放规则**：它只该在未提供 sessionProject 的旧接线里生效，
    // 提供了 sessionProject 就必须按会话取层（LA-01 契约）
    defaultProject: { rules: [], key: 'default-unused' },
    ...(sessionLayers !== undefined
      ? {
          sessionProject: (sid: ReturnType<typeof ids.session>) =>
            sessionLayers.get(sid) ?? undefined,
        }
      : {}),
    timeoutMs: 300_000,
    ...(opts?.trust !== undefined ? { trust: opts.trust } : {}),
  })
  return { sink, service, layers: sessionLayers ?? new Map<string, ProjectLayer>(), userStore }
}

function makeCheck(over?: Partial<PermissionCheck>): PermissionCheck {
  return {
    sessionId: SID_A,
    callId: newIds.call(),
    turnId: newIds.turn(),
    name: 'bash',
    action: 'fs.write',
    resource: 'file:/repo/a.txt',
    input: {},
    signal: new AbortController().signal,
    ...over,
  }
}

/** 走真实 ask 挂起路径，回传 requestId 与 assert 的最终 Promise（按 check 的会话取最新挂起） */
async function pendAsk(
  service: PermissionServiceImpl,
  sink: MemSink,
  check: PermissionCheck,
): Promise<{ requestId: RequestId; promise: Promise<boolean> }> {
  const promise = service.assert(check)
  await new Promise<void>((r) => setTimeout(r, 0))
  const asked = sink.events
    .filter((e) => isEvent(e, 'permission.asked') && e.sessionId === check.sessionId)
    .at(-1)
  if (asked === undefined || !isEvent(asked, 'permission.asked')) {
    throw new Error('未产生挂起审批（测试前提不成立——规则层已放行/拒绝？）')
  }
  return { requestId: asked.data.requestId, promise }
}

// ---- LA-02①：evaluate 层间 deny 优先 ----

describe('evaluate 层间 deny 优先（LA-02①）', () => {
  test('用户级 deny 不可被项目级 allow 覆盖（本批核心：旧扁平 findLast 会给 allow）', () => {
    const userDeny: PermissionRule = { action: 'fs.write', resource: '**', effect: 'deny' }
    const projAllow: PermissionRule = { action: 'fs.write', resource: '**', effect: 'allow' }
    expect(evaluate('fs.write', 'file:/repo/a', [userDeny], [projAllow])).toBe('deny')
  })

  test('项目级 deny 同样压过会话临时 allow（deny 与层序无关，双向成立）', () => {
    const projDeny: PermissionRule = { action: 'shell.exec', resource: 'cmd:rm **', effect: 'deny' }
    const sessAllow: PermissionRule = { action: 'shell.exec', resource: 'cmd:**', effect: 'allow' }
    expect(evaluate('shell.exec', 'cmd:rm -rf /x', [], [projDeny], [sessAllow])).toBe('deny')
  })

  test('层内 findLast 保留：plan 兜底 deny 行不吞同层更晚的 fs.read allow', () => {
    const planLayer: PermissionRule[] = [
      { action: '*', resource: '**', effect: 'deny' },
      { action: 'fs.read', resource: '**', effect: 'allow' },
      { action: 'plan.exit', resource: '**', effect: 'ask' },
    ]
    expect(evaluate('fs.read', 'file:/a', planLayer)).toBe('allow')
    expect(evaluate('fs.write', 'file:/a', planLayer)).toBe('deny')
  })

  test('无 deny 时维持 last-match-wins：后层 ask 胜前层 allow', () => {
    const userAllow: PermissionRule = { action: 'fs.read', resource: '**', effect: 'allow' }
    const sessAsk: PermissionRule = { action: 'fs.read', resource: 'file:**', effect: 'ask' }
    expect(evaluate('fs.read', 'file:/a', [userAllow], [], [sessAsk])).toBe('ask')
  })
})

// ---- LA-02②：收紧面扩容 ----

describe('trust 收紧面扩容（LA-02②）', () => {
  test('fs.write / agent.task / computer.use 在未信任目录都收紧，fs.read 不收紧', () => {
    expect(tightens('fs.write', 'none')).toBe(true)
    expect(tightens('agent.task', 'untrusted')).toBe(true)
    expect(tightens('computer.use', 'none')).toBe(true)
    expect(tightens('shell.exec', 'none')).toBe(true)
    expect(tightens('mcp.call', 'untrusted')).toBe(true)
    expect(tightens('fs.read', 'none')).toBe(false)
    expect(tightens('fs.write', 'trusted')).toBe(false)
  })

  test('service 级：未信任 cwd 下用户层 allow 的 fs.write 降级为 ask（走真实挂起）', async () => {
    const { sink, service } = makeService({
      userRules: [{ action: 'fs.write', resource: '**', effect: 'allow' }],
      trust: { tightens: (action) => tightens(action, 'untrusted') },
    })
    const { requestId, promise } = await pendAsk(service, sink, makeCheck())
    // 收紧 = 问一次；once 答复照常放行（收紧审批而非扩权）
    expect(await service.reply(requestId, 'once')).toBe(true)
    expect(await promise).toBe(true)
  })
})

// ---- LA-01：项目层信任门 ----

describe('项目层信任门（LA-01）', () => {
  test('sessionProject 提供且返回 undefined → 项目层整层不进评估（defaultProject 不回落）', async () => {
    const { service, sink } = makeService({
      // sessionLayers 为空 Map：所有会话都查不到层 = 未信任形态
      sessionLayers: new Map(),
      userRules: [],
    })
    // 无任何规则 → 默认 ask（而非被 defaultProject / 项目 allow 放行）
    const { requestId, promise } = await pendAsk(service, sink, makeCheck())
    expect(await service.reply(requestId, 'once')).toBe(true)
    expect(await promise).toBe(true)
  })

  test('对照：信任后的层正常参与评估（allow 短路，零事件）', async () => {
    const layers = new Map([[SID_A, layerOf('cwdA', [
      { action: 'fs.write', resource: '**', effect: 'allow' },
    ])]])
    const { sink, service } = makeService({ sessionLayers: layers })
    expect(await service.assert(makeCheck())).toBe(true)
    expect(sink.events).toHaveLength(0)
  })
})

// ---- LA-03①：固化与级联按会话 cwd 的项目层走 ----

describe('project 固化按会话 cwd 落盘（LA-03①）', () => {
  function threeSessionLayers(): { layers: Map<string, ProjectLayer>; storeA: MemRuleStore; storeB: MemRuleStore } {
    const storeA = new MemRuleStore([])
    const storeB = new MemRuleStore([])
    // 同 key = 同一层对象（引擎按 cwdKey 缓存共享）：SID_A 与 SID_C 同 cwd 故共用 layerA
    const layerA: ProjectLayer = { rules: [], store: storeA, key: 'cwd-A' }
    const layers = new Map<string, ProjectLayer>([
      [SID_A, layerA],
      [SID_B, { rules: [], store: storeB, key: 'cwd-B' }],
      [SID_C, layerA],
    ])
    return { layers, storeA, storeB }
  }

  test('B 会话（cwd-B）点「本项目总是允许」写的是 cwd-B 的仓，A 的仓零写入', async () => {
    const { layers, storeA, storeB } = threeSessionLayers()
    const { sink, service, userStore } = makeService({ sessionLayers: layers })
    const { requestId, promise } = await pendAsk(
      service,
      sink,
      makeCheck({ sessionId: SID_B }),
    )
    expect(await service.reply(requestId, 'always', undefined, 'project')).toBe(true)
    expect(await promise).toBe(true)
    expect(storeB.list()).toHaveLength(1)
    expect(storeA.list()).toHaveLength(0)
    expect(userStore.list()).toHaveLength(0)
  })

  test('级联范围 = 同一项目层：cwd-A 里 SID_C 的同资源挂起被放行，cwd-B 的 SID_A 不动', async () => {
    const { layers, storeB } = threeSessionLayers()
    const { sink, service } = makeService({ sessionLayers: layers })
    // 在 A（cwd-A）挂一条写请求，并在 B（cwd-B）挂同资源写请求
    const pendA = await pendAsk(service, sink, makeCheck({ sessionId: SID_A }))
    const pendB = await pendAsk(
      service,
      sink,
      makeCheck({ sessionId: SID_B }),
    )
    // 用户在 A 的挂起上答 always+project
    expect(await service.reply(pendA.requestId, 'always', undefined, 'project')).toBe(true)
    expect(await pendA.promise).toBe(true)
    // 同层（SID_C，cwd-A）的同资源请求现在直接放行——SID_A 固化的规则进了同层
    // 评估列表（store.add + 就地 push 双写）；全程只有 A/B 两条挂起事件
    expect(await service.assert(makeCheck({ sessionId: SID_C }))).toBe(true)
    expect(sink.events.filter((e) => isEvent(e, 'permission.asked'))).toHaveLength(2)
    // 异层（SID_B，cwd-B）的挂起不受影响——仍挂起，once 可答
    expect(await service.reply(pendB.requestId, 'once')).toBe(true)
    expect(await pendB.promise).toBe(true)
    expect(storeB.list()).toHaveLength(0)
  })
})

// ---- LA-03②：无项目层时 project 作用域如实拒绝 ----

describe('无项目层：E_PERMISSION_SCOPE（LA-03②③）', () => {
  test('未信任（无层）+ project 固化 → 抛 E_PERMISSION_SCOPE，审批仍可 once', async () => {
    const { sink, service } = makeService({ sessionLayers: new Map() })
    const { requestId, promise } = await pendAsk(service, sink, makeCheck())
    await expect(service.reply(requestId, 'always', undefined, 'project')).rejects.toThrow(
      'E_PERMISSION_SCOPE',
    )
    expect(await service.reply(requestId, 'once')).toBe(true)
    expect(await promise).toBe(true)
  })

  test('层存在但只读（家目录撞用户文件形态：store 缺省）→ 同样拒绝', async () => {
    const layers = new Map([[SID_A, layerOf('home-cwd', [], false)]])
    const { sink, service } = makeService({ sessionLayers: layers })
    const { requestId, promise } = await pendAsk(service, sink, makeCheck())
    await expect(service.reply(requestId, 'always', undefined, 'project')).rejects.toThrow(
      'E_PERMISSION_SCOPE',
    )
    expect(await service.reply(requestId, 'once')).toBe(true)
    expect(await promise).toBe(true)
  })

  test('user 作用域不受影响：全局仓照常固化并级联全会话', async () => {
    const layers = new Map([
      [SID_A, layerOf('cwd-A')],
      [SID_B, layerOf('cwd-B')],
    ])
    const { sink, service, userStore } = makeService({ sessionLayers: layers })
    const { requestId, promise } = await pendAsk(service, sink, makeCheck())
    expect(await service.reply(requestId, 'always', undefined, 'user')).toBe(true)
    expect(await promise).toBe(true)
    expect(userStore.list()).toHaveLength(1)
    // user 规则全局：B 会话同资源新请求直接 allow（零事件）
    expect(await service.assert(makeCheck({ sessionId: SID_B }))).toBe(true)
  })
})

// ---- LA-04：规则可查看/可撤销（Engine 门面级） ----

const engines: Engine[] = []

afterEach(async () => {
  for (const e of engines) await e.shutdown()
  engines.length = 0
})

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
        computerUseEnabled: false,
        bashPersistent: false,
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
    permissions: { version: 1, rules: [{ action: 'fs.read', resource: '**', effect: 'allow' }] },
  }
}

describe('listPermissionRules / removePermissionRule 双层合成（LA-04）', () => {
  test('列表 = 用户级 + 项目级（defaultCwd 层）合成且 source 标注；project 删除同步删项目文件', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-la04-root-'))
    const cwd = await mkdtemp(join(tmpdir(), 'spark-la04-cwd-'))
    // 项目级规则文件 + 信任档（层存在的两个前提：文件有内容 + cwd 受信任）
    const projectRules: PermissionRule[] = [
      { action: 'shell.exec', resource: 'cmd:git *', effect: 'allow' },
    ]
    mkdirSync(join(cwd, '.spark'), { recursive: true })
    writeFileSync(join(cwd, '.spark', 'permissions.json'), JSON.stringify({ version: 1, rules: projectRules }))
    writeFileSync(join(root, 'trusted.json'), JSON.stringify({ version: 1, folders: { [trustKey(cwd)]: 'trusted' } }))

    const engine = new Engine({ root, gateway: new ScriptedLlm(), config: makeConfig(), cwd })
    engines.push(engine)

    const rules = engine.listPermissionRules()
    expect(rules).toEqual([
      { action: 'fs.read', resource: '**', effect: 'allow', source: 'user' },
      { action: 'shell.exec', resource: 'cmd:git *', effect: 'allow', source: 'project' },
    ])

    // 用 user 作用域删项目规则 → 删不到（false，规则保留）
    expect(engine.removePermissionRule('shell.exec', 'cmd:git *', 'user')).toBe(false)
    // project 作用域 → 内存与项目文件同步删
    expect(engine.removePermissionRule('shell.exec', 'cmd:git *', 'project')).toBe(true)
    expect(engine.listPermissionRules()).toEqual([
      { action: 'fs.read', resource: '**', effect: 'allow', source: 'user' },
    ])
    const onDisk = JSON.parse(
      readFileSync(join(cwd, '.spark', 'permissions.json'), 'utf8'),
    ) as { rules: PermissionRule[] }
    expect(onDisk.rules).toEqual([])
  })

  test('未信任 cwd：项目层缺席，列表如实只有用户级', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-la04-root2-'))
    const cwd = await mkdtemp(join(tmpdir(), 'spark-la04-cwd2-'))
    mkdirSync(join(cwd, '.spark'), { recursive: true })
    writeFileSync(
      join(cwd, '.spark', 'permissions.json'),
      JSON.stringify({ version: 1, rules: [{ action: 'fs.write', resource: '**', effect: 'allow' }] }),
    )
    const engine = new Engine({ root, gateway: new ScriptedLlm(), config: makeConfig(), cwd })
    engines.push(engine)
    expect(engine.listPermissionRules()).toEqual([
      { action: 'fs.read', resource: '**', effect: 'allow', source: 'user' },
    ])
  })
})
