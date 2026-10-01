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
import { classifyLlmError } from './pi-gateway.js'
import type { RunawayGuard } from './runaway-guard.js'
import { ZERO_USAGE, addUsage } from './llm-gateway.js'
import type { Metrics } from './observability/metrics.js'
import { MICROCOMPACT_TRIGGER_RATIO } from './microcompact.js'
import type { SessionRuntime } from './session/runtime.js'
import type { InputItem } from './session/input-queue.js'

// ---- 端口（后续工单实现）----

/** §5.8.3 投影：surface 事件 → 模型上下文（含字符近似 token 估算） */
export interface Projector {
  modelContext(): { messages: LlmMessage[]; tokens: number }
}

/** §5.8.5 压缩：emit compaction.* 并重投影（阈值判断在 run-loop）。
 * LA-39：返回 true = 本轮产生 compaction.completed（压缩成功）；false = 失败或被跳过
 *（run-loop 据此做本 turn 冷却，不逐步重试 hammer 摘要通道）。 */
export interface Compactor {
  compact(): Promise<boolean>
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
/** 成本熔断端口（工单 7.7）。**必须 export**：出现在同文件已导出的 RunLoopDeps.budget 字段类型位置，
 * 私有会让声明发射（tsconfig.build.json 的 declaration）报 TS4033——而 typecheck 是 --noEmit 查不出来 */
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

/** ZC-3：纯文本截断的自动续写上限（耗尽后如实 finish=length，不无限烧预算） */
const ZC3_MAX_CONTINUATIONS = 3

export interface TurnCtx {
  turnId: TurnId
  delivery: Delivery
  /** interrupt 入口；级联到 LLM 流与工具 signal（§5.6 管线接线） */
  abort: AbortController
  /** ZC-3：纯文本截断已自动续写的次数（≤ZC3_MAX_CONTINUATIONS） */
  continuations?: number
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
  /** ZC-1：微压缩端口（可省——测试 stub 与 cli 纯 REST 形态不启用） */
  microcompact?: { run(): Promise<boolean> }
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
  /**
   * 持续目标循环（工单 16.7）：每个 turn 收尾后调用（含 error/aborted——goal 对
   * 失败闭合同样敏感：interrupt/turnError 即暂停）。返回合成续跑文本即推主队列
   * 开启下一 turn；目标循环内的护栏（迭代上限/预算/judge 超时）在实现内部闭环。
   * 缺省无目标循环——测试 stub 与未设目标时可省。
   */
  goal?: {
    afterTurn(input: { finish: TurnFinish; usage: Usage }): Promise<string | undefined>
  }
  /**
   * 循环护栏（CK-3）：step 边界观察 + steer 纠偏 + 连环升级判定。引擎内存态、
   * 不出协议事件（纠偏提醒经既有 user.message steer 注入）。缺省不接线——
   * 测试 stub 与未装配场景行为完全不变。
   */
  runaway?: RunawayGuard
  /**
   * @-mention 展开端口（CK-15）：user.message 落盘前把 `@path` 记号展开为文件/目录
   * 内容注入（实现见 mention.ts；路径硬边界与限额在其内闭环）。缺省不接线 =
   * 不展开（原样透传）。
   */
  mentionExpand?: (text: string) => Promise<string>
}

function isToolCall(c: ContentItem): c is Extract<ContentItem, { type: 'toolCall' }> {
  return c.type === 'toolCall'
}

function toPending(c: Extract<ContentItem, { type: 'toolCall' }>): ToolCallPending {
  return { callId: c.callId, name: c.name, input: c.input }
}

/**
 * LA-30：悬空 toolCall 闭合——turn 非正常收尾（aborted / 步数上限）时模型已发出的
 * toolCall 永不执行，不补对则 UI 永远转圈，且下轮 API 请求带无 tool_result 的
 * tool_use（Anthropic 侧直接拒收）。与 pipeline.emitAbortedPair 同用 E_ABORTED；
 * 截断保护（stopReason length 的半截调用）仍走原 E_TRUNCATED 分支不动。
 */
async function closeDanglingCalls(
  bus: EventBus,
  sid: SessionId,
  turnId: TurnId,
  calls: ToolCallPending[],
): Promise<void> {
  for (const call of calls) {
    await bus.emit(sid, 'tool.started', {
      turnId,
      callId: call.callId,
      name: call.name,
      input: call.input,
    })
    await bus.emit(sid, 'tool.completed', {
      turnId,
      callId: call.callId,
      output: { code: 'E_ABORTED' },
      isError: true,
      durationMs: 0,
    })
  }
  if (calls.length > 0) {
    await bus.emit(sid, 'assistant.message', {
      turnId,
      content: calls.map((c) => ({
        type: 'toolResult' as const,
        callId: c.callId,
        output: { code: 'E_ABORTED' },
        isError: true,
      })),
    })
  }
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
    } catch (err) {
      // AUD-07③：仅 E_QUEUE_CLOSED（引擎 shutdown）是正常退出；其余错误如实上抛
      // （不吞——原裸 catch 会把任何 reject 都当关闭信号静默 break）
      if (!(err instanceof Error) || !err.message.startsWith('E_QUEUE_CLOSED')) throw err
      break
    }
    let outcome: { finish: TurnFinish; usage: Usage } | undefined
    try {
      outcome = await runTurn(rt, deps, input)
    } catch (err) {
      // 兜底的兜底：runTurn 只在 turn.started 之前抛（其后内部已闭合）
      await deps.bus.emit(deps.sessionId, 'error', {
        scope: 'engine',
        message: errText(err),
      })
    }
    if (deps.goal !== undefined) {
      try {
        const text = await deps.goal.afterTurn(
          outcome ?? { finish: 'error' as const, usage: ZERO_USAGE },
        )
        if (text !== undefined) {
          // 合成续跑走主队列（用户真实输入天然排前——FIFO；护栏在 GoalRunner 内闭环）
          rt.submit(text, 'queue')
        }
      } catch (err) {
        // goal 循环自身的失败闭合：emit error，不杀会话常驻循环
        await deps.bus.emit(deps.sessionId, 'error', {
          scope: 'engine',
          message: errText(err),
        })
      }
    }
  }
}

