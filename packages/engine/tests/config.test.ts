/**
 * config 单测（doc/02 §8.6 engine/config 行）：
 * 三配置文件 zod——合法 / 缺字段 / 越界值 → 启动失败（E_CONFIG）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/index.js'

let dirs: string[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-config-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

function write(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, name), content, 'utf8')
}

const VALID_MODELS = JSON.stringify({
  providers: {
    deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
    ollama: { baseUrl: 'http://127.0.0.1:11434/v1', apiKeyEnv: null },
  },
  defaultModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
})

describe('合法路径', () => {
  it('三文件齐全：字段逐项解析正确', () => {
    const dir = tempDir()
    write(dir, 'spark.json', JSON.stringify({
      version: 1,
      server: { port: 5000, host: '127.0.0.1' },
      engine: { maxStepsPerTurn: 10, compactionThreshold: 0.5 },
    }))
    write(dir, 'models.json', VALID_MODELS)
    write(dir, 'permissions.json', JSON.stringify({
      version: 1,
      rules: [{ action: 'bash', resource: 'git status', effect: 'allow' }],
    }))

    const cfg = loadConfig(dir)

    // spark.json：显式字段覆盖，其余取默认
    expect(cfg.spark.server.port).toBe(5000)
    expect(cfg.spark.server.host).toBe('127.0.0.1')
    expect(cfg.spark.engine.maxStepsPerTurn).toBe(10)
    expect(cfg.spark.engine.compactionThreshold).toBe(0.5)
    expect(cfg.spark.engine.maxToolParallel).toBe(8) // 默认
    expect(cfg.spark.engine.toolTimeoutMs).toBe(120_000) // 默认
    expect(cfg.spark.engine.bashSandbox).toBe('off') // 默认（工单 5.2）

    expect(cfg.models.defaultModel).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
      contextWindow: 128000,
    })
    expect(cfg.models.providers.ollama).toEqual({
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKeyEnv: null,
    })

    expect(cfg.permissions.rules).toHaveLength(1)
    expect(cfg.permissions.rules[0]?.effect).toBe('allow')
  })

  it('仅 models.json：spark/permissions 全取默认（空规则表）', () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)

    const cfg = loadConfig(dir)

    expect(cfg.spark.server).toEqual({ port: 4318, host: '127.0.0.1' })
    expect(cfg.spark.engine.permissionTimeoutMs).toBe(300_000)
    expect(cfg.spark.engine.progressThrottleMs).toBe(200)
    expect(cfg.spark.engine.toolOutputLimitKB).toBe(32)
    expect(cfg.permissions).toEqual({ version: 1, rules: [] })
  })

  it('compactionModel 缺省：fallback 到 defaultModel', () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)

    const cfg = loadConfig(dir)

    expect(cfg.models.compactionModel).toEqual(cfg.models.defaultModel)
  })

  it('compactionModel 显式给出：contextWindow 缺省时沿用 defaultModel 的', () => {
    const dir = tempDir()
    write(dir, 'models.json', JSON.stringify({
      providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' } },
      defaultModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
      compactionModel: { provider: 'deepseek', model: 'deepseek-reasoner' },
    }))

    const cfg = loadConfig(dir)

    expect(cfg.models.compactionModel).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      contextWindow: 128000,
    })
  })

  it('models[] 显式清单 + defaultModel/compactionModel 合并去重（工单 6.5）', () => {
    const dir = tempDir()
    write(dir, 'models.json', JSON.stringify({
      providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' } },
      defaultModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
      compactionModel: { provider: 'deepseek', model: 'deepseek-reasoner' },
      models: [
        { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 64000 },
        { provider: 'deepseek', model: 'deepseek-x', contextWindow: 32000 },
      ],
    }))

    const cfg = loadConfig(dir)

    // 显式条目在前（重复的 defaultModel 以首个 contextWindow 为准），自动并入在后
    expect(cfg.models.models).toEqual([
      { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 64000 },
      { provider: 'deepseek', model: 'deepseek-x', contextWindow: 32000 },
      { provider: 'deepseek', model: 'deepseek-reasoner', contextWindow: 128000 },
    ])
  })

  it('models[] 缺省 = [defaultModel]（compactionModel 同项去重）', () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)

    const cfg = loadConfig(dir)

    expect(cfg.models.models).toEqual([cfg.models.defaultModel])
  })
})

describe('E_CONFIG：缺字段', () => {
  it('models.json 缺失：defaultModel 必填 → ConfigError', () => {
    const dir = tempDir()
    expect(() => loadConfig(dir)).toThrow(ConfigError)
  })

  it('models.json 缺 defaultModel → ConfigError', () => {
    const dir = tempDir()
    write(dir, 'models.json', JSON.stringify({ providers: {} }))
    expect(() => loadConfig(dir)).toThrow(/defaultModel/)
  })

  it('models.json 缺 contextWindow → ConfigError', () => {
    const dir = tempDir()
    write(dir, 'models.json', JSON.stringify({
      providers: {},
      defaultModel: { provider: 'deepseek', model: 'deepseek-chat' },
    }))
    expect(() => loadConfig(dir)).toThrow(/contextWindow/)
  })

  it('坏 JSON → ConfigError', () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)
    write(dir, 'spark.json', '{ nope')
    expect(() => loadConfig(dir)).toThrow(/合法 JSON/)
  })

  it('permissions.json 缺 rules → ConfigError', () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)
    write(dir, 'permissions.json', JSON.stringify({ version: 1 }))
    expect(() => loadConfig(dir)).toThrow(/permissions\.json/)
  })

  it('permissions.json effect 越出词表 → ConfigError', () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)
    write(dir, 'permissions.json', JSON.stringify({
      version: 1,
      rules: [{ action: 'bash', resource: '*', effect: 'maybe' }],
    }))
    expect(() => loadConfig(dir)).toThrow(/effect/)
  })
})

describe('E_CONFIG：越界值', () => {
  it.each([
    [{ server: { port: 0 } }, 'port'],
    [{ server: { port: 70000 } }, 'port'],
    [{ engine: { maxStepsPerTurn: 0 } }, 'maxStepsPerTurn'],
    [{ engine: { maxToolParallel: -1 } }, 'maxToolParallel'],
    [{ engine: { toolTimeoutMs: 0 } }, 'toolTimeoutMs'],
    [{ engine: { permissionTimeoutMs: -5 } }, 'permissionTimeoutMs'],
    [{ engine: { progressThrottleMs: 0 } }, 'progressThrottleMs'],
    [{ engine: { toolOutputLimitKB: 0 } }, 'toolOutputLimitKB'],
    [{ engine: { compactionThreshold: 1 } }, 'compactionThreshold'],
    [{ engine: { compactionThreshold: 0 } }, 'compactionThreshold'],
  ])('spark.json %j → ConfigError', (override, field) => {
    const dir = tempDir()
    write(dir, 'spark.json', JSON.stringify(override))
    write(dir, 'models.json', VALID_MODELS)
    const err = (() => {
      try {
        loadConfig(dir)
        return null
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(ConfigError)
    expect(String(err)).toContain(field)
  })

  it('providers.apiKeyEnv 类型错误 → ConfigError', () => {
    const dir = tempDir()
    write(dir, 'models.json', JSON.stringify({
      providers: { deepseek: { apiKeyEnv: 123 } },
      defaultModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
    }))
    expect(() => loadConfig(dir)).toThrow(/apiKeyEnv/)
  })

  it('providers.baseUrl 非法 URL → ConfigError', () => {
    const dir = tempDir()
    write(dir, 'models.json', JSON.stringify({
      providers: { x: { apiKeyEnv: null, baseUrl: 'not a url' } },
      defaultModel: { provider: 'x', model: 'm', contextWindow: 1000 },
    }))
    expect(() => loadConfig(dir)).toThrow(/baseUrl/)
  })
})

describe('ConfigError 形态', () => {
  it('code === "E_CONFIG"（§5.10 载体约定）', () => {
    const dir = tempDir()
    try {
      loadConfig(dir)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      expect((e as ConfigError).code).toBe('E_CONFIG')
      expect((e as ConfigError).name).toBe('ConfigError')
    }
  })
})

describe('spark.json engine/hooks 段单一来源（工单 R-B.4：复用 @spark/protocol schema）', () => {
  it('engine 段九项全覆盖：逐项解析', () => {
    const dir = tempDir()
    write(dir, 'spark.json', JSON.stringify({
      engine: {
        maxStepsPerTurn: 12,
        maxToolParallel: 3,
        toolTimeoutMs: 5_000,
        permissionTimeoutMs: 6_000,
        progressThrottleMs: 50,
        toolOutputLimitKB: 8,
        compactionThreshold: 0.25,
        checkpoints: false,
        bashSandbox: 'on',
      },
    }))
    write(dir, 'models.json', VALID_MODELS)

    expect(loadConfig(dir).spark.engine).toEqual({
      maxStepsPerTurn: 12,
      maxToolParallel: 3,
      toolTimeoutMs: 5_000,
      permissionTimeoutMs: 6_000,
      progressThrottleMs: 50,
      toolOutputLimitKB: 8,
      compactionThreshold: 0.25,
      checkpoints: false,
      bashSandbox: 'on',
    })
  })

  it('engine 段未知键剥离 → 该字段落默认值（宽松口径刻意保留；收紧属行为变更须另立工单）', () => {
    const dir = tempDir()
    write(dir, 'spark.json', JSON.stringify({
      engine: { maxStepPerTurn: 99, checkpoints: false }, // 首项拼错（少 s）
    }))
    write(dir, 'models.json', VALID_MODELS)

    const cfg = loadConfig(dir)
    expect(cfg.spark.engine.maxStepsPerTurn).toBe(40) // 默认值，非 99
    expect(cfg.spark.engine.checkpoints).toBe(false) // 同段合法键照常生效
  })

  it('hooks 段两种触发原样透传；数组被冻结（protocol .readonly() 语义，runner 只读遍历）', () => {
    const dir = tempDir()
    write(dir, 'spark.json', JSON.stringify({
      hooks: {
        'turn.before': [{ command: 'echo hi', timeoutMs: 1_000 }],
        'tool.completed': [{ skill: 'demo', emit: 'demo.done' }],
      },
    }))
    write(dir, 'models.json', VALID_MODELS)

    const hooks = loadConfig(dir).spark.hooks
    expect(hooks?.['turn.before']).toEqual([{ command: 'echo hi', timeoutMs: 1_000 }])
    expect(hooks?.['tool.completed']).toEqual([{ skill: 'demo', emit: 'demo.done' }])
    expect(Object.isFrozen(hooks?.['turn.before'])).toBe(true)
  })

  it('hooks 缺省 = undefined（引擎侧 `?? {}`）', () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)
    expect(loadConfig(dir).spark.hooks).toBeUndefined()
  })

  it('hooks 未知挂点名 → ConfigError（strictObject 拒未知键）', () => {
    const dir = tempDir()
    write(dir, 'spark.json', JSON.stringify({ hooks: { 'turn.mid': [{ command: 'x' }] } }))
    write(dir, 'models.json', VALID_MODELS)
    expect(() => loadConfig(dir)).toThrow(/turn\.mid/)
  })

  it('hooks 单条 command+skill 混写 → ConfigError（union 两支各自 strict）', () => {
    const dir = tempDir()
    write(dir, 'spark.json', JSON.stringify({
      hooks: { 'turn.after': [{ command: 'x', skill: 'demo', emit: 'demo.done' }] },
    }))
    write(dir, 'models.json', VALID_MODELS)
    expect(() => loadConfig(dir)).toThrow(ConfigError)
  })
})
