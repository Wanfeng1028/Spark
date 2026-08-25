/**
 * Run Loop（doc/02 §5.5）：每会话一个常驻 async 循环体（per-session 串行，
 * 跨会话并发——opencode RunCoordinator 思想）。
 *
 * 事件纪律（对照 mock normal.jsonl 基线）：
 *   user.message → turn.started → [reasoning.delta* → reasoning.ended →
 *   assistant.delta* → assistant.message → (tool.* 对 + assistant.message 工具结果)*]
 *   → turn.completed
 * 失败闭合：turn.started 已发出后无论如何补发 turn.completed（catch → finish='error'）；
 *   started 未发出即失败时不发 completed（无配对 started，不造悬挂）。
 * 截断保护（pi failToolCallsFromTruncatedMessage）：stopReason 'length' 时截断的
 *   toolCall 不执行，补 started/completed{E_TRUNCATED} 事件对并以 toolResult 回喂，
 *   continue——下一 step 模型重发完整调用。
 * Projector/Compactor/ToolPipeline 为端口（§5.6/§5.8 后续工单实现；测试注入 stub）。
 */
import type {
  CallId,
  ContentItem,
  Delivery,
  SessionId,
  TurnFinish,
  TurnId,
  Usage,
} from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { LlmGateway, LlmMessage, ResolvedModel, ToolSpec } from './llm-gateway.js'
import { ZERO_USAGE, addUsage } from './llm-gateway.js'
import type { Metrics } from './observability/metrics.js'
import type { SessionRuntime } from './session/runtime.js'
import type { InputItem } from './session/input-queue.js'

// ---- 端口（后续工单实现）----

/** §5.8.3 投影：surface 事件 → 模型上下文（含字符近似 token 估算） */
export interface Projector {
  modelContext(): { messages: LlmMessage[]; tokens: number }
}

/** §5.8.5 压缩：emit compaction.* 并重投影（阈值判断在 run-loop） */
export interface Compactor {
  compact(): Promise<void>
}

/** 工单 4.6：turn 边界快照端口（实现自闭合——失败 emit error{io}，不向 run-loop 抛） */
export interface Checkpointer {
  snapshot(turnId: TurnId): Promise<void>
}

/** 本 step 待执行的工具调用（assistant.message content 中 toolCall 项的提取） */
export interface ToolCallPending {
  callId: CallId
  name: string
  input: unknown
}

export interface ToolPipelineResult {
  callId: CallId
  output: unknown
  isError: boolean
}

/** §5.6 工具管线端口：materialize 广告清单；runAll 内部 emit tool.started/completed */
export interface ToolPipeline {
  materialize(): ToolSpec[]
  runAll(turn: TurnCtx, calls: readonly ToolCallPending[]): Promise<ToolPipelineResult[]>
}

// ---- TurnCtx（§5.5）----

export interface TurnCtx {
  turnId: TurnId
  delivery: Delivery
  /** interrupt 入口；级联到 LLM 流与工具 signal（§5.6 管线接线） */
  abort: AbortController
  step: number
  /** 本 turn 累计用量 */
  usage: Usage
  /** 本 step 的工具调用（interrupt/管线访问） */
  toolCalls: ToolCallPending[]
}

export interface RunLoopDeps {
  sessionId: SessionId
  bus: EventBus
  gateway: LlmGateway
  projector: Projector
  compactor: Compactor
  tools: ToolPipeline
  model: ResolvedModel
  /** §5.11 组装的 system prompt */
  system: string
  maxStepsPerTurn: number
  /** 压缩阈值比例（config.engine.compactionThreshold，乘 contextWindow） */
  compactionThreshold: number
  /** 进程内指标（§5.10 清单；缺省不计数——测试 stub 可省，工单 4.8） */
  metrics?: Metrics
  /** turn 边界 checkpoint（工单 4.6；config.engine.checkpoints=false 时缺省） */
  checkpoint?: Checkpointer
}

function isToolCall(c: ContentItem): c is Extract<ContentItem, { type: 'toolCall' }> {
  return c.type === 'toolCall'
}

