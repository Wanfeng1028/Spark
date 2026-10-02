/**
 * CK-17 批 1 单测：声明式安全六维——调度消费（concurrentSafe === false 降级串行，
 * parallelizable: true 不再单看，以实测最大并发数断言）/ 迁移兼容（未声明 safety
 * 的 parallelizable 工具并行行为不变）/ 声明位封闭形状。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { ids } from '@spark/protocol'
import { ToolRegistry } from '../src/tools/registry.js'
import { ToolPipelineImpl } from '../src/tools/pipeline.js'
import { ToolOutputStore } from '../src/tools/output-store.js'
import { EventBus, type EventSink } from '../src/bus.js'
import type { ToolDefinition, ToolContext, ToolOutput } from '../src/tools/definition.js'

const SID = ids.session('ses_safetytest000000000000')

class MemSink implements EventSink {
  readonly events: import('@spark/protocol').SparkEventEnvelope[] = []
  append(e: import('@spark/protocol').SparkEventEnvelope): Promise<import('@spark/protocol').SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

interface DefOpts {
  parallelizable: boolean
  safety?: ToolDefinition['safety']
  delayMs?: number
  rec: { order: string[]; active: number; maxActive: number }
}

function fakeTool(name: string, opts: DefOpts): ToolDefinition {
  return {
    name,
    description: `fake ${name}`,
    inputSchema: z.strictObject({ v: z.string().optional() }),
    permission: { action: `fake.${name}`, resourceOf: () => `fake:${name}` },
    parallelizable: opts.parallelizable,
    ...(opts.safety !== undefined ? { safety: opts.safety } : {}),
    async execute(ctx: ToolContext, _input): Promise<ToolOutput> {
      const rec = opts.rec
      console.log('EXEC', name)
      rec.order.push(`start:${name}`)
      rec.active += 1
      rec.maxActive = Math.max(rec.maxActive, rec.active)
      if (opts.delayMs !== undefined) await new Promise((r) => setTimeout(r, opts.delayMs))
      rec.active -= 1
      rec.order.push(`end:${name}`)
      return { output: `done:${name}`, isError: false }
    },
  }
}

interface Fixture {
  pipeline: ToolPipelineImpl
}

async function makeFixture(defs: ToolDefinition[]): Promise<Fixture> {
  const registry = new ToolRegistry()
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const outDir = await mkdtemp(join(tmpdir(), 'spark-safety-'))
  const pipeline = new ToolPipelineImpl({
    sessionId: SID,
    bus,
    registry,
    permission: { assert: () => Promise.resolve(true), isDenied: () => false },
    outputs: new ToolOutputStore(32 * 1024, outDir),
    cwd: '/tmp',
    maxToolParallel: 8,
    progressThrottleMs: 10,
  })
  for (const d of defs) registry.register(d)
  return { pipeline }
}

function makeTurn() {
  return {
    turnId: ids.turn('trn_safetytest00000000001'),
    delivery: 'now' as const,
    abort: new AbortController(),
    step: 1,
    usage: { inputTokens: 0, outputTokens: 0 },
    toolCalls: [],
  }
}

function pending(name: string, n: number): { callId: ReturnType<typeof ids.call>; name: string; input: { v: string } } {
  return { callId: ids.call(`cal_safety${n}${name}`), name, input: { v: String(n) } }
}

describe('CK-17：safety 声明与调度消费', () => {
  test('concurrentSafe: false 降级串行——parallelizable: true 不再单看（实测 maxActive=1）', async () => {
    const rec = { order: [], active: 0, maxActive: 0 }
    const f = await makeFixture([
      fakeTool('ser', { parallelizable: true, safety: { concurrentSafe: false }, delayMs: 40, rec }),
    ])
    // 同一 deferred-unsafe 工具两次调用：即使 parallelizable: true 也必须串行
    await f.pipeline.runAll(makeTurn(), [pending('ser', 1), pending('ser', 2)])
    expect(rec.maxActive).toBe(1)
    expect(rec.order).toEqual(['start:ser', 'end:ser', 'start:ser', 'end:ser'])
  })

  test('未声明 safety 的 parallelizable 工具：并行行为不变（迁移兼容，maxActive=2）', async () => {
    const rec = { order: [], active: 0, maxActive: 0 }
    const f = await makeFixture([
      fakeTool('par', { parallelizable: true, delayMs: 40, rec }),
    ])
    await f.pipeline.runAll(makeTurn(), [pending('par', 1), pending('par', 2)])
    expect(rec.maxActive).toBe(2)
    expect(rec.order).toEqual(['start:par', 'start:par', 'end:par', 'end:par'])
  })

  test('声明位封闭：五维均可声明且读取回读一致', () => {
    const def = fakeTool('x', {
      parallelizable: false,
      safety: {
        readOnly: false,
        destructive: true,
        concurrentSafe: false,
        sideEffectScope: 'external',
        riskLevel: 'high',
      },
      rec: { order: [], active: 0, maxActive: 0 },
    })
    expect(def.safety?.readOnly).toBe(false)
    expect(def.safety?.destructive).toBe(true)
    expect(def.safety?.concurrentSafe).toBe(false)
    expect(def.safety?.sideEffectScope).toBe('external')
    expect(def.safety?.riskLevel).toBe('high')
  })
})