/** 单个 turn：开启（user.message + turn.started）→ step 循环 → 收尾（turn.completed） */
/** 返回收尾结果供 goal 循环（工单 16.7）判定续跑；started 前失败返回 undefined（不造状态） */
export async function runTurn(
  rt: SessionRuntime,
  deps: RunLoopDeps,
  input: InputItem,
): Promise<{ finish: TurnFinish; usage: Usage } | undefined> {
  const sid = deps.sessionId
  const turnId = input.turnId
  let finish: TurnFinish = 'stop'
  let usage = ZERO_USAGE
  let started = false
  let result: { finish: TurnFinish; usage: Usage } | undefined
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
    // LA-39：压缩失败的本 turn 冷却——compact() 返回 false（未产生 compaction.completed）
    // 时本 turn 内不再重试（限流注入下摘要调用次数有上界，不逐步 hammer 辅助通道）
    let compactionCooled = false
    // ZC-1：微压缩不值得的本 turn 冷却（同上——不逐步重试）
    let microcompactCooled = false
    // CK-7：溢出重试的本 turn 冷却——同 turn 至多一次反应式压缩重试
    let overflowCooled = false
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
    // CK-15：@-mention 展开——先于 user.message 落盘；展开文本随 user.message 进
    // durable 流（surface 纪律成立：模型可见的注入就在 surface 消息里）。记忆查询
    // 仍用原始输入（文件正文不是好的检索词）。
    const userText =
      deps.mentionExpand !== undefined ? await deps.mentionExpand(input.text) : input.text
    // CK-2 批 1：user_prompt_submit——先于 user.message 落盘（与 turn.before 的差别：
    // 本点携带最终输入文本且已在记忆注入之后）
    deps.hooks?.fire('user_prompt_submit', {
      sessionId: sid,
      cwd: deps.cwd ?? '',
      sourceEventId: null,
      data: { turnId, text: userText },
    })
    const userEvent = await deps.bus.emit(sid, 'user.message', {
      text: userText,
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
      // ZC-1：微压缩前置——水位到 0.9×压缩阈值即清旧 toolResult（投影层），
      // 把全量压缩的触发点往后推；不值得（<256 token）则本 turn 冷却
      if (
        !microcompactCooled &&
        ctx.tokens > deps.compactionThreshold * deps.model.contextWindow * MICROCOMPACT_TRIGGER_RATIO
      ) {
        const mcOk = (await deps.microcompact?.run()) ?? false
        if (!mcOk) microcompactCooled = true
        ctx = deps.projector.modelContext()
      }
      if (
        !compactionCooled &&
        ctx.tokens > deps.compactionThreshold * deps.model.contextWindow
      ) {
        // CK-2 批 1：pre_compact——压缩调用前（载荷带当时水位）
        deps.hooks?.fire('pre_compact', {
          sessionId: sid,
          cwd: deps.cwd ?? '',
          sourceEventId: null,
          data: { turnId, tokens: ctx.tokens, contextWindow: deps.model.contextWindow },
        })
        const ok = await deps.compactor.compact()
        if (ok) {
          // CK-2 批 1：post_compact——compaction.completed 已落盘后（compactor 内部
          // 发事件，本点只报"压缩完成"事实；失败（ok=false）只走既有 error 上报不 fire）
          deps.hooks?.fire('post_compact', {
            sessionId: sid,
            cwd: deps.cwd ?? '',
            sourceEventId: null,
            data: { turnId, tokensBefore: ctx.tokens },
          })
        }
        if (!ok) compactionCooled = true // LA-39：本 turn 冷却（失败不再重试）
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
        // CK-7：溢出即压缩——上下文超窗是确定性错误，不该让整 turn 失败闭合。
        // 同 turn 反应式压缩后重采样**一次**（overflowCooled 限一次；压缩失败或
        // 二次溢出仍走 fatal——失败闭合不变，与水位前瞻压缩/微压缩正交：错误驱动
        // vs 阈值驱动 vs 投影层粒度）。error 分支先于 assistant.message emit，
        // continue 重采样无悬空副作用；usage 已计入（调用量本身是事实）。
        const overflow = result.error !== undefined && classifyLlmError(result.error).kind === 'E_LLM_OVERFLOW'
        if (overflow && !overflowCooled) {
          overflowCooled = true
          const ok = await deps.compactor.compact()
          if (ok) {
            continue
          }
        }
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
        // LA-30：半截 content 若含 toolCall，闭合为 E_ABORTED 对 + toolResult 回喂
        await closeDanglingCalls(
          deps.bus,
          sid,
          turnId,
          result.content.filter(isToolCall).map(toPending),
        )
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
        // LA-30：本步 assistant.message 若含 toolCall，闭合防悬空（同 aborted 口径）
        await closeDanglingCalls(
          deps.bus,
          sid,
          turnId,
          result.content.filter(isToolCall).map(toPending),
        )
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
        // AUD-07①：截断续步同样受步数预算约束——此前无条件 continue，纯文本/空
        // content 的 length 可无限续采样绕过 maxStepsPerTurn（步数上限检查对本路径不可达）
        if (turn.step >= deps.maxStepsPerTurn) {
          finish = 'length'
          break
        }
        // ZC-3：纯文本（无 toolCall）截断 → 追加续写指令再跑一轮，最多 ZC3_MAX_CONTINUATIONS
        // 次（耗尽如实 finish=length 报错——不无限烧预算）；带 toolCall 的截断仍走
        // E_TRUNCATED 回喂重发（上方路径）。指令作为 user.message 进投影，模型从截断处继续。
        if (truncated.length === 0) {
          turn.continuations = (turn.continuations ?? 0) + 1
          if (turn.continuations > ZC3_MAX_CONTINUATIONS) {
            finish = 'length'
            break
          }
          await deps.bus.emit(sid, 'user.message', {
            text: '[系统] 输出因长度上限被截断——请从中断处继续，不要重复已输出内容。',
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
        // LA-30：步数耗尽，本步 calls 不再执行——闭合防悬空（E_ABORTED 口径）
        await closeDanglingCalls(deps.bus, sid, turnId, calls)
        finish = 'length' // 规格二选一取简单分支（opencode 强制最后一轮模式留 v2）
        break
      }
      const toolResults = await deps.tools.runAll(turn, calls)
      // CK-3：循环护栏观察点——本 step 的 action/result 对进窗口并跑六信号。
      // 命中（且本 turn 该信号未提醒过）→ steer 注入纠偏提醒（下一步 ① 处生效）；
      // 连续多轮命中升级 → error 终止本轮（fail-closed，不静默放行）。
      if (deps.runaway !== undefined) {
        const hit = deps.runaway.observeAndDetect(
          calls.map((c) => ({ name: c.name, input: c.input })),
          toolResults.map((r) => ({ output: r.output, isError: r.isError })),
        )
        if (hit !== null) {
          if (hit.escalateEligible && deps.runaway.shouldEscalate()) {
            await deps.bus.emit(sid, 'error', {
              scope: 'engine',
              message: `E_RUNAWAY_LOOP: 疑似失控循环已连续多轮命中（最近信号 ${hit.signal}：${hit.detail}）——本轮已被循环护栏终止；请检查任务设定、换方法后重试`,
            })
            finish = 'error'
            break
          }
          rt.submit(
            `[系统提醒，仅本轮生效——请勿把本提醒写入记忆、文件或长期上下文] ` +
              `检测到疑似循环行为（${hit.signal}）：${hit.detail}。` +
              `请停止重复同一操作，改变策略（换方法 / 换参数 / 向用户说明障碍后等待指示）。`,
            'steer',
          )
        }
      }
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
    // CK-3：循环护栏 turn 收尾——结转连续命中计数并重置 turn-local 影子状态
    //（放在最外层 finally：error/aborted 收尾路径同样结转，连续性判定不失真）
    deps.runaway?.endTurn()
    // CK-2 批 1：stop 挂点——自然收尾（finish='stop'）专用（error/aborted/length
    // 走既有 error 事件与 turn.completed{finish} 表达，不复读机）
    if (started && finish === 'stop') {
      deps.hooks?.fire('stop', {
        sessionId: sid,
        cwd: deps.cwd ?? '',
        sourceEventId: null,
        data: { turnId },
      })
    }
    // 失败闭合：started 已发则必有 completed；endTurn 转移 steer 残留并处理 idle。
    // AUD-07②：运行态释放（endTurn）放在收尾链外层的无条件 finally——completed
    // 落盘 / hooks / checkpoint / flush 任一抛错时也必须清理 turnAbort 与活动
    // turn，否则会话永久卡 running（后续输入全被判 steer 滞留或 E_RUNTIME_TURN_ACTIVE）；
    // 收尾链异常沿原路径上抛（runSessionLoop 兜底 emit error，不吞）
    try {
      if (started) {
        // 收尾结果供 goal 循环判定（16.7）；turn.completed 为投影已发同值
        result = { finish, usage }
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
    } finally {
      rt.endTurn()
    }
  }
  // 不在 finally 里 return（会吞掉收尾段异常——§2.11 吞异常黑名单）；正常路径带结果返回
  return result
}
