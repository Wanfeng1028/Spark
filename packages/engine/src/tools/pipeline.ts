/**
 * 执行管线（doc/02 §5.6.2）：runAll 分组调度 + runOne 事件纪律。
 *
 * 分组：连续 parallelizable 段归一组（Promise.all，并发上限 maxToolParallel 分批），
 * 遇 serial 工具（bash/edit/write）单独成 barrier（dsh exclusive 语义）。
 * abort 双检点（pi prepareToolCall）：工具启动前查 signal（未启动 → 补
 * started+completed{E_ABORTED} 事件对，dsh 重放合法原则）；串行链项间 break；
 * 并行组等待已启动者自然结束（跑到静默）。
 * 进度门控（pi tool_execution_update 模式）：onProgress 先进缓冲、acceptingUpdates
 * 门控 + 200ms 节流合并；工具结束关门排水后才 emit tool.completed——progress
 * 永不晚于 completed 乱序到达。
 */
import type { CallId, SessionId } from '@spark/protocol'
import type { EventBus } from '../bus.js'
import type { UserHookRunner } from '../hooks/runner.js'
import type { ToolSpec } from '../llm-gateway.js'
import type { Metrics } from '../observability/metrics.js'
import type { ToolPipeline, ToolPipelineResult, TurnCtx } from '../run-loop.js'
import type { ToolCallPending } from '../run-loop.js'
import type { PermissionService } from './permission-port.js'
import type { ToolOutputStore } from './output-store.js'
import type { ToolRegistry } from './registry.js'
import type { IoGuard } from './guard.js'

export interface PipelineDeps {
  sessionId: SessionId
  bus: EventBus
  registry: ToolRegistry
  permission: PermissionService
  outputs: ToolOutputStore
  cwd: string
  maxToolParallel: number
  progressThrottleMs: number
  /** 进程内指标（§5.10；缺省不计数——测试 stub 可省，工单 4.8） */
  metrics?: Metrics
  /** I/O 护栏（工单 7.2；缺省不启用——测试 stub 可省） */
  guard?: IoGuard
  /** 用户侧 hooks（工单 7.3；缺省不触发——测试 stub 可省） */
  hooks?: UserHookRunner
}

/** 错误 → {code, message}：提取 E_* 前缀码，未分类 → E_INTERNAL（§5.10） */
function mapError(err: unknown): { code: string; message: string } {
  const message = err instanceof Error ? err.message : String(err)
  const code = /^E_[A-Z_]+/.exec(message)?.[0] ?? 'E_INTERNAL'
  return { code, message }
}

interface CallGroup {
  parallel: boolean
  calls: ToolCallPending[]
}

/** 进度门控队列（§5.6.3 pi 模式）：节流合并 + 关门排水保序 */
class ProgressGate {
  private pending: string[] = []
  private lastFlush = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private accepting = true
  private drain: Promise<void> = Promise.resolve()

  constructor(
    private readonly emit: (chunk: string) => void,
    private readonly throttleMs: number,
  ) {}

  push(chunk: string): void {
    if (!this.accepting) return
    this.pending.push(chunk)
    const now = Date.now()
    if (now - this.lastFlush >= this.throttleMs) {
      this.flush()
    } else if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.throttleMs - (now - this.lastFlush))
    }
  }

  private flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.length === 0) return
    const chunk = this.pending.join('')
    this.pending = []
    this.lastFlush = Date.now()
    this.drain = this.drain.then(() => this.emit(chunk))
  }

  /** 工具结束：关门并排水（progress 先于 tool.completed 的顺序保证） */
  async close(): Promise<void> {
    this.accepting = false
    this.flush()
    await this.drain
  }
}

