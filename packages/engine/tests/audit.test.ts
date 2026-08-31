/**
 * 审计日志单测（阶段七工单 7.12 / H11）：
 * AuditLog JSONL 往返（新→旧）/ 写前脱敏（静态三层 + 密钥仓动态值）/ 坏行跳过 /
 * since·kind·result·tool·limit 过滤；PermissionService 审计挂点（规则快路径层归因、
 * reply/超时主体与来源、always 固化规则行）；Engine 门面（规则管理行 / rollback 行 /
 * listAudit 读）。
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids, type RequestId, type SparkEventEnvelope } from '@spark/protocol'
import { AuditLog, type AuditEntry } from '../src/audit/log.js'
import { EventBus, type EventSink } from '../src/bus.js'
import type { EngineConfig } from '../src/config.js'
import { Engine } from '../src/engine.js'
import type { PermissionRule } from '../src/config.js'
import { PermissionServiceImpl } from '../src/permission/service.js'
import type { RuleStore } from '../src/permission/store.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import type { PermissionCheck } from '../src/tools/permission-port.js'
import { newIds } from '../src/ulid.js'

const SID = ids.session('sesaudittest00000000000000')

function entry(over: Partial<AuditEntry> & Pick<AuditEntry, 'time' | 'kind' | 'actor' | 'result'>): AuditEntry {
  return over
}

describe('AuditLog 存储语义（工单 7.12）', () => {
  test('往返：记录后 entries 新→旧；坏行跳过', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-audit-'))
    const log = new AuditLog(root)
    log.record(entry({ time: 100, kind: 'permission.decision', actor: 'system', result: 'allow', tool: 'Read' }))
    log.record(entry({ time: 200, kind: 'session.rollback', actor: 'user', result: 'ok' }))
    log.record(entry({ time: 300, kind: 'permission.rule', actor: 'user', result: 'applied', op: 'add' }))
    appendFileSync(join(root, 'audit.jsonl'), 'not-json\n') // 单行损坏不阻塞列表

    const rows = log.entries({ limit: 10 })
    expect(rows.map((r) => r.time)).toEqual([300, 200, 100])
    expect(rows.map((r) => r.kind)).toEqual(['permission.rule', 'session.rollback', 'permission.decision'])
  })

  test('写前脱敏：静态密钥正则与密钥仓动态值均不入库', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-audit-'))
    const dynamic = ['vault-token-abcdef']
    const log = new AuditLog(root, () => dynamic)
    log.record(
      entry({
        time: 1,
        kind: 'permission.decision',
        actor: 'system',
        result: 'deny',
        resource: 'sk-abcdefghijklmnopqrstuvwxyz Bearer hunter2secret vault-token-abcdef',
      }),
    )
    const raw = readFileSync(join(root, 'audit.jsonl'), 'utf8')
    expect(raw).not.toContain('sk-abcdefghijklmnopqrstuvwxyz')
    expect(raw).not.toContain('hunter2secret')
    expect(raw).not.toContain('vault-token-abcdef')
    expect(raw).toContain('***')
    // 动态值追加后即时生效（同 IoGuard 模式：构造时持取值函数，不快照）
    dynamic.push('late-secret-value')
    log.record(entry({ time: 2, kind: 'permission.rule', actor: 'user', result: 'applied', resource: 'late-secret-value' }))
    expect(readFileSync(join(root, 'audit.jsonl'), 'utf8')).not.toContain('late-secret-value')
  })

  test('过滤：since / kind / result / tool 叠加后取末 limit 条', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-audit-'))
    const log = new AuditLog(root)
    for (let i = 0; i < 5; i++) {
      log.record(entry({ time: i, kind: 'permission.decision', actor: 'system', result: i % 2 === 0 ? 'allow' : 'deny', tool: 'Bash' }))
    }
    log.record(entry({ time: 9, kind: 'permission.decision', actor: 'user', result: 'allow', tool: 'Write' }))
    log.record(entry({ time: 10, kind: 'session.rollback', actor: 'user', result: 'ok' }))

    expect(log.entries({ limit: 100, kind: 'permission.decision', result: 'allow', tool: 'Bash' }).map((r) => r.time)).toEqual([4, 2, 0])
    expect(log.entries({ limit: 100, since: 9 }).map((r) => r.time)).toEqual([10, 9])
    expect(log.entries({ limit: 2 }).map((r) => r.time)).toEqual([10, 9])
  })
})

// ---- PermissionService 审计挂点（服务层单测；夹具同 permission.test.ts） ----

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
    const idx = this.rules.findIndex((r) => r.action === rule.action && r.resource === rule.resource)
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

function makeService(
  root: string,
  opts?: { userRules?: PermissionRule[]; timeoutMs?: number },
): { sink: MemSink; service: PermissionServiceImpl; log: AuditLog } {
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const log = new AuditLog(root)
  const service = new PermissionServiceImpl({
    bus,
    ruleStore: new MemRuleStore(opts?.userRules ?? []),
    projectRules: [],
    timeoutMs: opts?.timeoutMs ?? 300_000,
    audit: log,
  })
  return { sink, service, log }
}

function makeCheck(over?: Partial<PermissionCheck>): PermissionCheck {
  return {
    sessionId: SID,
    callId: newIds.call(),
    turnId: newIds.turn(),
    name: 'bash',
    action: 'shell.exec',
    resource: 'echo hi',
    input: { command: 'echo hi' },
    signal: new AbortController().signal,
    ...over,
  }
}

/** 挂起一个 ask：等到新增一条 asked 入流后返回 { requestId, promise }
 *（按计数等新增——同一测试内多次挂起时不得命中上一条已决事件） */
