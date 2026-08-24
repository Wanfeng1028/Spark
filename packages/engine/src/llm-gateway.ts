/**
 * LLM 网关端口（doc/02 §5.9）：RunLoop 消费的流式采样接口。
 * 本文件先立端口类型与接口契约；真实 pi-ai 集成（含 zod→jsonSchema→
 * Type.Unsafe 薄桥与重试）在后续工单实现，ScriptedLlm 假 provider 实现同一端口
 * 供 run-loop/工具/审批全链路 CI 测试（不依赖真实 API key）。
 *
 * 契约（pi 契约本地化）：
 * - 错误进结果不抛：provider/网络/abort 一律以 stopReason 表达
 *   （'error' / 'aborted'），已交付前缀保留在 content（dsh：截断定稿）。
 * - onDelta/onThinking 是 live 回调（assistant.delta / reasoning.delta 的源），
 *   只回调不落协议——定稿事件由 run-loop emit。
 * - system 提示词独立字段（v2.7 修正：pi-ai Context.systemPrompt 非 messages[0]）。
 */
import type { ContentItem, Usage } from '@spark/protocol'

/** models.json + 环境变量合成的已解析模型；apiKey 只在此注入，不进事件/日志/DTO */
export interface ResolvedModel {
  provider: string
  model: string
  contextWindow: number
  apiKey?: string
  baseUrl?: string
}

/** 模型上下文消息（Projector 投影输出；system 走 StreamRequest.system） */
export interface LlmMessage {
  role: 'user' | 'assistant'
  content: ContentItem[]
}

/** 工具清单条目（ToolRegistry.materialize 输出；parameters 为 zod→toJSONSchema 产物） */
export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface StreamRequest {
  model: ResolvedModel
  /** §5.11 组装的 system prompt（独立字段直传 pi-ai） */
  system: string
  messages: LlmMessage[]
  tools: ToolSpec[]
  signal: AbortSignal
  onDelta: (text: string) => void
  onThinking: (text: string) => void
}

export type StopReason = 'stop' | 'length' | 'error' | 'aborted'

export interface StreamResult {
  /** 定稿内容（reasoning?/text/toolCalls）；aborted 时为已交付前缀 */
  content: ContentItem[]
  stopReason: StopReason
  usage: Usage
  /** stopReason==='error' 时的错误描述（进 error 事件） */
  error?: string
}

/** 压缩/起标题等一次性生成（非流式） */
export interface OnceRequest {
  model: ResolvedModel
  system?: string
  prompt: string
  signal?: AbortSignal
}

export interface LlmGateway {
  stream(req: StreamRequest): Promise<StreamResult>
  generateOnce(req: OnceRequest): Promise<string>
}
