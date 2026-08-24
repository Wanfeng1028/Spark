/**
 * SessionStore 单测（doc/02 §5.8.1/§5.8.4，§8.6 engine/session 行）：
 * 单写者 append/flush；mungeDir 确定性；坏行策略（尾行丢弃/非尾拒绝/ignorable 占行号/
 * seq 断洞拒绝）；resume 重建树；悬挂 turn 检测（resume 补闭合的输入）。
 */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import {
  SessionStore,
  danglingTurnIds,
  mungeDir,
  sessionFileName,
} from '../src/session/store.js'
import type { SessionHeader } from '../src/session/store.js'

const SID = ids.session('ses_store0000000000000000000')

const HEADER: SessionHeader = {
  sparkVersion: '0.1.0',
  cwd: '/tmp/proj',
  createdAt: 1700000000000,
  model: 'deepseek/deepseek-chat',
}

/** 测试信封：默认 session.title，over 覆盖 type/data 等 */
function env(n: number, over: Partial<SparkEventEnvelope> = {}): SparkEventEnvelope {
  const base: SparkEventEnvelope = {
    id: ids.event(`evt_store${String(n).padStart(3, '0')}`),
    sessionId: SID,
    seq: n,
    version: 1,
    time: 1700000000000 + n,
    type: 'session.title',
    data: { title: `t${n}` },
  }
  return { ...base, ...over }
}

/** 手工拼磁盘行（坏行测试用） */
function diskLine(e: SparkEventEnvelope, override: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...e, ...override })
}

async function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'spark-store-'))
}

async function writeRaw(content: string): Promise<string> {
  const dir = await tmpDir()
  const path = join(dir, 's.jsonl')
  await writeFile(path, content, 'utf8')
  return path
}

describe('mungeDir（§5.8.1 确定性防碰撞）', () => {
  it('doc 例：非 [A-Za-z0-9] 段合并为 -，尾缀 sha1(cwd) 前 8 位', () => {
    const cwd = 'E:\\code\\javascript\\project\\Spark'
    const hash = createHash('sha1').update(cwd).digest('hex').slice(0, 8)
    expect(mungeDir(cwd)).toBe(`E-code-javascript-project-Spark-${hash}`)
  })

  it('确定性：同 cwd 同结果；不同 cwd 不同结果', () => {
    expect(mungeDir('/home/wanfeng/spark')).toBe(mungeDir('/home/wanfeng/spark'))
    expect(mungeDir('/home/wanfeng/spark')).not.toBe(mungeDir('/home/wanfeng/spark2'))
  })

  it('超长 cwd：base 截断 48 字符后接 -hash8', () => {
    const cwd = `/${'a'.repeat(80)}`
    const hash = createHash('sha1').update(cwd).digest('hex').slice(0, 8)
    expect(mungeDir(cwd)).toBe(`-${'a'.repeat(47)}-${hash}`)
  })
})

describe('sessionFileName（§5.8.1 时间戳前缀）', () => {
  it('ISO 时间戳冒号转 -，格式 <ts>_<ses_id>.jsonl', () => {
    const ts = new Date(HEADER.createdAt).toISOString().replace(/:/g, '-')
    expect(sessionFileName(HEADER.createdAt, SID)).toBe(`${ts}_${SID}.jsonl`)
    expect(sessionFileName(HEADER.createdAt, SID)).not.toContain(':')
  })
})

