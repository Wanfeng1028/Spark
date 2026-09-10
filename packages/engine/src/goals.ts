/**
 * 持续目标（工单 16.7，消解 V2-35；qwen-code packages/core/src/goals/ 参考设计，
 * 只参考不移植——体量约 20 文件，本实现取其三护栏与 judge 旁路思想）：
 *
 * 循环：turn 正常收尾（finish='stop'）→ 旁路 LLM judge（**不进主上下文**，
 *   即不 emit surface 事件——判据来自会话 JSONL 尾部证据）→ 未满足 → 推合成续跑输入。
 * 三护栏（qwen 同款 + Spark 判定）：
 *   ① 迭代硬上限 MAX_GOAL_ITERATIONS=50——防 judge 永远说不满足的 token 焚烧；
 *   ② 每目标 token 预算（默认 GOAL_BUDGET_TOKENS=200_000，约一次中等会话量级；
 *      judge 用量一并计入）；
 *   ③ judge 超时（JUDGE_TIMEOUT_MS=25s，qwen 同值）/ LLM 错误 / 解析不出判定 →
 *      暂停（fail-closed——不裸转不猜测）；interrupt（finish='aborted'）立即停。
 * surface 纪律：目标内容经合成续跑 user.message 进模型历史（如实标注 [goal] 合成，
 *   不伪造用户意图）；goal.* 四枚事件只是状态日志，不进模型上下文。
 * 红线：续跑 turn 走正常管线——工具照常过审批链，goal 不提供任何旁路。
 * 事件回放：rebuild() 从 durable 事件流重建状态（进程重启 / 会话重载不丢目标）。
 */
import type {
  SessionId,
  SparkEventEnvelope,
  SparkEventMap,
  TurnFinish,
  Usage,
} from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { LlmGateway, ResolvedModel } from './llm-gateway.js'

/** 迭代硬上限（qwen MAX_GOAL_ITERATIONS 同值；迷你 ADR D33 登记） */
export const MAX_GOAL_ITERATIONS = 50
/** 每目标 token 预算缺省（迷你 ADR D33；输入+输出合计口径，judge 用量同计） */
export const GOAL_BUDGET_TOKENS = 200_000
/** judge 判定超时（qwen 同值 25s；超时即暂停保留目标，fail-closed） */
export const JUDGE_TIMEOUT_MS = 25_000

export type GoalStatus = 'active' | 'paused' | 'completed'
type GoalPauseReason = SparkEventMap['goal.paused']['reason']

export interface GoalState {
  goal: string
  iterations: number
  usedTokens: number
  status: GoalStatus
}

/** goal 组事件的信封窄化谓词（信封默认泛型是"全 union"单型，type↔data 不联动——须显式收窄） */
type GoalEventKind = 'goal.set' | 'goal.updated' | 'goal.completed' | 'goal.paused'
function isGoalEvent<K extends GoalEventKind>(
  e: SparkEventEnvelope,
  type: K,
): e is SparkEventEnvelope<K> {
  return e.type === type
}

/** judge 判定输入的证据格式化端口：会话 JSONL 尾部 → 人话证据行（引擎注入，本模块不读盘） */
export type GoalEvidenceReader = () => string

/** 旁路判定提示词（system）：只许二选一，判据 = 证据里的事实（送达不等于状态改变） */
const JUDGE_SYSTEM =
  '你是目标完成判定器。根据给定目标与会话证据判断目标是否已达成。' +
  '判据铁律：证据中必须有事实性记录（如工具结果证明状态改变），声称送达/尝试过不等于完成。' +
  '只回答一行：SATISFIED 或 NOT_SATISFIED（不要输出其他内容）。'

interface GoalRunnerDeps {
  sessionId: SessionId
  bus: EventBus
  gateway: LlmGateway
  /** 会话当前模型（getter 与 RunLoopDeps.model 同口径——换模型下一轮判定生效） */
  model: () => ResolvedModel
  evidence: GoalEvidenceReader
  /** 每目标 token 预算（缺省 GOAL_BUDGET_TOKENS） */
  budgetTokens?: number
  /** judge 判定超时（缺省 JUDGE_TIMEOUT_MS；测试注入小值） */
  judgeTimeoutMs?: number
}

