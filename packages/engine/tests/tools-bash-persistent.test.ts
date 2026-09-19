/**
 * bash 常驻会话池单测（阶段十九 19.3 / ADR D45）：
 * cwd/env 保持、跨会话隔离、空闲回收、容量 LRU 逐出、缺省关零回归、
 * shell 死亡 E_SHELL_DIED。真实 /bin/bash（CI ubuntu；常驻路径要求 POSIX bash，
 * Windows powershell 回落为平台边界——见 bash.ts 头注）。
 */
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { ToolContext } from '../src/tools/definition.js'
import { makeBashTool } from '../src/tools/builtin/bash.js'
import { BashShellPool } from '../src/tools/bash-pool.js'

function makeCtx(cwd: string, sessionId = 'ses_bashpool1'): ToolContext {
  return {
    sessionId: ids.session(sessionId),
    turnId: ids.turn('trn_bashpool1'),
    callId: ids.call('cal_bashpool1'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd,
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function runCommand(
  tool: ReturnType<typeof makeBashTool>,
  ctx: ToolContext,
  input: { command: string; cwd?: string },
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

describe('bash 常驻会话池（阶段十九 19.3 / ADR D45）', () => {
  test('cwd/环境变量跨调用保持（同会话）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bp-'))
    await mkdir(join(root, 'a'), { recursive: true })
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true })
    const ctx = makeCtx(root)
    // cwd 参数进入子目录设值；下一调用无 cwd（回根）仍能读到——cd 保持 + 变量保持一并验证
    const r1 = await runCommand(tool, ctx, { command: 'SPARK_X=42', cwd: 'a' })
    expect(r1.isError).toBe(false)
    const r2 = await runCommand(tool, ctx, { command: 'echo "$SPARK_X@$(pwd)"' })
    expect(r2.isError).toBe(false)
    expect(r2.text).toContain('42')
    expect(r2.text).toContain(join(root, 'a'))
  })

  test('跨会话隔离：不同 sessionId 各自一个 shell', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bp-'))
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true })
    const ctxA = makeCtx(root, 'ses_bashpoola')
    const ctxB = makeCtx(root, 'ses_bashpoolb')
    await runCommand(tool, ctxA, { command: 'SPARK_X=only-a' })
    const r = await runCommand(tool, ctxB, { command: 'echo "[$SPARK_X]"' })
    expect(r.text).toBe('[]\n')
  })

  test('空闲回收：超 idleMs 后 shell 重建（变量丢失）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bp-'))
    const pool = new BashShellPool({ maxEntries: 8, idleMs: 60, now: Date.now })
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true, pool })
    const ctx = makeCtx(root)
    await runCommand(tool, ctx, { command: 'SPARK_X=keep' })
    expect(pool.has(String(ctx.sessionId))).toBe(true)
    await sleep(160)
    expect(pool.has(String(ctx.sessionId))).toBe(false)
    const r = await runCommand(tool, ctx, { command: 'echo "[$SPARK_X]"' })
    expect(r.text).toBe('[]\n')
  })

  test('容量上限：LRU 逐出最久未用会话', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bp-'))
    const pool = new BashShellPool({ maxEntries: 1, idleMs: 60_000, now: Date.now })
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true, pool })
    const ctxA = makeCtx(root, 'ses_bashpoola')
    const ctxB = makeCtx(root, 'ses_bashpoolb')
    await runCommand(tool, ctxA, { command: 'SPARK_X=only-a' })
    expect(pool.has(String(ctxA.sessionId))).toBe(true)
    await runCommand(tool, ctxB, { command: 'true' })
    expect(pool.has(String(ctxA.sessionId))).toBe(false)
    const r = await runCommand(tool, ctxA, { command: 'echo "[$SPARK_X]"' })
    expect(r.text).toBe('[]\n')
  })

  test('缺省关：独立 shell 旧行为零回归（变量不跨调用）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bp-'))
    const tool = makeBashTool({ sandbox: 'off', persistent: () => false })
    const ctx = makeCtx(root)
    const r1 = await runCommand(tool, ctx, { command: 'SPARK_X=42' })
    expect(r1.isError).toBe(false)
    const r2 = await runCommand(tool, ctx, { command: 'echo "[$SPARK_X]"' })
    expect(r2.text).toBe('[]\n')
  })

  test('shell 死亡：E_SHELL_DIED + isError（下一调用自动重建）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bp-'))
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true })
    const ctx = makeCtx(root)
    const r = await runCommand(tool, ctx, { command: 'kill -9 $$' })
    expect(r.isError).toBe(true)
    expect(r.code).toBe('E_SHELL_DIED')
    // 重建后可用
    const r2 = await runCommand(tool, ctx, { command: 'echo ok' })
    expect(r2.isError).toBe(false)
    expect(r2.text).toBe('ok\n')
  })

  test('退出码非 0：E_EXIT_CODE 且输出保留（哨兵协议不打断既有语义）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spark-bp-'))
    const tool = makeBashTool({ sandbox: 'off', persistent: () => true })
    const ctx = makeCtx(root)
    const r = await runCommand(tool, ctx, { command: 'echo before; false' })
    expect(r.isError).toBe(true)
    expect(r.code).toBe('E_EXIT_CODE')
    expect(r.text).toBe('before\n')
  })
})