async function pendAsk(
  service: PermissionServiceImpl,
  sink: MemSink,
  check: PermissionCheck,
): Promise<{ requestId: RequestId; promise: Promise<boolean> }> {
  const askedBefore = sink.events.filter((e) => e.type === 'permission.asked').length
  const promise = service.assert(check)
  const deadline = Date.now() + 2000
  while (sink.events.filter((e) => e.type === 'permission.asked').length <= askedBefore) {
    if (Date.now() > deadline) throw new Error('等待 permission.asked 超时')
    await new Promise((r) => setTimeout(r, 5))
  }
  const asked = sink.events
    .filter((e): e is SparkEventEnvelope<'permission.asked'> => e.type === 'permission.asked')
    .at(-1)
  if (asked === undefined) throw new Error('permission.asked 缺失（不可达）')
  return { requestId: asked.data.requestId, promise }
}

describe('PermissionService 审计挂点（工单 7.12）', () => {
  test('规则快路径：决策行 + 层归因（用户层 / 档位层）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-audit-'))
    const { service, log } = makeService(root, {
      userRules: [
        { action: 'shell.exec', resource: 'rm *', effect: 'deny' },
        { action: 'fs.read', resource: '**', effect: 'allow' },
      ],
    })

    expect(await service.assert(makeCheck({ resource: 'rm *' }))).toBe(false)
    expect(await service.assert(makeCheck({ action: 'fs.read', resource: 'a.txt' }))).toBe(true)
    service.setPreset(SID, 'auto-edit')
    expect(await service.assert(makeCheck({ action: 'fs.write', resource: 'b.txt' }))).toBe(true)

    const rows = log.entries({ limit: 10 })
    expect(rows.map((r) => `${r.result}:${r.source}`)).toEqual([
      'allow:rule:preset',
      'allow:rule:user',
      'deny:rule:user',
    ])
    expect(rows.every((r) => r.kind === 'permission.decision' && r.actor === 'system')).toBe(true)
    expect(rows[0]?.sessionId).toBe(SID)
    expect(rows[0]?.tool).toBe('bash')
  })

  test('用户答复：主体 user + reply 来源；always 另记规则固化行', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-audit-'))
    const { sink, service, log } = makeService(root)

    const once = await pendAsk(service, sink, makeCheck())
    expect(await service.reply(once.requestId, 'once')).toBe(true)
    expect(await once.promise).toBe(true)

    const always = await pendAsk(service, sink, makeCheck({ resource: 'npm test' }))
    expect(await service.reply(always.requestId, 'always')).toBe(true)
    expect(await always.promise).toBe(true)

    const rows = log.entries({ limit: 10 })
    const decisions = rows.filter((r) => r.kind === 'permission.decision')
    expect(decisions.map((r) => `${r.actor}:${r.source}:${r.result}`)).toEqual([
      'user:reply:always:allow',
      'user:reply:once:allow',
    ])
    const ruleRow = rows.find((r) => r.kind === 'permission.rule')
    expect(ruleRow).toMatchObject({
      actor: 'user',
      result: 'applied',
      op: 'add',
      effect: 'allow',
      action: 'shell.exec',
      resource: 'npm test',
      source: 'reply:always',
    })
  })

  test('超时 fail-closed：system/timeout/deny', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-audit-'))
    const { service, log } = makeService(root, { timeoutMs: 20 })
    expect(await service.assert(makeCheck())).toBe(false)
    const rows = log.entries({ limit: 10 })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'permission.decision', actor: 'system', result: 'deny', source: 'timeout' })
  })
})

// ---- Engine 门面集成（规则管理行 / 审批全链路 / rollback 行） ----

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

const engines: Engine[] = []

