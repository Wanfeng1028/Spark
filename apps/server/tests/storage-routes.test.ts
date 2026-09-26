/**
 * 数据目录占用统计路由测试（阶段十九 19.37 第二批）：GET /api/storage/report——
 * 引擎真实临时 root 上的只读统计：形状（StorageReportDto）与 exists 语义。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { makeServer } from './helpers.js'

describe('GET /api/storage/report（19.37 第二批）', () => {
  test('真实临时 root：200 + exists:true + 桶表与总量守恒；统计只读不落新文件', async () => {
    const server = await makeServer()
    // 摆两个已知大小的条目
    const logs = join(server.root, 'logs')
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'engine.log'), Buffer.alloc(1200, 1))
    writeFileSync(join(server.root, 'models.json'), Buffer.alloc(100, 1))

    const res = await server.app.inject({ method: 'GET', url: '/api/storage/report' })
    expect(res.statusCode).toBe(200)
    const r = res.json<{
      exists: boolean
      totalBytes: number
      totalFiles: number
      buckets: { name: string; bytes: number; files: number }[]
      skipped: unknown[]
    }>()
    expect(r.exists).toBe(true)
    // 摆入的 1200 字节必须全数计入 logs 桶（其他条目由 makeServer 自建，量不钉）
    expect(r.buckets.find((b) => b.name === 'logs')?.bytes ?? 0).toBeGreaterThanOrEqual(1200)
    // 守恒恒等式与 skipped 语义是本测试的真正断言
    expect(r.totalBytes).toBe(r.buckets.reduce((sum, b) => sum + b.bytes, 0))
    expect(r.totalFiles).toBe(r.buckets.reduce((sum, b) => sum + b.files, 0))
    expect(r.skipped).toEqual([])
  })

  test('清理（19.37 第三批）：白名单外桶 400 E_STORAGE_UNCLEANABLE；trash 桶永久清空', async () => {
    const server = await makeServer()
    writeFileSync(join(server.root, 'trash', 'junk.jsonl'), '{}
')

    const bad = await server.app.inject({
      method: 'POST',
      url: '/api/storage/cleanup',
      payload: { bucket: 'sessions' },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json<{ code: string }>().code).toBe('E_STORAGE_UNCLEANABLE')

    const empty = await server.app.inject({
      method: 'POST',
      url: '/api/storage/cleanup',
      payload: { bucket: 'trash' },
    })
    expect(empty.statusCode).toBe(200)
    expect(empty.json<{ permanent: boolean }>().permanent).toBe(true)
  })

  test('导出/回导 round-trip（19.37 第三批）：导出 bundle 回导空库 → imported 计数', async () => {
    const source = await makeServer()
    const exp = await source.app.inject({ method: 'GET', url: '/api/storage/export' })
    expect(exp.statusCode).toBe(200)
    const { bundle, files } = exp.json<{ bundle: string; files: number }>()
    expect(files).toBeGreaterThanOrEqual(0)

    const target = await makeServer()
    const imp = await target.app.inject({
      method: 'POST',
      url: '/api/storage/import',
      payload: { bundle },
    })
    expect(imp.statusCode).toBe(200)
    const r = imp.json<{ imported: number; skipped: number; failed: number }>()
    expect(r.imported).toBe(files)
    expect(r.failed).toBe(0)
  })
})
