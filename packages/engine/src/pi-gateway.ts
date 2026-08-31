/**
 * pi-ai 集成网关（doc/02 §5.9 工单 8）：Spark 端口类型 ↔ pi-ai 类型双向映射 +
 * 指数退避重试（1s/2s/4s，±20% jitter，最多 3 次）。
 *
 * pi 依赖隔离点：本文件是 engine 唯一 import pi-ai 的模块（§5.0 依赖方向约定），
 * api 实现走 lazy 变体（首次调用才加载 provider SDK）。
 *
 * 映射契约（§5.9 v2.4 事件映射取舍）：
 * - text_delta → onDelta；thinking_delta → onThinking；其余事件忽略（v1 不映射）
 * - 消息：Spark assistant.content 的 toolResult 项拆为 pi 独立 toolResult 消息
 *   （toolName 从上下文同 callId 的 toolCall 回溯）；toolCall ↔ pi ToolCall 直转
 * - 工具清单：ToolSpec.parameters（JSON Schema）→ Type.Unsafe 薄桥（v2.7 勘误）
 * - stopReason：pi toolUse → Spark stop（run-loop 以 content 判工具调用）
 * - 错误进结果不抛（pi 契约本地化）；重试仅限 429/5xx/网络错误且尚无 delta 交付
 *   （已交付即不重试——避免重复输出，失败闭合由 run-loop 承担）
 */
import { Type } from '@earendil-works/pi-ai'
import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  Context as PiContext,
  Message as PiMessage,
  Model,
  SimpleStreamOptions,
  StreamOptions,
  TextContent,
  ThinkingContent,
  Tool as PiTool,
  ToolCall as PiToolCall,
  Usage as PiUsage,
} from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { ids, type ContentItem, type Usage } from '@spark/protocol'
import {
  ZERO_USAGE,
  type LlmGateway,
  type LlmMessage,
  type OnceRequest,
  type ResolvedModel,
  type StopReason,
  type StreamRequest,
  type StreamResult,
  type ToolSpec,
} from './llm-gateway.js'
import { PROVIDER_CATALOG } from './model-catalog.js'

// ---- provider → api 解析 ----

interface ProviderSpec {
  api: Api
  defaultBaseUrl: string
}

/** 目录表（model-catalog 单一来源）→ 流式分派用 ProviderSpec（api 字面量即 Api 联合成员） */
const PROVIDERS: Record<string, ProviderSpec> = Object.fromEntries(
  Object.entries(PROVIDER_CATALOG).map(([id, e]) => [id, { api: e.api, defaultBaseUrl: e.defaultBaseUrl }]),
)

/** 任意 api 的 pi Model（泛型缺省在 strict 下不可省，统一别名） */
type AnyPiModel = Model<Api>

/** 可注入的 pi stream 函数（真实装配由构造缺省提供；测试注入 fake） */
export type PiStreamFn = (
  model: AnyPiModel,
  context: PiContext,
  options?: StreamOptions,
) => AsyncIterable<AssistantMessageEvent>

export interface PiGatewayDeps {
  /** pi stream 函数（缺省按 provider 的 api 选 lazy 实现） */
  streamFn?: PiStreamFn
  /** 退避 sleep（缺省真实 setTimeout；测试注入假钟） */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  /** 重试上限（§5.9：3 次） */
  maxRetries?: number
  /** 退避基数毫秒（§5.9：1s → 1s/2s/4s） */
  baseDelayMs?: number
}

// ---- 错误分类（§5.10 错误码 + §5.9 可重试判定）----

export type LlmErrorKind = 'E_LLM_RATELIMIT' | 'E_LLM_PROVIDER' | 'E_LLM_NETWORK'

interface ErrorClass {
  kind: LlmErrorKind
  retryable: boolean
}

/** 配额/鉴权/参数类：不可重试（fail-fast，确定性错误） */
const FATAL_PATTERN =
  /(insufficient_quota|quota exceeded|out of budget|billing|usage limit|invalid[_ ]?api[_ ]?key|incorrect api key|unauthorized|forbidden|model_not_found|not_found_error|invalid_request_error)/i