async function makeEngine(opts?: {
  rules?: PermissionRule[]
  checkpoints?: boolean
}): Promise<{ engine: Engine; gateway: ScriptedLlm; events: SparkEventEnvelope[] }> {
  const root = await mkdtemp(join(tmpdir(), 'spark-audit-eng-'))
  const gateway = new ScriptedLlm()
  const config = makeConfig()
  if (opts?.rules !== undefined) config.permissions.rules = opts.rules
  if (opts?.checkpoints === true) config.spark.engine.checkpoints = true
  const engine = new Engine({ root, gateway, config })
  engines.push(engine)
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    events.push(e)
  })
  return { engine, gateway, events }
}

async function waitFor(pred: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000
  for (;;) {
    if (pred()) return
    if (Date.now() > deadline) throw new Error(`等待 ${what} 超时`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

afterEach(async () => {
  for (const e of engines) await e.shutdown()
  engines.length = 0
})

describe('Engine 审计集成（工单 7.12）', () => {
  test('规则管理：add/remove 记 permission.rule 行（设置页来源）', async () => {
    const { engine } = await makeEngine()
    engine.addPermissionRule({ action: 'fs.read', resource: '**', effect: 'allow' })
    expect(engine.removePermissionRule('fs.read', '**')).toBe(true)
    expect(engine.removePermissionRule('fs.read', '**')).toBe(false) // 不存在不记行

    const rows = engine.listAudit({ limit: 10, kind: 'permission.rule' })
    expect(rows.map((r) => `${r.op}:${r.source}`)).toEqual(['remove:settings-ui', 'add:settings-ui'])
    expect(rows[1]).toMatchObject({ action: 'fs.read', resource: '**', effect: 'allow' })
  })

  test('审批全链路：deny 规则快路径 + reply once 归因（bash 工具）', async () => {
    const denied = await makeEngine({
      rules: [{ action: 'shell.exec', resource: '**', effect: 'deny' }],
    })
    denied.gateway.scriptStep({
      content: [{ type: 'toolCall', callId: ids.call('cal_auditdeny0000000000'), name: 'bash', input: { command: 'echo x' } }],
    })
    denied.gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const h1 = await denied.engine.createSession()
    await h1.send('跑命令')
    await waitFor(() => denied.events.some((e) => e.type === 'turn.completed'), 'deny turn')

    const denyRow = denied.engine.listAudit({ limit: 10, kind: 'permission.decision' })[0]
    expect(denyRow).toMatchObject({ result: 'deny', actor: 'system', source: 'rule:user', tool: 'bash' })

    const asked = await makeEngine()
    asked.gateway.scriptStep({
      content: [{ type: 'toolCall', callId: ids.call('cal_auditask00000000000'), name: 'bash', input: { command: 'echo hi' } }],
    })
    asked.gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const h2 = await asked.engine.createSession()
    await h2.send('跑命令')
    await waitFor(() => asked.events.some((e) => e.type === 'permission.asked'), 'permission.asked')
    const ev = asked.events.find((e) => e.type === 'permission.asked') as SparkEventEnvelope<'permission.asked'>
    expect(await asked.engine.replyPermission(ev.data.requestId, 'once')).toBe('ok')
    await waitFor(() => asked.events.some((e) => e.type === 'turn.completed'), 'reply turn')

    const allowRow = asked.engine.listAudit({ limit: 10, kind: 'permission.decision' })[0]
    expect(allowRow).toMatchObject({ result: 'allow', actor: 'user', source: 'reply:once', tool: 'bash' })
  })

  test('回滚记 session.rollback 行（含 checkpointId）', async () => {
    const { engine, gateway } = await makeEngine({ checkpoints: true })
    const ws = await mkdtemp(join(tmpdir(), 'spark-audit-ws-'))
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '答复一' }] })
    const handle = await engine.createSession({ cwd: ws })
    await handle.send('问题一')
    // 等首个快照落盘（checkpointsOf 轮询——谓词异步，不能用同步签名的 waitFor）
    const deadline = Date.now() + 2000
    while ((await engine.checkpointsOf(handle.id)).length < 1) {
      if (Date.now() > deadline) throw new Error('等待快照超时')
      await new Promise((r) => setTimeout(r, 10))
    }
    const list = await engine.checkpointsOf(handle.id)
    const first = list[0]
    if (first === undefined) throw new Error('快照记录缺失')
    await engine.rollbackToCheckpoint(handle.id, first.checkpointId)

    const row = engine.listAudit({ limit: 10, kind: 'session.rollback' })[0]
    expect(row).toMatchObject({
      actor: 'user',
      result: 'ok',
      sessionId: handle.id,
      checkpointId: first.checkpointId,
      source: 'checkpoint',
    })
  })
})
