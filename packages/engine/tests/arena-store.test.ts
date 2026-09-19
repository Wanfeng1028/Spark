/**
 * ArenaStore 单测（工单 19.10，翻案 D42"竞答记录仅内存"登记限制）：
 * 写/读 roundtrip、mtime 降序（新→旧）、limit 截取、损坏单文件跳过（fail-soft）、
 * 空目录/缺目录、remove 撤记录。纯文件层——不启引擎（manager 接线见 arena.test.ts）。
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import { ArenaStore } from '../src/arena/store.js'
import type { ArenaRunRecord } from '../src/arena/manager.js'
import type { ArenaRun } from '../src/arena/manager.js'

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function makeStore(): { store: ArenaStore; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'spark-arena-store-'))
  roots.push(root)
  return { store: new ArenaStore(root), root }
}

function makeRecord(arenaId: string, status: ArenaRun['status']): ArenaRunRecord {
  return {
    run: {
      arenaId,
      sessionId: ids.session('ses_store_main000000000001'),
      prompt: `任务 ${arenaId}`,
      status,
      contenders: [],
      winner: null,
      applied: null,
    },
    startedAt: 1_700_000_000_000,
    completedAt: null,
  }
}

/** 强制文件 mtime（同秒内连写两次在部分文件系统上 mtime 相同——排序断言须确定性） */
function forceMtime(root: string, arenaId: string, ms: number): void {
  const d = new Date(ms)
  utimesSync(join(root, 'arena', `${arenaId}.json`), d, d)
}

describe('ArenaStore（工单 19.10）', () => {
  test('缺目录 loadHistory → 空表（无竞答的安装不预建目录）', () => {
    const { store } = makeStore()
    expect(store.loadHistory(20)).toEqual([])
  })

  test('save → loadHistory roundtrip：字段完整、mtime 降序（新→旧）', () => {
    const { store, root } = makeStore()
    store.save(makeRecord('ses_arena_1000000000000001', 'done'))
    store.save(makeRecord('ses_arena_2000000000000002', 'running'))
    // mtime 确定性：1000 号更旧、2000 号更新
    forceMtime(root, 'ses_arena_1000000000000001', 1_000)
    forceMtime(root, 'ses_arena_2000000000000002', 2_000)
    const history = store.loadHistory(20)
    expect(history.map((r) => r.run.arenaId)).toEqual(['ses_arena_2000000000000002', 'ses_arena_1000000000000001'])
    expect(history[1]?.run.prompt).toBe('任务 ses_arena_1000000000000001')
    expect(history[1]?.run.status).toBe('done')
    expect(history[1]?.startedAt).toBe(1_700_000_000_000)
    expect(history[1]?.completedAt).toBeNull()
    expect(history[1]?.run.sessionId).toBe(ids.session('ses_store_main000000000001'))
  })

  test('limit 截取：只回最近 N 场', () => {
    const { store, root } = makeStore()
    store.save(makeRecord('ses_arena_1000000000000001', 'done'))
    store.save(makeRecord('ses_arena_2000000000000002', 'done'))
    store.save(makeRecord('ses_arena_3000000000000003', 'done'))
    forceMtime(root, 'ses_arena_1000000000000001', 1_000)
    forceMtime(root, 'ses_arena_2000000000000002', 2_000)
    forceMtime(root, 'ses_arena_3000000000000003', 3_000)
    const history = store.loadHistory(2)
    expect(history.map((r) => r.run.arenaId)).toEqual(['ses_arena_3000000000000003', 'ses_arena_2000000000000002'])
  })

  test('损坏单文件跳过（fail-soft）：坏 JSON 与形状不对的文件都不阻塞其余条目', () => {
    const { store, root } = makeStore()
    store.save(makeRecord('ses_arena_1000000000000001', 'done'))
    // 坏 JSON（半截写入模拟）
    const arenaDir = join(root, 'arena')
    writeFileSync(join(arenaDir, 'ses_arena_broken0000000001.json'), '{ "run": { "arena', 'utf8')
    // 形状不对（合法 JSON 但不是 ArenaRunRecord）
    writeFileSync(join(arenaDir, 'ses_arena_wrong00000000001.json'), '{"hello": 1}', 'utf8')
    store.save(makeRecord('ses_arena_3000000000000003', 'cancelled'))
    forceMtime(root, 'ses_arena_1000000000000001', 1_000)
    forceMtime(root, 'ses_arena_broken0000000001', 2_000)
    forceMtime(root, 'ses_arena_wrong00000000001', 3_000)
    forceMtime(root, 'ses_arena_3000000000000003', 4_000)
    const history = store.loadHistory(20)
    // 最新的两个是坏文件——被跳过后仍按序读到有效记录（不因坏文件截断列表）
    expect(history.map((r) => r.run.arenaId)).toEqual(['ses_arena_3000000000000003', 'ses_arena_1000000000000001'])
  })

  test('worktree 子目录不误读：只认目录下顶层 *.json 文件', () => {
    const { store, root } = makeStore()
    store.save(makeRecord('ses_arena_1000000000000001', 'running'))
    // 同目录另有 worktree 子目录与其中的 json、杂项文件——读取一律忽略
    mkdirSync(join(root, 'arena', 'ses_store_main000000000001', '1-fake-a'), { recursive: true })
    writeFileSync(join(root, 'arena', 'ses_store_main000000000001', '1-fake-a', 'nested.json'), '{}', 'utf8')
    writeFileSync(join(root, 'arena', 'notes.txt'), 'not json', 'utf8')
    const history = store.loadHistory(20)
    expect(history).toHaveLength(1)
    expect(history[0]?.run.arenaId).toBe('ses_arena_1000000000000001')
  })

  test('remove 撤记录：start 半途失败不留幻影 running 条目', () => {
    const { store } = makeStore()
    store.save(makeRecord('ses_arena_1000000000000001', 'running'))
    store.remove('ses_arena_1000000000000001')
    expect(store.loadHistory(20)).toEqual([])
    // remove 不存在的 id 静默（幂等）
    expect(() => store.remove('ses_arena_9999999999999999')).not.toThrow()
  })
})
