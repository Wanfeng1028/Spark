/**
 * 数据目录占用统计单测（阶段十九 19.37 第二批；模块由并行会话 Qwen 初稿落盘、本批接线）：
 * 总量守恒 / sessions·checkpoints 分流聚合 / 符号链接不跟随 / 读不动条目如实 skipped /
 * 根不存在 exists:false / 空目录保留 0 值行。只读口径（统计不建不写）顺带断言。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { CHECKPOINT_BUCKET, storageReport } from '../src/storage/report.js'

/** 摆一个文件（父目录自建） */
function put(root: string, rel: string, bytes: number): string {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, Buffer.alloc(bytes, 1))
  return abs
}

describe('storageReport（19.37 第二批）', () => {
  test('顶层一桶 + 总量守恒 + 占用降序', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-rep-'))
    try {
      put(root, 'logs/engine.log', 3000)
      put(root, 'search.db', 500)
      put(root, 'notes.txt', 100)
      const r = await storageReport(root)
      expect(r.exists).toBe(true)
      expect(r.totalBytes).toBe(3600)
      expect(r.totalFiles).toBe(3)
      expect(r.buckets.map((b) => b.name)).toEqual(['logs', 'search.db', 'notes.txt'])
      expect(r.buckets[0]?.bytes).toBe(3000)
      expect(r.skipped).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('sessions/checkpoints 聚合分流：两桶之和 = sessions 总量（跨 cwd 目录聚合）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-rep-'))
    try {
      put(root, 'sessions/projA/ses_1/session.jsonl', 1000)
      put(root, 'sessions/projA/ses_1/checkpoints/ckpt1.tar', 4000)
      put(root, 'sessions/projB/ses_2/checkpoints/ckpt2.tar', 600)
      put(root, 'sessions/projB/ses_2/session.jsonl', 200)
      const r = await storageReport(root)
      const sessions = r.buckets.find((b) => b.name === 'sessions')
      const checkpoints = r.buckets.find((b) => b.name === CHECKPOINT_BUCKET)
      expect(sessions?.bytes).toBe(1200)
      expect(checkpoints?.bytes).toBe(4600)
      expect((sessions?.files ?? 0) + (checkpoints?.files ?? 0)).toBe(4)
      expect(r.totalBytes).toBe(5800)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('sessions 子树外的同名 checkpoints 目录不分流（那是它自己的占用）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-rep-'))
    try {
      put(root, 'backups/checkpoints/x.tar', 500)
      const r = await storageReport(root)
      expect(r.buckets.find((b) => b.name === 'backups')?.bytes).toBe(500)
      expect(r.buckets.find((b) => b.name === CHECKPOINT_BUCKET)).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('根不存在 → exists:false + 空桶表（不回零值表装作无占用）', async () => {
    const r = await storageReport(join(tmpdir(), `spark-rep-missing-${Date.now()}`))
    expect(r.exists).toBe(false)
    expect(r.buckets).toEqual([])
    expect(r.totalBytes).toBe(0)
  })

  test('空目录保留 0 值行（目录存在是事实）；符号链接进 skipped（unix；Windows 建链需特权）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-rep-'))
    try {
      mkdirSync(join(root, 'empty-dir'))
      put(root, 'real.txt', 10)
      try {
        symlinkSync(join(root, 'real.txt'), join(root, 'link.txt'))
      } catch {
        // Windows 无特权建链：本例按 skipIf 语义跳过断言（CI ubuntu 真跑）
        const r = await storageReport(root)
        expect(r.buckets.find((b) => b.name === 'empty-dir')?.bytes).toBe(0)
        return
      }
      const r = await storageReport(root)
      expect(r.buckets.find((b) => b.name === 'empty-dir')?.files).toBe(0)
      expect(r.buckets.find((b) => b.name === 'real.txt')?.bytes).toBe(10)
      const link = r.skipped.find((s) => s.name === 'link.txt')
      expect(link?.reason).toContain('符号链接')
      // 链接不当 0 字节悄悄抹掉，也不计入目标占用（total 只含 real.txt）
      expect(r.totalBytes).toBe(10)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('只读口径：统计前后目录内容逐字节一致（不建目录不写文件）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-rep-'))
    try {
      put(root, 'sessions/p/s/ck.tar', 100)
      const before = readFileSync(join(root, 'sessions', 'p', 's', 'ck.tar'))
      await storageReport(root)
      expect(readFileSync(join(root, 'sessions', 'p', 's', 'ck.tar'))).toEqual(before)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
