/**
 * 浏览器截图供图路由单测（阶段七工单 7.10 / H09 / ADR D27）：
 * GET /api/artifacts/:file —— 白名单文件名 200 返回 image/png；
 * 非法名/路径逃逸/缺文件 404（文件名校验在引擎侧，路由只做透传）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeServer, type ServerFixture } from './helpers.js'

type ErrBody = { code: string }

let fixtures: ServerFixture[] = []
let dirs: string[] = []

beforeEach(() => {
  fixtures = []
  dirs = []
})

afterEach(async () => {
  for (const f of fixtures) await f.app.close()
  for (const f of fixtures) await f.engine.shutdown()
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      // 句柄未释放的目录跳过清理（交系统临时目录回收）
    }
  }
})

async function makeArtifactServer(): Promise<ServerFixture> {
  const f = await makeServer()
  fixtures.push(f)
  dirs.push(f.root)
  return f
}

/** 直接落一张白名单命名的假截图到引擎截图目录 */
function writeShot(f: ServerFixture, file: string, bytes: number[]): void {
  mkdirSync(join(f.root, 'browser-shots'), { recursive: true })
  writeFileSync(join(f.root, 'browser-shots', file), Buffer.from(bytes))
}

describe('GET /api/artifacts/:file（工单 7.10）', () => {
  test('白名单文件名 → 200 image/png，字节原样返回', async () => {
    const f = await makeArtifactServer()
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    writeShot(f, 'shot-1700000000000-0.png', png)
    const res = await f.app.inject({ method: 'GET', url: '/api/artifacts/shot-1700000000000-0.png' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
    expect([...res.rawPayload]).toEqual(png)
  })

  test('非法名 / 路径逃逸 / 缺文件 → 404', async () => {
    const f = await makeArtifactServer()
    writeShot(f, 'shot-1700000000000-0.png', [0x89])
    for (const file of [
      'nope.png', // 缺文件
      'shot-x.png', // 非白名单形状
      '../permissions.json', // 路径逃逸
      'shot-1700000000000-0.txt', // 非 png 扩展
    ]) {
      const res = await f.app.inject({ method: 'GET', url: `/api/artifacts/${encodeURIComponent(file)}` })
      expect(res.statusCode, file).toBe(404)
      expect(res.json<ErrBody>().code, file).toBe('E_NOT_FOUND')
    }
  })

  test('空文件名段 → 404（Fastify 不匹配空段，落兜底）', async () => {
    const f = await makeArtifactServer()
    const res = await f.app.inject({ method: 'GET', url: '/api/artifacts/' })
    expect([404]).toContain(res.statusCode)
  })
})
