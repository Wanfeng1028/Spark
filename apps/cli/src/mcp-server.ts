/**
 * Spark as MCP server（阶段十五工单 15.1 / ADR D39）：stdio MCP server——
 * 把引擎能力经 MCP 暴露给外部 agent（Claude Code / ZCode 等），Spark 成为
 * "带审计的执行后端"。装配同工单 12.3（spark -p）模式：宿主侧构造 Engine +
 * `@spark/sdk/inprocess` 进程内通道，不经 HTTP、不占端口。
 *
 * 三工具（只读查询 + 一把执行）：
 * - spark_run：prompt+cwd → 建会话跑完一轮，返回 { finalText, sessionId, finish }；
 * - spark_sessions：会话列表 + 状态（空闲/运行中/等审批）；
 * - spark_events：session+since → durable 事件页（seq 升序尾部切片，轮询代替流式）。
 *
 * 审批语义（D39，如实声明）：MCP 工具调用是同步请求，不支持交互审批——
 * 权限规则照常生效，ask 挂起时由引擎 fail-closed 超时判 deny（production 入口把
 * permissionTimeoutMs 收敛到 MCP_PERMISSION_TIMEOUT_MS，不让外部调用干等 5min）；
 * spark_run 的权限决策照常进 ~/.spark/audit.jsonl（7.12 链路不旁路——走的就是
 * 引擎自身管线，无任何旁路代码）。
 *
 * 流式：不暴露——MCP 工具是请求响应，流式走 spark_events 按 since 轮询。
 * stdout 纪律：stdio 传输独占 stdout，Engine logger 必须 stdout:false（12.3 同款）。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { SparkEventEnvelope, Transport, TurnFinish } from '@spark/protocol'
import { Engine, Logger, SPARK_VERSION, loadConfig, type EngineConfig } from '@spark/engine'
import { createInProcessClient } from '@spark/sdk/inprocess'
import type { SparkClient } from '@spark/sdk'
import { z } from 'zod'

/** MCP 模式审批挂起上限：同步调用没有交互面，超时 fail-closed 拒绝（D39） */
const MCP_PERMISSION_TIMEOUT_MS = 120_000

/** spark_run 整轮墙钟上限：超时如实抛错（MCP 客户端侧另有自己的工具超时兜底） */
const RUN_TIMEOUT_MS = 600_000

/** spark_events 单页上限（与协议 §9.3 的 limit 上限 200 同档，工具侧再封 500） */
const EVENTS_PAGE_LIMIT = 200

// ---- 工具 input schema（zod 定义，z.toJSONSchema 出 ListTools 的 inputSchema）----

const SparkRunInput = z.strictObject({
  prompt: z.string().min(1).describe('发给 Spark 的任务 prompt'),
  cwd: z.string().min(1).optional().describe('工作区目录（缺省 MCP server 进程 cwd）'),
})
type SparkRunInput = z.infer<typeof SparkRunInput>

const SparkSessionsInput = z.strictObject({})
type SparkSessionsInput = z.infer<typeof SparkSessionsInput>

const SparkEventsInput = z.strictObject({
  sessionId: z.string().min(1).describe('目标会话 id'),
  since: z.number().int().nonnegative().optional().describe('只返回 seq > since 的 durable 事件'),
  limit: z.number().int().positive().max(500).optional().describe('尾部切片上限（缺省 200）'),
})
type SparkEventsInput = z.infer<typeof SparkEventsInput>

/** ListTools 描述符（inputSchema 由 zod schema 现场导出，单一来源） */
const MCP_TOOLS = [
  {
    name: 'spark_run',
    description:
      '把一段 prompt 交给 Spark 引擎跑完一轮（新建会话），返回最终 assistant 文本、sessionId 与 finish。' +
      '权限规则照常生效：需要审批且无人在场时，挂起超时后 fail-closed 拒绝；权限决策进 Spark 审计流。',
    inputSchema: z.toJSONSchema(SparkRunInput),
  },
  {
    name: 'spark_sessions',
    description: '列出 Spark 会话（id/标题/工作区/状态/最近更新时间）。',
    inputSchema: z.toJSONSchema(SparkSessionsInput),
  },
  {
    name: 'spark_events',
    description:
      '读取某会话的 durable 事件页（seq 升序尾部切片；since 只取 seq 更大的新事件）——用轮询跟踪 spark_run 进度。',
    inputSchema: z.toJSONSchema(SparkEventsInput),
  },
] as const

/** spark_run 返回（finalText 为该会话全部 assistant 文本块按序拼接） */
interface SparkRunResult {
  finalText: string
  sessionId: string
  finish: TurnFinish
}

/** spark_sessions 行（SessionMeta 的窄投影——只暴露外部 agent 需要的字段） */
interface SparkSessionRow {
  id: string
  title: string
  model: string
  cwd: string
  status: 'idle' | 'running' | 'waiting-approval'
  updatedAt: number
}

/** spark_events 返回 */
interface SparkEventsResult {
  events: SparkEventEnvelope[]
  /** 本页最后一条的 seq（下一轮 since 直接用它；空页 = 原样返回请求 since） */
  nextSince: number
}

/** 依赖注入面：三个 handler 只消费进程内 client 的这一小块能力面（测试可换假体） */
interface SparkMcpDeps {
  /** SparkClient<Transport>：显式基接口（缺省泛型是 HttpTransport——InProcess 不兼容） */
  client: SparkClient<Transport>
  /** spark_run 整轮超时（缺省 RUN_TIMEOUT_MS；测试注入小值） */
  runTimeoutMs?: number
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 等待谓词成立（轮询 10ms；超时抛 E_MCP_RUN_TIMEOUT——失败闭合不悬挂） */
async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!pred()) {
    if (Date.now() > deadline) {
      throw new Error(`E_MCP_RUN_TIMEOUT: spark_run 等待 turn 完成超时（${timeoutMs}ms）`)
    }
    await new Promise((r) => setTimeout(r, 10))
  }
}

