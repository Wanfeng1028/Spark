/**
 * /arena 多模型竞答单测（工单 16.8 / ADR D42）：临时 git 仓 + ScriptedLlm 双 contender——
 * 参数面（1 模型/重复模型/非 git 仓拒）+ 全链路（start → 并行 → done 快照用量/diffStat）+
 * 胜者应用（整体一次审批：allow 直通/ask 挂起；**删除类改动跳过登记**——§2.10）+ 取消清理。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import type { ArenaRun } from '../src/arena/manager.js'
import { Engine } from '../src/engine.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function makeRoot(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'spark-arena-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe' })
}

/** 基线 git 仓：init + 初始提交（worktree add 需要至少一个 commit） */
function makeRepo(files: Record<string, string>): string {
  const root = makeRoot(files)
  git(root, ['init'])
  git(root, ['config', 'user.email', 'test@spark.local'])
  git(root, ['config', 'user.name', 'test'])
  git(root, ['add', '-A'])
  git(root, ['commit', '-m', 'base', '--no-gpg-sign'])
  return root
}

function makeConfig(): EngineConfig {
  const ref = { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 8,
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
      defaultModel: ref,
      compactionModel: ref,
      fallbacks: [],
      titleModel: ref,
      subagentModel: ref,
      costLimitUsd: undefined,
      defaultEffort: undefined,
      models: [ref],
    },
    // 胜者应用整体审批直通（验收走 allow 路径；ask 挂起路径另行断言）
    permissions: { version: 1, rules: [{ action: 'fs.write', resource: '**', effect: 'allow' }] },
  }
}

function makeEngine(
  cwd: string,
  rules?: EngineConfig['permissions']['rules'],
): { engine: Engine; gateway: ScriptedLlm } {
  const cfg = makeConfig()
  if (rules !== undefined) cfg.permissions = { version: 1, rules }
  const root = mkdtempSync(join(tmpdir(), 'spark-arena-root-'))
  roots.push(root)
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: cfg, cwd })
  return { engine, gateway }
}

describe('/arena 参数面（工单 16.8）', () => {
  test('1 个模型 / 重复模型 / 非 git 仓 → E_ARENA_ARGS / E_CONFIG', async () => {
    const repo = makeRepo({ 'README.md': 'base' })
    const { engine } = await makeEngine(repo)
    try {
      const handle = await engine.createSession({ cwd: repo })
      await expect(engine.arenaStart(handle.id, '干活', ['fake/fake-chat'])).rejects.toThrow('E_ARENA_ARGS')
      await expect(
        engine.arenaStart(handle.id, '干活', ['fake/a', 'fake/a']),
      ).rejects.toThrow('E_ARENA_ARGS')
      // 非 git 仓
      const plain = makeRoot({})
      const h2 = await engine.createSession({ cwd: plain })
      await expect(engine.arenaStart(h2.id, '干活', ['fake/a', 'fake/b'])).rejects.toThrow('E_CONFIG')
    } finally {
      await engine.shutdown()
    }
  })
})

