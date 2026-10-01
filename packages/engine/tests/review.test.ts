/**
 * GitCheckpointer.review 单测（工单 19.35 审查聚合）：
 * 无快照只聚合未跟踪新增（patch 手工合成）；快照后修改/新增/删除的状态与统计；
 * from 指定快照的基准语义与不存在快照 E_NOT_FOUND；.gitignore 生效（exclude-standard）；
 * 会话别名过滤；patch 预算截断（truncated 如实标注）；二进制探测。
 * 夹具为真 git + 临时目录（快照仓在 checkpointsRoot，与 cwd 分离——与引擎接线同形）。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { GitCheckpointer } from '../src/checkpoint.js'
import { EventBus, type EventSink } from '../src/bus.js'
import type { SparkLogger } from '../src/logger.js'

const SID = ids.session('sesreviewtest00000000000000')

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

const SILENT_LOGGER = {
  level: 'silent',
  info() {},
  warn() {},
  error() {},
  debug() {},
} as unknown as SparkLogger

async function makeFixture(): Promise<{
  cwd: string
  cp: GitCheckpointer
}> {
  const root = await mkdtemp(join(tmpdir(), 'spark-review-'))
  const cwd = join(root, 'work')
  await mkdir(cwd, { recursive: true })
  // 会话文件必须真实存在——snapshot 的 hash-object -w 对缺失路径直接抛错（快照永不落地）
  await writeFile(join(root, 'session.jsonl'), '', 'utf8')
  const cp = new GitCheckpointer({
    sessionId: SID,
    cwd,
    sessionPath: join(root, 'session.jsonl'),
    checkpointRoot: join(root, 'checkpoints'),
    bus: new EventBus({ sink: new MemSink() }),
    logger: SILENT_LOGGER,
  })
  return { cwd, cp }
}

/** 写工作区文件（review 的 diff 域就是 work-tree——文件必须落在 cwd 内） */
function write(cwd: string, rel: string, content: string): Promise<void> {
  return writeFile(join(cwd, rel), content, 'utf8')
}

function pathsOf(review: { files: { path: string }[] }): string[] {
  return review.files.map((f) => f.path)
}

