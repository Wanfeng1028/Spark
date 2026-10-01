/**
 * RunawayGuard 单测（CK-3）：六信号注入式（exact_action / exact_result /
 * same_error_family / abab 环 / polling / unchanged_progress）+ 提醒限频
 * （每信号每 turn 一次）+ 豁免档（task_output 法定轮询面）+ 连环升级判定
 * （连续 ≥2 轮命中且本轮再命中非轮询信号）+ turn-local 影子状态重置。
 */
import { describe, expect, test } from 'vitest'
import {
  RunawayGuard,
  RUNAWAY_EXEMPT_TOOLS,
  normalizeActionInput,
  type RunawaySignal,
} from '../src/runaway-guard.js'

type Action = { name: string; input: unknown }
type Result = { output: unknown; isError: boolean }

function feed(
  guard: RunawayGuard,
  steps: readonly { actions: Action[]; results: Result[] }[],
): (RunawaySignal | null)[] {
  return steps.map((s) => {
    const hit = guard.observeAndDetect(s.actions, s.results)
    return hit?.signal ?? null
  })
}

const bash = (cmd: string): Action => ({ name: 'bash', input: { command: cmd } })
const read = (path: string): Action => ({ name: 'read', input: { path } })
const ok = (text: string): Result => ({ output: text, isError: false })
const err = (code: string): Result => ({ output: { code }, isError: true })

describe('RunawayGuard 六信号（CK-3）', () => {
  test('exact_action_repeat：同 action 连读 3 次（结果不同）', () => {
    const g = new RunawayGuard()
    const hits = feed(g, [
      { actions: [bash('ls -la')], results: [ok('a')] },
      { actions: [bash('ls  -la')], results: [ok('b'.repeat(40))] }, // 归一化后同指纹；长度带外
      { actions: [bash('ls -la')], results: [ok('c')] },
    ])
    expect(hits[2]).toBe('exact_action_repeat')
  })

  test('exact_result_repeat：同 action 同结果连读 3 次（优先于 exact_action）', () => {
    const g = new RunawayGuard()
    const hits = feed(g, [
      { actions: [bash('echo hi')], results: [ok('hi')] },
      { actions: [bash('echo hi')], results: [ok('hi')] },
      { actions: [bash('echo hi')], results: [ok('hi')] },
    ])
    expect(hits[2]).toBe('exact_result_repeat')
  })

  test('same_error_family：同族错误连读 3 次（action 可不同）', () => {
    const g = new RunawayGuard()
    const hits = feed(g, [
      { actions: [read('a.ts')], results: [err('E_PATH_OUTSIDE')] },
      { actions: [read('b.ts')], results: [err('E_PATH_OUTSIDE')] },
      { actions: [bash('rm x')], results: [err('E_PATH_OUTSIDE')] },
    ])
    expect(hits[2]).toBe('same_error_family')
  })

  test('abab_action_cycle：A,B,A,B 交替打环（末 4 条）', () => {
    const g = new RunawayGuard()
    const hits = feed(g, [
      { actions: [bash('git status')], results: [ok('1')] },
      { actions: [bash('git add .')], results: [ok('2')] },
      { actions: [bash('git status')], results: [ok('3')] },
      { actions: [bash('git add .')], results: [ok('4')] },
    ])
    expect(hits[3]).toBe('abab_action_cycle')
  })

  test('polling_repeat：读族工具同参数连读 4 次（escalateEligible=false）', () => {
    const g = new RunawayGuard()
    // 结果长度带外（±10% 带判定不命中，unchanged 不抢先）——内容持续变化模拟日志追加
    const hits = feed(g, [
      { actions: [read('log.txt')], results: [ok('v')] },
      { actions: [read('log.txt')], results: [ok('v'.repeat(20))] },
      { actions: [read('log.txt')], results: [ok('v'.repeat(60))] },
      { actions: [read('log.txt')], results: [ok('v'.repeat(150))] },
    ])
    expect(hits[3]).toBe('polling_repeat')
  })

  test('unchanged_progress_repeat：同 action 连读 3 次、输出长度在 ±10% 带内', () => {
    const g = new RunawayGuard()
    const base = 'x'.repeat(100)
    const hits = feed(g, [
      { actions: [bash('check-status')], results: [ok(base)] },
      { actions: [bash('check-status')], results: [ok(base + 'y')] }, // 101/100 = +1%
      { actions: [bash('check-status')], results: [ok(base + 'zz')] }, // 102/100 = +2%
    ])
    expect(hits[2]).toBe('unchanged_progress_repeat')
  })

  test('非命中：正常多工具交替推进不触发任何信号', () => {
    const g = new RunawayGuard()
    const hits = feed(g, [
      { actions: [bash('echo 1')], results: [ok('1')] },
      { actions: [read('src/a.ts')], results: [ok('file body')] },
      { actions: [bash('pnpm test')], results: [ok('pass')] },
      { actions: [read('src/b.ts')], results: [ok('other body')] },
    ])
    expect(hits.every((h) => h === null)).toBe(true)
  })
})

