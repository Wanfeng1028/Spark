/**
 * Eval 夹具层（阶段七工单 7.11 / H10，doc/06 §2）：临时 root + ScriptedLlm + 真实 Engine——
 * 与引擎单测同款装配（fake provider 定版配置），但脱离 vitest，经 tsx 直跑。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SparkEventEnvelope } from '@spark/protocol'
import type { EngineConfig, PermissionRule } from '@spark/engine'
import { Engine, ScriptedLlm } from '@spark/engine'

export interface EvalOutcome {
  status: 'pass' | 'fail' | 'skip'
  notes: string[]
}

export interface EvalScenario {
  /** 场景标识（ASCII，报告与 nightly 日志的锚点） */
  name: string
  run: () => Promise<EvalOutcome>
}

export function pass(...notes: string[]): EvalOutcome {
  return { status: 'pass', notes }
}

export function fail(...notes: string[]): EvalOutcome {
  return { status: 'fail', notes }
}

export function skip(...notes: string[]): EvalOutcome {
  return { status: 'skip', notes }
}

/** 与引擎单测同形配置（fake provider；checkpoints 关——eval 不需要 git 影子仓） */
export function makeConfig(): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 40,
        maxToolParallel: 8,
        toolTimeoutMs: 120_000,
        permissionTimeoutMs: 300_000,
        progressThrottleMs: 200,
        toolOutputLimitKB: 32,
        compactionThreshold: 0.8,
        checkpoints: false,
        bashSandbox: 'off',
      },
    },
    models: {
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      fallbacks: [],
      titleModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      subagentModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      costLimitUsd: undefined,
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
    },
    permissions: { version: 1, rules: [] },
  }
}

export interface EvalFixture {
  root: string
  engine: Engine
  gateway: ScriptedLlm
  events: SparkEventEnvelope[]
  /** shutdown + 临时目录清理（句柄未释放的目录跳过，交系统临时目录回收） */
  cleanup: () => Promise<void>
}

export function makeFixture(opts?: { rules?: PermissionRule[] }): EvalFixture {
  const root = mkdtempSync(join(tmpdir(), 'spark-eval-'))
  const gateway = new ScriptedLlm()
  const config = makeConfig()
  if (opts?.rules !== undefined) config.permissions.rules = opts.rules
  const engine = new Engine({ root, gateway, config })
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    events.push(e)
  })
  return {
    root,
    engine,
    gateway,
    events,
    cleanup: async () => {
      await engine.shutdown()
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        // 句柄未释放的目录跳过清理（交系统临时目录回收）
      }
    },
  }
}

export async function waitFor(pred: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (pred()) return
    if (Date.now() > deadline) throw new Error(`等待 ${what} 超时（${timeoutMs}ms）`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

export function findEvent<T extends SparkEventEnvelope['type']>(
  events: SparkEventEnvelope[],
  type: T,
): SparkEventEnvelope<T> | undefined {
  return events.find((e): e is SparkEventEnvelope<T> => e.type === type)
}