export class ToolPipelineImpl implements ToolPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  /** 广告清单：全域 deny 的工具不进模型可见面（§5.7 补强 5） */
  materialize(): ToolSpec[] {
    return this.deps.registry.materialize().filter((spec) => {
      const def = this.deps.registry.resolve(spec.name)
      return def === undefined || !this.deps.permission.isDenied(def.permission.action)
    })
  }

  async runAll(
    turn: TurnCtx,
    calls: readonly ToolCallPending[],
  ): Promise<ToolPipelineResult[]> {
    const groups = this.group(calls)
    const results: ToolPipelineResult[] = []
    for (const group of groups) {
      if (turn.abort.signal.aborted) {
        // 组未启动：整组补 E_ABORTED 事件对（每个 started 必有 completed）
        for (const call of group.calls) {
          await this.emitAbortedPair(turn, call)
          results.push({ callId: call.callId, output: { code: 'E_ABORTED' }, isError: true })
        }
        continue
      }
      if (group.parallel) {
        const batches = this.chunk(group.calls, this.deps.maxToolParallel)
        for (const batch of batches) {
          if (turn.abort.signal.aborted) {
            for (const call of batch) {
              await this.emitAbortedPair(turn, call)
              results.push({ callId: call.callId, output: { code: 'E_ABORTED' }, isError: true })
            }
            continue
          }
          const batchResults = await Promise.all(batch.map((c) => this.runOne(turn, c)))
          results.push(...batchResults)
        }
      } else {
        for (const call of group.calls) {
          if (turn.abort.signal.aborted) {
            await this.emitAbortedPair(turn, call)
            results.push({ callId: call.callId, output: { code: 'E_ABORTED' }, isError: true })
            continue
          }
          results.push(await this.runOne(turn, call))
        }
      }
    }
    return results
  }

  /** §5.6.2 runOne：started →（权限门）→ execute → bound → completed */
  private async runOne(turn: TurnCtx, call: ToolCallPending): Promise<ToolPipelineResult> {
    const { bus, sessionId: sid } = this.deps
    const def = this.deps.registry.resolve(call.name)
    const t0 = Date.now()
    const startedAt = (): number => Date.now() - t0

    if (def === undefined) {
      await bus.emit(sid, 'tool.started', {
        turnId: turn.turnId,
        callId: call.callId,
        name: call.name,
        input: call.input,
      })
      await this.emitCompleted(
        turn,
        call.callId,
        call.name,
        { code: 'E_NOT_FOUND', message: `未知工具 ${call.name}` },
        true,
        startedAt(),
      )
      this.deps.metrics?.inc('spark_tool_calls_total', { name: call.name, is_error: 'true' })
      return { callId: call.callId, output: { code: 'E_NOT_FOUND' }, isError: true }
    }

    await bus.emit(sid, 'tool.started', {
      turnId: turn.turnId,
      callId: call.callId,
      name: call.name,
      input: call.input,
    })

    const gate = new ProgressGate((chunk) => {
      bus.emitLive(sid, 'tool.progress', { turnId: turn.turnId, callId: call.callId, chunk })
    }, this.deps.progressThrottleMs)

    try {
      // ② 权限门（ask → 挂起等待；超时/中断一律 deny——fail-closed 在 service 内）。
      // 复合操作的多 pattern 清单由工具声明（§5.7 补强 1；单段命令 patternsOf 返回 undefined）
      const patterns = def.permission.patternsOf?.(call.input, { cwd: this.deps.cwd })
      const alwaysPatterns = def.permission.alwaysPatternsOf?.(call.input, { cwd: this.deps.cwd })
      const allowed = await this.deps.permission.assert({
        sessionId: sid,
        callId: call.callId,
        turnId: turn.turnId,
        name: call.name,
        action: def.permission.action,
        resource: def.permission.resourceOf(call.input, { cwd: this.deps.cwd }),
        ...(patterns !== undefined ? { patterns } : {}),
        ...(alwaysPatterns !== undefined ? { alwaysPatterns } : {}),
        input: call.input,
        signal: turn.abort.signal,
      })
      if (!allowed) {
        await gate.close()
        await this.emitCompleted(
          turn,
          call.callId,
          call.name,
          { code: 'E_PERMISSION' },
          true,
          startedAt(),
        )
        this.deps.metrics?.inc('spark_tool_calls_total', { name: call.name, is_error: 'true' })
        return { callId: call.callId, output: { code: 'E_PERMISSION' }, isError: true }
      }

      // ③ execute（inputSchema 先校验；ctx.signal 级联 turn.abort）
      const input = def.inputSchema.parse(call.input)
      const result = await def.execute(
        {
          sessionId: sid,
          turnId: turn.turnId,
          callId: call.callId,
          signal: turn.abort.signal,
          onProgress: (chunk) => gate.push(chunk),
          cwd: this.deps.cwd,
        },
        input,
      )
      // ⑤ 输出限界（>32KB 截断 + 溢写文件）
      const bounded = await this.deps.outputs.bound(result.output, call.callId)
      // ⑥ I/O 护栏（工单 7.2）：过滤敏感片段 + 注入扫描——tool.completed 事件
      // 与 run-loop toolResult 回填共用此输出，两面一次覆盖；告警不阻断 turn
      let finalOutput = bounded
      if (this.deps.guard !== undefined) {
        const guarded = this.deps.guard.apply(bounded)
        finalOutput = guarded.output
        for (const w of guarded.warnings) {
          await bus.emit(sid, 'io.warning', {
            turnId: turn.turnId,
            callId: call.callId,
            tool: call.name,
            kind: w.kind,
            rules: w.rules,
            ...(w.redacted !== undefined ? { redacted: w.redacted } : {}),
          })
        }
      }
      await gate.close()
      await this.emitCompleted(
        turn,
        call.callId,
        call.name,
        finalOutput,
        result.isError,
        startedAt(),
      )
      this.deps.metrics?.inc('spark_tool_calls_total', {
        name: call.name,
        is_error: String(result.isError),
      })
      return { callId: call.callId, output: finalOutput, isError: result.isError }
    } catch (err) {
      await gate.close()
      const mapped = mapError(err)
      await this.emitCompleted(turn, call.callId, call.name, mapped, true, startedAt())
      return { callId: call.callId, output: mapped, isError: true }
    }
  }

  /**
   * tool.completed 发射 + 用户侧 hooks 挂点（工单 7.3）：载荷不含 output
   * （可能超大/含敏感内容）。合成闭合对（E_ABORTED 未启动 / E_TRUNCATED 截断
   * 保护）不走此路——挂点语义是"真实工具调用完成后"。
   */
  private async emitCompleted(
    turn: TurnCtx,
    callId: CallId,
    name: string,
    output: unknown,
    isError: boolean,
    durationMs: number,
  ): Promise<void> {
    const env = await this.deps.bus.emit(this.deps.sessionId, 'tool.completed', {
      turnId: turn.turnId,
      callId,
      output,
      isError,
      durationMs,
    })
    this.deps.hooks?.fire('tool.completed', {
      sessionId: this.deps.sessionId,
      cwd: this.deps.cwd,
      sourceEventId: env.id,
      data: { turnId: turn.turnId, callId, name, isError, durationMs },
    })
  }

  /** 未启动即被 interrupt：补事件对（E_ABORTED） */
  private async emitAbortedPair(turn: TurnCtx, call: ToolCallPending): Promise<void> {
    await this.deps.bus.emit(this.deps.sessionId, 'tool.started', {
      turnId: turn.turnId,
      callId: call.callId,
      name: call.name,
      input: call.input,
    })
    await this.deps.bus.emit(this.deps.sessionId, 'tool.completed', {
      turnId: turn.turnId,
      callId: call.callId,
      output: { code: 'E_ABORTED' },
      isError: true,
      durationMs: 0,
    })
  }

  /** 连续 parallelizable 归组；serial 单独成 barrier */
  private group(calls: readonly ToolCallPending[]): CallGroup[] {
    const groups: CallGroup[] = []
    let current: CallGroup | null = null
    for (const call of calls) {
      const def = this.deps.registry.resolve(call.name)
      const parallelizable = def?.parallelizable === true
      if (parallelizable && current?.parallel) {
        current.calls.push(call)
      } else {
        current = { parallel: parallelizable, calls: [call] }
        groups.push(current)
      }
    }
    return groups
  }

  private chunk<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size))
    }
    return out
  }
}
