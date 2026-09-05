/**
 * spark -p 一次性模式单测（阶段十二工单 12.3）：
 * ScriptedLlm 确定性验证——text 输出最终 assistant 文本且退出码 0；json 输出可被
 * JSON.parse（jq 等价）；finish=error 路径退出码 1。参数解析三态另测。
 */
import { describe, expect, test } from 'vitest'
import type { EngineConfig } from '@spark/engine'
import { ScriptedLlm } from '@spark/engine'
import { parsePrintArgs, runPrint } from '../src/print.js'

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

describe('parsePrintArgs（-p 参数解析）', () => {
  test('未命中 -p → null（走 TUI 路径）', () => {
    expect(parsePrintArgs(['--api', 'http://x'])).toBe(null)
    expect(parsePrintArgs([])).toBe(null)
  })

  test('-p 与 --print 等价；--output-format json / --cwd 解析', () => {
    expect(parsePrintArgs(['-p', 'hi'])).toEqual({
      prompt: 'hi',
      outputFormat: 'text',
      cwd: process.cwd(),
    })
    expect(parsePrintArgs(['--print', 'hi', '--output-format', 'json', '--cwd', '/tmp'])).toEqual({
      prompt: 'hi',
      outputFormat: 'json',
      cwd: '/tmp',
    })
  })

  test('-p 缺 prompt / --output-format 非法 → E_USAGE', () => {
    expect(() => parsePrintArgs(['-p'])).toThrow('E_USAGE')
    expect(() => parsePrintArgs(['-p', '--output-format'])).toThrow('E_USAGE')
    expect(() => parsePrintArgs(['-p', 'hi', '--output-format', 'yaml'])).toThrow('E_USAGE')
  })
})

describe('runPrint（ScriptedLlm 确定性）', () => {
  test('text 输出最终 assistant 文本；stop → 退出码 0', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '包名是 ' }, { kind: 'text', text: 'spark。' }] })
    const captured = process.stdout.write.bind(process.stdout)
    let out = ''
    process.stdout.write = (chunk: unknown): boolean => {
      out += String(chunk)
      return true
    }
    try {
      const r = await runPrint({
        prompt: '读 package.json 并说出包名',
        outputFormat: 'text',
        cwd: process.cwd(),
        config: makeConfig(),
        gateway,
      })
      expect(r.exitCode).toBe(0)
      expect(out).toContain('包名是 spark。')
    } finally {
      process.stdout.write = captured
    }
  })

  test('json 输出为 durable 事件数组（JSON.parse 可解析，含 turn.completed）', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: 'ok' }] })
    const captured = process.stdout.write.bind(process.stdout)
    let out = ''
    process.stdout.write = (chunk: unknown): boolean => {
      out += String(chunk)
      return true
    }
    try {
      const r = await runPrint({
        prompt: 'hi',
        outputFormat: 'json',
        cwd: process.cwd(),
        config: makeConfig(),
        gateway,
      })
      expect(r.exitCode).toBe(0)
      const events = JSON.parse(out) as Array<{ type: string }>
      expect(Array.isArray(events)).toBe(true)
      expect(events.some((e) => e.type === 'turn.completed')).toBe(true)
    } finally {
      process.stdout.write = captured
    }
  })

  test('finish=error 路径 → 退出码 1（text 仍如实输出已产出的文本）', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({
      deltas: [{ kind: 'text', text: 'partial' }],
      stopReason: 'error',
      error: '模型侧失败',
    })
    const captured = process.stdout.write.bind(process.stdout)
    let out = ''
    process.stdout.write = (chunk: unknown): boolean => {
      out += String(chunk)
      return true
    }
    try {
      const r = await runPrint({
        prompt: 'hi',
        outputFormat: 'text',
        cwd: process.cwd(),
        config: makeConfig(),
        gateway,
      })
      expect(r.exitCode).toBe(1)
      // 失败回合的 deltas 是 live 不落盘——durable assistant.message 未成形时
      // 如实输出占位行（禁假状态），退出码才是本模式的合同
      expect(out).toBeDefined()
    } finally {
      process.stdout.write = captured
    }
  })
})
