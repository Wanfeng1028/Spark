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
  ReasoningEffort,
  SessionId,
  TurnFinish,
  TurnId,
  Usage,
} from '@spark/protocol'
import type { EventBus } from './bus.js'
import { errText } from './errs.js'
import type { UserHookRunner } from './hooks/runner.js'
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

/**
 * 成本熔断端口（工单 7.7 / H07）：usage 聚合阈值中断。
 * - turn 开始前 exceeded → 新 turn 拒绝（error 人话 + turn.completed{error}）；
 * - 每步 usage 累加后检查 → 超限即中断本 turn（assistant.message 已 emit 后断——
 *   产出保留，失败闭合走 finish='error'）。
 */
export interface Budget {
  /** 当前成本上限美元值（undefined = 未配置，永不熔断） */
  limitUsd(): number | undefined
  /** 累加一步用量 */
  add(usage: Usage): void
  /** 熔断判定 */
  exceeded(): boolean
  /** 当前累计成本（人话错误文案用） */
  spendUsd(): number
}

/** 熔断人话文案（工单 7.7 验收：触发后提示须可操作） */
function budgetMessage(limitUsd: number, spendUsd: number): string {
  return (
    `E_BUDGET_EXCEEDED: 已达成本上限 $${limitUsd}（累计 $${spendUsd.toFixed(4)}）——` +
    '本 turn 已熔断。可上调 models.json 的 costLimitUsd，或调用 DELETE /api/routing/usage 重置累计'
  )
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
  /** 推理档位现读端口（工单 10.6）：会话级内存态 ?? 配置缺省；返回 undefined = 不设置 */
  effort?: () => ReasoningEffort | undefined
  maxStepsPerTurn: number
  /** 压缩阈值比例（config.engine.compactionThreshold，乘 contextWindow） */
  compactionThreshold: number
  /** 进程内指标（§5.10 清单；缺省不计数——测试 stub 可省，工单 4.8） */
  metrics?: Metrics
  /** 成本熔断（工单 7.7 / H07；缺省不限——测试 stub 可省） */
  budget?: Budget
  /** turn 边界 checkpoint（工单 4.6；config.engine.checkpoints=false 时缺省） */
  checkpoint?: Checkpointer
  /** 会话工作目录（工单 7.3：turn.before/turn.after 用户 hook 的命令 cwd） */
  cwd?: string
  /** 用户侧 hooks（工单 7.3 / H03；缺省不触发——测试 stub 可省） */
  hooks?: UserHookRunner
  /**
   * 长期记忆注入端口（工单 7.5 / H05 / ADR D25）：会话首条 user.message 落盘后
   * 调用（端口内部自判注入条件——已注入过/非首条即 no-op；命中空集不 emit）。
   * 缺省不注入——测试 stub 与记忆未启用时可省。
   */
  memory?: {
    maybeInject: (turnId: TurnId, query: string) => Promise<void>
  }
}

function isToolCall(c: ContentItem): c is Extract<ContentItem, { type: 'toolCall' }> {
  return c.type === 'toolCall'
}

function toPending(c: Extract<ContentItem, { type: 'toolCall' }>): ToolCallPending {
  return { callId: c.callId, name: c.name, input: c.input }
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
        message: errText(err),
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
    // 用户侧 hooks（工单 7.3）：turn.before——输入受理后、事件流开路前触发
    // （先于 user.message/turn.started；fire-and-forget 不阻断）
    deps.hooks?.fire('turn.before', {
      sessionId: sid,
      cwd: deps.cwd ?? '',
      sourceEventId: null,
      data: { turnId },
    })
    // 长期记忆注入（工单 7.5 / ADR D25）：先于 user.message 落盘（投影才是模型
    // 上下文的首条前缀消息）；命中即 emit memory.injected（durable 落盘 = surface
    // 纪律）；端口内部自判注入条件（非首条/已注入/命中空集 no-op）
    await deps.memory?.maybeInject(turnId, input.text)
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

    // 成本熔断（工单 7.7）：新 turn 拒绝——不调用 LLM，事件流人话闭合
    // （finally 补 turn.completed{error}，失败闭合形态完整）
    if (deps.budget !== undefined && deps.budget.exceeded()) {
      await deps.bus.emit(sid, 'error', {
        scope: 'engine',
        message: budgetMessage(deps.budget.limitUsd() ?? 0, deps.budget.spendUsd()),
      })
      finish = 'error'
      return
    }

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
      const effort = deps.effort?.()
      const result = await deps.gateway.stream({
        model: deps.model,
        system: deps.system,
        messages: ctx.messages,
        tools,
        signal: abort.signal,
        ...(effort !== undefined ? { effort } : {}),
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
      // 成本熔断（工单 7.7）：记账口径同指标——全部流式调用都计入
      deps.budget?.add(result.usage)

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
      // 成本熔断（工单 7.7）：本步产出已定稿落盘，超限即中断（不再执行工具/续步）
      if (deps.budget !== undefined && deps.budget.exceeded()) {
        await deps.bus.emit(sid, 'error', {
          scope: 'engine',
          message: budgetMessage(deps.budget.limitUsd() ?? 0, deps.budget.spendUsd()),
        })
        finish = 'error'
        break
      }
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
    await deps.bus.emit(sid, 'error', { scope: 'engine', message: errText(err) })
  } finally {
    // 失败闭合：started 已发则必有 completed；endTurn 转移 steer 残留并处理 idle
    if (started) {
      const completed = await deps.bus.emit(sid, 'turn.completed', { turnId, finish, usage })
      deps.metrics?.inc('spark_turns_total', { finish })
      // 用户侧 hooks（工单 7.3）：turn.after——completed 已落盘后触发
      deps.hooks?.fire('turn.after', {
        sessionId: sid,
        cwd: deps.cwd ?? '',
        sourceEventId: completed.id,
        data: { turnId, finish, usage },
      })
      // turn 边界 checkpoint（工单 4.6）：completed 已落盘，快照在下一输入前串行执行
      // （晚于 turn.completed、不含自身事件；失败由实现自闭合 emit error{io}）
      if (deps.checkpoint !== undefined) {
        await deps.checkpoint.snapshot(turnId)
      }
    }
    rt.endTurn()
  }
}
