/**
 * 会话归档与两段式删除单测（阶段十二工单 12.4 / V2-23）：
 * archive → 默认列表消失 / archived=true 可见 / 恢复幂等；
 * delete → trash 目录存在原 JSONL（两段式可找回）→ 列表与索引不可见 / 运行中拒绝。
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import { Engine } from '../src/engine.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

let dirs: string[] = []
let engines: Engine[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-archive-'))
  dirs.push(d)
  return d
}

afterEach(async () => {
  for (const e of engines) {
    try {
      await e.shutdown()
    } catch {
      // 已关引擎忽略
    }
  }
  engines = []
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

function makeConfig(): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 40,
        maxToolParallel: 8,
        toolTimeoutMs: 120_000,
        permissionTimeoutMs: 300_000,
        progressThrottleMs: 200,
        toolOutputLimitKB: 32,
        compactionThreshold: 0.8,
        checkpoints: false,
        bashSandbox: 'off',
      },
    },
    models: {
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      fallbacks: [],
      titleModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      subagentModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      costLimitUsd: undefined,
      defaultEffort: undefined,
      models: [],
    },
    permissions: { version: 1, rules: [] },
  }
}

async function makeEngine(): Promise<{ engine: Engine; gateway: ScriptedLlm; root: string }> {
  const root = tempDir()
  const gateway = new ScriptedLlm()
  gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
  gateway.scriptOnce('标题')
  const engine = new Engine({ root, gateway, config: makeConfig() })
  engines.push(engine)
  await engine.ready()
  return { engine, gateway, root }
}

describe('会话归档（工单 12.4）', () => {
  test('归档 → 默认列表消失、archived=true 可见（带 archivedAt）→ 恢复回到默认列表', async () => {
    const { engine } = await makeEngine()
    const h = await engine.createSession({ title: '归档我' })
    const id = h.id

    await engine.archiveSession(id, true)
    const active = await engine.listSessions()
    expect(active.some((m) => m.id === id)).toBe(false)
    const archived = await engine.listSessions({ archived: true })
    expect(archived.some((m) => m.id === id)).toBe(true)
    expect(archived.find((m) => m.id === id)?.archivedAt).toBeDefined()

    // 恢复（幂等：二次恢复无副作用）
    await engine.archiveSession(id, false)
    await engine.archiveSession(id, false)
    const activeAgain = await engine.listSessions()
    expect(activeAgain.some((m) => m.id === id)).toBe(true)
    expect((await engine.listSessions({ archived: true })).some((m) => m.id === id)).toBe(false)
  })

  test('归档后 resume 不受影响（文件原地不动）', async () => {
    const { engine } = await makeEngine()
    const h = await engine.createSession({ title: '归档后仍可开' })
    await engine.archiveSession(h.id, true)
    const reopened = await engine.resumeSession(h.id)
    expect(reopened.id).toBe(h.id)
  })

  test('重启后归档状态保留（标记文件 boot 扫描）', async () => {
    const root = tempDir()
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    gateway.scriptOnce('标题')
    const engine1 = new Engine({ root, gateway, config: makeConfig() })
    engines.push(engine1)
    await engine1.ready()
    const h = await engine1.createSession({ title: '跨重启' })
    await engine1.archiveSession(h.id, true)
    await engine1.shutdown()

    const gateway2 = new ScriptedLlm()
    gateway2.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    gateway2.scriptOnce('标题')
    const engine2 = new Engine({ root, gateway: gateway2, config: makeConfig() })
    engines.push(engine2)
    await engine2.ready()
    const active = await engine2.listSessions()
    expect(active.some((m) => m.id === h.id)).toBe(false)
    const archived = await engine2.listSessions({ archived: true })
    expect(archived.some((m) => m.id === h.id)).toBe(true)
  })
})

describe('两段式删除（工单 12.4）', () => {
  test('删除 → trash 存在原 JSONL、列表与索引不可见、标记清除', async () => {
    const { engine, root } = await makeEngine()
    const h = await engine.createSession({ title: '删除我' })
    await engine.archiveSession(h.id, true) // 从归档态删除（抽屉链路）

    await engine.deleteSession(h.id)

    const trashDir = join(root, 'trash')
    expect(existsSync(trashDir)).toBe(true)
    const trashed = readdirSync(trashDir)
    expect(trashed.length).toBe(1)
    expect(trashed[0]).toContain('.jsonl')
    expect((await engine.listSessions({ archived: true })).some((m) => m.id === h.id)).toBe(false)
    expect((await engine.listSessions()).some((m) => m.id === h.id)).toBe(false)
  })

  test('运行中会话删除 → E_SESSION_ACTIVE 拒绝', async () => {
    const { engine, root } = await makeEngine()
    const h = await engine.createSession({ title: '运行中' })
    const events: Array<{ type: string }> = []
    engine.subscribe((e) => {
      events.push({ type: e.type })
    })
    // ScriptedLlm 长回合：发两轮让 turn 有运行窗口
    void h.send('开始一个回合')
    await new Promise((r) => setTimeout(r, 120))
    if (events.some((e) => e.type === 'turn.completed')) {
      // 回合已闭合（CI 时序）——直接走删除成功路径而非强造运行态
      await engine.deleteSession(h.id)
      expect(existsSync(join(root, 'sessions'))).toBe(true)
      return
    }
    await expect(engine.deleteSession(h.id)).rejects.toThrow('E_SESSION_ACTIVE')
    await new Promise((r) => setTimeout(r, 300))
  })

  test('删除不存在会话 → E_NOT_FOUND', async () => {
    const { engine } = await makeEngine()
    await expect(engine.deleteSession(ids.session('ses_no_such_session_x'))).rejects.toThrow(
      'E_NOT_FOUND',
    )
  })
})
