/**
 * read-state 文件新鲜度守卫单测（ZC 参考工单批次 ZC-5 / ADR D55，doc/02 §5.6.3）：
 * 直接驱动三工具 execute（ctx 注入 ReadFileStateMap）覆盖登记 / 拦截 / 豁免 /
 * 刷新 / stat 通道 / 未注入退化，外加管线级接线（ToolPipelineImpl 注入 ctx）。
 * 外部改动用 writeFile / utimes 模拟用户与 linter 的两种真实形态。
 */
import { mkdtemp, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import type { ToolContext } from '../src/tools/definition.js'
import { readTool } from '../src/tools/builtin/read.js'
import { writeTool } from '../src/tools/builtin/write.js'
import { editTool } from '../src/tools/builtin/edit.js'
import { readStateKey, type ReadFileStateMap } from '../src/tools/read-state.js'
import { EventBus, type EventSink } from '../src/bus.js'
import { ZERO_USAGE } from '../src/llm-gateway.js'
import type { TurnCtx, ToolCallPending } from '../src/run-loop.js'
import { ToolRegistry } from '../src/tools/registry.js'
import { ToolPipelineImpl } from '../src/tools/pipeline.js'
import { ToolOutputStore } from '../src/tools/output-store.js'
import type { PermissionCheck, PermissionService } from '../src/tools/permission-port.js'

async function makeCwd(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'spark-readstate-'))
}

function makeCtx(cwd: string, map?: ReadFileStateMap): ToolContext {
  return {
    sessionId: ids.session('ses_readstate'),
    turnId: ids.turn('trn_readstate'),
    callId: ids.call('calreadstate'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd,
    ...(map !== undefined ? { readFileState: map } : {}),
  }
}

async function writeFixture(cwd: string, name: string, content: string): Promise<string> {
  const abs = join(cwd, name)
  await writeFile(abs, content, 'utf8')
  return abs
}

describe('read 登记（ZC-5 read-state）', () => {
  test('整读登记内容基线：full=true + content + stat 基线', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'l1\nl2\nl3\n')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt' })
    const entry = map.get(readStateKey(abs))
    expect(entry).toBeDefined()
    expect(entry?.full).toBe(true)
    expect(entry?.content).toBe('l1\nl2\nl3\n')
    expect(entry?.sourceTool).toBe('read')
    expect(entry?.sizeBytes).toBe(Buffer.byteLength('l1\nl2\nl3\n', 'utf8'))
    const info = await stat(abs)
    expect(entry?.mtimeMs).toBe(Math.floor(info.mtimeMs))
  })

  test('显式窗口恰好覆盖全文件 → full=true 存内容', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'l1\nl2\nl3\n')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt', limit: 10 })
    expect(map.get(readStateKey(abs))?.full).toBe(true)
  })

  test('显式 offset 窗口 → full=false 只登记 stat 基线（不存内容）', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'l1\nl2\nl3\n')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt', offset: 1, limit: 1 })
    const entry = map.get(readStateKey(abs))
    expect(entry?.full).toBe(false)
    expect(entry?.content).toBeUndefined()
    expect(entry?.mtimeMs).toBeDefined()
  })

  test('尾部窗口（>2000 行默认截取）→ full=false', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(
      cwd,
      'big.txt',
      Array.from({ length: 2005 }, (_, i) => `line${i}`).join('\n') + '\n',
    )
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'big.txt' })
    const entry = map.get(readStateKey(abs))
    expect(entry?.full).toBe(false)
    expect(entry?.content).toBeUndefined()
  })

  test('未注入 map：读后不登记（直接驱动旧行为契约）', async () => {
    const cwd = await makeCwd()
    await writeFixture(cwd, 'a.txt', 'x')
    await readTool.execute(makeCtx(cwd), { path: 'a.txt' })
    // 无 map 可断言 → 只验证不抛错；守卫退化契约在 edit 组锁
  })
})

