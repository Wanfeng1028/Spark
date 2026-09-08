/**
 * 会话链路聚合（工单 13.7 / V2-11 / doc/07 H27）：durable 事件数组 → TraceDto。
 *
 * 纪律：
 * - **不加埋点**：只用已有事件字段——turn.started/completed（时长、finish、usage）、
 *   assistant.message（一步 = 一次模型往返，携带 usage）、tool.started/completed
 *   （durationMs 直取事件，不做时间差推算）、permission.asked / io.warning（按 callId 命中）、
 *   error（无 turnId，按"当时是否有开放回合"位置归属）、compaction.completed /
 *   checkpoint.created / memory.injected（时间线标记）。
 * - **fallback 不进 trace**：模型降级切换只有 pino 日志（`llm.fallback`）没有事件，
 *   要标记就得新增事件 = 加埋点，超出本单口径（doc/08 §13.7 备案）。
 * - **不伪造**：无 usage 的步为 null（不以 0 充数）；未配对到 completed 的工具调用
 *   durationMs 为 null（悬挂如实呈现）；未闭合回合 finish 为 null；归属不了的 error 进
 *   looseErrors 而不是塞给最近回合。
 * - 归属规则（marks）：带 turnId 的挂对应回合；压缩在回合内 → 当前回合，回合间（手动
 *   /compact）→ 最近回合；记忆注入先于 turn.started 落盘（ADR D25）→ 缓冲到它所属的下一回合。
 * - 单遍 O(n)：千事件会话远低于 200ms 断言（server 侧有性能单测）。
 */
import type {
  SessionId,
  SparkEventEnvelope,
  SparkEventType,
  TraceDto,
  TraceErrorDto,
  TraceMarkDto,
  TraceStepDto,
  TraceToolDto,
  TraceTurnDto,
  Usage,
  UsageAmounts,
} from '@spark/protocol'

const ZERO: UsageAmounts = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
}

/** Usage（三分量可选）→ 五分量（缺省分量计 0，与 CostTracker 同口径） */
function amountsOf(u: Usage): UsageAmounts {
  return {
    costUsd: u.costUsd ?? 0,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheRead: u.cacheRead ?? 0,
    cacheWrite: u.cacheWrite ?? 0,
  }
}

function addAmounts(a: UsageAmounts, b: UsageAmounts): UsageAmounts {
  return {
    costUsd: a.costUsd + b.costUsd,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  }
}

/** 聚合中间态（可变累加器——出参前转成 DTO 形状） */
interface TurnAcc extends TraceTurnDto {
  /** 各步的结束时刻（算 durationMs 用；与 steps 同序） */
  stepEnds: number[]
  /** 同名工具是否已出现过 isError（重试启发式的判据） */
  failedNames: Set<string>
}

/** 待归属标记：target undefined = 挂到下一个开始的回合 */
interface PendingMark {
  mark: TraceMarkDto
  target: string | undefined
}

/**
 * `SparkEventEnvelope` 的 data 不随 type 收窄（它是宽松形状：type 与 data 各自联合）。
 * 本联合只是让 switch 各分支拿到自己的 data 形状的**类型视图**：成员均可赋给
 * SparkEventEnvelope，运行时零成本、不改变任何值（同 apply-event 的 ofType 守卫目的一致）。
 */
type Envelope = { [K in SparkEventType]: SparkEventEnvelope<K> }[SparkEventType]

