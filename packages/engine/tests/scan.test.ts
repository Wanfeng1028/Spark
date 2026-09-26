/**
 * 会话扫描容错单测（LA-38）：单个坏 .jsonl 文件不得静默截断会话列表——
 * 好文件保持可见，坏文件 stderr 告警后跳过（装载路径 fail-closed 语义不变）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import { scanDiskSessions, scanForkChildren } from '../src/session/scan.js'

const roots: string[] = []

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'spark-scan-'))
  roots.push(root)
  return root
}

function writeSession(
  root: string,
  dir: string,
  file: string,
  opts: { parentSession?: string; broken?: boolean } = {},
): string {
  const dirPath = join(root, dir)
  mkdirSync(dirPath, { recursive: true })
  const header: Record<string, unknown> = {
    sparkVersion: '0.1.0',
    cwd: '/tmp/proj',
    createdAt: 1700000000000,
    model: 'deepseek/deepseek-chat',
    ...(opts.parentSession !== undefined
      ? { parentSession: opts.parentSession, parentEventId: ids.event('evt_parent000000000000000') }
      : {}),
  }
  const event = {
    id: ids.event('evt_scan000000000000000000'),
    sessionId: ids.session('ses_scan000000000000000000'),
    seq: 1,
    version: 1,
    time: 1700000000001,
    type: 'session.title',
    data: { title: '标题' },
    parentId: null,
  }
  const body = opts.broken
    ? [JSON.stringify(header), '{"broken":'].join('\n') + '\n'
    : [JSON.stringify(header), JSON.stringify(event)].join('\n') + '\n'
  writeFileSync(join(dirPath, file), body, 'utf8')
  return join(dirPath, file)
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      // 句柄未释放的目录交系统临时目录回收
    }
  }
})

describe('LA-38：坏文件不截断扫描列表', () => {
  test('scanDiskSessions：坏文件跳过并 stderr 告警，好文件保持可见', async () => {
    const root = makeRoot()
    writeSession(root, 'proj-a', '2026-09-26T00:00:00.000Z_ses_good0000000000000000a.jsonl')
    writeSession(root, 'proj-a', '2026-09-26T01:00:00.000Z_ses_bad0000000000000000b.jsonl', {
      broken: true,
    })

    const stderr: string[] = []
    const orig = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    try {
      const metas = await scanDiskSessions(root)
      expect(metas.map((m) => m.id)).toEqual(['ses_good0000000000000000a'])
      expect(stderr.join('')).toContain('E_SESSION_SCAN_SKIP')
      expect(stderr.join('')).toContain('ses_bad0000000000000000b')
    } finally {
      process.stderr.write = orig
    }
  })

  test('scanForkChildren：坏子会话文件跳过，其余子会话照常返回', async () => {
    const root = makeRoot()
    const parent = ids.session('ses_parent000000000000000')
    writeSession(root, 'p', '2026-09-26T02:00:00.000Z_ses_forkgood00000000000c.jsonl', {
      parentSession: parent,
    })
    writeSession(root, 'p', '2026-09-26T03:00:00.000Z_ses_forkbad00000000000d.jsonl', {
      parentSession: parent,
      broken: true,
    })

    const stderr: string[] = []
    const orig = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    try {
      const children = await scanForkChildren(root, parent, () => 'idle')
      expect(children.map((c) => c.child.sessionId)).toEqual(['ses_forkgood00000000000c'])
      expect(stderr.join('')).toContain('E_SESSION_SCAN_SKIP')
    } finally {
      process.stderr.write = orig
    }
  })
})
