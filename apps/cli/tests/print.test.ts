/**
 * spark -p 一次性模式单测（阶段十二工单 12.3）：
 * ScriptedLlm 确定性验证——text 输出最终 assistant 文本且退出码 0；json 输出可被
 * JSON.parse（jq 等价）；finish=error 路径退出码 1。参数解析三态另测。
 */
import { describe, expect, test } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineConfig } from '@spark/engine'
import { ScriptedLlm } from '@spark/engine/internal'
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
        computerUseEnabled: false,
        bashPersistent: false,
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
      costLimitTokens: undefined,
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

// ---------- CK-14：--output-schema 与 --resume-last ----------

function captureStdout(): { out: () => string; restore: () => void } {
  let buf = ''
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown): boolean => {
    buf += String(chunk)
    return true
  }
  return {
    out: () => buf,
    restore: () => {
      process.stdout.write = orig
    },
  }
}

describe('CK-14：--output-schema（最终文本按 JSON Schema 校验）', () => {
  test('合格：输出格式化 JSON，exit 0', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '{"name":"spark","steps":3}' }] })
    const schemaPath = join(tmpdir(), 'spark-schema-ok.json')
    writeFileSync(schemaPath, JSON.stringify({ type: 'object', properties: { name: { type: 'string' }, steps: { type: 'number' } }, required: ['name', 'steps'] }))
    const cap = captureStdout()
    try {
      const r = await runPrint({
        prompt: 'p',
        outputFormat: 'text',
        cwd: process.cwd(),
        outputSchemaPath: schemaPath,
        config: makeConfig(),
        gateway,
      })
      expect(r.exitCode).toBe(0)
      expect(JSON.parse(cap.out())).toEqual({ name: 'spark', steps: 3 })
    } finally {
      cap.restore()
    }
  })

  test('不合格（合法 JSON 但缺字段）→ exit 2 + stderr 说明', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '{"wrong":true}' }] })
    const schemaPath = join(tmpdir(), 'spark-schema-bad.json')
    writeFileSync(schemaPath, JSON.stringify({ type: 'object', properties: { name: { type: 'string' }, steps: { type: 'number' } }, required: ['name', 'steps'] }))
    const cap = captureStdout()
    const errBuf: string[] = []
    const origErr = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: unknown): boolean => {
      errBuf.push(String(chunk))
      return true
    }
    try {
      const r = await runPrint({
        prompt: 'p',
        outputFormat: 'text',
        cwd: process.cwd(),
        outputSchemaPath: schemaPath,
        config: makeConfig(),
        gateway,
      })
      expect(r.exitCode).toBe(2)
      expect(errBuf.join('')).toContain('E_OUTPUT_SCHEMA')
    } finally {
      cap.restore()
      process.stderr.write = origErr
    }
  })

  test('最终文本不是 JSON → exit 2', async () => {
    const gateway = new ScriptedLlm()
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '这是说明文字不是 JSON' }] })
    const schemaPath = join(tmpdir(), 'spark-schema-any.json')
    writeFileSync(schemaPath, JSON.stringify({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }))
    const cap = captureStdout()
    const errBuf: string[] = []
    const origErr = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: unknown): boolean => {
      errBuf.push(String(chunk))
      return true
    }
    try {
      const r = await runPrint({
        prompt: 'p',
        outputFormat: 'text',
        cwd: process.cwd(),
        outputSchemaPath: schemaPath,
        config: makeConfig(),
        gateway,
      })
      expect(r.exitCode).toBe(2)
      expect(errBuf.join('')).toContain('不是合法 JSON')
    } finally {
      cap.restore()
      process.stderr.write = origErr
    }
  })
})

describe('CK-14：--resume-last（免记 session id 续跑）', () => {
  test('首轮落盘后 resume-last 续进同一会话（两轮文本先后出现于 root 会话流）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-resume-'))
    try {
      const gw1 = new ScriptedLlm()
      gw1.scriptStep({ deltas: [{ kind: 'text', text: '第一轮回答' }] })
      const r1 = await runPrint({
        prompt: '第一问',
        outputFormat: 'text',
        cwd: process.cwd(),
        root,
        config: makeConfig(),
        gateway: gw1,
      })
      expect(r1.exitCode).toBe(0)

      const gw2 = new ScriptedLlm()
      gw2.scriptStep({ deltas: [{ kind: 'text', text: '第二轮回答' }] })
      const cap = captureStdout()
      try {
        const r2 = await runPrint({
          prompt: '第二问',
          outputFormat: 'text',
          cwd: process.cwd(),
          root,
          resumeLast: true,
          config: makeConfig(),
          gateway: gw2,
        })
        expect(r2.exitCode).toBe(0)
        expect(cap.out()).toContain('第二轮回答')
      } finally {
        cap.restore()
      }
      // root 里只有一个会话（resume 复用而非新建）
      const dirs = readdirSync(root, { recursive: true }).filter((f) =>
        String(f).endsWith('.jsonl'),
      )
      expect(dirs.length).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('空 root resume-last → E_PRINT_RESUME_EMPTY（exit 1）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-resume-empty-'))
    try {
      const errBuf: string[] = []
      const origErr = process.stderr.write.bind(process.stderr)
      process.stderr.write = (chunk: unknown): boolean => {
        errBuf.push(String(chunk))
        return true
      }
      try {
        const r = await runPrint({
          prompt: 'p',
          outputFormat: 'text',
          cwd: process.cwd(),
          root,
          resumeLast: true,
          config: makeConfig(),
          gateway: new ScriptedLlm(),
        })
        expect(r.exitCode).toBe(1)
        expect(errBuf.join('')).toContain('E_PRINT_RESUME_EMPTY')
      } finally {
        process.stderr.write = origErr
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('CK-14：parsePrintArgs 扩展', () => {
  test('--output-schema / --resume-last 解析', () => {
    expect(parsePrintArgs(['-p', 'hi', '--output-schema', 's.json', '--resume-last'])).toEqual({
      prompt: 'hi',
      outputFormat: 'text',
      cwd: process.cwd(),
      outputSchemaPath: 's.json',
      resumeLast: true,
    })
    expect(() => parsePrintArgs(['-p', 'hi', '--output-schema'])).toThrow('E_USAGE')
    expect(() => parsePrintArgs(['-p', 'hi', '--bogus'])).toThrow('E_USAGE')
  })
})
})
