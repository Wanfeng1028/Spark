/**
 * PermissionService 单测（doc/02 §5.7 / §8.6 engine/permission 行）：
 * evaluate 优先级矩阵（用户/项目/会话三层 findLast）与 wildcard 语义；
 * ask 挂起→reply once/always/reject；always 写入 + 同批放行；reject 级联 +
 * feedback 注入 user.message；超时/中断/dispose fail-closed；deny 工具不广告；
 * 项目级规则文件加载。
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ids, type RequestId, type SparkEventEnvelope, type SparkEventType } from '@spark/protocol'
import { EventBus, type EventSink } from '../src/bus.js'
import { ConfigError, loadProjectRules, type PermissionRule } from '../src/config.js'
import { evaluate } from '../src/permission/rules.js'
import { PermissionServiceImpl } from '../src/permission/service.js'
import type { PermissionCheck } from '../src/tools/permission-port.js'
import { newIds } from '../src/ulid.js'

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

const SID = ids.session('sespermtest0000000000000000')
const SID2 = ids.session('sespermtest2000000000000000')

function makeService(opts?: {
  userRules?: PermissionRule[]
  projectRules?: PermissionRule[]
  timeoutMs?: number
}): { sink: MemSink; service: PermissionServiceImpl } {
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const service = new PermissionServiceImpl({
    bus,
    userRules: opts?.userRules ?? [],
    projectRules: opts?.projectRules ?? [],
    timeoutMs: opts?.timeoutMs ?? 300_000,
  })
  return { sink, service }
}

interface CheckBundle {
  check: PermissionCheck
  controller: AbortController
}

function makeCheck(overrides?: Partial<PermissionCheck>): CheckBundle {
  const controller = new AbortController()
  const check: PermissionCheck = {
    sessionId: SID,
    callId: newIds.call(),
    turnId: newIds.turn(),
    name: 'bash',
    action: 'shell.exec',
    resource: 'cmd:rm -rf /tmp/x',
    input: { command: 'rm -rf /tmp/x' },
    signal: controller.signal,
    ...overrides,
  }
  return { check, controller }
}

/** 挂起一个 ask：等到 asked 落盘后返回 { requestId, promise } */
async function pendAsk(
  service: PermissionServiceImpl,
  sink: MemSink,
  check: PermissionCheck,
): Promise<{ requestId: RequestId; promise: Promise<boolean> }> {
  const before = sink.events.filter((e) => isEvent(e, 'permission.asked')).length
  const promise = service.assert(check)
  await vi.waitFor(() => {
    expect(sink.events.filter((e) => isEvent(e, 'permission.asked')).length).toBe(before + 1)
  })
  const asked = sink.events.filter((e) => isEvent(e, 'permission.asked')).at(-1)
  if (asked === undefined || !isEvent(asked, 'permission.asked')) {
    throw new Error('asked 事件缺失（测试前提不成立）')
  }
  return { requestId: asked.data.requestId, promise }
}

afterEach(() => {
  vi.useRealTimers()
})

// ---- evaluate（§5.7.1） ----

describe('evaluate 优先级矩阵（§8.6：临时>项目>用户>默认 ask）', () => {
  const USER_ALLOW: PermissionRule = { action: 'shell.exec', resource: 'cmd:rm **', effect: 'allow' }
  const PROJ_DENY: PermissionRule = { action: 'shell.exec', resource: 'cmd:rm **', effect: 'deny' }
  const SESS_ASK: PermissionRule = { action: 'shell.exec', resource: 'cmd:rm **', effect: 'ask' }

  test('无规则 → 默认 ask', () => {
    expect(evaluate('shell.exec', 'cmd:rm -rf /tmp/x')).toBe('ask')
  })

  test('用户级 allow 单独生效', () => {
    expect(evaluate('shell.exec', 'cmd:rm -rf /tmp/x', [USER_ALLOW])).toBe('allow')
  })

  test('项目级 deny 覆盖用户级 allow（findLast：项目在后）', () => {
    expect(evaluate('shell.exec', 'cmd:rm -rf /tmp/x', [USER_ALLOW], [PROJ_DENY])).toBe('deny')
  })

  test('会话临时层最高：项目 allow 之上再 ask', () => {
    const projAllow: PermissionRule = { ...PROJ_DENY, effect: 'allow' }
    expect(evaluate('shell.exec', 'cmd:rm -rf /tmp/x', [projAllow], [], [SESS_ASK])).toBe('ask')
  })

  test('同层多条命中 findLast 胜出（后写赢）', () => {
    const rules: PermissionRule[] = [
      { action: 'shell.exec', resource: 'cmd:**', effect: 'deny' },
      { action: 'shell.exec', resource: 'cmd:rm **', effect: 'allow' },
    ]
    expect(evaluate('shell.exec', 'cmd:rm -rf /tmp/x', rules)).toBe('allow')
  })

  test('action 不匹配的规则不参与', () => {
    expect(evaluate('fs.read', 'file:/a', [USER_ALLOW])).toBe('ask')
  })
})