export class GoalRunner {
  private state: GoalState | null = null

  constructor(private readonly deps: GoalRunnerDeps) {}

  /** 从 durable 事件流重建状态（会话装载/重载时调用；幂等——全量重扫） */
  rebuild(events: readonly SparkEventEnvelope[]): void {
    for (const e of events) {
      if (isGoalEvent(e, 'goal.set')) {
        this.state = { goal: e.data.goal, iterations: 0, usedTokens: 0, status: 'active' }
      } else if (isGoalEvent(e, 'goal.updated')) {
        this.state = {
          goal: e.data.goal,
          iterations: e.data.iterations,
          usedTokens: e.data.usedTokens,
          status: e.data.status,
        }
      } else if (isGoalEvent(e, 'goal.completed')) {
        if (this.state !== null) {
          this.state = { ...this.state, status: 'completed', iterations: e.data.iterations, usedTokens: e.data.usedTokens }
        }
      } else if (isGoalEvent(e, 'goal.paused')) {
        if (this.state !== null) {
          this.state = { ...this.state, status: 'paused', iterations: e.data.iterations, usedTokens: e.data.usedTokens }
        }
      }
    }
  }

  /** 当前状态快照（executeCommand 校验用；引擎外部不得改写） */
  get snapshot(): GoalState | null {
    return this.state === null ? null : { ...this.state }
  }

  /** /goal set <条件>：重设即换目标（从零计数）；仅 active 可被替换（已完成/已暂停可重启） */
  async set(goal: string): Promise<void> {
    this.state = { goal, iterations: 0, usedTokens: 0, status: 'active' }
    await this.deps.bus.emit(this.deps.sessionId, 'goal.set', { goal })
  }

  /** /goal clear：active → paused{cleared}（历史可回放，不删目标文本） */
  async clear(): Promise<void> {
    const s = this.requireActive()
    this.state = { ...s, status: 'paused' }
    await this.deps.bus.emit(this.deps.sessionId, 'goal.paused', {
      reason: 'cleared',
      iterations: s.iterations,
      usedTokens: s.usedTokens,
    })
  }

  /** /goal status：emit goal.updated 回显（四端投影 slice.goal 可见；无目标报错 fail-closed） */
  async status(): Promise<void> {
    const s = this.requireGoal()
    await this.deps.bus.emit(this.deps.sessionId, 'goal.updated', {
      goal: s.goal,
      iterations: s.iterations,
      usedTokens: s.usedTokens,
      status: s.status,
    })
  }

