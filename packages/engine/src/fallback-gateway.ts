/**
 * provider fallback 链（阶段七工单 7.7 / H07，P0）：LlmGateway 装饰器。
 *
 * 切换纪律（与 pi-gateway "已交付即不重试" 同源）：
 * - 仅当 inner 返回 stopReason==='error' 且 content 为空（无任何已交付前缀——
 *   delta 与定稿 content 同源，content 空 ⇔ 未交付）时逐个尝试 fallback 链；
 * - aborted 不切换（用户主动中断不是故障）；部分交付不切换（避免重复输出）；
 * - 链尽 → 返回汇总错误（每个模型的失败原因都可见，人话定位）；
 * - 空链零开销短路——inner 行为完全不变（测试注入 ScriptedLlm 无感）。
 *
 * 链经函数每请求现读（engine 装配传 `() => this.routing.fallbacks`）——
 * 热更新（PUT /api/routing）下一请求生效。
 */
import type {
  LlmGateway,
  OnceRequest,
  ResolvedModel,
  StreamRequest,
  StreamResult,
} from './llm-gateway.js'
import { errText } from './errs.js'

/** fallback 发生的可观测出口（engine 传 logger.warn；缺省静默） */
export interface FallbackLogger {
  warn(msg: string, data?: Record<string, unknown>): void
}

export interface FallbackGatewayDeps {
  inner: LlmGateway
  /** fallback 链（每请求现读；ResolvedModel 已含 apiKey——engine resolveModel 单点） */
  chain: () => readonly ResolvedModel[]
  logger?: FallbackLogger
}

/** 模型标识（日志/错误汇总用；不含 apiKey） */
function modelId(m: ResolvedModel): string {
  return `${m.provider}/${m.model}`
}

/** 错误且无已交付内容（可安全切换的形态） */
function switchable(result: StreamResult): boolean {
  return result.stopReason === 'error' && result.content.length === 0
}

export class FallbackGateway implements LlmGateway {
  constructor(private readonly deps: FallbackGatewayDeps) {}

  async stream(req: StreamRequest): Promise<StreamResult> {
    let result = await this.deps.inner.stream(req)
    if (!switchable(result)) return result
    const chain = this.deps.chain()
    if (chain.length === 0) return result // 空链短路：inner 行为完全不变
    const failures: string[] = [`${modelId(req.model)}（${result.error ?? '未提供错误详情'}）`]
    for (const model of chain) {
      this.deps.logger?.warn('llm.fallback', {
        from: modelId(req.model),
        to: modelId(model),
      })
      const attempt = await this.deps.inner.stream({ ...req, model })
      if (!switchable(attempt)) return attempt
      result = attempt
      failures.push(`${modelId(model)}（${attempt.error ?? '未提供错误详情'}）`)
    }
    return {
      content: [],
      stopReason: 'error',
      usage: result.usage,
      error: `E_LLM_FALLBACK: 主模型与 fallback 链均不可用——${failures.join('；')}`,
    }
  }

  async generateOnce(req: OnceRequest): Promise<string> {
    try {
      return await this.deps.inner.generateOnce(req)
    } catch (primaryErr) {
      const chain = this.deps.chain()
      if (chain.length === 0) throw primaryErr // 空链短路：原错误原样上抛
      const failures: string[] = [`${modelId(req.model)}（${errText(primaryErr)}）`]
      for (const model of chain) {
        this.deps.logger?.warn('llm.fallback.once', {
          from: modelId(req.model),
          to: modelId(model),
        })
        try {
          return await this.deps.inner.generateOnce({ ...req, model })
        } catch (err) {
          failures.push(`${modelId(model)}（${errText(err)}）`)
        }
      }
      throw new Error(
        `E_LLM_FALLBACK: 主模型与 fallback 链均不可用——${failures.join('；')}`,
      )
    }
  }
}