const RATELIMIT_PATTERN = /(\b429\b|rate.?limit|too many requests|resourceexhausted)/i
const NETWORK_PATTERN =
  /(network|fetch failed|getaddrinfo|enotfound|eai_again|econnrefused|econnreset|econnaborted|etimedout|timed? ?out|socket hang up|connection (error|refused|lost|closed|reset)|other side closed|upstream connect|reset before headers|terminated|epipe)/i
const SERVER_PATTERN =
  /(\b5\d\d\b|overloaded|service.?unavailable|server.?error|internal.?error|bad gateway|provider.?returned.?error)/i

export function classifyLlmError(message: string): ErrorClass {
  if (FATAL_PATTERN.test(message)) return { kind: 'E_LLM_PROVIDER', retryable: false }
  if (RATELIMIT_PATTERN.test(message)) return { kind: 'E_LLM_RATELIMIT', retryable: true }
  if (NETWORK_PATTERN.test(message)) return { kind: 'E_LLM_NETWORK', retryable: true }
  if (SERVER_PATTERN.test(message)) return { kind: 'E_LLM_PROVIDER', retryable: true }
  return { kind: 'E_LLM_PROVIDER', retryable: false }
}

/** 指数退避：base * 2^(attempt-1)，±20% jitter（attempt 从 1 起） */
export function backoffDelayMs(baseMs: number, attempt: number): number {
  const exp = baseMs * 2 ** (attempt - 1)
  return Math.round(exp * (0.8 + Math.random() * 0.4))
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timer = setTimeout(() => resolve(), ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('aborted'))
      },
      { once: true },
    )
  })
}

// ---- 类型映射 ----

function toPiModel(m: ResolvedModel, spec: ProviderSpec): AnyPiModel {
  return {
    id: m.model,
    name: m.model,
    api: spec.api,
    provider: m.provider,
    baseUrl: m.baseUrl ?? spec.defaultBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.contextWindow,
    maxTokens: 8192,
  }
}

/** Spark ContentItem[] → pi 消息内容（text/reasoning/toolCall 三类） */
function toPiAssistantContent(content: readonly ContentItem[]): Array<TextContent | ThinkingContent | PiToolCall> {
  const out: Array<TextContent | ThinkingContent | PiToolCall> = []
  for (const c of content) {
    if (c.type === 'text') out.push({ type: 'text', text: c.text })
    else if (c.type === 'reasoning') out.push({ type: 'thinking', thinking: c.text })
    else if (c.type === 'toolCall')
      out.push({ type: 'toolCall', id: c.callId, name: c.name, arguments: asArguments(c.input) })
    // toolResult 项由 toPiMessages 拆为独立消息，此处跳过
  }
  return out
}

function asArguments(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
}

/** 工具输出序列化（toolResult.output → pi TextContent） */
function outputToText(output: unknown): string {
  if (typeof output === 'string') return output
  return JSON.stringify(output) ?? String(output)
}

/** Spark LlmMessage[] → pi Message[]（toolResult 拆独立消息；toolName 回溯同 callId） */
export function toPiMessages(messages: readonly LlmMessage[]): PiMessage[] {
  const out: PiMessage[] = []
  // 先全量收集 callId → 工具名（toolCall 与 toolResult 常分属两条 Spark 消息）
  const callNames = new Map<string, string>()
  for (const m of messages) {
    for (const c of m.content) {
      if (c.type === 'toolCall') callNames.set(c.callId, c.name)
    }
  }
  for (const m of messages) {
    if (m.role === 'user') {
      const texts = m.content.filter((c): c is Extract<ContentItem, { type: 'text' }> => c.type === 'text')
      out.push({
        role: 'user',
        content: texts.map((t) => ({ type: 'text' as const, text: t.text })),
        timestamp: Date.now(),
      })
      continue
    }
    const main = toPiAssistantContent(m.content)
    for (const c of m.content) {
      if (c.type === 'toolResult') {
        out.push({
          role: 'toolResult',
          toolCallId: c.callId,
          toolName: callNames.get(c.callId) ?? '',
          content: [{ type: 'text', text: outputToText(c.output) }],
          isError: c.isError,
          timestamp: Date.now(),
        })
      }
    }
    if (main.length > 0) {
      out.push({
        role: 'assistant',
        content: main,
        api: 'openai-completions',
        provider: '',
        model: '',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
      })
    }
  }
  return out
}

