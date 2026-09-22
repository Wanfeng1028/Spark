/**
 * embedding 提供方（阶段十九 19.8 / ADR D51，翻案 D25"向量后置"登记）：
 * models.json `providers.<id>.embeddings = { model, dimensions? }` 声明能力；
 * 走 **OpenAI 兼容 /embeddings** HTTP 端点（零新依赖——与 LLM 网关同款 fetch 直调）。
 * 解析优先级：models.json `embedding.provider` 指名（须声明 embeddings）→ 否则文件序
 * 第一个声明者。无声明者 → 语义检索不可用（调用方如实降级到关键词，禁假状态）。
 */
import type { ModelsConfig } from '../config.js'

/** 生效的 embedding 提供方（引擎装配一次，运行期不变——换提供方改 models.json 重启） */
export interface EmbeddingProviderInfo {
  /** models.json providers 键 */
  providerId: string
  /** embedding 模型名 */
  model: string
  /** 向量维度（提供方未声明时由首次响应推断） */
  dimensions: number | undefined
}

/** 单次请求超时（embedding 批量小、响应快；超时即失败不重试——由调用方降级） */
export const EMBEDDING_TIMEOUT_MS = 30_000

/** 批量上限（OpenAI 兼容端点单请求 input 数组长度；超出分批） */
export const EMBEDDING_BATCH = 16

export class EmbeddingError extends Error {
  readonly code: string
  constructor(message: string, code = 'E_EMBEDDING_FAILED') {
    super(message)
    this.name = 'EmbeddingError'
    this.code = code
  }
}

/**
 * 从 models.json 解析生效提供方。providers 为空表/无声明 → null（语义不可用）。
 * dimensions 缺省 = 首次响应后由 VectorStore 侧推断（不猜——不同模型维度不同）。
 */
export function resolveEmbeddingProvider(
  providers: ModelsConfig['providers'],
  preferred?: string,
): EmbeddingProviderInfo | null {
  const entries = Object.entries(providers).filter(([, p]) => p.embeddings !== undefined)
  if (entries.length === 0) return null
  const picked =
    (preferred !== undefined ? entries.find(([id]) => id === preferred) : undefined) ?? entries[0]
  if (picked === undefined) return null
  const [providerId, p] = picked
  const emb = p.embeddings
  if (emb === undefined) return null
  return { providerId, model: emb.model, dimensions: emb.dimensions }
}

/** 提供方声明形状（config.ts 的 modelsSchema 同源；此处只作解析入参类型） */
export interface EmbeddingDecl {
  model: string
  dimensions?: number | undefined
}

/**
 * embedding 客户端接口（vector/semantic.ts 只依赖此面——单测可注入假 client，
 * 免网络免 key）。embed(texts) 返回与入参**同序**的向量；失败抛 EmbeddingError。
 */
export interface EmbeddingClient {
  readonly provider: EmbeddingProviderInfo
  /** 已确定的向量维度（首次响应后收窄；提供方未声明且未调用过时为 undefined） */
  readonly dimensions: number | undefined
  embed(texts: string[]): Promise<Float32Array[]>
}

export interface EmbeddingClientOptions {
  baseUrl: string
  apiKey: string | undefined
  provider: EmbeddingProviderInfo
  /** 测试注入：fetch 替身（缺省全局 fetch） */
  fetchImpl?: typeof fetch | undefined
  /** 测试注入：超时（缺省 EMBEDDING_TIMEOUT_MS） */
  timeoutMs?: number | undefined
}

/** OpenAI 兼容 /embeddings 响应条目 */
interface EmbeddingResponseItem {
  embedding?: unknown
  index?: unknown
}

/**
 * embedding 客户端。embed(texts) 返回与入参**同序**的向量数组（按 index 排序回填，
 * 不信任服务端返回顺序）；形状不符 → EmbeddingError（fail-closed，调用方降级关键词）。
 */
export class HttpEmbeddingClient {
  readonly provider: EmbeddingProviderInfo
  private readonly baseUrl: string
  private readonly apiKey: string | undefined
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(opts: EmbeddingClientOptions) {
    this.provider = opts.provider
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.apiKey = opts.apiKey
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.timeoutMs = opts.timeoutMs ?? EMBEDDING_TIMEOUT_MS
  }

  /** 向量维度（首次成功响应后确定；此前为提供方声明值或 undefined） */
  get dimensions(): number | undefined {
    return this.provider.dimensions
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    const out: Float32Array[] = []
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH)
      const vectors = await this.embedBatch(batch)
      for (let j = 0; j < vectors.length; j++) out[i + j] = vectors[j] as Float32Array
    }
    return out
  }

  private async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.timeoutMs)
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey !== undefined ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: this.provider.model, input: texts }),
        signal: ac.signal,
      })
    } catch (err) {
      throw new EmbeddingError(`embedding 请求失败：${errText(err)}`)
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      throw new EmbeddingError(`embedding 端点返回 ${String(res.status)}`, 'E_EMBEDDING_HTTP')
    }
    const body = (await res.json().catch(() => null)) as { data?: unknown } | null
    const data = Array.isArray(body?.data) ? (body?.data as EmbeddingResponseItem[]) : null
    if (data === null || data.length !== texts.length) {
      throw new EmbeddingError('embedding 响应形状不符（data 数组长度与入参不一致）', 'E_EMBEDDING_SHAPE')
    }
    // 按 index 回填（服务端顺序不作数）；index 缺失按位置兜底
    const byIndex = new Map<number, Float32Array>()
    for (let pos = 0; pos < data.length; pos++) {
      const item = data[pos] as EmbeddingResponseItem
      const vec = toVector(item.embedding)
      if (vec === null) {
        throw new EmbeddingError('embedding 响应形状不符（embedding 非数值数组）', 'E_EMBEDDING_SHAPE')
      }
      const idx = typeof item.index === 'number' ? item.index : pos
      byIndex.set(idx, vec)
    }
    const out: Float32Array[] = []
    for (let i = 0; i < texts.length; i++) {
      const v = byIndex.get(i)
      if (v === undefined) {
        throw new EmbeddingError('embedding 响应缺 index 条目', 'E_EMBEDDING_SHAPE')
      }
      out.push(v)
    }
    // 首答推断维度（提供方未声明时）——只收窄不放宽
    if (this.provider.dimensions === undefined && out.length > 0) {
      this.provider.dimensions = (out[0] as Float32Array).length
    }
    return out
  }
}

/** 数值数组 → Float32Array；非数值/空 → null（fail-closed 不猜维度） */
export function toVector(raw: unknown): Float32Array | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    const n: unknown = raw[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    out[i] = n
  }
  return out
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