describe('GitCheckpointer.review（19.35 审查聚合）', () => {
  test('无快照：未跟踪新增聚合为 added，patch 手工合成（含全部 + 行）', async () => {
    const { cwd, cp } = await makeFixture()
    await write(cwd, 'hello.txt', 'line1\nline2\n')
    const review = await cp.review()
    expect(review.baseCheckpointId).toBeNull()
    expect(review.baseTurnId).toBeNull()
    expect(pathsOf(review)).toEqual(['hello.txt'])
    expect(review.files[0]).toMatchObject({
      path: 'hello.txt',
      status: 'added',
      additions: 2,
      deletions: 0,
      binary: false,
    })
    expect(review.patches).toHaveLength(1)
    expect(review.patches[0]?.path).toBe('hello.txt')
    expect(review.patches[0]?.patch).toContain('diff --git a/hello.txt b/hello.txt')
    expect(review.patches[0]?.patch).toContain('+line1')
    expect(review.truncated).toBe(false)
  })

  test('快照后修改/新增/删除：tracked diff 三态并存，基准为最近快照', async () => {
    const { cwd, cp } = await makeFixture()
    await write(cwd, 'a.txt', 'one\n')
    await write(cwd, 'b.txt', 'gone\n')
    await cp.snapshot(ids.turn('trn_review01'))
    await write(cwd, 'a.txt', 'one\ntwo\nthree\n') // modified +2
    await rm(join(cwd, 'b.txt')) // deleted（快照里有、工作区没了）
    await write(cwd, 'c.txt', 'fresh\n') // added（未跟踪）
    const review = await cp.review()
    expect(review.baseCheckpointId).not.toBeNull()
    expect(review.baseTurnId).toBe('trn_review01')
    expect(pathsOf(review)).toEqual(['a.txt', 'b.txt', 'c.txt'])
    expect(review.files.find((f) => f.path === 'a.txt')).toMatchObject({
      status: 'modified',
      additions: 2,
      deletions: 0,
    })
    expect(review.files.find((f) => f.path === 'b.txt')).toMatchObject({
      status: 'deleted',
      additions: 0,
      deletions: 1,
    })
    expect(review.files.find((f) => f.path === 'c.txt')).toMatchObject({
      status: 'added',
      additions: 1,
    })
    expect(review.patches.map((p) => p.path).sort()).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })

  test('删除文件的 patch 含删除行（-x1 形态）', async () => {
    const { cwd, cp } = await makeFixture()
    await write(cwd, 'doomed.txt', 'x1\nx2\n')
    await cp.snapshot(ids.turn('trn_review02'))
    await rm(join(cwd, 'doomed.txt'))
    const review = await cp.review()
    const patch = review.patches.find((p) => p.path === 'doomed.txt')
    expect(patch?.patch).toContain('-x1')
  })

  test('from 指定不存在快照 → E_NOT_FOUND；指定存在快照 → 以其为基准', async () => {
    const { cwd, cp } = await makeFixture()
    await write(cwd, 'v1.txt', 'v1\n')
    await cp.snapshot(ids.turn('trn_review03'))
    const first = (await cp.list())[0]
    if (first === undefined) throw new Error('快照缺失（前提不成立）')
    await expect(cp.review(ids.checkpoint('ckp_nosuch'))).rejects.toThrow('E_NOT_FOUND')
    await write(cwd, 'v2.txt', 'v2\n')
    const fromFirst = await cp.review(first.checkpointId)
    expect(fromFirst.baseCheckpointId).toBe(first.checkpointId)
    // v1.txt 已在基准快照内且未变更——变更聚合不列未变文件
    expect(pathsOf(fromFirst)).toEqual(['v2.txt'])
    await write(cwd, 'v1.txt', 'v1-changed\n')
    const changed = await cp.review(first.checkpointId)
    expect(pathsOf(changed).sort()).toEqual(['v1.txt', 'v2.txt'])
  })

  test('.gitignore 生效：exclude-standard 不列忽略文件', async () => {
    const { cwd, cp } = await makeFixture()
    await write(cwd, '.gitignore', 'ignored.txt\n')
    await write(cwd, 'ignored.txt', 'noisy\n')
    const review = await cp.review()
    expect(pathsOf(review)).toEqual(['.gitignore'])
  })

  test('会话别名路径被过滤（untracked 场景）', async () => {
    const { cwd, cp } = await makeFixture()
    await mkdir(join(cwd, '.spark-checkpoint'), { recursive: true })
    await write(cwd, '.spark-checkpoint/session.jsonl', '{}\n')
    const review = await cp.review()
    expect(pathsOf(review)).toEqual([])
  })

  test('patch 预算截断：超预算文件有统计无 patch，truncated=true', async () => {
    const { cwd, cp } = await makeFixture()
    // 预算 256KB（checkpoint.ts REVIEW_PATCH_BUDGET，未导出——数值对齐即过）；行数取到 patch 体积稳超
    const big = Array.from({ length: Math.ceil((256 * 1024) / 3) }, (_, i) => `l${i}`).join('\n')
    await write(cwd, 'big.txt', big)
    const review = await cp.review()
    expect(review.truncated).toBe(true)
    expect(review.patches.find((p) => p.path === 'big.txt')).toBeUndefined()
  })

  test('二进制文件：binary=true、无 patch、additions=0', async () => {
    const { cwd, cp } = await makeFixture()
    await writeFile(join(cwd, 'img.bin'), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))
    const review = await cp.review()
    expect(review.files.find((f) => f.path === 'img.bin')).toMatchObject({
      status: 'added',
      binary: true,
      additions: 0,
    })
    expect(review.patches.find((p) => p.path === 'img.bin')).toBeUndefined()
  })
})
