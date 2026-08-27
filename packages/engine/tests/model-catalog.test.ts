/**
 * 供应商目录与连通测试单测（工单 6.5）：
 * - listModels：内置/自定义合成、掩码原则（key 永不进 DTO）、hasKey 环境变量判定；
 * - testProvider：配置缺失各失败分支（不发网络请求）+ 注入 fetch 的网络路径
 *   （200/429/401/404/网络错误/超时；anthropic 探针 URL 与头）。
 */
import { afterEach, describe, expect, test } from 'vitest'
import { listModels, PROVIDER_CATALOG, testProvider } from '../src/model-catalog.js'
import type { ModelsConfig } from '../src/config.js'

function makeConfig(over: Partial<ModelsConfig> = {}): ModelsConfig {
  return {
    providers: {
      deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
      custom: { apiKeyEnv: 'CUSTOM_KEY', baseUrl: 'https://custom.example/v1' },
    },
    defaultModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
    compactionModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
    models: [
      { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
      { provider: 'custom', model: 'custom-x', contextWindow: 32768 },
    ],
    ...over,
  }
}

describe('PROVIDER_CATALOG', () => {
  test('内置目录 8 家：id 小写键 + label/api/defaultBaseUrl', () => {
    expect(Object.keys(PROVIDER_CATALOG)).toEqual([
      'openai',
      'deepseek',
      'openrouter',
      'groq',
      'together',
      'xai',
      'mistral',
      'anthropic',
    ])
    expect(PROVIDER_CATALOG['anthropic']).toEqual({
      label: 'Anthropic',
      api: 'anthropic-messages',
      defaultBaseUrl: 'https://api.anthropic.com',
    })
  })
})

describe('listModels', () => {
  test('内置全量在前（未配置也列出）+ 自定义在后；字段合成正确', () => {
    const dto = listModels(makeConfig())
    expect(dto.providers.length).toBe(9) // 目录 8 全量（deepseek 配置态在目录项上体现）+ 自定义 custom
    const ids = dto.providers.map((p) => p.id)
    expect(ids.slice(0, 8)).toEqual(Object.keys(PROVIDER_CATALOG))
    expect(ids[8]).toBe('custom')

    const deepseek = dto.providers.find((p) => p.id === 'deepseek')
    expect(deepseek).toMatchObject({
      label: 'DeepSeek',
      builtin: true,
      configured: true,
      baseUrl: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      hasKey: false, // 环境变量未设
      api: 'openai-completions',
    })
    const custom = dto.providers.find((p) => p.id === 'custom')
    expect(custom).toMatchObject({
      label: 'custom',
      builtin: false,
      configured: true,
      baseUrl: 'https://custom.example/v1',
      api: 'openai-completions',
    })
    // 未配置的内置供应商：configured=false、apiKeyEnv=null、hasKey=false，仍带默认 baseUrl
    const openai = dto.providers.find((p) => p.id === 'openai')
    expect(openai).toMatchObject({
      builtin: true,
      configured: false,
      apiKeyEnv: null,
      hasKey: false,
      baseUrl: 'https://api.openai.com/v1',
    })
    expect(dto.defaultModel.provider).toBe('deepseek')
    expect(dto.models.length).toBe(2)
  })

  test('hasKey 随环境变量点亮；models.json baseUrl 覆盖目录默认', () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-test-value'
    try {
      const config = makeConfig({
        providers: {
          deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseUrl: 'https://proxy.example/v1' },
        },
      })
      const dto = listModels(config)
      const deepseek = dto.providers.find((p) => p.id === 'deepseek')
      expect(deepseek?.hasKey).toBe(true)
      expect(deepseek?.baseUrl).toBe('https://proxy.example/v1')
      // 掩码原则：DTO 只含环境变量名，永不含 key 值
      expect(JSON.stringify(dto)).not.toContain('sk-test-value')
    } finally {
      delete process.env['DEEPSEEK_API_KEY']
    }
  })
})

// ---- testProvider：配置缺失分支（不发网络请求） ----

describe('testProvider 配置缺失分支', () => {
  test('未知供应商（不在 providers 也不在目录）', async () => {
    const r = await testProvider('nope', makeConfig())
    expect(r).toMatchObject({ provider: 'nope', ok: false })
    expect(r.message).toContain('未知供应商')
  })

  test('目录内但未写入 models.json providers（如 openai）', async () => {
    const r = await testProvider('openai', makeConfig())
    expect(r.ok).toBe(false)
    expect(r.message).toContain('未配置')
  })

  test('已配置但 apiKeyEnv 为 null', async () => {
    const config = makeConfig({ providers: { deepseek: { apiKeyEnv: null } } })
    const r = await testProvider('deepseek', config)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('API Key')
  })

  test('apiKeyEnv 已设但环境变量缺失', async () => {
    const r = await testProvider('deepseek', makeConfig())
    expect(r.ok).toBe(false)
    expect(r.message).toContain('环境变量 DEEPSEEK_API_KEY')
  })

  test('自定义供应商（不在目录）缺 baseUrl', async () => {
    process.env['CUSTOM_KEY'] = 'sk-x'
    try {
      const config = makeConfig({ providers: { custom: { apiKeyEnv: 'CUSTOM_KEY' } } })
      const r = await testProvider('custom', config)
      expect(r.ok).toBe(false)
      expect(r.message).toContain('Base URL')
    } finally {
      delete process.env['CUSTOM_KEY']
    }
  })
})