  /**
   * run-loop 端口：每个 turn 收尾后调用（含 error/aborted——goal 对失败闭合同样敏感）。
   * 返回合成续跑输入文本（push 到会话主队列开启下一 turn）或 undefined（无事发生）。
   */
  async afterTurn(input: { finish: TurnFinish; usage: Usage }): Promise<string | undefined> {
    const s = this.state
    if (s === null || s.status !== 'active') return undefined

    // interrupt（Esc）：立即停，保留目标（resume 靠 /goal set 重启——v1 不做半途续跑）
    if (input.finish === 'aborted') {
      await this.pause('interrupt', s)
      return undefined
    }
    // turn 错误收尾：不带着坏状态裸续（fail-closed），目标保留可 status 查看
    if (input.finish === 'error') {
      await this.pause('turnError', s)
      return undefined
    }
    if (input.finish !== 'stop') return undefined

    // 护栏①②：上限/预算（本 turn 用量先记账再判）
    const used = s.usedTokens + input.usage.inputTokens + input.usage.outputTokens
    const iterations = s.iterations + 1
    const budget = this.deps.budgetTokens ?? GOAL_BUDGET_TOKENS
    if (iterations >= MAX_GOAL_ITERATIONS) {
      await this.pause('maxIterations', { ...s, iterations, usedTokens: used })
      return undefined
    }
    if (used >= budget) {
      await this.pause('budgetExhausted', { ...s, iterations, usedTokens: used })
      return undefined
    }

    // 旁路 judge：25s 超时，无工具（判据只有证据文本，不让 judge 自行取数）
    const verdict = await this.judge(s.goal)
    const judged: GoalState = { ...s, iterations, usedTokens: used + verdict.judgeTokens }
    if (verdict.kind === 'satisfied') {
      this.state = { ...judged, status: 'completed' }
      await this.deps.bus.emit(this.deps.sessionId, 'goal.completed', {
        iterations: judged.iterations,
        usedTokens: judged.usedTokens,
      })
      return undefined
    }
    if (verdict.kind === 'unavailable') {
      // 超时/LLM 错误/无法解析：暂停保留目标（不裸转）
      await this.pause('judgeTimeout', judged)
      return undefined
    }
    // 未满足：记账 + 进度事件 + 合成续跑输入（如实标注 [goal]，目标即用户先前指令）
    this.state = { ...judged, status: 'active' }
    await this.deps.bus.emit(this.deps.sessionId, 'goal.updated', {
      goal: judged.goal,
      iterations: judged.iterations,
      usedTokens: judged.usedTokens,
      status: 'active',
    })
    return (
      `[goal 合成输入·第 ${judged.iterations} 轮续跑] 目标：${judged.goal}\n` +
      '请继续推进该目标（判定器认为尚未满足）。工具操作照常走审批。'
    )
  }

  /** 旁路判定（不 emit surface——不进模型历史）；返回判定 + judge 自身用量 */
  private async judge(
    goal: string,
  ): Promise<{ kind: 'satisfied' | 'notSatisfied' | 'unavailable'; judgeTokens: number }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.deps.judgeTimeoutMs ?? JUDGE_TIMEOUT_MS)
    try {
      const result = await this.deps.gateway.stream({
        model: this.deps.model(),
        system: JUDGE_SYSTEM,
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: `目标：${goal}\n\n会话证据（JSONL 尾部，新→旧）：\n${this.deps.evidence()}`,
              },
            ],
          },
        ],
        tools: [],
        signal: controller.signal,
        // 旁路判定不流式：回调空实现（deltas 仅进 result.content 汇总）
        onDelta: () => {},
        onThinking: () => {},
      })
      const tokens = result.usage.inputTokens + result.usage.outputTokens
      if (result.stopReason === 'error' || result.stopReason === 'aborted') {
        return { kind: 'unavailable', judgeTokens: tokens }
      }
      const text = result.content
        .filter((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
        .map((c) => c.text)
        .join('')
      // 解析口径：明确 SATISFIED 且非 NOT_ 前缀才算完成——其余一律视为未满足判定失败
      if (/\bSATISFIED\b/.test(text) && !/NOT_SATISFIED/.test(text)) {
        return { kind: 'satisfied', judgeTokens: tokens }
      }
      if (/NOT_SATISFIED/.test(text)) {
        return { kind: 'notSatisfied', judgeTokens: tokens }
      }
      return { kind: 'unavailable', judgeTokens: tokens }
    } catch {
      return { kind: 'unavailable', judgeTokens: 0 }
    } finally {
      clearTimeout(timer)
    }
  }

  /** 暂停并 emit（目标文本不清——回放可读） */
  private async pause(reason: GoalPauseReason, s: GoalState): Promise<void> {
    this.state = { ...s, status: 'paused' }
    await this.deps.bus.emit(this.deps.sessionId, 'goal.paused', {
      reason,
      iterations: s.iterations,
      usedTokens: s.usedTokens,
    })
  }

  private requireActive(): GoalState {
    const s = this.requireGoal()
    if (s.status !== 'active') {
      throw new Error(
        `E_GOAL_NOT_ACTIVE: 当前目标状态为 ${s.status}（续跑循环只认 active；/goal set 重启）`,
      )
    }
    return s
  }

  private requireGoal(): GoalState {
    if (this.state === null) {
      throw new Error('E_NO_GOAL: 本会话没有持续目标（/goal set <条件> 先行）')
    }
    return this.state
  }
}
