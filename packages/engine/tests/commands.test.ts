/**
 * 命令注册表单测（阶段七工单 7.4 / H04 / doc/02 §8.6）：
 * - loader：目录不存在 = 零命令 / frontmatter description 与正文解析 /
 *   名字非法与内置重名 warn 跳过 / 坏文件 warn 跳过；
 * - expandCommandPrompt：$ARGUMENTS 替换 / 无占位符追加 / args 空原样；
 * - Engine：listCommands 内置基线 + 自定义合并 / executeCommand——
 *   compact 走压缩入口（E_TURN_ACTIVE 回归）/ 自定义 prompt 展开走 turn 通道
 *   （user.message 事件落盘）/ client 与未知命令拒绝。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { SparkEventEnvelope } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import { Engine } from '../src/engine.js'
import { BUILTIN_COMMANDS, expandCommandPrompt, loadCommands } from '../src/commands/loader.js'
import { ScriptedLlm } from '../src/scripted-llm.js'

let dirs: string[] = []
let engines: Engine[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-commands-'))
  dirs.push(d)
  return d
}

afterEach(async () => {
  for (const e of engines) await e.shutdown()
  engines = []
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

/** 收集 warn 的假 logger */
function collectingLogger(): {
  logger: { warn: (m: string, f?: Record<string, unknown>) => void }
  warns: string[]
} {
  const warns: string[] = []
  return { logger: { warn: (m) => { warns.push(m) } }, warns }
}

// ---------- loader ----------

describe('loadCommands（~/.spark/commands/*.md 扫描）', () => {
  test('目录不存在 = 零自定义命令', async () => {
    expect(await loadCommands(join(tempDir(), 'commands'))).toEqual([])
  })

  test('frontmatter description + 正文 prompt 解析；无 frontmatter 取首行摘要', async () => {
    const dir = join(tempDir(), 'commands')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'review.md'),
      '---\ndescription: 审查当前改动\n---\n\n请审查当前工作区改动，按风险排序。\n',
      'utf8',
    )
    await writeFile(join(dir, 'greet.md'), '你好，介绍一下自己\n\n再说说你能做什么。', 'utf8')
    const cmds = await loadCommands(dir)
    // readdir 目录序不保证：按名排序后断言
    expect([...cmds].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      {
        name: 'greet',
        description: '你好，介绍一下自己',
        prompt: '你好，介绍一下自己\n\n再说说你能做什么。',
      },
      { name: 'review', description: '审查当前改动', prompt: '请审查当前工作区改动，按风险排序。' },
    ])
  })

  test('名字非法 / 与内置重名 warn 跳过；非 .md 忽略', async () => {
    const dir = join(tempDir(), 'commands')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'Bad_Name.md'), 'x', 'utf8') // 大写+下划线不匹配
    await writeFile(join(dir, 'compact.md'), 'x', 'utf8') // 与内置重名
    await writeFile(join(dir, 'notes.txt'), 'x', 'utf8') // 非 .md
    await writeFile(join(dir, 'ok.md'), '正文', 'utf8')
    const { logger, warns } = collectingLogger()
    const cmds = await loadCommands(dir, logger)
    expect(cmds.map((c) => c.name)).toEqual(['ok'])
    expect(warns).toEqual(['commands.load.skip', 'commands.load.skip'])
  })
})

// ---------- expandCommandPrompt ----------

describe('expandCommandPrompt（$ARGUMENTS 语义）', () => {
  test('含 $ARGUMENTS：替换为 args（空 args 替换为空串）', () => {
    expect(expandCommandPrompt('总结 $ARGUMENTS 的要点', '这份文档')).toBe(
      '总结 这份文档 的要点',
    )
    expect(expandCommandPrompt('总结 $ARGUMENTS 的要点', undefined)).toBe('总结  的要点')
  })

  test('无占位符：args 非空追加，空则原样', () => {
    expect(expandCommandPrompt('审查改动', '重点看并发')).toBe('审查改动\n\n重点看并发')
    expect(expandCommandPrompt('审查改动', undefined)).toBe('审查改动')
    expect(expandCommandPrompt('审查改动', '  ')).toBe('审查改动')
  })
})