/**
 * 三个工具的业务 handler（纯进程内，stdio 解耦——测试直接调用；
 * Server 侧 CallToolRequest 只做分发与结果包装）。
 */
export function createSparkMcpHandlers(deps: SparkMcpDeps) {
  const runTimeoutMs = deps.runTimeoutMs ?? RUN_TIMEOUT_MS
  return {
    async sparkRun(input: SparkRunInput): Promise<SparkRunResult> {
      const session = await deps.client.sessions.create(
        input.cwd !== undefined ? { cwd: input.cwd } : {},
      )
      const texts: string[] = []
      let finish: TurnFinish | undefined
      // 先订阅再发（turn.completed 不漏）；只认本会话事件
      const off = deps.client.events.subscribe((e: SparkEventEnvelope) => {
        if (e.sessionId !== session.id) return
        if (e.type === 'assistant.message') {
          const blocks = (e.data as { content: Array<{ type: string; text?: string }> }).content
          for (const b of blocks) {
            if (b.type === 'text' && typeof b.text === 'string' && b.text !== '') texts.push(b.text)
          }
        }
        if (e.type === 'turn.completed') {
          finish = (e.data as { finish: TurnFinish }).finish
        }
      })
      try {
        await deps.client.sessions.send(session.id, input.prompt, { delivery: 'now' })
        await waitFor(() => finish !== undefined, runTimeoutMs)
      } finally {
        off()
      }
      // waitFor 成功后 finish 必已赋值（谓词与赋值同源）；显式兜底满足类型收窄
      if (finish === undefined) {
        throw new Error('E_MCP_RUN_STATE: turn 完成信号丢失（内部状态不一致）')
      }
      return { finalText: texts.join('\n'), sessionId: session.id, finish }
    },

    async sparkSessions(_input: SparkSessionsInput): Promise<{ sessions: SparkSessionRow[] }> {
      const all = await deps.client.sessions.list(false)
      return {
        sessions: all.map((m) => ({
          id: m.id,
          title: m.title,
          model: m.model,
          cwd: m.cwd,
          status: m.status,
          updatedAt: m.updatedAt,
        })),
      }
    },

    async sparkEvents(input: SparkEventsInput): Promise<SparkEventsResult> {
      const dto = await deps.client.events.replay(input.sessionId)
      const since = input.since ?? 0
      const fresh = (dto.events ?? []).filter((e) => e.seq !== undefined && e.seq > since)
      const page = fresh.slice(-(input.limit ?? EVENTS_PAGE_LIMIT))
      const last = page.at(-1)?.seq
      return { events: page, nextSince: last ?? since }
    },
  }
}

type SparkMcpHandlers = ReturnType<typeof createSparkMcpHandlers>

/** 统一入口：分发到 handler，返回 text content；业务错误 → isError（失败闭合，不悬空） */
async function dispatchTool(
  handlers: SparkMcpHandlers,
  name: string,
  rawArgs: Record<string, unknown> | undefined,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    let result: unknown
    if (name === 'spark_run') {
      result = await handlers.sparkRun(SparkRunInput.parse(rawArgs ?? {}))
    } else if (name === 'spark_sessions') {
      result = await handlers.sparkSessions(SparkSessionsInput.parse(rawArgs ?? {}))
    } else if (name === 'spark_events') {
      result = await handlers.sparkEvents(SparkEventsInput.parse(rawArgs ?? {}))
    } else {
      return {
        content: [{ type: 'text', text: `E_MCP_UNKNOWN_TOOL: 未知工具 "${name}"` }],
        isError: true,
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return { content: [{ type: 'text', text: errMessage(err) }], isError: true }
  }
}

/** 组装 MCP Server（stdio 解耦：connect 由调用方执行，测试可只借 handler 层） */
export function createSparkMcpServer(deps: SparkMcpDeps): Server {
  const handlers = createSparkMcpHandlers(deps)
  const server = new Server({ name: 'spark', version: SPARK_VERSION }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: MCP_TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    dispatchTool(handlers, req.params.name, req.params.arguments),
  )
  return server
}

/** 生产入口（`spark mcp`）：装配真实 Engine（~/.spark 数据根）+ stdio 传输 */
export async function runMcpServer(): Promise<void> {
  // MCP 模式审批挂起收敛（D39）：规则照常生效，超时上限不再沿用交互式 5min 缺省
  const config = loadConfig()
  const clamped = Math.min(config.spark.engine.permissionTimeoutMs, MCP_PERMISSION_TIMEOUT_MS)
  const engineConfig: EngineConfig = {
    ...config,
    spark: { ...config.spark, engine: { ...config.spark.engine, permissionTimeoutMs: clamped } },
  }
  const root = join(homedir(), '.spark')
  const engine = new Engine({ config: engineConfig, logger: new Logger({ root, stdout: false }) })
  const client = createInProcessClient(engine)
  let closed = false
  const shutdown = (): void => {
    if (closed) return
    closed = true
    void client.close()
    void engine
      .shutdown()
      .catch(() => {})
      .finally(() => process.exit(0))
  }
  const server = createSparkMcpServer({ client })
  server.onclose = shutdown
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  await engine.ready()
  await server.connect(new StdioServerTransport())
  process.stderr.write(`Spark MCP server 已就绪（stdio；数据根 ${root}；三工具 spark_run/spark_sessions/spark_events）\n`)
}
