/**
 * 供应商目录与连通测试（DESIGN §13.D③ / 阶段六工单 6.5 轻后端例外）：
 * - PROVIDER_CATALOG 是引擎唯一供应商目录（pi-gateway 流式分派同一张表——单一来源）；
 * - listModels 合成 GET /api/models 线上形状（内置/自定义两组、掩码原则：key 永不进 DTO）；
 * - testProvider 做一次廉价鉴权请求（openai 系 GET /models、anthropic GET /v1/models），
 *   返回时延或人话错误文案——ok=false 不是传输失败，走 200。
 */
import type { ModelProviderDto, ModelTestResultDto, ModelsDto } from '@spark/protocol'
import type { ModelsConfig } from './config.js'
import type { SecretSource } from './secrets/store.js'

export type ProviderApiKind = 'openai-completions' | 'anthropic-messages'

export interface CatalogEntry {
  label: string
  api: ProviderApiKind
  defaultBaseUrl: string
}

/** v1 内置供应商目录（原 pi-gateway PROVIDERS 表迁此——目录与流式分派共用单一来源） */
export const PROVIDER_CATALOG: Record<string, CatalogEntry> = {
  openai: { label: 'OpenAI', api: 'openai-completions', defaultBaseUrl: 'https://api.openai.com/v1' },
  deepseek: { label: 'DeepSeek', api: 'openai-completions', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  openrouter: { label: 'OpenRouter', api: 'openai-completions', defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  groq: { label: 'Groq', api: 'openai-completions', defaultBaseUrl: 'https://api.groq.com/openai/v1' },
  together: { label: 'Together', api: 'openai-completions', defaultBaseUrl: 'https://api.together.xyz/v1' },
  xai: { label: 'xAI', api: 'openai-completions', defaultBaseUrl: 'https://api.x.ai/v1' },
  mistral: { label: 'Mistral', api: 'openai-completions', defaultBaseUrl: 'https://api.mistral.ai/v1' },
  anthropic: { label: 'Anthropic', api: 'anthropic-messages', defaultBaseUrl: 'https://api.anthropic.com' },
}

/**
 * apiKey 解析注入点（工单 10.12）：状态判定必须与实际取用同一口径——
 * 引擎注入 secrets 仓解析器（store > env），否则只写密钥仓的供应商被误报「缺 Key」。
 */
export type KeyResolver = (
  provider: string,
  apiKeyEnv: string | null,
) => { apiKey?: string; source: SecretSource }

/** 缺省解析器：仅看环境变量（纯目录语义，等价原 hasKeyOf——空串视为未设置） */
export const envKeyResolver: KeyResolver = (_provider, apiKeyEnv) => {
  if (apiKeyEnv === null) return { source: 'none' }
  const v = process.env[apiKeyEnv]
  return v !== undefined && v !== '' ? { apiKey: v, source: 'env' } : { source: 'none' }
}

/** models.json → GET /api/models 线上形状 */
export function listModels(config: ModelsConfig, resolveKey: KeyResolver = envKeyResolver): ModelsDto {
  // 目录全量在前（含未配置的内置供应商），models.json 独有的自定义在后
  const ids: string[] = [
    ...Object.keys(PROVIDER_CATALOG),
    ...Object.keys(config.providers).filter((p) => PROVIDER_CATALOG[p.toLowerCase()] === undefined),
  ]
  const providers: ModelProviderDto[] = ids.map((id) => {
    const configured = config.providers[id] !== undefined
    const entry = PROVIDER_CATALOG[id.toLowerCase()]
    return {
      id,
      label: entry?.label ?? id,
      builtin: entry !== undefined,
      configured,
      ...(configured && config.providers[id]?.baseUrl !== undefined
        ? { baseUrl: config.providers[id]?.baseUrl }
        : entry !== undefined
          ? { baseUrl: entry.defaultBaseUrl }
          : {}),
      apiKeyEnv: configured ? (config.providers[id]?.apiKeyEnv ?? null) : null,
      hasKey: configured ? resolveKey(id, config.providers[id]?.apiKeyEnv ?? null).source !== 'none' : false,
      api: entry?.api ?? 'openai-completions',
    }
  })
  return {
    providers,
    models: config.models,
    defaultModel: config.defaultModel,
  }
}

// ---- 连通测试 ----

export interface TestDeps {
  /** fetch 注入（测试用；缺省全局 fetch） */
  fetchImpl?: typeof fetch
  /** 超时毫秒（缺省 8000） */
  timeoutMs?: number
  /** 计时器（缺省 Date.now；测试注入固定时延） */
  now?: () => number
  /** apiKey 解析器（缺省仅环境变量；引擎注入 secrets 仓口径——工单 10.12） */
  resolveKey?: KeyResolver
}

/** 测试探针端点：openai 系 /models；anthropic /v1/models（两系均支持廉价 GET 鉴权探测） */
function probeUrl(api: ProviderApiKind, baseUrl: string): string {
  return api === 'anthropic-messages' ? `${baseUrl}/v1/models` : `${baseUrl}/models`
}

function headersOf(api: ProviderApiKind, apiKey: string): Record<string, string> {
  return api === 'anthropic-messages'
    ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { authorization: `Bearer ${apiKey}` }
}

function failure(provider: string, message: string, detail?: string): ModelTestResultDto {
  return { provider, ok: false, message, ...(detail !== undefined ? { detail } : {}) }
}

/** HTTP 状态 → 人话文案（ok 判定：2xx/429 = 连通且鉴权通过） */
function resultOfStatus(provider: string, status: number, latencyMs: number): ModelTestResultDto {
  if (status >= 200 && status < 300) return { provider, ok: true, latencyMs, message: '连通正常' }
  if (status === 429) return { provider, ok: true, latencyMs, message: '连通正常（当前限流中）' }
  if (status === 401 || status === 403) {
    return { provider, ok: false, latencyMs, message: `鉴权失败（HTTP ${status}）：API Key 无效或无权限` }
  }
  if (status === 404) return { provider, ok: false, latencyMs, message: '接口不存在（HTTP 404）：Base URL 可能不正确' }
  return { provider, ok: false, latencyMs, message: `服务端错误（HTTP ${status}）` }
}

/** 单供应商连通测试：配置缺失即失败（不发起网络请求）；网络/超时给可读文案 */
export async function testProvider(
  providerId: string,
  config: ModelsConfig,
  deps: TestDeps = {},
): Promise<ModelTestResultDto> {
  const provider = config.providers[providerId]
  if (provider === undefined && PROVIDER_CATALOG[providerId.toLowerCase()] === undefined) {
    return failure(providerId, '未知供应商：不在 models.json providers，也不在内置目录')
  }
  if (provider === undefined) {
    return failure(providerId, '未配置：该供应商未写入 models.json providers')
  }
  const resolveKey = deps.resolveKey ?? envKeyResolver
  const resolved = resolveKey(providerId, provider.apiKeyEnv)
  if (resolved.apiKey === undefined) {
    // 缺 Key：文案区分「未配 apiKeyEnv」与「环境变量未设置」，并如实说明密钥仓亦无条目
    if (provider.apiKeyEnv === null) {
      return failure(providerId, '缺少 API Key：models.json 未设置 apiKeyEnv，密钥仓亦无条目')
    }
    return failure(
      providerId,
      `缺少 API Key：环境变量 ${provider.apiKeyEnv} 未设置，密钥仓亦无条目`,
    )
  }
  const apiKey = resolved.apiKey
  const entry = PROVIDER_CATALOG[providerId.toLowerCase()]
  const baseUrl = provider.baseUrl ?? entry?.defaultBaseUrl
  if (baseUrl === undefined) {
    return failure(providerId, '缺少 Base URL：自定义供应商须在 models.json 设置 baseUrl')
  }
  const api = entry?.api ?? 'openai-completions'
  const url = probeUrl(api, baseUrl)
  const doFetch = deps.fetchImpl ?? fetch
  const now = deps.now ?? Date.now
  const started = now()
  try {
    const res = await doFetch(url, {
      headers: headersOf(api, apiKey),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 8000),
    })
    const latencyMs = now() - started
    return resultOfStatus(providerId, res.status, latencyMs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isAbort = err instanceof Error && err.name === 'TimeoutError'
    return failure(
      providerId,
      isAbort ? '连接超时（8 秒无响应）' : '无法连接：网络不通或域名无法解析',
      msg,
    )
  }
}