// ---------- Engine 集成 ----------

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
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
    },
    permissions: { version: 1, rules: [] },
  }
}

async function makeCommandEngine(files: Record<string, string>): Promise<{
  engine: Engine
  gateway: ScriptedLlm
  events: SparkEventEnvelope[]
}> {
  const root = tempDir()
  const dir = join(root, 'commands')
  await mkdir(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, 'utf8')
  }
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeConfig() })
  engines.push(engine)
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => { events.push(e) })
  await engine.ready()
  return { engine, gateway, events }
}

/** 等 turn 闭合（上限 2s） */
async function waitTurnDone(events: SparkEventEnvelope[]): Promise<void> {
  const deadline = Date.now() + 2000
  while (!events.some((e) => e.type === 'turn.completed')) {
    if (Date.now() > deadline) throw new Error('等待 turn.completed 超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('Engine 命令注册表（工单 7.4）', () => {
  test('listCommands：内置基线（六条）+ 自定义合并', async () => {
    const { engine } = await makeCommandEngine({
      'review.md': '---\ndescription: 审查改动\n---\n\n请审查改动。',
    })
    const cmds = engine.listCommands()
    expect(cmds.slice(0, BUILTIN_COMMANDS.length)).toEqual(BUILTIN_COMMANDS)
    expect(cmds[cmds.length - 1]).toEqual({ name: 'review', description: '审查改动', kind: 'prompt' })
    // 基线验收下限：六条命令名逐条在册
    for (const name of ['compact', 'model', 'mcp', 'skills', 'usage', 'resume']) {
      expect(cmds.some((c) => c.name === name)).toBe(true)
    }
  })

  test('executeCommand 自定义命令：prompt 展开走 turn 通道（user.message 落盘）', async () => {
    const { engine, gateway, events } = await makeCommandEngine({
      'review.md': '---\ndescription: 审查\n---\n\n请审查以下内容：$ARGUMENTS',
    })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '好的' }] })
    const handle = await engine.createSession()
    await engine.executeCommand(handle.id, 'review', 'src/index.ts')
    await waitTurnDone(events)
    const userMsg = events.find((e) => e.type === 'user.message') as
      | SparkEventEnvelope<'user.message'>
      | undefined
    expect(userMsg?.data.text).toBe('请审查以下内容：src/index.ts')
  })

  test('executeCommand compact：走压缩入口（回归 §5.8.5——E_TURN_ACTIVE 语义保留）', async () => {
    const { engine, gateway, events } = await makeCommandEngine({})
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] }) // turn 应答
    gateway.scriptOnce('自动标题') // turn.completed 触发的自动标题（generateOnce 消费者一）
    gateway.scriptOnce('手动压缩摘要') // 压缩摘要（generateOnce 消费者二——顺序不定，各取一条）
    const handle = await engine.createSession()
    await handle.send('hi')
    await waitTurnDone(events)
    // compaction threshold 0.8 未到：手动压缩仍应执行（compaction.started/completed 事件对）
    await engine.executeCommand(handle.id, 'compact')
    const types = events.map((e) => e.type)
    expect(types).toContain('compaction.started')
    expect(types).toContain('compaction.completed')
  })

  test('executeCommand 拒绝路径：client 命令与未知命令失败闭合', async () => {
    const { engine } = await makeCommandEngine({})
    const handle = await engine.createSession()
    await expect(engine.executeCommand(handle.id, 'model')).rejects.toThrow('E_COMMAND_CLIENT')
    await expect(engine.executeCommand(handle.id, 'nope')).rejects.toThrow('E_NOT_FOUND')
  })

  test('listMcpServers / listSkills：只读数据面（无配置 = 空表）', async () => {
    const { engine } = await makeCommandEngine({})
    expect(engine.listMcpServers()).toEqual([])
    expect(engine.listSkills()).toEqual([])
  })
})