// ---- testProvider：网络路径（注入 fetch / now） ----

/** 记录请求 URL/头的 fake fetch，按脚本回状态码 */
function fakeFetch(status: number) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const impl = (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, headers: init.headers as Record<string, string> })
    return Promise.resolve(new Response('', { status }))
  }
  return { impl, calls }
}

function fixedClock(): { now: () => number } {
  let t = 1000
  return {
    now: () => (t += 100), // 每次 +100ms → started/end 两次调用差 = 时延 100ms
  }
}

function withKeyConfig(): ModelsConfig {
  return makeConfig({
    providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' } },
  })
}

describe('testProvider 网络路径', () => {
  afterEach(() => {
    delete process.env['DEEPSEEK_API_KEY']
  })

  test('200 → ok:true + latencyMs；openai 探针 GET /models + Bearer 头', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-live'
    const fetcher = fakeFetch(200)
    const clock = fixedClock()
    const r = await testProvider('deepseek', withKeyConfig(), {
      fetchImpl: fetcher.impl as unknown as typeof fetch,
      now: clock.now,
    })
    expect(r).toEqual({ provider: 'deepseek', ok: true, latencyMs: 100, message: '连通正常' })
    expect(fetcher.calls[0]?.url).toBe('https://api.deepseek.com/v1/models')
    expect(fetcher.calls[0]?.headers['authorization']).toBe('Bearer sk-live')
  })

  test('429 → ok:true（连通且鉴权通过，限流中）', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-live'
    const fetcher = fakeFetch(429)
    const r = await testProvider('deepseek', withKeyConfig(), {
      fetchImpl: fetcher.impl as unknown as typeof fetch,
      now: fixedClock().now,
    })
    expect(r.ok).toBe(true)
    expect(r.message).toContain('限流')
  })

  test('401 → ok:false 鉴权失败文案', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-bad'
    const fetcher = fakeFetch(401)
    const r = await testProvider('deepseek', withKeyConfig(), {
      fetchImpl: fetcher.impl as unknown as typeof fetch,
      now: fixedClock().now,
    })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('鉴权失败')
  })

  test('404 → ok:false Base URL 可能不正确', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-live'
    const fetcher = fakeFetch(404)
    const r = await testProvider('deepseek', withKeyConfig(), {
      fetchImpl: fetcher.impl as unknown as typeof fetch,
      now: fixedClock().now,
    })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Base URL')
  })

  test('5xx → ok:false 服务端错误', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-live'
    const fetcher = fakeFetch(503)
    const r = await testProvider('deepseek', withKeyConfig(), {
      fetchImpl: fetcher.impl as unknown as typeof fetch,
      now: fixedClock().now,
    })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('503')
  })

  test('网络错误 → ok:false 无法连接 + detail 保留原始信息', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-live'
    const impl = (): Promise<Response> => Promise.reject(new Error('ECONNREFUSED'))
    const r = await testProvider('deepseek', withKeyConfig(), {
      fetchImpl: impl as unknown as typeof fetch,
      now: fixedClock().now,
    })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('无法连接')
    expect(r.detail).toBe('ECONNREFUSED')
  })

  test('超时 → ok:false 连接超时文案', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-live'
    const impl = (): Promise<Response> => {
      const err = new Error('The operation was aborted due to timeout')
      err.name = 'TimeoutError'
      return Promise.reject(err)
    }
    const r = await testProvider('deepseek', withKeyConfig(), {
      fetchImpl: impl as unknown as typeof fetch,
      now: fixedClock().now,
    })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('超时')
  })

  test('anthropic 系：探针 /v1/models + x-api-key 头', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant'
    try {
      const config = makeConfig({
        providers: {
          anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com' },
        },
      })
      const fetcher = fakeFetch(200)
      const r = await testProvider('anthropic', config, {
        fetchImpl: fetcher.impl as unknown as typeof fetch,
        now: fixedClock().now,
      })
      expect(r.ok).toBe(true)
      expect(fetcher.calls[0]?.url).toBe('https://api.anthropic.com/v1/models')
      expect(fetcher.calls[0]?.headers['x-api-key']).toBe('sk-ant')
      expect(fetcher.calls[0]?.headers['anthropic-version']).toBe('2023-06-01')
    } finally {
      delete process.env['ANTHROPIC_API_KEY']
    }
  })
})