describe('/arena 全链路（双 contender）', () => {
  test('start → 并行跑完 → 快照 done/usage/diffStat；胜者应用（allow 直通）主 cwd 出现改动；删除类跳过登记', async () => {
    const repo = makeRepo({ 'README.md': 'base\n' })
    const { engine, gateway } = await makeEngine(repo)
    try {
      const handle = await engine.createSession({ cwd: repo })
      // ScriptedLlm 步骤两条（两 contender 各消费一条——文本内容一致，顺序无关）
      gateway.scriptStep({ deltas: [{ kind: 'text', text: 'A 方案完成' }] })
      gateway.scriptStep({ deltas: [{ kind: 'text', text: 'B 方案完成' }] })
      const arenaId = await engine.arenaStart(handle.id, '补一节安装说明', ['fake/model-a', 'fake/model-b'])
      expect(arenaId).toBeDefined()
      // 等 done（轮询快照）
      const deadline = Date.now() + 10_000
      let snap: ArenaRun | null = null
      for (;;) {
        snap = engine.arenaSnapshot(handle.id)
        if (snap !== null && snap.status === 'done') break
        if (Date.now() > deadline) throw new Error(`等待 arena done 超时：${JSON.stringify(snap)}`)
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(snap.contenders).toHaveLength(2)
      for (const c of snap.contenders) {
        expect(c.status).toBe('done')
        expect(c.usage.inputTokens).toBeGreaterThanOrEqual(0)
        expect(c.durationMs).toBeGreaterThan(0)
        expect(c.diffStat).toEqual({ files: 0, additions: 0, deletions: 0 }) // 无工具改动
      }
      // 胜者应用：手动模拟 contender worktree 改动（新增 + 纯删除各一）
      const winner = snap.contenders[0] as { sessionId: typeof snap.contenders[0]['sessionId']; worktree: string }
      writeFileSync(join(winner.worktree, 'NEW.md'), '胜者新文件')
      rmSync(join(winner.worktree, 'README.md'))
      writeFileSync(join(winner.worktree, 'CHANGED.md'), '改动')
      await engine.arenaApplyWinner(handle.id, winner.sessionId)
      // 主 cwd：新增与改动落盘；README.md 仍在（删除类跳过——§2.10）
      expect(readFileSync(join(repo, 'NEW.md'), 'utf8')).toBe('胜者新文件')
      expect(readFileSync(join(repo, 'CHANGED.md'), 'utf8')).toBe('改动')
      expect(existsSync(join(repo, 'README.md'))).toBe(true)
      const after = engine.arenaSnapshot(handle.id)
      if (after === null) throw new Error('应用后快照丢失')
      expect(after.applied?.files).toContain('NEW.md')
      expect(after.applied?.skippedDeletions).toContain('README.md')
    } finally {
      await engine.shutdown()
    }
  })

  test('ask 规则下应用挂起等待审批（once 放行后落盘）', async () => {
    const repo = makeRepo({ 'README.md': 'base\n' })
    const rules = [{ action: 'fs.write', resource: '**', effect: 'ask' as const }]
    const { engine, gateway } = await makeEngine(repo, rules)
    try {
      const handle = await engine.createSession({ cwd: repo })
      gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
      gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
      await engine.arenaStart(handle.id, '补说明', ['fake/a', 'fake/b'])
      const deadline = Date.now() + 10_000
      for (;;) {
        const snap = engine.arenaSnapshot(handle.id)
        if (snap !== null && snap.status === 'done') break
        if (Date.now() > deadline) throw new Error('等待 done 超时')
        await new Promise((r) => setTimeout(r, 100))
      }
      const snap = engine.arenaSnapshot(handle.id) as { contenders: { sessionId: ReturnType<typeof ids.session>; worktree: string }[] }
      const winner = snap.contenders[0] as { sessionId: typeof snap.contenders[0]['sessionId']; worktree: string }
      writeFileSync(join(winner.worktree, 'ASKED.md'), '审批后落盘')
      // ask 规则：assert 挂起——事件流等 permission.asked 后 once 放行
      const events: { type: string; data: unknown }[] = []
      engine.subscribe((e) => {
        if (e.sessionId === handle.id) events.push({ type: e.type, data: e.data })
      })
      const applying = engine.arenaApplyWinner(handle.id, winner.sessionId)
      const askDeadline = Date.now() + 2000
      for (;;) {
        if (events.some((e) => e.type === 'permission.asked')) break
        if (Date.now() > askDeadline) throw new Error('等待 permission.asked 超时')
        await new Promise((r) => setTimeout(r, 20))
      }
      const asked = events.find((e) => e.type === 'permission.asked') as { data: { requestId: string } }
      await engine.replyPermission(ids.request(asked.data.requestId), 'once')
      await applying
      expect(readFileSync(join(repo, 'ASKED.md'), 'utf8')).toBe('审批后落盘')
    } finally {
      await engine.shutdown()
    }
  })
})
