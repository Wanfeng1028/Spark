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
import type { SessionId } from '@spark/protocol'
import type { EventBus } from '../bus.js'
import type { ToolSpec } from '../llm-gateway.js'
import type { ToolPipeline, ToolPipelineResult, TurnCtx } from '../run-loop.js'
import type { ToolCallPending } from '../run-loop.js'
import type { PermissionService } from './permission-port.js'
import type { ToolOutputStore } from './output-store.js'
import type { ToolRegistry } from './registry.js'

export interface PipelineDeps {
  sessionId: SessionId
  bus: EventBus
  registry: ToolRegistry
  permission: PermissionService
  outputs: ToolOutputStore
  cwd: string
  maxToolParallel: number
  progressThrottleMs: number
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
      await bus.emit(sid, 'tool.completed', {
        turnId: turn.turnId,
        callId: call.callId,
        output: { code: 'E_NOT_FOUND', message: `未知工具 ${call.name}` },
        isError: true,
        durationMs: startedAt(),
      })
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
      // ② 权限门（ask → 挂起等待；超时/中断一律 deny——fail-closed 在 service 内）
      const allowed = await this.deps.permission.assert({
        sessionId: sid,
        callId: call.callId,
        turnId: turn.turnId,
        name: call.name,
        action: def.permission.action,
        resource: def.permission.resourceOf(call.input, { cwd: this.deps.cwd }),
        input: call.input,
        signal: turn.abort.signal,
      })
      if (!allowed) {
        await gate.close()
        await bus.emit(sid, 'tool.completed', {
          turnId: turn.turnId,
          callId: call.callId,
          output: { code: 'E_PERMISSION' },
          isError: true,
          durationMs: startedAt(),
        })
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
      await gate.close()
      await bus.emit(sid, 'tool.completed', {
        turnId: turn.turnId,
        callId: call.callId,
        output: bounded,
        isError: result.isError,
        durationMs: startedAt(),
      })
      return { callId: call.callId, output: bounded, isError: result.isError }
    } catch (err) {
      await gate.close()
      await bus.emit(sid, 'tool.completed', {
        turnId: turn.turnId,
        callId: call.callId,
        output: mapError(err),
        isError: true,
        durationMs: startedAt(),
      })
      return { callId: call.callId, output: mapError(err), isError: true }
    }
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
