/**
 * examples/sdk-bot —— automation bot 的**可复用核心**（工单 14.5 要求 2；入口在 `main.ts`）。
 *
 * 做什么：建会话 → 发任务 → 等 `turn.completed` → 结果写 stdout（可选追加日志文件）。
 * 两条通道（ADR D30），核心 `runBot` 与通道无关——这正是"一个 client 合同、两个 transport"
 * 对第三方脚本的意义：换通道不改业务代码。
 *   缺省 HTTP：`SPARK_API`（缺省 http://127.0.0.1:4318）——先 `pnpm --filter server dev`；
 *   `SPARK_DEMO=1` 演示模式：进程内起 Engine + ScriptedLlm（不出网、不打真实模型、不需 server），
 *     走 `@spark/sdk/inprocess`——这也是本例能在 CI 里被真跑的原因（`tests/bot.test.ts`）。
 *
 * boring 红线：零业务抽象——没有重试策略、没有队列、没有插件点，就是一个脚本该有的样子。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionId, SparkEventEnvelope, Transport } from '@spark/protocol'
import type { EngineConfig } from '@spark/engine'
import { createClient } from '@spark/sdk'
import type { SparkClient } from '@spark/sdk'

export interface BotOptions {
  /** 任务文本 */
  task: string
  /** 结果追加写入的日志文件（缺省只写 stdout） */
  logFile?: string
}

export interface BotResult {
  /** 品牌化原样透出（取自 SessionDto.id），消费方拿去回放/追问不用再转 */
  sessionId: SessionId
  finish: string
  text: string
}

/** 通道无关的核心：HTTP 与进程内都跑这一份 */
export async function runBot(client: SparkClient<Transport>, opts: BotOptions): Promise<BotResult> {
  const session = await client.sessions.create({ title: 'bot 任务' })
  const texts: string[] = []
  let finish = 'error'
  // 先订阅再发消息：turn.completed 可能在 send 返回前就到（进程内通道尤其快）
  const finished = new Promise<void>((resolve) => {
    const off = client.events.subscribe((e: SparkEventEnvelope) => {
      if (e.sessionId !== session.id) return
      if (e.type === 'assistant.message') {
        const content = (e.data as { content: Array<{ type: string; text?: string }> }).content
        for (const block of content) {
          if (block.type === 'text' && block.text !== undefined) texts.push(block.text)
        }
      }
      if (e.type === 'turn.completed') {
        finish = (e.data as { finish: string }).finish
        off()
        resolve()
      }
    })
  })
  await client.sessions.send(session.id, opts.task, { delivery: 'now' })
  await finished

  const text = texts.join('\n')
  const line = `[${new Date().toISOString()}] session=${session.id} finish=${finish}\n${text}\n`
  process.stdout.write(line)
  if (opts.logFile !== undefined) await appendFile(opts.logFile, line, 'utf8')
  return { sessionId: session.id, finish, text }
}

/** 演示模式的引擎配置：假供应商 fake/fake-chat（与 evals、server 测试夹具同口径） */
function demoConfig(): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 8,
        maxToolParallel: 4,
        toolTimeoutMs: 30_000,
        permissionTimeoutMs: 5_000, // 演示模式不交互审批：短超时走 fail-closed
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
      defaultEffort: undefined,
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
    },
    permissions: { version: 1, rules: [] },
  }
}

/**
 * 装配客户端：`SPARK_DEMO=1` → 进程内（Engine + ScriptedLlm，离线确定性）；否则 HTTP。
 * 进程内分支用**动态 import**：只用 HTTP 的人不必装 `@spark/engine`
 * （ADR D30 的 optional peer 语义在示例里的体现）。
 */
export async function makeClient(): Promise<{ client: SparkClient<Transport>; close: () => Promise<void> }> {
  if (process.env['SPARK_DEMO'] !== '1') {
    const client = createClient(process.env['SPARK_API'] ?? 'http://127.0.0.1:4318')
    return { client, close: async () => client.close() }
  }
  const { Engine } = await import('@spark/engine')
  const { ScriptedLlm } = await import('@spark/engine/internal')
  const { createInProcessClient } = await import('@spark/sdk/inprocess')
  const root = mkdtempSync(join(tmpdir(), 'spark-bot-demo-'))
  const gateway = new ScriptedLlm()
  gateway.scriptStep({ deltas: [{ kind: 'text', text: '演示模式：这是 ScriptedLlm 的预录回答。' }] })
  const engine = new Engine({ root, gateway, config: demoConfig() })
  await engine.ready()
  const client = createInProcessClient(engine)
  return {
    client,
    close: async () => {
      client.close() // 先退订，再关引擎（顺序见 doc/02 §4.8 ⑥）
      await engine.shutdown()
      rmSync(root, { recursive: true, force: true })
    },
  }
}