describe('evaluate wildcard 语义（* 单段 / ** 跨段）', () => {
  test('file:** 跨段匹配任意路径', () => {
    const rule: PermissionRule = { action: 'fs.read', resource: 'file:**', effect: 'allow' }
    expect(evaluate('fs.read', 'file:/a/b/c.ts', [rule])).toBe('allow')
  })

  test('file:src/* 单段不跨目录', () => {
    const rule: PermissionRule = { action: 'fs.read', resource: 'file:src/*', effect: 'allow' }
    expect(evaluate('fs.read', 'file:src/a.ts', [rule])).toBe('allow')
    expect(evaluate('fs.read', 'file:src/sub/a.ts', [rule])).toBe('ask')
  })

  test('cmd:git * 匹配无斜杠复合命令；含 / 回落（fail-closed 方向）', () => {
    const rule: PermissionRule = { action: 'shell.exec', resource: 'cmd:git *', effect: 'allow' }
    expect(evaluate('shell.exec', 'cmd:git status', [rule])).toBe('allow')
    expect(evaluate('shell.exec', 'cmd:git push origin main', [rule])).toBe('allow')
    expect(evaluate('shell.exec', 'cmd:git push origin feature/x', [rule])).toBe('ask')
  })

  test('action 也支持通配（fs.* 匹配 fs.read）', () => {
    const rule: PermissionRule = { action: 'fs.*', resource: '**', effect: 'deny' }
    expect(evaluate('fs.read', 'file:/a', [rule])).toBe('deny')
    expect(evaluate('shell.exec', 'cmd:ls', [rule])).toBe('ask')
  })

  test('** 是全域 pattern（匹配一切 resource）', () => {
    const rule: PermissionRule = { action: '*', resource: '**', effect: 'deny' }
    expect(evaluate('anything.go', 'any resource', [rule])).toBe('deny')
  })
})

// ---- PermissionServiceImpl（§5.7.2） ----

describe('PermissionServiceImpl.assert 快路径', () => {
  test('allow：直接 true，零事件', async () => {
    const { sink, service } = makeService({
      userRules: [{ action: 'shell.exec', resource: 'cmd:rm **', effect: 'allow' }],
    })
    const { check } = makeCheck()
    expect(await service.assert(check)).toBe(true)
    expect(sink.events).toHaveLength(0)
  })

  test('deny：直接 false，零事件（E_PERMISSION 事件由管线补）', async () => {
    const { sink, service } = makeService({
      userRules: [{ action: 'shell.exec', resource: 'cmd:**', effect: 'deny' }],
    })
    const { check } = makeCheck()
    expect(await service.assert(check)).toBe(false)
    expect(sink.events).toHaveLength(0)
  })

  test('入口已 abort：fail-closed 直接 false，零事件', async () => {
    const { sink, service } = makeService()
    const { check, controller } = makeCheck()
    controller.abort()
    expect(await service.assert(check)).toBe(false)
    expect(sink.events).toHaveLength(0)
  })
})

