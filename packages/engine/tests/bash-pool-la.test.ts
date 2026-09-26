/**
 * bash 常驻池 LA-09/12~16 补测与行为钉子：
 * - LA-12：新 shell 显式起在会话根（不继承引擎进程 cwd）
 * - LA-13：无尾换行命令（printf 'x'）不再超时；伪造哨兵行（无 nonce）不误判
 * - LA-09：超时 kill → 池除名 → 下一调用重建；输出无尾换行
 * - LA-14：执行期收集上限（池内生效，标记同源）
 * - LA-15：busy 条目豁免 LRU 逐出；出池条目不挂迟到 idle 定时器（超时后重建不被误杀）
 * - LA-16：主开关关闭 → 下一条命令顺手排水
 * 平台：CI ubuntu 真实 /bin/bash（常驻路径 POSIX 限定；Windows powershell 回落为
 * 平台边界——bash.ts 头注登记）。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { ToolContext } from '../src/tools/definition.js'
import { makeBashTool } from '../src/tools/builtin/bash.js'
import { BashShellPool, COLLECT_TRUNCATION_MARK } from '../src/tools/bash-pool.js'

function makeCtx(cwd: string, sessionId = 'ses_bplaa1'): ToolContext {
  return {
    sessionId: ids.session(sessionId),
    turnId: ids.turn('trn_bplaa1'),
    callId: ids.call('cal_bplaa1'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd,
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function runCommand(
  tool: ReturnType<typeof makeBashTool>,
  ctx: ToolContext,
  input: { command: string; cwd?: string; timeoutMs?: number },
): Promise<{ isError: boolean; text: string; code?: string | undefined }> {
  const r = await tool.execute(ctx, input)
  if (typeof r.output === 'string') return { isError: r.isError, text: r.output }
  const o = r.output as Record<string, unknown>
  return {
    isError: r.isError,
    text: typeof o.output === 'string' ? o.output : '',
    code: typeof o.code === 'string' ? o.code : undefined,
  }
}

describe('LA-12：新 shell 显式起在会话根（不继承引擎进程 cwd）', () => {
  test('首条命令无 cwd → pwd 等于会话根', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bpl12-'))
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true })
    const ctx = makeCtx(root)
    // 引擎进程 cwd（测试运行时 = packages/engine）≠ 会话根（tmpdir）——可区分
    const r = await runCommand(tool, ctx, { command: 'pwd' })
    expect(r.isError).toBe(false)
    expect(r.text).toBe(`${root}\n`)
  })
})

describe('LA-13：哨兵协议修订（前导换行 + nonce）', () => {
  test('无尾换行命令（printf）不再被哨兵粘连卡死', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bpl13-'))
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true })
    const ctx = makeCtx(root)
    const r = await runCommand(tool, ctx, { command: "printf 'x'", timeoutMs: 3000 })
    expect(r.isError).toBe(false)
    expect(r.text).toBe('x\n') // 前导换行终结残行；非尾换行补一个换行（登记保真度损失）
  })

  test('伪造哨兵行（旧格式无 nonce）作为输出透传，不误判完成', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bpl13-'))
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true })
    const ctx = makeCtx(root)
    const r = await runCommand(tool, ctx, {
      command: 'echo "__SPARK_DONE__1_0"; echo after',
      timeoutMs: 3000,
    })
    expect(r.isError).toBe(false)
    expect(r.text).toBe('__SPARK_DONE__1_0\nafter\n')
  })
})

describe('LA-09：超时 kill → 除名 → 重建', () => {
  test('超时：E_TIMEOUT + 池除名；下一调用自动重建可用', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bpl09-'))
    const pool = new BashShellPool({ maxEntries: 8, idleMs: 60_000, now: Date.now })
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true, pool })
    const ctx = makeCtx(root)
    const r = await runCommand(tool, ctx, { command: 'sleep 5', timeoutMs: 300 })
    expect(r.isError).toBe(true)
    expect(r.code).toBe('E_TIMEOUT')
    expect(pool.has(String(ctx.sessionId))).toBe(false)
    const r2 = await runCommand(tool, ctx, { command: 'echo rebuilt' })
    expect(r2.isError).toBe(false)
    expect(r2.text).toBe('rebuilt\n')
  })

  test('超时后的迟到 idle 定时器不误杀重建 shell（LA-15：出池不挂定时器）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bpl09b-'))
    // idleMs 80：超时路径 finish 后若挂了迟到定时器，80ms 后会误杀重建 shell
    const pool = new BashShellPool({ maxEntries: 8, idleMs: 80, now: Date.now })
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true, pool })
    const ctx = makeCtx(root)
    const r = await runCommand(tool, ctx, { command: 'sleep 5', timeoutMs: 250 })
    expect(r.code).toBe('E_TIMEOUT')
    // 立即重建跑长命令（>80ms）：迟到定时器若误杀 → E_SHELL_DIED
    const r2 = await runCommand(tool, ctx, { command: 'sleep 0.4; echo survived', timeoutMs: 3000 })
    expect(r2.isError).toBe(false)
    expect(r2.text).toBe('survived\n')
  })
})

describe('LA-14：执行期收集上限（池内生效）', () => {
  test('超限截断 + 同源标记；上限内输出完整', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bpl14-'))
    const pool = new BashShellPool({ maxEntries: 8, idleMs: 60_000, now: Date.now })
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true, pool })
    // outputLimitBytes 1024 → maxOutputChars 4096（池执行期截断）
    const ctx: ToolContext = { ...makeCtx(root), outputLimitBytes: 1024 }
    const r = await runCommand(tool, ctx, { command: "head -c 20000 /dev/zero | tr '\\0' 'a'" })
    expect(r.isError).toBe(false)
    expect(r.text.length).toBe(4096 + COLLECT_TRUNCATION_MARK.length)
    expect(r.text.endsWith(COLLECT_TRUNCATION_MARK)).toBe(true)
  })
})

describe('LA-15：busy 条目豁免 LRU 逐出', () => {
  test('容量满时运行中的会话不被逐出（豁免），空闲后恢复', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bpl15-'))
    const pool = new BashShellPool({ maxEntries: 1, idleMs: 60_000, now: Date.now })
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true, pool })
    const ctxA = makeCtx(root, 'ses_bpl15a')
    const ctxB = makeCtx(root, 'ses_bpl15b')
    // A 跑长命令不等待（busy 中）
    const pA = runCommand(tool, ctxA, { command: 'sleep 0.6; echo a-done', timeoutMs: 5000 })
    await sleep(150) // A 进入 busy
    // B 的命令触发逐出判定——A busy 豁免，B 照常跑
    const rB = await runCommand(tool, ctxB, { command: 'echo b-ok' })
    expect(rB.isError).toBe(false)
    expect(pool.has(String(ctxA.sessionId))).toBe(true) // busy 豁免：A 未被逐出
    const rA = await pA
    expect(rA.isError).toBe(false)
    expect(rA.text).toBe('a-done\n')
  })
})

describe('LA-16：主开关关闭 → 下一条命令顺手排水', () => {
  test('开关翻 false 后池中 shell 被回收', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bpl16-'))
    let on = true
    const pool = new BashShellPool({ maxEntries: 8, idleMs: 60_000, now: Date.now })
    const tool = makeBashTool({ sandbox: 'off', persistent: () => on, pool })
    const ctx = makeCtx(root)
    await runCommand(tool, ctx, { command: 'echo on' })
    expect(pool.has(String(ctx.sessionId))).toBe(true)
    on = false
    await runCommand(tool, ctx, { command: 'echo off' })
    expect(pool.has(String(ctx.sessionId))).toBe(false)
  })
})
