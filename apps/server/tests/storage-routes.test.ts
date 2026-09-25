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
    expect(r.buckets.find((b) => b.name === 'logs')?.bytes).toBe(1200)
    expect(r.totalBytes).toBe(r.buckets.reduce((sum, b) => sum + b.bytes, 0))
    expect(r.totalFiles).toBe(r.buckets.reduce((sum, b) => sum + b.files, 0))
    expect(r.skipped).toEqual([])
  })
})
