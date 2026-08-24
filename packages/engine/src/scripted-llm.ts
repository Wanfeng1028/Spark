/**
 * ScriptedLlm（doc/02 §8 阶段三清单）：预录响应序列的假 provider，
 * 实现 LlmGateway 端口——run-loop/工具/审批全链路 CI 可测，不依赖真实 API key。
 *
 * 行为：
 * - stream() 逐个消费 scriptStep 预录步骤：先回放 deltas（同步触发
 *   onDelta/onThinking），可挂起 hangMs（测 interrupt 级联），再返回定稿结果；
 * - abort：入口已 aborted 不消耗步骤直接返回 aborted（请求未达 provider）；
 *   挂起/回放途中 aborted 返回 aborted + 已交付前缀（dsh 截断定稿语义）；
 * - 序列耗尽 = 测试编程错误，fail-fast 抛 E_SCRIPTED_EXHAUSTED；
 * - calls 记录每次请求的 system/messages/tools 供断言（不含 apiKey）。
 */
import type { ContentItem, Usage } from '@spark/protocol'
import type {
  LlmGateway,
  LlmMessage,
  OnceRequest,
  StreamRequest,
  StreamResult,
  StopReason,
  ToolSpec,
} from './llm-gateway.js'
import { ZERO_USAGE } from './llm-gateway.js'

export interface ScriptedDelta {
  kind: 'text' | 'thinking'
  text: string
}

export interface ScriptedStep {
  /** 流式回放序列（触发 live 回调） */
  deltas?: ScriptedDelta[]
  /** 定稿 content；缺省由 deltas 汇总（reasoning 一块 + text 一块） */
  content?: ContentItem[]
  /** 缺省 'stop' */
  stopReason?: Exclude<StopReason, 'aborted'>
  usage?: Usage
  /** stopReason==='error' 时的错误描述 */
  error?: string
  /** 回放完 deltas 后挂起的毫秒数（挂起期间 abort → aborted 前缀） */
  hangMs?: number
}

function abortableSleep(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      resolve()
    }
    if (signal.aborted) {
      clearTimeout(timer)
      resolve()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** 已交付前缀 → 截断定稿 content（aborted 时） */
function prefixContent(texts: string[], thinkings: string[]): ContentItem[] {
  const content: ContentItem[] = []
  if (thinkings.length > 0) content.push({ type: 'reasoning', text: thinkings.join('') })
  if (texts.length > 0) content.push({ type: 'text', text: texts.join('') })
  return content
}

export class ScriptedLlm implements LlmGateway {
  private readonly steps: ScriptedStep[] = []
  private readonly onceReplies: string[] = []
  /** 每次 stream 调用的请求快照（断言投影/工具清单用） */
  readonly calls: Array<{ system: string; messages: LlmMessage[]; tools: ToolSpec[] }> = []
  /** 每次 generateOnce 调用的请求快照（断言压缩/标题提示词用） */
  readonly onceCalls: Array<{ system: string | undefined; prompt: string; maxTokens: number | undefined }> = []

  scriptStep(step: ScriptedStep): void {
    this.steps.push(step)
  }

  scriptOnce(reply: string): void {
    this.onceReplies.push(reply)
  }

  async stream(req: StreamRequest): Promise<StreamResult> {
    this.calls.push({ system: req.system, messages: req.messages, tools: req.tools })
    if (req.signal.aborted) {
      // 请求未达 provider：不消耗预录步骤
      return { content: [], stopReason: 'aborted', usage: ZERO_USAGE }
    }
    const step = this.steps.shift()
    if (step === undefined) {
      throw new Error('E_SCRIPTED_EXHAUSTED: 预录响应序列耗尽（测试脚本缺口）')
    }

    const texts: string[] = []
    const thinkings: string[] = []
    for (const d of step.deltas ?? []) {
      if (req.signal.aborted) break
      if (d.kind === 'text') {
        req.onDelta(d.text)
        texts.push(d.text)
      } else {
        req.onThinking(d.text)
        thinkings.push(d.text)
      }
    }

    if (step.hangMs !== undefined && !req.signal.aborted) {
      await abortableSleep(req.signal, step.hangMs)
    }
    if (req.signal.aborted) {
      return { content: prefixContent(texts, thinkings), stopReason: 'aborted', usage: ZERO_USAGE }
    }

    const content =
      step.content !== undefined ? step.content : prefixContent(texts, thinkings)
    return {
      content,
      stopReason: step.stopReason ?? 'stop',
      usage: step.usage ?? ZERO_USAGE,
      ...(step.error !== undefined ? { error: step.error } : {}),
    }
  }

  generateOnce(req: OnceRequest): Promise<string> {
    this.onceCalls.push({ system: req.system, prompt: req.prompt, maxTokens: req.maxTokens })
    const reply = this.onceReplies.shift()
    if (reply === undefined) {
      return Promise.reject(
        new Error('E_SCRIPTED_EXHAUSTED: 预录 once 应答序列耗尽（测试脚本缺口）'),
      )
    }
    return Promise.resolve(reply)
  }
}