export function buildTrace(
  sessionId: SessionId,
  events: readonly SparkEventEnvelope[],
): TraceDto {
  const turns: TurnAcc[] = []
  const byTurnId = new Map<string, TurnAcc>()
  /** callId 全会话唯一：completed/asked/warning 按此找回 started 建的条目 */
  const byCall = new Map<string, TraceToolDto>()
  const looseErrors: TraceErrorDto[] = []
  const pending: PendingMark[] = []
  let current: TurnAcc | null = null
  let lastTurn: TurnAcc | null = null
  let currentStep: TraceStepDto | null = null

  function placeMark(mark: TraceMarkDto, target: string | undefined): void {
    if (target !== undefined) {
      const hit = byTurnId.get(target)
      if (hit !== undefined) {
        hit.marks.push(mark)
        return
      }
      pending.push({ mark, target })
      return
    }
    if (current !== null) {
      current.marks.push(mark)
      return
    }
    // 手动 /compact 发生在回合之间：挂最近回合（它压缩的就是那批内容）
    if (mark.kind === 'compaction' && lastTurn !== null) {
      lastTurn.marks.push(mark)
      return
    }
    pending.push({ mark, target: undefined })
  }

  for (const raw of events) {
    const e = raw as Envelope
    switch (e.type) {
      case 'turn.started': {
        const acc: TurnAcc = {
          turnId: e.data.turnId,
          delivery: e.data.delivery,
          startedAt: e.time,
          durationMs: 0,
          finish: null,
          steps: [],
          stepEnds: [],
          tools: [],
          marks: [],
          errors: [],
          usage: null,
          failedNames: new Set(),
        }
        turns.push(acc)
        byTurnId.set(acc.turnId, acc)
        current = acc
        lastTurn = acc
        currentStep = null
        // 先于本回合落盘的标记（如 memory.injected，ADR D25）在此归属
        for (let i = pending.length - 1; i >= 0; i -= 1) {
          const item = pending[i]
          if (item === undefined) continue
          if (item.target === acc.turnId || item.target === undefined) {
            acc.marks.push(item.mark)
            pending.splice(i, 1)
          }
        }
        acc.marks.sort((a, b) => a.at - b.at)
        break
      }
      case 'turn.completed': {
        const acc = byTurnId.get(e.data.turnId)
        if (acc !== undefined) {
          acc.finish = e.data.finish
          acc.durationMs = Math.max(0, e.time - acc.startedAt)
          acc.usage = e.data.usage !== undefined ? amountsOf(e.data.usage) : sumSteps(acc.steps)
        }
        current = null
        currentStep = null
        break
      }
      case 'assistant.message': {
        const acc = byTurnId.get(e.data.turnId)
        if (acc === undefined) break
        // 上一步的间隔到此为止（事件只在模型往返完成时落盘，故含该步触发的工具执行时长）
        if (currentStep !== null) {
          acc.stepEnds.push(e.time)
        }
        const step: TraceStepDto = {
          index: acc.steps.length,
          at: e.time,
          durationMs: 0,
          toolCalls: 0,
          usage: e.data.usage !== undefined ? amountsOf(e.data.usage) : null,
        }
        acc.steps.push(step)
        currentStep = step
        break
      }
      case 'tool.started': {
        const acc = byTurnId.get(e.data.turnId)
        if (acc === undefined) break
        const tool: TraceToolDto = {
          callId: e.data.callId,
          name: e.data.name,
          startedAt: e.time,
          durationMs: null,
          isError: false,
          // 重试启发式：同回合内同名工具此前失败过（非引擎埋点，DTO 注释已如实标注）
          retry: acc.failedNames.has(e.data.name),
          approvalAsked: false,
          warnings: [],
        }
        acc.tools.push(tool)
        byCall.set(tool.callId, tool)
        if (currentStep !== null) currentStep.toolCalls += 1
        break
      }
      case 'tool.completed': {
        const tool = byCall.get(e.data.callId)
        // 引擎状态机保证 started 必先于 completed；此分支只为类型收窄，不是业务路径
        if (tool === undefined) break
        tool.durationMs = e.data.durationMs
        tool.isError = e.data.isError
        if (e.data.isError) {
          const acc = byTurnId.get(e.data.turnId)
          if (acc !== undefined) acc.failedNames.add(tool.name)
        }
        break
      }
      case 'permission.asked': {
        const tool = byCall.get(e.data.callId)
        if (tool !== undefined) tool.approvalAsked = true
        break
      }
      case 'io.warning': {
        const tool = byCall.get(e.data.callId)
        if (tool !== undefined && !tool.warnings.includes(e.data.kind)) {
          tool.warnings.push(e.data.kind)
        }
        break
      }
      case 'error': {
        const err: TraceErrorDto = {
          at: e.time,
          scope: e.data.scope,
          message: e.data.message,
          fatal: e.data.fatal ?? false,
        }
        // error 事件无 turnId：只归属"当时开放的回合"，否则如实进 looseErrors
        if (current !== null) current.errors.push(err)
        else looseErrors.push(err)
        break
      }
      case 'compaction.completed': {
        placeMark(
          {
            at: e.time,
            kind: 'compaction',
            label: `压缩：${e.data.tokensBefore} tokens 前文 → 摘要`,
          },
          undefined,
        )
        break
      }
      case 'checkpoint.created': {
        placeMark(
          { at: e.time, kind: 'checkpoint', label: `快照 ${e.data.files.length} 个文件` },
          e.data.turnId,
        )
        break
      }
      case 'memory.injected': {
        placeMark(
          { at: e.time, kind: 'memory', label: `注入 ${e.data.memories.length} 条记忆` },
          e.data.turnId,
        )
        break
      }
      default:
        break
    }
  }

  // 步时长收尾：末步以回合结束时刻为界。**未闭合回合**（悬挂或截断文件）：
  // 时长到本回合最后一条内容为止——不推算也不填 0 假值（DTO 以 finish=null 如实标注）
  const dtoTurns: TraceTurnDto[] = turns.map((acc) => {
    const lastStep = acc.steps.reduce((m, s) => Math.max(m, s.at), acc.startedAt)
    const lastMark = acc.marks.reduce((m, k) => Math.max(m, k.at), lastStep)
    const lastError = acc.errors.reduce((m, e) => Math.max(m, e.at), lastMark)
    const end =
      acc.finish !== null
        ? acc.startedAt + acc.durationMs
        : acc.tools.reduce((m, t) => Math.max(m, t.startedAt), lastError)
    const durationMs = Math.max(0, end - acc.startedAt)
    const steps = acc.steps.map((s, i) => {
      const next = acc.stepEnds[i] ?? end
      return { ...s, durationMs: Math.max(0, next - s.at) }
    })
    const { stepEnds: _stepEnds, failedNames: _failedNames, ...turn } = acc
    return { ...turn, steps, tools: [...acc.tools], durationMs }
  })

  const totals = dtoTurns.reduce(
    (acc, t) => ({
      turns: acc.turns + 1,
      steps: acc.steps + t.steps.length,
      toolCalls: acc.toolCalls + t.tools.length,
      toolErrors: acc.toolErrors + t.tools.filter((x) => x.isError).length,
      errors: acc.errors + t.errors.length,
      durationMs: acc.durationMs + t.durationMs,
      usage: t.usage !== null ? addAmounts(acc.usage, t.usage) : acc.usage,
    }),
    {
      turns: 0,
      steps: 0,
      toolCalls: 0,
      toolErrors: 0,
      errors: looseErrors.length,
      durationMs: 0,
      usage: { ...ZERO },
    },
  )

  return { sessionId, totals, turns: dtoTurns, looseErrors }
}

/** turn.completed 未带 usage 时以各步累加（全为 null → null，不伪造 0） */
function sumSteps(steps: readonly TraceStepDto[]): UsageAmounts | null {
  let acc: UsageAmounts | null = null
  for (const s of steps) {
    if (s.usage !== null) acc = acc === null ? { ...s.usage } : addAmounts(acc, s.usage)
  }
  return acc
}