describe('edit 守卫（ZC-5 read-state）', () => {
  test('未 read 直接 edit → E_NOT_READ', async () => {
    const cwd = await makeCwd()
    await writeFixture(cwd, 'a.txt', 'hello world')
    await expect(
      editTool.execute(makeCtx(cwd, new Map()), { path: 'a.txt', oldString: 'hello', newString: 'hi' }),
    ).rejects.toThrow('E_NOT_READ')
  })

  test('未注入 map：无 read 也放行（守卫不启用，旧行为不变）', async () => {
    const cwd = await makeCwd()
    await writeFixture(cwd, 'a.txt', 'hello world')
    const r = await editTool.execute(makeCtx(cwd), {
      path: 'a.txt',
      oldString: 'hello',
      newString: 'hi',
    })
    expect(r.isError).toBe(false)
  })

  test('read 后未变 → 成功，且基线刷新为 edit 结果（连续编辑不需重读）', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'hello world')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt' })
    const r1 = await editTool.execute(makeCtx(cwd, map), {
      path: 'a.txt',
      oldString: 'hello',
      newString: 'hi',
    })
    expect(r1.isError).toBe(false)
    const entry = map.get(readStateKey(abs))
    expect(entry?.sourceTool).toBe('edit')
    expect(entry?.content).toBe('hi world')
    // 第二次编辑无需重新 read
    const r2 = await editTool.execute(makeCtx(cwd, map), {
      path: 'a.txt',
      oldString: 'world',
      newString: 'there',
    })
    expect(r2.isError).toBe(false)
    expect(await readFile(abs, 'utf8')).toBe('hi there')
  })

  test('read 后被外部改写 → E_STALE', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'hello world')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt' })
    await writeFile(abs, 'user typed new stuff', 'utf8')
    await expect(
      editTool.execute(makeCtx(cwd, map), { path: 'a.txt', oldString: 'hello', newString: 'hi' }),
    ).rejects.toThrow('E_STALE')
  })

  test('read 后仅 touch（mtime 变、内容同）→ 内容通道豁免，编辑成功', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'hello world')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt' })
    const future = new Date(Date.now() + 60_000)
    await utimes(abs, future, future)
    const r = await editTool.execute(makeCtx(cwd, map), {
      path: 'a.txt',
      oldString: 'hello',
      newString: 'hi',
    })
    expect(r.isError).toBe(false)
  })

  test('窗口读后未变 → stat 通道通过（不强制整读）', async () => {
    const cwd = await makeCwd()
    await writeFixture(cwd, 'a.txt', 'l1\nl2\nl3\n')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt', offset: 1, limit: 1 })
    const r = await editTool.execute(makeCtx(cwd, map), {
      path: 'a.txt',
      oldString: 'l2',
      newString: 'L2',
    })
    expect(r.isError).toBe(false)
  })

  test('窗口读后被外部改 → stat 通道 E_STALE', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'l1\nl2\nl3\n')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt', offset: 1, limit: 1 })
    await writeFile(abs, 'l1\nchanged\nl3\n', 'utf8')
    await expect(
      editTool.execute(makeCtx(cwd, map), { path: 'a.txt', oldString: 'l2', newString: 'L2' }),
    ).rejects.toThrow('E_STALE')
  })
})

