/**
 * 子代理预设档单测（工单 13.5）：装载纪律（逐档失败闭合）+ 工具面收窄派生
 * （allow/deny pattern，deny 胜出）+ 引擎端到端（模型覆盖 / systemAppend /
 * 广告面收窄 / 调用被会话级 deny 规则拦截 E_PERMISSION / 未指定 preset 行为不变）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import type { EngineConfig, PermissionRule } from '../src/config.js'
import { Engine } from '../src/engine.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import { excludedTools, loadAgentPresets, presetToolEffects } from '../src/agents/presets.js'
import { ToolRegistry } from '../src/tools/registry.js'
import { writeTool } from '../src/tools/builtin/write.js'
import { readTool } from '../src/tools/builtin/read.js'
import { makeTaskTool } from '../src/tools/builtin/task.js'

/** 轮询等待（本包无共用测试 helper——与 evals harness.waitFor 同形，够用不抽层） */
async function waitFor(pred: () => boolean, what: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (pred()) return
    if (Date.now() > deadline) throw new Error(`等待 ${what} 超时（${timeoutMs}ms）`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

// ---------- 装载与派生（纯逻辑） ----------

const roots: string[] = []

function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'spark-agents-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
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

describe('loadAgentPresets（装载纪律）', () => {
  test('agents 目录不存在 → 零预设（不报错，与 commands/skills 同语义）', async () => {
    expect(await loadAgentPresets(makeRoot({}))).toEqual([])
  })

  test('合法两档按名字序返回；非 .json 忽略', async () => {
    const root = makeRoot({
      'agents/reader.json': JSON.stringify({ tools: { allow: ['read'] } }),
      'agents/coder.json': JSON.stringify({ model: 'fake/fake-chat', title: '编码子代理' }),
      'agents/notes.md': '# 不是预设',
    })
    const presets = await loadAgentPresets(root)
    expect(presets.map((p) => p.name)).toEqual(['coder', 'reader'])
    expect(presets[0]?.title).toBe('编码子代理')
    expect(presets[1]?.tools).toEqual({ allow: ['read'] })
  })

  test('坏 JSON / 名字非法 / 形状非法（未知键）→ warn 跳过，不阻塞其余档', async () => {
    const warns: string[] = []
    const root = makeRoot({
      'agents/good.json': JSON.stringify({ systemAppend: '附加段' }),
      'agents/broken.json': '{ 不是 JSON',
      'agents/BadName.json': JSON.stringify({}),
      'agents/unknown-key.json': JSON.stringify({ nope: true }),
    })
    const presets = await loadAgentPresets(root, {
      warn: (msg) => {
        warns.push(msg)
      },
    })
    expect(presets.map((p) => p.name)).toEqual(['good'])
    expect(warns.length).toBe(3)
    expect(warns.every((m) => m === 'agents.load.skip')).toBe(true)
  })
})

describe('excludedTools / presetToolEffects（收窄派生）', () => {
  const names = ['read', 'grep', 'write', 'edit', 'bash', 'task']

  test('未设 tools → 不收窄', () => {
    expect(excludedTools(names, undefined)).toEqual([])
  })

  test('allow 白名单：未命中的一律排除（`*` 单段通配，同审批规则语义）', () => {
    expect(excludedTools(names, { allow: ['read', 'grep'] })).toEqual(['write', 'edit', 'bash', 'task'])
    // `*a*` = 名字含 a 的留下（read/bash/task）——其余排除
    expect(excludedTools(names, { allow: ['*a*'] })).toEqual(['grep', 'write', 'edit'])
  })

  test('deny 黑名单：命中即排除', () => {
    expect(excludedTools(names, { deny: ['write', 'bash'] })).toEqual(['write', 'bash'])
  })

  test('deny 胜出：allow 命中但 deny 也命中 → 排除', () => {
    expect(excludedTools(names, { allow: ['**'], deny: ['write'] })).toEqual(['write'])
  })

  test('presetToolEffects：隐藏集 + 按工具声明的 action 合成 deny 规则（同 action 去重）', () => {
    const registry = new ToolRegistry()
    registry.register(readTool)
    registry.register(writeTool)
    registry.register(makeTaskTool(() => Promise.resolve({ output: '', isError: false })))
    const effects = presetToolEffects(registry, { allow: ['read'] })
    expect([...effects.hiddenTools].sort()).toEqual(['task', 'write'])
    // write = fs.write、task = agent.task；resource 用 ** 跨段全匹配
    expect(effects.rules).toEqual([
      { action: 'fs.write', resource: '**', effect: 'deny' },
      { action: 'agent.task', resource: '**', effect: 'deny' },
    ])
  })
})

// ---------- 引擎端到端 ----------

/** 三模型配置：默认 / 子代理路由档 / 预设覆盖档——用于断言优先级 */
function makeConfig(rules: PermissionRule[]): EngineConfig {
  const ref = (model: string) => ({ provider: 'fake', model, contextWindow: 100_000 })
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
      defaultModel: ref('fake-chat'),
      compactionModel: ref('fake-chat'),
      fallbacks: [],
      titleModel: ref('fake-chat'),
      subagentModel: ref('subagent-default'),
      costLimitUsd: undefined,
      defaultEffort: undefined,
      models: [ref('fake-chat'), ref('subagent-default'), ref('preset-model')],
    },
    permissions: { version: 1, rules },
  }
}