describe('ask → reply（§5.7.2 时序）', () => {
  test('once：asked 事件字段齐全 → resolved{once} → assert true', async () => {
    const { sink, service } = makeService()
    const { check } = makeCheck()
    const { requestId, promise } = await pendAsk(service, sink, check)
    const asked = sink.events.find((e) => isEvent(e, 'permission.asked'))
    expect(asked?.data).toMatchObject({
      requestId,
      callId: check.callId,
      action: 'shell.exec',
      resource: 'cmd:rm -rf /tmp/x',
    })
    expect(asked?.data.reason).toContain('bash')
    expect(await service.reply(requestId, 'once')).toBe(true)
    const resolved = sink.events.find((e) => isEvent(e, 'permission.resolved'))
    expect(resolved?.data).toMatchObject({ requestId, reply: 'once' })
    expect(await promise).toBe(true)
  })

  test('reject（带 feedback）：resolved{reject, feedback} + user.message 注入回喂', async () => {
    const { sink, service } = makeService()
    const { check } = makeCheck()
    const { requestId, promise } = await pendAsk(service, sink, check)
    expect(await service.reply(requestId, 'reject', '别删这个目录')).toBe(true)
    const resolved = sink.events.find((e) => isEvent(e, 'permission.resolved'))
    expect(resolved?.data).toMatchObject({ requestId, reply: 'reject', feedback: '别删这个目录' })
    const userMsg = sink.events.find((e) => isEvent(e, 'user.message'))
    expect(userMsg?.data.text).toBe('别删这个目录')
    expect(await promise).toBe(false)
  })

  test('reject（无 feedback）：不注入 user.message', async () => {
    const { sink, service } = makeService()
    const { check } = makeCheck()
    const { requestId } = await pendAsk(service, sink, check)
    await service.reply(requestId, 'reject')
    expect(sink.events.some((e) => isEvent(e, 'user.message'))).toBe(false)
  })

  test('reply 未知 requestId → false（server 层映射 404）', async () => {
    const { service } = makeService()
    expect(await service.reply(newIds.request(), 'once')).toBe(false)
  })

  test('重复 reply 同一 requestId：第二次 false（已决）', async () => {
    const { sink, service } = makeService()
    const { check } = makeCheck()
    const { requestId } = await pendAsk(service, sink, check)
    expect(await service.reply(requestId, 'once')).toBe(true)
    expect(await service.reply(requestId, 'once')).toBe(false)
  })

  test('always：写入会话临时层，后续同 action/resource 直接放行', async () => {
    const { sink, service } = makeService()
    const { check } = makeCheck()
    const { requestId, promise } = await pendAsk(service, sink, check)
    expect(await service.reply(requestId, 'always')).toBe(true)
    expect(await promise).toBe(true)
    const resolved = sink.events.find((e) => isEvent(e, 'permission.resolved'))
    expect(resolved?.data).toMatchObject({ requestId, reply: 'always' })
    // 第二次同规则直接 allow，不再 asked
    const second = makeCheck()
    expect(await service.assert(second.check)).toBe(true)
    expect(sink.events.filter((e) => isEvent(e, 'permission.asked'))).toHaveLength(1)
  })

  test('always 级联：同 action/resource 的其他挂起项一并放行', async () => {
    const { sink, service } = makeService()
    const first = await pendAsk(service, sink, makeCheck().check)
    const second = await pendAsk(service, sink, makeCheck().check)
    expect(first.requestId).not.toBe(second.requestId)
    await service.reply(second.requestId, 'always')
    expect(await first.promise).toBe(true)
    expect(await second.promise).toBe(true)
    const resolvedAll = sink.events.filter((e) => isEvent(e, 'permission.resolved'))
    expect(resolvedAll).toHaveLength(2)
    expect(
      resolvedAll.every((e) => isEvent(e, 'permission.resolved') && e.data.reply === 'always'),
    ).toBe(true)
  })

  test('reject 级联：同会话其余挂起一并自动 reject（补强 2）', async () => {
    const { sink, service } = makeService()
    const a = await pendAsk(service, sink, makeCheck({ action: 'fs.write', resource: 'file:/tmp/a' }).check)
    const b = await pendAsk(
      service,
      sink,
      makeCheck({ action: 'fs.write', resource: 'file:/tmp/b' }).check,
    )
    await service.reply(a.requestId, 'reject')
    expect(await a.promise).toBe(false)
    expect(await b.promise).toBe(false)
    const resolvedAll = sink.events.filter((e) => isEvent(e, 'permission.resolved'))
    expect(resolvedAll).toHaveLength(2)
    expect(
      resolvedAll.every((e) => isEvent(e, 'permission.resolved') && e.data.reply === 'reject'),
    ).toBe(true)
  })

  test('reject 级联只影响同会话（他 session 挂起不动）', async () => {
    const { sink, service } = makeService()
    const mine = await pendAsk(service, sink, makeCheck().check)
    const other = await pendAsk(service, sink, makeCheck({ sessionId: SID2 }).check)
    await service.reply(mine.requestId, 'reject')
    expect(await mine.promise).toBe(false)
    // 他会话的挂起未被级联：仍可正常 reply
    expect(await service.reply(other.requestId, 'once')).toBe(true)
    expect(await other.promise).toBe(true)
  })
})