/** pi AssistantMessage.content → Spark ContentItem[]（image 项 v1 不产出自模型侧） */
export function toSparkContent(content: ReadonlyArray<TextContent | ThinkingContent | PiToolCall>): ContentItem[] {
  const out: ContentItem[] = []
  for (const c of content) {
    if (c.type === 'text') out.push({ type: 'text', text: c.text })
    else if (c.type === 'thinking') out.push({ type: 'reasoning', text: c.thinking })
    // 协议边界收窄：pi ToolCall.id 即先前投影出去的 CallId（run-loop 全链路回环）
    else out.push({ type: 'toolCall', callId: ids.call(c.id), name: c.name, input: c.arguments })
  }
  return out
}

function toSparkStopReason(r: string): StopReason {
  if (r === 'length') return 'length'
  if (r === 'aborted') return 'aborted'
  if (r === 'error') return 'error'
  return 'stop' // 'stop' | 'toolUse'（Spark 不区分，run-loop 以 content 判定）
}

export function toSparkUsage(u: PiUsage | undefined): Usage {
  if (u === undefined) return ZERO_USAGE
  return {
    inputTokens: u.input,
    outputTokens: u.output,
    ...(u.reasoning !== undefined ? { reasoningTokens: u.reasoning } : {}),
    ...(u.cacheRead !== 0 ? { cacheRead: u.cacheRead } : {}),
    ...(u.cacheWrite !== 0 ? { cacheWrite: u.cacheWrite } : {}),
    ...(u.cost.total !== 0 ? { costUsd: u.cost.total } : {}),
  }
}

/** 工具薄桥（v2.7 勘误）：JSON Schema → Type.Unsafe 包成 typebox TSchema */
function toPiTools(tools: readonly ToolSpec[]): PiTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: Type.Unsafe(t.parameters),
  }))
}

// ---- 网关实现 ----

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const NO_API_KEY_RESULT = (provider: string): StreamResult => ({
  content: [],
  stopReason: 'error',
  usage: ZERO_USAGE,
  error: `E_LLM_PROVIDER: provider ${provider} 未配置 apiKey（models.json apiKeyEnv 环境变量缺失）`,
})

const UNKNOWN_PROVIDER_RESULT = (provider: string): StreamResult => ({
  content: [],
  stopReason: 'error',
  usage: ZERO_USAGE,
  error: `E_LLM_PROVIDER: 未知 provider ${provider}（v1 支持见 PROVIDERS 表；自定义 OpenAI 兼容端点请用已知 provider 名 + baseUrl）`,
})

export class PiGateway implements LlmGateway {
  private readonly streamFn: PiStreamFn
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>
  private readonly maxRetries: number
  private readonly baseDelayMs: number

  constructor(deps: PiGatewayDeps = {}) {
    const openai = openAICompletionsApi()
    const anthropic = anthropicMessagesApi()
    this.streamFn =
      deps.streamFn ??
      ((model, context, options) => {
        // 按 model.api 分派到对应 lazy api 实现
        if (model.api === 'anthropic-messages') return anthropic.stream(model, context, options)
        return openai.stream(model, context, options)
      })
    this.sleep = deps.sleep ?? defaultSleep
    this.maxRetries = deps.maxRetries ?? 3
    this.baseDelayMs = deps.baseDelayMs ?? 1000
  }

