/**
 * 浏览器产物清理路由测试（阶段十九 19.12 / ADR D49）：POST /api/browser/cleanup——
 * 临时 shotsDir 放置白名单命名文件 → 清理后 200 {removed} 且文件消失。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { makeServer } from './helpers'

describe('POST /api/browser/cleanup（阶段十九 19.12 / ADR D49）', () => {
  test('清理 shotsDir 白名单产物：removed 计数 + 文件消失', async () => {
    const server = await makeServer()
    // 引擎 shotsDir = <root>/browser-shots——直接摆两个合法名 + 一个白名单外文件
    const shots = join(server.root, 'browser-shots')
    writeFileSync(join(shots, 'shot-1700000000000-1.png'), 'a')
    writeFileSync(join(shots, 'shot-1700000000000-2.png'), 'b')
    writeFileSync(join(shots, 'not-a-shot.txt'), 'c')

    const res = await server.app.inject({ method: 'POST', url: '/api/browser/cleanup' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ removed: number }>().removed).toBe(2)
    expect(existsSync(join(shots, 'shot-1700000000000-1.png'))).toBe(false)
    expect(existsSync(join(shots, 'shot-1700000000000-2.png'))).toBe(false)
    // 白名单外文件不误删（SHOT_FILE_RE 同源纪律）
    expect(existsSync(join(shots, 'not-a-shot.txt'))).toBe(true)
  })
})