describe('fail-closed（超时/中断/dispose）', () => {
  test('超时：resolve(deny) + resolved{reject}', async () => {
    vi.useFakeTimers()
    const { sink, service } = makeService({ timeoutMs: 5_000 })
    const { check } = makeCheck()
    const { requestId, promise } = await pendAsk(service, sink, check)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await promise).toBe(false)
    const resolved = sink.events.find((e) => isEvent(e, 'permission.resolved'))
    expect(resolved?.data).toMatchObject({ requestId, reply: 'reject' })
  })

  test('turn 中断（AbortSignal）：挂起级联拒绝', async () => {
    const { sink, service } = makeService()
    const { check, controller } = makeCheck()
    const { requestId, promise } = await pendAsk(service, sink, check)
    controller.abort()
    expect(await promise).toBe(false)
    const resolved = sink.events.find((e) => isEvent(e, 'permission.resolved'))
    expect(resolved?.data).toMatchObject({ requestId, reply: 'reject' })
  })

  test('dispose：shutdown 收尾，全部挂起 resolve(deny)（补强 7）', async () => {
    const { sink, service } = makeService()
    const a = await pendAsk(service, sink, makeCheck().check)
    const b = await pendAsk(service, sink, makeCheck().check)
    await service.dispose()
    expect(await a.promise).toBe(false)
    expect(await b.promise).toBe(false)
    expect(sink.events.filter((e) => isEvent(e, 'permission.resolved'))).toHaveLength(2)
  })
})

describe('deny 工具不广告（§5.7 补强 5）', () => {
  test('resource ** 的 deny 规则 → isDenied true', () => {
    const { service } = makeService({
      userRules: [{ action: 'fs.read', resource: '**', effect: 'deny' }],
    })
    expect(service.isDenied('fs.read')).toBe(true)
    expect(service.isDenied('fs.write')).toBe(false)
  })

  test('非全域 deny（file:**）不算禁用工具', () => {
    const { service } = makeService({
      userRules: [{ action: 'fs.read', resource: 'file:**', effect: 'deny' }],
    })
    expect(service.isDenied('fs.read')).toBe(false)
  })

  test('无规则 → 不禁用（默认 ask）', () => {
    const { service } = makeService()
    expect(service.isDenied('shell.exec')).toBe(false)
  })
})

// ---- 项目级规则文件（§5.7.1） ----

describe('loadProjectRules（<cwd>/.spark/permissions.json）', () => {
  test('文件不存在 → 空表', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spark-projrules-'))
    expect(loadProjectRules(dir)).toEqual([])
  })

  test('合法文件 → 规则表', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spark-projrules-'))
    await mkdir(join(dir, '.spark'))
    await writeFile(
      join(dir, '.spark', 'permissions.json'),
      JSON.stringify({
        version: 1,
        rules: [{ action: 'fs.read', resource: 'file:**', effect: 'allow' }],
      }),
      'utf8',
    )
    expect(loadProjectRules(dir)).toEqual([
      { action: 'fs.read', resource: 'file:**', effect: 'allow' },
    ])
  })

  test('坏 JSON → ConfigError（E_CONFIG）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spark-projrules-'))
    await mkdir(join(dir, '.spark'))
    await writeFile(join(dir, '.spark', 'permissions.json'), '{not json', 'utf8')
    expect(() => loadProjectRules(dir)).toThrow(ConfigError)
  })

  test('校验失败（非法 effect）→ ConfigError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spark-projrules-'))
    await mkdir(join(dir, '.spark'))
    await writeFile(
      join(dir, '.spark', 'permissions.json'),
      JSON.stringify({
        version: 1,
        rules: [{ action: 'fs.read', resource: '**', effect: 'maybe' }],
      }),
      'utf8',
    )
    expect(() => loadProjectRules(dir)).toThrow(ConfigError)
  })
})