const PARENT = ids.session('ses_preset_parent_0000000001')

interface EngineFixture {
  engine: Engine
  gateway: ScriptedLlm
  events: SparkEventEnvelope[]
}

async function makeEngine(presetFiles: Record<string, unknown>): Promise<EngineFixture> {
  const root = makeRoot(
    Object.fromEntries(
      Object.entries(presetFiles).map(([name, body]) => [
        `agents/${name}.json`,
        JSON.stringify(body),
      ]),
    ),
  )
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeConfig([]) })
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    events.push(e)
  })
  await engine.ready()
  roots.push(root)
  return { engine, gateway, events }
}

/** 收尾：engine.shutdown（各用例末尾调用，避免句柄滞留） */
async function shutdown(f: EngineFixture): Promise<void> {
  await f.engine.shutdown()
}

describe('引擎接线（工单 13.5）', () => {
  test('未指定 preset：子代理仍走 subagentModel 路由档、标题缺省、工具面不收窄', async () => {
    const f = await makeEngine({})
    try {
      const h = await f.engine.createSession({ parentId: PARENT })
      expect(h.meta.model).toBe('fake/subagent-default')
      expect(h.meta.title).toBe('子代理')
      expect(f.engine.listAgentPresets()).toEqual([])
    } finally {
      await shutdown(f)
    }
  })

  test('preset 不存在 → E_CONFIG 人话（列出可用档名，不静默回退）', async () => {
    const f = await makeEngine({ reader: { tools: { allow: ['read'] } } })
    try {
      await expect(f.engine.createSession({ parentId: PARENT, preset: 'nope' })).rejects.toThrow(
        /E_CONFIG: 子代理预设档 nope 不存在.*可用：reader/,
      )
    } finally {
      await shutdown(f)
    }
  })

  test('preset 生效：模型覆盖 + 标题 + systemAppend + 广告面收窄', async () => {
    const f = await makeEngine({
      reader: {
        model: 'fake/preset-model',
        title: '只读调研',
        systemAppend: '# 只读纪律\n不得修改任何文件。',
        tools: { allow: ['read', 'grep'] },
      },
    })
    try {
      const h = await f.engine.createSession({ parentId: PARENT, preset: 'reader' })
      expect(h.meta.model).toBe('fake/preset-model')
      expect(h.meta.title).toBe('只读调研')

      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '调研完成' }] })
      await h.send('看看这个仓库')
      await waitFor(
        () => f.events.some((e) => e.type === 'turn.completed'),
        'turn.completed（预设档会话）',
      )

      const call = f.gateway.calls[0]
      expect(call?.system).toContain('不得修改任何文件。')
      const advertised = (call?.tools ?? []).map((t) => t.name)
      expect(advertised).toContain('read')
      expect(advertised).not.toContain('write')
      expect(advertised).not.toContain('bash')
    } finally {
      await shutdown(f)
    }
  })

  test('模型仍调用被收窄的工具 → 会话级 deny 规则拦截（E_PERMISSION，不挂起）', async () => {
    const f = await makeEngine({ reader: { tools: { allow: ['read'] } } })
    try {
      const h = await f.engine.createSession({ parentId: PARENT, preset: 'reader' })
      f.gateway.scriptStep({
        content: [
          {
            type: 'toolCall',
            callId: ids.call('cal_preset_write_0000000001'),
            name: 'write',
            input: { path: 'x.ts', content: 'x' },
          },
        ],
      })
      f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '被拦了' }] })
      await h.send('写个文件')
      await waitFor(
        () => f.events.some((e) => e.type === 'turn.completed'),
        'turn.completed（deny 拦截）',
      )
      const completed = f.events.filter((e) => e.type === 'tool.completed')
      expect(completed.length).toBe(1)
      expect(JSON.stringify(completed[0]?.data)).toContain('E_PERMISSION')
      // 拦截不等于挂起：全程没有 permission.asked（deny 是规则层快路径）
      expect(f.events.some((e) => e.type === 'permission.asked')).toBe(false)
    } finally {
      await shutdown(f)
    }
  })

  test('显式 opts.model 优先于预设档 model（调用方指定即尊重）', async () => {
    const f = await makeEngine({ reader: { model: 'fake/preset-model' } })
    try {
      const h = await f.engine.createSession({
        parentId: PARENT,
        preset: 'reader',
        model: 'fake/fake-chat',
      })
      expect(h.meta.model).toBe('fake/fake-chat')
    } finally {
      await shutdown(f)
    }
  })
})
