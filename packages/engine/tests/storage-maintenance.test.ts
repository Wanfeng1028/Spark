/**
 * 数据维护单测（阶段十九工单 19.37 第三批）：桶清理的 §2.10 trash 纪律（白名单外拒绝 /
 * 检查点跨会话聚合清理 / trash 桶永久清空 / 单条失败计数）与 JSONL 打包导出导入
 * （marker + 原始行逐字保留 / 回导同名跳过 / 坏段计数 / 守恒）。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { CLEANABLE_BUCKETS, cleanupBucket, exportSessionsBundle, importSessionsBundle } from '../src/storage/maintenance.js'
import { sparkDir } from '../src/storage/paths.js'

const roots: string[] = []

function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
  roots.length = 0
})

function put(root: string, rel: string, body: string): string {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, body)
  return abs
}

function putSession(root: string, cwdDir: string, sid: string, header: Record<string, unknown>): string {
  const file = `2026-01-01T00-00-00-000Z_${sid}.jsonl`
  return put(root, `sessions/${cwdDir}/${file}`, JSON.stringify(header))
}

describe('cleanupBucket（19.37 第三批：§2.10 trash 纪律）', () => {
  test('白名单外桶如实拒绝（E_STORAGE_UNCLEANABLE），不碰任何文件', async () => {
    const root = makeRoot('spark-mnt-')
    put(root, 'sessions/x/ses_a.jsonl', '{}\n')
    await expect(cleanupBucket(root, 'sessions')).rejects.toThrow('E_STORAGE_UNCLEANABLE')
    await expect(cleanupBucket(root, 'memory.db')).rejects.toThrow('E_STORAGE_UNCLEANABLE')
    expect(existsSync(join(sparkDir(root, 'sessions'), 'x', 'ses_a.jsonl'))).toBe(true)
  })

  test('toolOutputs 清理 = 移入 trash/toolOutputs（可找回），原件消失', async () => {
    const root = makeRoot('spark-mnt-')
    put(root, 'toolOutputs/abc.bin', 'x'.repeat(100))
    const r = await cleanupBucket(root, 'toolOutputs')
    expect(r).toMatchObject({ bucket: 'toolOutputs', moved: 1, failed: 0, permanent: false })
    expect(existsSync(join(root, 'toolOutputs', 'abc.bin'))).toBe(false)
    const trashDir = sparkDir(root, 'trash')
    expect(existsSync(join(trashDir, 'toolOutputs'))).toBe(true)
    // 白名单一致性：四个可清理桶
    expect(CLEANABLE_BUCKETS).toContain('trash')
  })

  test('sessions/checkpoints 跨会话聚合清理：两个会话的检查点目录都进 trash', async () => {
    const root = makeRoot('spark-mnt-')
    put(root, 'sessions/projA/ses_a/checkpoints/ckpt1/git.pid', '1')
    put(root, 'sessions/projB/ses_b/checkpoints/ckpt2/git.pid', '2')
    const r = await cleanupBucket(root, 'sessions/checkpoints')
    expect(r.moved).toBe(2)
    expect(existsSync(join(root, 'sessions', 'projA', 'ses_a', 'checkpoints'))).toBe(false)
    expect(existsSync(join(sparkDir(root, 'trash'), 'sessions_checkpoints'))).toBe(true)
  })

  test('trash 桶清理 = 永久删除（回收站语义），正文会话不受影响', async () => {
    const root = makeRoot('spark-mnt-')
    put(root, 'trash/20260101-000000_ses_old.jsonl', '{}\n')
    putSession(root, 'projA', 'ses_keep0000000000001', { cwd: '/w', createdAt: 1, model: 'm' })
    const r = await cleanupBucket(root, 'trash')
    expect(r.permanent).toBe(true)
    expect(r.moved).toBe(1)
    expect(existsSync(join(sparkDir(root, 'trash'), '20260101-000000_ses_old.jsonl'))).toBe(false)
    // 会话正文不是可清理桶，永远原地
    expect(existsSync(join(sparkDir(root, 'sessions'), 'projA', '2026-01-01T00-00-00-000Z_ses_keep0000000000001.jsonl'))).toBe(true)
  })
})

describe('exportSessionsBundle / importSessionsBundle（19.37 第三批）', () => {
  test('导出 = marker 行 + 原始行逐字保留；回导同名跳过、未知会话恢复', async () => {
    const root = makeRoot('spark-mnt-')
    const header = { sparkVersion: 'test', cwd: '/w', createdAt: 1_700_000_000_000, model: 'fake/chat' }
    const eventLine = JSON.stringify({
      id: 'evt_x', sessionId: 'ses_mntcase000000000000001', type: 'user.message',
      time: 1_700_000_000_001, seq: 1, data: { text: 'hi' },
    })
    putSession(root, 'projA', 'ses_mntcase000000000000001', header)
    const file = join(sparkDir(root, 'sessions'), 'projA', '2026-01-01T00-00-00-000Z_ses_mntcase000000000000001.jsonl')
    writeFileSync(file, JSON.stringify(header) + '\n' + eventLine + '\n')

    const { bundle, files } = await exportSessionsBundle(root)
    expect(files).toBe(1)
    expect(bundle).toContain('"sparkBundle"')
    // 逐字保留：原始两行都在 bundle 里
    expect(bundle).toContain(JSON.stringify(header))
    expect(bundle).toContain(eventLine)

    // 回导到同一库：同名已存在 → skipped
    const again = await importSessionsBundle(root, bundle)
    expect(again).toEqual({ imported: 0, skipped: 1, failed: 0 })

    // 回导到空库：整段恢复，字节与导出一致（mungeDir 名含 hash 不可预知——扫目录对比）
    const empty = makeRoot('spark-mnt-imp-')
    const first = await importSessionsBundle(empty, bundle)
    expect(first).toEqual({ imported: 1, skipped: 0, failed: 0 })
    const dir = sparkDir(empty, 'sessions')
    const found: string[] = []
    for (const d of readdirSync(dir)) {
      for (const f of readdirSync(join(dir, d))) {
        if (f.endsWith('.jsonl')) found.push(join(dir, d, f))
      }
    }
    expect(found).toHaveLength(1)
    expect(readFileSync(found[0] ?? '', 'utf8')).toBe(readFileSync(file, 'utf8'))
  })

  test('坏段计数：无 id 文件名 / 首行非 header 如实 failed，不静默混过', async () => {
    const root = makeRoot('spark-mnt-')
    const bad = [
      JSON.stringify({ sparkBundle: 1, file: 'no-id-file.jsonl' }),
      '{}',
      JSON.stringify({ sparkBundle: 1, file: '2026-01-01T00-00-00-000Z_ses_mntcase000000000000002.jsonl' }),
      JSON.stringify({ notAHeader: true }),
      '',
    ].join('\n')
    const r = await importSessionsBundle(root, bad)
    expect(r.failed).toBe(2)
    expect(r.imported).toBe(0)
  })

  test('空库导出 = 空 bundle、0 文件', async () => {
    const root = makeRoot('spark-mnt-')
    const r = await exportSessionsBundle(root)
    expect(r.files).toBe(0)
    expect(r.bundle).toBe('')
  })
})