describe('create / append / flush（单写者）', () => {
  it('建父目录、写 header 首行；read 回读 header 与零事件（header-only 可接受）', async () => {
    const dir = await tmpDir()
    const path = join(dir, 'nested', 'dir', sessionFileName(HEADER.createdAt, SID))
    const store = await SessionStore.create(path, HEADER)
    await store.close()

    const file = await SessionStore.read(path)
    expect(file.header).toEqual(HEADER)
    expect(file.events).toEqual([])
    const raw = await readFile(path, 'utf8')
    expect(raw.split('\n')[0]).toBe(JSON.stringify(HEADER))
  })

  it('append 填 parentId（首事件 null）并落盘，返回最终信封', async () => {
    const dir = await tmpDir()
    const path = join(dir, 's.jsonl')
    const store = await SessionStore.create(path, HEADER)

    const a = env(1)
    const gotA = await store.append(a)
    expect(gotA.parentId).toBeNull()

    const b = env(2)
    const gotB = await store.append(b)
    expect(gotB.parentId).toBe(a.id)
    await store.close()

    const file = await SessionStore.read(path)
    expect(file.events.map((e) => e.seq)).toEqual([1, 2])
    expect(file.events[0]?.parentId).toBeNull()
    expect(file.events[1]?.parentId).toBe(a.id)
  })

  it('树随落盘演进：leafId / pathToRoot 与磁盘行一致', async () => {
    const dir = await tmpDir()
    const store = await SessionStore.create(join(dir, 's.jsonl'), HEADER)

    const a = env(1)
    const b = env(2)
    await store.append(a)
    await store.append(b)
    await store.close()

    // close 前已进树；此处验证的是 append 后的状态（重新开一个 store 走 resume 路径在下方）
    expect(store.tree.leafId).toBe(b.id)
    expect(store.tree.pathToRoot().map((e) => e.id)).toEqual([a.id, b.id])
  })

  it('并发 append 按调用序落盘（单写者串行链）', async () => {
    const dir = await tmpDir()
    const path = join(dir, 's.jsonl')
    const store = await SessionStore.create(path, HEADER)

    const p1 = store.append(env(1))
    const p2 = store.append(env(2))
    const p3 = store.append(env(3))
    await Promise.all([p1, p2, p3])
    await store.close()

    const file = await SessionStore.read(path)
    expect(file.events.map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('flush 可重复调用（fsync 幂等入口）', async () => {
    const dir = await tmpDir()
    const store = await SessionStore.create(join(dir, 's.jsonl'), HEADER)
    await store.append(env(1))
    await store.flush()
    await store.flush()
    await store.close()
  })

  it('close 后 append 拒绝（fail-closed，不静默丢写）', async () => {
    const dir = await tmpDir()
    const store = await SessionStore.create(join(dir, 's.jsonl'), HEADER)
    await store.close()
    await expect(store.append(env(9))).rejects.toThrow(/E_SESSION_CLOSED/)
  })
})

describe('坏行策略（§5.8.4）', () => {
  it('尾行坏 JSON（带尾换行）：丢弃不报错（崩溃半写）', async () => {
    const path = await writeRaw(
      [JSON.stringify(HEADER), diskLine(env(1)), '{"id":"evt_torn0000000000000000'].join('\n') +
        '\n',
    )
    const file = await SessionStore.read(path)
    expect(file.events.map((e) => e.seq)).toEqual([1])
  })

  it('尾行坏 JSON（无尾换行，崩溃截断形态）：同样丢弃', async () => {
    const path = await writeRaw(
      [JSON.stringify(HEADER), diskLine(env(1)), '{"id":"evt_torn'].join('\n'),
    )
    const file = await SessionStore.read(path)
    expect(file.events.map((e) => e.seq)).toEqual([1])
  })

  it('非尾行坏 JSON：拒绝加载（fail-closed）', async () => {
    const path = await writeRaw(
      [JSON.stringify(HEADER), '{"broken":', diskLine(env(2))].join('\n') + '\n',
    )
    await expect(SessionStore.read(path)).rejects.toThrow(/E_SESSION_BAD_LINE/)
  })

  it('未知 type 且 ignorable:true：跳过但占行号（后续 seq 校验仍过）', async () => {
    const future = JSON.stringify({
      id: 'evt_future0000000000000000',
      sessionId: SID,
      time: 1700000000005,
      type: 'future.unknown-event',
      ignorable: true,
      data: { whatever: true },
    })
    const path = await writeRaw(
      [JSON.stringify(HEADER), diskLine(env(1)), future, diskLine(env(3))].join('\n') + '\n',
    )
    const file = await SessionStore.read(path)
    // 行 2 被跳过，行 3 的 seq==3 通过（dsh "seq = log.length" 契约）
    expect(file.events.map((e) => e.seq)).toEqual([1, 3])
  })

  it('未知 type 且无 ignorable：拒绝加载（协议演进保护）', async () => {
    const future = JSON.stringify({
      id: 'evt_future0000000000000000',
      sessionId: SID,
      time: 1700000000002,
      type: 'future.unknown-event',
      data: {},
    })
    const path = await writeRaw(
      [JSON.stringify(HEADER), diskLine(env(1)), future].join('\n') + '\n',
    )
    await expect(SessionStore.read(path)).rejects.toThrow(/E_SESSION_UNKNOWN_EVENT/)
  })

  it('seq 断洞（行删除形态）：拒绝加载', async () => {
    // 行 2 被删：lineNo 2 处事件的 seq=3 ≠ 2
    const path = await writeRaw(
      [JSON.stringify(HEADER), diskLine(env(1)), diskLine(env(3))].join('\n') + '\n',
    )
    await expect(SessionStore.read(path)).rejects.toThrow(/E_SESSION_SEQ_GAP/)
  })

  it('空文件：拒绝（E_SESSION_EMPTY）', async () => {
    const path = await writeRaw('')
    await expect(SessionStore.read(path)).rejects.toThrow(/E_SESSION_EMPTY/)
  })

  it('首行非 JSON：拒绝（E_SESSION_BAD_HEADER）', async () => {
    const path = await writeRaw('not-json\n')
    await expect(SessionStore.read(path)).rejects.toThrow(/E_SESSION_BAD_HEADER/)
  })

  it('首行缺字段：拒绝（E_SESSION_BAD_HEADER）', async () => {
    const path = await writeRaw('{"sparkVersion":"0.1.0"}\n')
    await expect(SessionStore.read(path)).rejects.toThrow(/E_SESSION_BAD_HEADER/)
  })
})

describe('resume（§5.8.4）', () => {
  it('重建 header 与树；续写 parentId 接叶', async () => {
    const dir = await tmpDir()
    const path = join(dir, 's.jsonl')
    const s1 = await SessionStore.create(path, HEADER)
    const a = env(1)
    const b = env(2)
    await s1.append(a)
    await s1.append(b)
    await s1.close()

    const s2 = await SessionStore.resume(path)
    expect(s2.header).toEqual(HEADER)
    expect(s2.tree.pathToRoot().map((e) => e.id)).toEqual([a.id, b.id])
    expect(s2.tree.leafId).toBe(b.id)

    const c = env(3)
    const gotC = await s2.append(c)
    expect(gotC.parentId).toBe(b.id)
    await s2.close()

    const file = await SessionStore.read(path)
    expect(file.events.map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('孤儿 parentId：拒绝加载（fail-closed，§5.8.1 与 pi 的分歧点）', async () => {
    const path = await writeRaw(
      [
        JSON.stringify(HEADER),
        diskLine(env(1), { parentId: null }),
        diskLine(env(2), { parentId: 'evt_missing000000000000000' }),
      ].join('\n') + '\n',
    )
    await expect(SessionStore.resume(path)).rejects.toThrow(/E_TREE_ORPHAN/)
  })
})

describe('danglingTurnIds（§5.8.4 resume 补闭合输入）', () => {
  const T1 = ids.turn('trn_0000000000000000000000a1')
  const T2 = ids.turn('trn_0000000000000000000000a2')
  const UE1 = ids.event('evt_ue00000000000000000000001')

  it('turn.started 无对应 completed → 检出；已闭合的不检出', () => {
    const events = [
      env(1, {
        type: 'turn.started',
        data: { turnId: T1, delivery: 'now', userEventId: UE1 },
      }),
      env(2, { type: 'user.message', data: { text: 'hi' } }),
      env(3, {
        type: 'turn.started',
        data: { turnId: T2, delivery: 'now', userEventId: UE1 },
      }),
      env(4, { type: 'turn.completed', data: { turnId: T1, finish: 'stop' } }),
    ]
    expect(danglingTurnIds(events)).toEqual([T2])
  })

  it('多个悬挂按出现序返回；无悬挂返回空', () => {
    const events = [
      env(1, {
        type: 'turn.started',
        data: { turnId: T1, delivery: 'now', userEventId: UE1 },
      }),
      env(2, {
        type: 'turn.started',
        data: { turnId: T2, delivery: 'queue', userEventId: UE1 },
      }),
    ]
    expect(danglingTurnIds(events)).toEqual([T1, T2])

    const closed = [
      ...events,
      env(3, { type: 'turn.completed', data: { turnId: T2, finish: 'stop' } }),
      env(4, { type: 'turn.completed', data: { turnId: T1, finish: 'aborted' } }),
    ]
    expect(danglingTurnIds(closed)).toEqual([])
  })
})