describe('write 守卫（ZC-5 read-state）', () => {
  test('新建文件不需要 read → 成功', async () => {
    const cwd = await makeCwd()
    const r = await writeTool.execute(makeCtx(cwd, new Map()), { path: 'new.txt', content: 'x' })
    expect(r.isError).toBe(false)
  })

  test('覆盖已存在文件未 read → E_NOT_READ', async () => {
    const cwd = await makeCwd()
    await writeFixture(cwd, 'a.txt', 'old')
    await expect(
      writeTool.execute(makeCtx(cwd, new Map()), { path: 'a.txt', content: 'new' }),
    ).rejects.toThrow('E_NOT_READ')
  })

  test('read 后被外部改 → E_STALE（stat 通道，不读旧内容）', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'old')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt' })
    await writeFile(abs, 'externally replaced', 'utf8')
    await expect(
      writeTool.execute(makeCtx(cwd, map), { path: 'a.txt', content: 'new' }),
    ).rejects.toThrow('E_STALE')
  })

  test('read 后覆盖成功 → 基线刷新（再次覆盖不需重读）', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'old')
    const map: ReadFileStateMap = new Map()
    await readTool.execute(makeCtx(cwd, map), { path: 'a.txt' })
    const r1 = await writeTool.execute(makeCtx(cwd, map), { path: 'a.txt', content: 'v2' })
    expect(r1.isError).toBe(false)
    expect(map.get(readStateKey(abs))?.sourceTool).toBe('write')
    expect(map.get(readStateKey(abs))?.content).toBe('v2')
    const r2 = await writeTool.execute(makeCtx(cwd, map), { path: 'a.txt', content: 'v3' })
    expect(r2.isError).toBe(false)
    expect(await readFile(abs, 'utf8')).toBe('v3')
  })
})

describe('键归一（ZC-5 read-state）', () => {
  test('win32 大小写不敏感，POSIX 原样', () => {
    expect(readStateKey('C:\\A\\Foo.ts', 'win32')).toBe('c:\\a\\foo.ts')
    expect(readStateKey('/srv/Foo.ts', 'linux')).toBe('/srv/Foo.ts')
  })
})

// —— 管线级接线：ToolPipelineImpl 必须把每会话基线注入 ToolContext（read→edit 跨调用生效）

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

class StubPerm implements PermissionService {
  assert(check: PermissionCheck): Promise<boolean> {
    void check
    return Promise.resolve(true)
  }
  isDenied(): boolean {
    return false
  }
}

function makeTurn(): TurnCtx {
  return {
    turnId: ids.turn('trn_readstate'),
    delivery: 'now',
    abort: new AbortController(),
    step: 1,
    usage: ZERO_USAGE,
    toolCalls: [],
  }
}

function pending(name: string, input: Record<string, unknown>): ToolCallPending {
  callSeq += 1
  // CallIdSchema 只允许 [0-9A-Za-z]
  return { callId: ids.call(`calp${callSeq}`), name, input }
}
let callSeq = 0

describe('管线接线（ZC-5 read-state）：基线经 ToolContext 注入，read→edit 跨调用生效', () => {
  test('read 后 edit 成功；外部改后 edit 回 E_STALE', async () => {
    const cwd = await makeCwd()
    const abs = await writeFixture(cwd, 'a.txt', 'hello world')
    const registry = new ToolRegistry()
    registry.register(readTool)
    registry.register(editTool)
    const outDir = await mkdtemp(join(tmpdir(), 'spark-outputs-'))
    const pipeline = new ToolPipelineImpl({
      sessionId: ids.session('sesreadstate'),
      bus: new EventBus({ sink: new MemSink() }),
      registry,
      permission: new StubPerm(),
      outputs: new ToolOutputStore(32 * 1024, outDir),
      cwd,
      maxToolParallel: 8,
      progressThrottleMs: 10,
    })

    const r1 = await pipeline.runAll(makeTurn(), [pending('read', { path: 'a.txt' })])
    expect(r1.map((r) => r.isError)).toEqual([false])
    const r2 = await pipeline.runAll(makeTurn(), [
      pending('edit', { path: 'a.txt', oldString: 'hello', newString: 'hi' }),
    ])
    expect(r2.map((r) => r.isError)).toEqual([false])
    expect(await readFile(abs, 'utf8')).toBe('hi world')

    await writeFile(abs, 'user rewrote it', 'utf8')
    const r3 = await pipeline.runAll(makeTurn(), [
      pending('edit', { path: 'a.txt', oldString: 'hi', newString: 'hey' }),
    ])
    expect(r3[0]?.isError).toBe(true)
    expect((r3[0]?.output as { code?: string }).code).toBe('E_STALE')
  })
})
