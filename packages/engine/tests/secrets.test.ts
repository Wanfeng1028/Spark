/**
 * 密钥仓单测（阶段七工单 7.1 / doc/02 §8.6）：
 * - SecretStore CRUD + 持久化往返 + 坏 JSON/形状 fail-closed（E_CONFIG）；
 * - resolveApiKey 优先级：store > env（env 迁移兼容）；
 * - 引擎级：setSecret → 后续 resolveModel 取用 store 值；事件流/日志无明文。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ConfigError,
  Engine,
  SecretStore,
  resolveApiKey,
  type EngineConfig,
} from '../src/index.js'

let dirs: string[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-secrets-'))
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
  compactionModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
  fallbacks: [],
  titleModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
  subagentModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
  costLimitUsd: undefined,
  defaultEffort: undefined,
  models: [{ provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 }],
})

/** 最小可用引擎配置（checkpoints 关——测试提速，engine.test.ts 同惯例） */
function engineConfig(): EngineConfig {
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
    models: JSON.parse(VALID_MODELS) as EngineConfig['models'],
    permissions: { version: 1, rules: [] },
  }
}

describe('SecretStore CRUD 与持久化', () => {
  it('set/get/has/delete + 落盘往返（新实例读回）', () => {
    const dir = tempDir()
    const path = join(dir, 'secrets.json')
    const store = new SecretStore(path)
    expect(store.has('deepseek')).toBe(false)

    store.set('deepseek', 'sk-test-abc')
    expect(store.get('deepseek')).toBe('sk-test-abc')
    expect(store.has('deepseek')).toBe(true)

    const persisted = JSON.parse(readFileSync(path, 'utf8')) as {
      version: number
      secrets: Record<string, string>
    }
    expect(persisted.version).toBe(1)
    expect(persisted.secrets.deepseek).toBe('sk-test-abc')

    const reloaded = new SecretStore(path)
    expect(reloaded.get('deepseek')).toBe('sk-test-abc')

    expect(reloaded.delete('deepseek')).toBe(true)
    expect(reloaded.delete('deepseek')).toBe(false) // 二次删 → false（路由层 404 语义）
    expect(new SecretStore(path).names()).toEqual([])
  })

  it('空值/空 provider 拒绝（E_CONFIG）', () => {
    const store = new SecretStore(join(tempDir(), 'secrets.json'))
    expect(() => store.set('deepseek', '')).toThrow(ConfigError)
    expect(() => store.set('   ', 'x')).toThrow(ConfigError)
  })

  it('坏 JSON / 形状不符 → E_CONFIG fail-closed', () => {
    const dir = tempDir()
    write(dir, 'secrets.json', '{not json')
    expect(() => new SecretStore(join(dir, 'secrets.json'))).toThrow(ConfigError)

    const dir2 = tempDir()
    write(dir2, 'secrets.json', JSON.stringify({ version: 2, secrets: {} }))
    expect(() => new SecretStore(join(dir2, 'secrets.json'))).toThrow(ConfigError)
  })
})

describe('resolveApiKey 优先级（store > env）', () => {
  // 注意：store 必须在 it 内建——describe 顶层 tempDir 会被前序 describe 的
  // afterEach 全量清理（dirs 数组共享），导致 persist ENOENT。
  let store: SecretStore

  beforeEach(() => {
    store = new SecretStore(join(tempDir(), 'secrets.json'))
  })

  it('store 优先于 env', () => {
    store.set('deepseek', 'from-store')
    const r = resolveApiKey(store, 'deepseek', 'DEEPSEEK_API_KEY', {
      DEEPSEEK_API_KEY: 'from-env',
    })
    expect(r.apiKey).toBe('from-store')
    expect(r.source).toBe('store')
  })

  it('store 无此键 → env 兜底（迁移兼容）', () => {
    const r = resolveApiKey(store, 'openai', 'OPENAI_API_KEY', {
      OPENAI_API_KEY: 'from-env',
    })
    expect(r.apiKey).toBe('from-env')
    expect(r.source).toBe('env')
  })

  it('apiKeyEnv=null 且无 store → none', () => {
    const r = resolveApiKey(store, 'ollama', null, {})
    expect(r.apiKey).toBeUndefined()
    expect(r.source).toBe('none')
  })
})

describe('Engine 密钥管理入口', () => {
  it('setSecret → listSecrets 状态翻转 + 持久化（值不回传）', async () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)
    const engine = new Engine({ root: dir, config: engineConfig() })
    try {
      expect(engine.listSecrets()).toEqual([
        { provider: 'deepseek', source: 'none' },
        { provider: 'ollama', source: 'none' },
      ])

      engine.setSecret('deepseek', 'sk-engine-level')
      expect(engine.listSecrets()).toEqual([
        { provider: 'deepseek', source: 'store' },
        { provider: 'ollama', source: 'none' },
      ])

      // 值只进不回：状态接口形状不含值；secrets.json 落盘含值
      expect(JSON.stringify(engine.listSecrets())).not.toContain('sk-engine-level')
      const file = readFileSync(join(dir, 'secrets.json'), 'utf8')
      expect(file).toContain('sk-engine-level')

      expect(engine.removeSecret('deepseek')).toBe(true)
      expect(engine.listSecrets()[0]).toEqual({ provider: 'deepseek', source: 'none' })
    } finally {
      await engine.shutdown()
    }
  })

  it('未知 provider setSecret → E_CONFIG', async () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)
    const engine = new Engine({ root: dir, config: engineConfig() })
    try {
      expect(() => engine.setSecret('nonexistent', 'x')).toThrow(/E_CONFIG/)
    } finally {
      await engine.shutdown()
    }
  })

  it('验收：setSecret 后 engine.log 无 store 值明文（pino 脱敏断言复用）', async () => {
    const dir = tempDir()
    write(dir, 'models.json', VALID_MODELS)
    const engine = new Engine({ root: dir, config: engineConfig() })
    // 值刻意不带 sk- 前缀且非 env 值——只能靠 registerSecrets 脱敏层命中
    engine.setSecret('deepseek', 'plainStoreTokenValue998877')
    await engine.shutdown()
    await new Promise((r) => setTimeout(r, 50)) // pino multistream flush（logger.test 同惯例）
    const log = readFileSync(join(dir, 'logs', 'engine.log'), 'utf8')
    expect(log).toContain('secrets.set') // 操作确有落日志
    expect(log).not.toContain('plainStoreTokenValue998877')
  })
})
