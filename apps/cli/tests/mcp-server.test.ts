/**
 * Spark MCP server 三工具单测（阶段十五工单 15.1 / ADR D39）：
 * 进程内直接调 handler——真实 Engine + ScriptedLlm 确定性驱动（sdk inprocess 通道，
 * spark -p 同款装配），stdio 协议层不在本测面。覆盖：spark_run happy path /
 * spark_sessions 投影 / spark_events 分页与 since 过滤 / input 校验拒绝 /
 * 审批挂起 fail-closed 超时拒绝（决策进 audit 链路）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { EngineConfig, PermissionRule } from '@spark/engine'
import { Engine } from '@spark/engine'
import { ScriptedLlm } from '@spark/engine/internal'
import { createInProcessClient } from '@spark/sdk/inprocess'
import { createSparkMcpHandlers } from '../src/mcp-server.js'

/** 与引擎单测同形配置（fake provider；权限规则与审批超时可注入） */
function makeConfig(overrides?: { rules?: PermissionRule[]; permissionTimeoutMs?: number }): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 40,
        maxToolParallel: 8,
        toolTimeoutMs: 120_000,
        permissionTimeoutMs: overrides?.permissionTimeoutMs ?? 300_000,
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
    permissions: { version: 1, rules: overrides?.rules ?? [] },
  }
}

interface McpFixture {
  root: string
  engine: Engine
  gateway: ScriptedLlm
  handlers: ReturnType<typeof createSparkMcpHandlers>
  cleanup: () => Promise<void>
}

async function makeFixture(overrides?: {
  rules?: PermissionRule[]
  permissionTimeoutMs?: number
}): Promise<McpFixture> {
  const root = mkdtempSync(join(tmpdir(), 'spark-mcp-'))
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeConfig(overrides) })
  await engine.ready()
  const client = createInProcessClient(engine)
  const handlers = createSparkMcpHandlers({ client })
  return {
    root,
    engine,
    gateway,
    handlers,
    cleanup: async () => {
      client.close()
      await engine.shutdown()
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        // 句柄未释放的目录跳过清理（交系统临时目录回收）
      }
    },
  }
}

describe('spark_run（工单 15.1）', () => {
  test('happy path：跑完一轮返回 finalText/sessionId/finish=stop', async () => {
    const f = await makeFixture()
    try {
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '你好，' }, { kind: 'text', text: '世界。' }] })
      const r = await f.handlers.sparkRun({ prompt: '打个招呼', cwd: f.root })
      expect(r.finalText).toBe('你好，世界。')
      expect(r.sessionId).toBeTruthy()
      expect(r.finish).toBe('stop')
    } finally {
      await f.cleanup()
    }
  })

  test('prompt 为空 → zod 校验拒绝（E_MCP_UNKNOWN_TOOL 之外的输入面）', async () => {
    const f = await makeFixture()
    try {
      await expect(f.handlers.sparkRun({ prompt: '' })).rejects.toThrow()
    } finally {
      await f.cleanup()
    }
  })

  test('审批挂起超时：fail-closed 拒绝且决策进 audit（actor=system/source=timeout）', async () => {
    const f = await makeFixture({
      rules: [{ action: 'fs.read', resource: '*', effect: 'ask' }],
      permissionTimeoutMs: 150,
    })
    try {
      f.gateway.scriptStep({
        content: [{ type: 'toolCall', callId: ids.call('cal_mcp_timeout1'), name: 'read', input: { path: 'package.json' } }],
      })
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '审批超时已被拒绝。' }] })
      // 同步调用无交互审批面：挂起 150ms 后引擎自动 deny（D39 语义），handler 不悬挂
      const r = await f.handlers.sparkRun({ prompt: '读 package.json', cwd: f.root })
      expect(r.finish).toBe('stop')
      expect(r.finalText).toBe('审批超时已被拒绝。')
      const decision = f.engine
        .listAudit({ limit: 50 })
        .find((a) => a.kind === 'permission.decision' && a.result === 'deny' && a.source === 'timeout')
      expect(decision).toBeDefined()
      expect(decision?.actor).toBe('system')
    } finally {
      await f.cleanup()
    }
  })
})

describe('spark_sessions（工单 15.1）', () => {
  test('列出已建会话并投影为窄字段', async () => {
    const f = await makeFixture()
    try {
      const r = await f.handlers.sparkSessions({})
      expect(r.sessions).toHaveLength(0) // ready 后未建会话 = 空表（禁假数据）
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
      await f.handlers.sparkRun({ prompt: 'hi', cwd: f.root })
      const after = await f.handlers.sparkSessions({})
      expect(after.sessions).toHaveLength(1)
      const row = after.sessions[0]
      if (row === undefined) throw new Error('E_TEST: 会话行缺失（列表为空）')
      expect(row.status).toBe('idle')
      expect(row.cwd).toBe(f.root)
      expect(row.model).toBe('fake/fake-chat')
    } finally {
      await f.cleanup()
    }
  })
})

describe('spark_events（工单 15.1）', () => {
  test('durable 事件页：since 过滤 + nextSince 推进 + 空页语义', async () => {
    const f = await makeFixture()
    try {
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '一' }] })
      const run = await f.handlers.sparkRun({ prompt: 'hi', cwd: f.root })
      const page1 = await f.handlers.sparkEvents({ sessionId: run.sessionId })
      expect(page1.events.length).toBeGreaterThan(0)
      expect(page1.events.some((e) => e.type === 'user.message')).toBe(true)
      const lastSeq = page1.nextSince
      expect(lastSeq).toBeGreaterThan(0)
      const page2 = await f.handlers.sparkEvents({ sessionId: run.sessionId, since: lastSeq })
      expect(page2.events).toHaveLength(0)
      expect(page2.nextSince).toBe(lastSeq) // 空页原样返回请求 since
    } finally {
      await f.cleanup()
    }
  })

  test('未知会话 → E_NOT_FOUND 拒绝（失败闭合不返回假页）', async () => {
    const f = await makeFixture()
    try {
      await expect(
        f.handlers.sparkEvents({ sessionId: ids.session('ses_mcp_missing') }),
      ).rejects.toThrow('E_NOT_FOUND')
    } finally {
      await f.cleanup()
    }
  })
})