describe('RunawayGuard 限频与升级（CK-3）', () => {
  test('同信号同 turn 只提醒一次；不同信号各自提醒', () => {
    const g = new RunawayGuard()
    const hits = feed(g, [
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [bash('echo a')], results: [ok('a')] }, // exact_result 命中（第 1 次）
      { actions: [bash('echo a')], results: [ok('a')] }, // 同信号 → null（限频）
      { actions: [read('log')], results: [ok('log')] }, // 打断同连读
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [read('log')], results: [ok('log')] },
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [read('log')], results: [ok('log')] },
      { actions: [bash('echo a')], results: [ok('a')] },
    ])
    expect(hits[2]).toBe('exact_result_repeat')
    expect(hits[3]).toBeNull()
    // 第 5 步起 bash/read 交替，第 6 步成环（read,bash,read,bash）→ 新信号独立提醒；
    // 其后同信号继续交替 → 限频 null
    expect(hits[6]).toBe('abab_action_cycle')
    expect(hits[7]).toBeNull()
    expect(hits[9]).toBeNull()
  })

  test('连环升级：上一轮有命中 + 本轮再命中升级资格信号 → shouldEscalate；轮询信号不升级', () => {
    const g = new RunawayGuard()
    // 轮 1：exact_result 命中（steer）
    feed(g, [
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [bash('echo a')], results: [ok('a')] },
    ])
    expect(g.shouldEscalate()).toBe(false) // 本轮首次命中不升级
    g.endTurn()
    // 轮 2：再命中升级资格信号 → 升级
    feed(g, [
      { actions: [bash('echo b')], results: [ok('b')] },
      { actions: [bash('echo b')], results: [ok('b')] },
      { actions: [bash('echo b')], results: [ok('b')] },
    ])
    expect(g.shouldEscalate()).toBe(true)
  })

  test('轮询信号不计入升级：上轮 polling + 本轮 polling → shouldEscalate false', () => {
    const g = new RunawayGuard()
    // 结果长度带外（unchanged 不抢先，确保命中的是 polling）
    feed(g, [
      { actions: [read('log')], results: [ok('1')] },
      { actions: [read('log')], results: [ok('2'.repeat(20))] },
      { actions: [read('log')], results: [ok('3'.repeat(60))] },
      { actions: [read('log')], results: [ok('4'.repeat(150))] },
    ])
    g.endTurn()
    feed(g, [
      { actions: [read('log')], results: [ok('5')] },
      { actions: [read('log')], results: [ok('6'.repeat(20))] },
      { actions: [read('log')], results: [ok('7'.repeat(60))] },
      { actions: [read('log')], results: [ok('8'.repeat(150))] },
    ])
    expect(g.shouldEscalate()).toBe(false)
  })

  test('endTurn 重置影子状态：跨 turn 连读重新起算；无命中轮清零连续计数', () => {
    const g = new RunawayGuard()
    feed(g, [
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [bash('echo a')], results: [ok('a')] },
    ])
    g.endTurn()
    // 新 turn 窗口已清——2 条连读不足以命中
    const hits = feed(g, [
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [bash('echo a')], results: [ok('a')] },
    ])
    expect(hits.every((h) => h === null)).toBe(true)
    g.endTurn() // 本轮无命中 → 连续计数清零
    feed(g, [
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [bash('echo a')], results: [ok('a')] },
      { actions: [bash('echo a')], results: [ok('a')] },
    ])
    expect(g.shouldEscalate()).toBe(false)
  })
})

describe('RunawayGuard 豁免与归一（CK-3）', () => {
  test('task_output 整工具豁免：法定轮询面不进窗口', () => {
    const g = new RunawayGuard()
    expect(RUNAWAY_EXEMPT_TOOLS.has('task_output')).toBe(true)
    const hits = feed(g, [
      { actions: [{ name: 'task_output', input: { taskId: 'tsk_x' } }], results: [ok('tail')] },
      { actions: [{ name: 'task_output', input: { taskId: 'tsk_x' } }], results: [ok('tail')] },
      { actions: [{ name: 'task_output', input: { taskId: 'tsk_x' } }], results: [ok('tail')] },
      { actions: [{ name: 'task_output', input: { taskId: 'tsk_x' } }], results: [ok('tail')] },
    ])
    expect(hits.every((h) => h === null)).toBe(true)
  })

  test('bash 命令归一化：空白差异同指纹；对象键序不参与指纹', () => {
    expect(normalizeActionInput('bash', { command: '  ls   -la\n' })).toBe('ls -la')
    expect(normalizeActionInput('read', { path: 'a', offset: 1 })).toBe(
      normalizeActionInput('read', { offset: 1, path: 'a' }),
    )
  })
})