  async stream(req: StreamRequest): Promise<StreamResult> {
    // 目录命中用目录表；自定义供应商（models.json 独有）按 OpenAI 兼容约定走 completions，
    // 但必须自带 baseUrl（无地址的自定义名 = 无法分派，保持原拒绝语义）
    const spec: ProviderSpec | undefined =
      PROVIDERS[req.model.provider.toLowerCase()] ??
      (req.model.baseUrl !== undefined
        ? { api: 'openai-completions', defaultBaseUrl: '' }
        : undefined)
    if (spec === undefined) return UNKNOWN_PROVIDER_RESULT(req.model.provider)
    if (req.model.apiKey === undefined) return NO_API_KEY_RESULT(req.model.provider)

    const piModel = toPiModel(req.model, spec)
    const context: PiContext = {
      ...(req.system !== '' ? { systemPrompt: req.system } : {}),
      messages: toPiMessages(req.messages),
      ...(req.tools.length > 0 ? { tools: toPiTools(req.tools) } : {}),
    }
    const options: SimpleStreamOptions = {
      apiKey: req.model.apiKey,
      signal: req.signal,
      ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      // 工单 10.6：推理档位透传（ThinkingLevel 子集；不支持的 provider 由 pi-ai 忽略）
      ...(req.effort !== undefined ? { reasoning: req.effort } : {}),
    }

    let attempt = 0
    for (;;) {
      let final: AssistantMessage | null = null
      let delivered = false
      try {
        for await (const e of this.streamFn(piModel, context, options)) {
          if (e.type === 'text_delta') {
            delivered = true
            req.onDelta(e.delta)
          } else if (e.type === 'thinking_delta') {
            delivered = true
            req.onThinking(e.delta)
          } else if (e.type === 'done') {
            final = e.message
          } else if (e.type === 'error') {
            final = e.error
          }
        }
      } catch (err) {
        // 迭代器抛出（pi 契约之外的异常路径）：失败闭合——空内容错误结果
        return { content: [], stopReason: 'error', usage: ZERO_USAGE, error: `E_LLM_PROVIDER: ${errText(err)}` }
      }
      if (final === null) {
        return { content: [], stopReason: 'error', usage: ZERO_USAGE, error: 'E_LLM_PROVIDER: 流未闭合（无 done/error 事件）' }
      }
      if (final.stopReason === 'aborted' || req.signal.aborted) {
        return {
          content: toSparkContent(final.content),
          stopReason: 'aborted',
          usage: toSparkUsage(final.usage),
        }
      }
      if (final.stopReason !== 'error') {
        return {
          content: toSparkContent(final.content),
          stopReason: toSparkStopReason(final.stopReason),
          usage: toSparkUsage(final.usage),
        }
      }
      // provider 错误：分类 → 重试判定（已交付不重试；配额/鉴权 fail-fast）
      const cls = classifyLlmError(final.errorMessage ?? '')
      if (delivered || !cls.retryable || attempt >= this.maxRetries) {
        return {
          content: toSparkContent(final.content),
          stopReason: 'error',
          usage: toSparkUsage(final.usage),
          error: `${cls.kind}: ${final.errorMessage ?? '未提供错误详情'}`,
        }
      }
      attempt += 1
      try {
        await this.sleep(backoffDelayMs(this.baseDelayMs, attempt), req.signal)
      } catch {
        return { content: [], stopReason: 'aborted', usage: ZERO_USAGE }
      }
    }
  }

  async generateOnce(req: OnceRequest): Promise<string> {
    const controller = new AbortController()
    if (req.signal !== undefined) {
      if (req.signal.aborted) controller.abort()
      else req.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    const result = await this.stream({
      model: req.model,
      system: req.system ?? '',
      messages: [{ role: 'user', content: [{ type: 'text', text: req.prompt }] }],
      tools: [],
      signal: controller.signal,
      onDelta: () => {},
      onThinking: () => {},
      ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
    })
    if (result.stopReason === 'error') throw new Error(result.error ?? 'E_LLM_PROVIDER')
    if (result.stopReason === 'aborted') throw new Error('E_ABORTED: generateOnce 被中断')
    return result.content
      .filter((c): c is Extract<ContentItem, { type: 'text' }> => c.type === 'text')
      .map((c) => c.text)
      .join('')
  }
}