function toPending(c: Extract<ContentItem, { type: 'toolCall' }>): ToolCallPending {
  return { callId: c.callId, name: c.name, input: c.input }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 会话常驻循环：take 输入 → runTurn → 续跑。
 * 退出路径：输入队列关闭（引擎 shutdown，rt.shutdown()）——挂起的 take reject。
 * runTurn 已自身保证失败闭合；此处 catch 兜底 emit error（started 前失败的形态）。
 */
export async function runSessionLoop(rt: SessionRuntime, deps: RunLoopDeps): Promise<void> {
  for (;;) {
    let input: InputItem
    try {
      input = await rt.takeInput()
    } catch {
      break // E_QUEUE_CLOSED：引擎 shutdown，正常退出
    }
    try {
      await runTurn(rt, deps, input)
    } catch (err) {
      // 兜底的兜底：runTurn 只在 turn.started 之前抛（其后内部已闭合）
      await deps.bus.emit(deps.sessionId, 'error', {
        scope: 'engine',
        message: errMessage(err),
      })
    }
  }
}

/** 单个 turn：开启（user.message + turn.started）→ step 循环 → 收尾（turn.completed） */
export async function runTurn(
  rt: SessionRuntime,
  deps: RunLoopDeps,
  input: InputItem,
): Promise<void> {
  const sid = deps.sessionId
  const turnId = input.turnId
  let finish: TurnFinish = 'stop'
  let usage = ZERO_USAGE
  let started = false
  const abort = rt.beginTurn(input.turnId)
  const turn: TurnCtx = {
    turnId,
    delivery: input.delivery,
    abort,
    step: 0,
    usage,
    toolCalls: [],
  }

  try {
    const userEvent = await deps.bus.emit(sid, 'user.message', {
      text: input.text,
      ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
    })
    await deps.bus.emit(sid, 'turn.started', {
      turnId,
      delivery: input.delivery,
      userEventId: userEvent.id,
    })
    started = true

    for (;;) {
      turn.step += 1
      // ① steering 注入（pi：在 assistant 响应前生效）
      for (const item of rt.drainSteer()) {
        await deps.bus.emit(sid, 'user.message', { text: item.text })
      }
      // ② 上下文组装（StepContext 快照语义，Codex）
      let ctx = deps.projector.modelContext()
      if (ctx.tokens > deps.compactionThreshold * deps.model.contextWindow) {
        await deps.compactor.compact()
        ctx = deps.projector.modelContext() // 压缩后重投影
      }
      const tools = deps.tools.materialize()
      // ③ 流式采样（live delta 直播；定稿事件本函数 emit）
      let thinking = ''
      const result = await deps.gateway.stream({
        model: deps.model,
        system: deps.system,
        messages: ctx.messages,
        tools,
        signal: abort.signal,
        onDelta: (text) => deps.bus.emitLive(sid, 'assistant.delta', { turnId, text }),
        onThinking: (text) => {
          thinking += text
          deps.bus.emitLive(sid, 'reasoning.delta', { turnId, text })
        },
      })
      usage = addUsage(usage, result.usage)
      turn.usage = usage
      // 指标口径：全部流式调用（含 error/aborted——调用量本身就是要观测的事实）
      deps.metrics?.inc('spark_llm_tokens_total', { direction: 'input' }, result.usage.inputTokens)
      deps.metrics?.inc(
        'spark_llm_tokens_total',
        { direction: 'output' },
        result.usage.outputTokens,
      )

      if (result.stopReason === 'error') {
        await deps.bus.emit(sid, 'error', {
          scope: 'llm',
          message: result.error ?? 'E_LLM_PROVIDER: 未提供错误详情',
        })
        finish = 'error'
        break
      }
      if (result.stopReason === 'aborted') {
        // 已交付前缀定稿为截断的 assistant.message（dsh），空前缀不 emit
        if (result.content.length > 0) {
          await deps.bus.emit(sid, 'assistant.message', {
            turnId,
            content: result.content,
          })
        }
        finish = 'aborted'
        break
      }
      if (thinking.length > 0) {
        await deps.bus.emit(sid, 'reasoning.ended', { turnId, text: thinking })
      }
      await deps.bus.emit(sid, 'assistant.message', {
        turnId,
        content: result.content,
        usage: result.usage,
      })
      // ④ 截断保护（pi failToolCallsFromTruncatedMessage）
      if (result.stopReason === 'length') {
        const truncated = result.content.filter(isToolCall).map(toPending)
        turn.toolCalls = truncated
        for (const call of truncated) {
          await deps.bus.emit(sid, 'tool.started', {
            turnId,
            callId: call.callId,
            name: call.name,
            input: call.input,
          })
          await deps.bus.emit(sid, 'tool.completed', {
            turnId,
            callId: call.callId,
            output: { code: 'E_TRUNCATED' },
            isError: true,
            durationMs: 0,
          })
        }
        if (truncated.length > 0) {
          // E_TRUNCATED toolResult 回喂：下一 step 模型重发完整调用
          await deps.bus.emit(sid, 'assistant.message', {
            turnId,
            content: truncated.map((c) => ({
              type: 'toolResult' as const,
              callId: c.callId,
              output: { code: 'E_TRUNCATED' },
              isError: true,
            })),
          })
        }
        continue // terminate=false：错误结果回喂，不终止
      }
      // ⑤ 工具执行
      const calls = result.content.filter(isToolCall).map(toPending)
      turn.toolCalls = calls
      if (calls.length === 0 && rt.steerQueue.length === 0) {
        finish = 'stop'
        break
      }
      if (turn.step >= deps.maxStepsPerTurn) {
        finish = 'length' // 规格二选一取简单分支（opencode 强制最后一轮模式留 v2）
        break
      }
      const toolResults = await deps.tools.runAll(turn, calls)
      await deps.bus.emit(sid, 'assistant.message', {
        turnId,
        content: toolResults.map((r) => ({
          type: 'toolResult' as const,
          callId: r.callId,
          output: r.output,
          isError: r.isError,
        })),
      })
    }
  } catch (err) {
    finish = 'error'
    await deps.bus.emit(sid, 'error', { scope: 'engine', message: errMessage(err) })
  } finally {
    // 失败闭合：started 已发则必有 completed；endTurn 转移 steer 残留并处理 idle
    if (started) {
      await deps.bus.emit(sid, 'turn.completed', { turnId, finish, usage })
      deps.metrics?.inc('spark_turns_total', { finish })
      // turn 边界 checkpoint（工单 4.6）：completed 已落盘，快照在下一输入前串行执行
      // （晚于 turn.completed、不含自身事件；失败由实现自闭合 emit error{io}）
      if (deps.checkpoint !== undefined) {
        await deps.checkpoint.snapshot(turnId)
      }
    }
    rt.endTurn()
  }
}
