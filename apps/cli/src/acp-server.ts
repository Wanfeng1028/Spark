/**
 * `spark acp`——Agent Client Protocol 适配器（CK-16 实施批 / doc/15 §4 方案一；
 * 晚风 2026-10-05 拍板"1.授权"）。
 *
 * 形态：stdio JSON-RPC 子进程（编辑器拉起本进程，stdin/stdout 通信——**无网络监听面**，
 * 安全上优于 HTTP 常驻）。引擎装配走 `createInProcessClient`（mcp-server 同款——
 * 十四 MCP 模式审批收敛口径：规则照常生效、超时上限收敛）。
 *
 * 方法面映射（SparkClient ↔ ACP v1）：
 * - `session/new`   → client.sessions.create({ cwd })（ACP 的 cwd 是会话工作区）
 * - `session/prompt`→ client.sessions.send + 事件流订阅翻译：
 *     assistant.delta → agent_message_chunk；
 *     tool.started/tool.completed → tool_call/tool_call_update（callId 直作 toolCallId）；
 *     permission.asked → session/request_permission（outcome once/always 直映
 *     PermissionReply——**弹窗 UI 归编辑器，审批门语义不变**）；
 *     turn.completed → stopReason（end_turn/aborted→cancelled 其余 end_turn 收口）。
 * - `session/cancel`→ client.sessions.interrupt。
 * - **`fs/*` 反向请求：不支持**（agentCapabilities.fileSystem: false）——Spark 文件面
 *   自带 resolveInRoot 硬边界 + 敏感文件防线（#3.6），不经编辑器手（doc/15 §4 安全前提④，
 *   晚风已拍板"拒绝降级"策略）。
 *
 * 事件流消费纪律（§1.1）：直播事件经 client.events.subscribe（全局流），按 sessionId
 * 过滤；去重靠事件自带 seq 与投影 lastSeq 吸附（ACP 层无状态，不做局部乐观修补）。
 */
import { Readable, Writable } from 'node:stream'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as acp from '@agentclientprotocol/sdk'
import { Engine, Logger, loadConfig, type EngineConfig } from '@spark/engine'
import { createInProcessClient } from '@spark/sdk/inprocess'
import type { SparkClient } from '@spark/sdk'
import type { SessionId, SparkEventEnvelope } from '@spark/protocol'

/** MCP 模式审批收敛同款（D39）：stdio 语境没有交互式 5min 的必要 */
const ACP_PERMISSION_TIMEOUT_MS = 300_000

/** 会话运行态：中止控制器（cancel）+ 事件流退订 + turn 终止等待 */
interface AcpSession {
  abort: AbortController | null
  unsubscribe: () => void
  /** prompt() 等待的 turn 终止句柄（turn.completed 时置位） */
  turnResolve?: (() => void) | undefined
  turnStop?: ((s: 'end_turn' | 'cancelled') => void) | undefined
}

class SparkAcpAgent {
  private readonly sessions = new Map<string, AcpSession>()
  /** ACP sessionId（字符串）→ Spark SessionId（品牌 id）映射 */
  private readonly sidMap = new Map<string, SessionId>()

  constructor(
    private readonly client: SparkClient,
    private readonly log: { info(msg: string, fields?: Record<string, unknown>): void },
  ) {}

  async initialize(_params: acp.InitializeRequest): Promise<acp.InitializeResponse> {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
        // 安全前提④：fs/* 反向请求不支持——Spark 文件面自带边界，不经编辑器手
        promptCapabilities: { audio: false, embeddedContext: false },
      },
      authMethods: [],
    }
  }

  async authenticate(_params: acp.AuthenticateRequest): Promise<acp.AuthenticateResponse | void> {
    // 本地引擎无 agent 侧鉴权（配对鉴权是远端通道的事）——空响应
    return {}
  }

  async newSession(params: acp.NewSessionRequest): Promise<acp.NewSessionResponse> {
    const dto = await this.client.sessions.create(
      params.cwd !== undefined && params.cwd !== '' ? { cwd: params.cwd } : {},
    )
    const acpId = dto.id
    this.sidMap.set(acpId, dto.id)
    // 全局事件流一条订阅 per 会话（退订挂会话态；断线重连由 SessionStreamCore 吸附）
    const unsubscribe = this.client.events.subscribe((e) => {
      void this.onEnvelope(acpId, e).catch(() => undefined)
    })
    this.sessions.set(acpId, { abort: null, unsubscribe })
    this.log.info('acp.session.new', { sid: dto.id, cwd: params.cwd })
    return { sessionId: acpId }
  }

  async prompt(params: acp.PromptRequest, cx: acp.AgentContext): Promise<acp.PromptResponse> {
    const session = this.sessions.get(params.sessionId)
    const sid = this.sidMap.get(params.sessionId)
    if (session === undefined || sid === undefined) {
      throw new Error(`Session ${params.sessionId} not found`)
    }
    // 文本块拼接（ACP ContentBlock 数组 → Spark 单文本；image 块暂不支持——audio/image
    // 面 Spark 尚未在 send 通道开，如实降级为文本提示）
    const text = params.prompt
      .map((b) => (b.type === 'text' ? b.text : `[${b.type} 内容暂不支持]`))
      .join('\n')
    const abort = new AbortController()
    session.abort = abort
    // turn 终止等待：订阅里置位；stopReason 从 turn.completed 取
    let stopReason: 'end_turn' | 'cancelled' = 'end_turn'
    const turnDone = new Promise<void>((resolve) => {
      session.turnResolve = resolve
      session.turnStop = (s) => {
        stopReason = s
        resolve()
      }
    })
    try {
      await this.client.sessions.send(sid, text)
      await turnDone
    } catch (err) {
      if (abort.signal.aborted) return { stopReason: 'cancelled' }
      throw err
    } finally {
      session.abort = null
    }
    void cx
    return { stopReason }
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    const session = this.sessions.get(params.sessionId)
    const sid = this.sidMap.get(params.sessionId)
    if (session === undefined || sid === undefined) return
    session.abort?.abort()
    await this.client.sessions.interrupt(sid)
    session.turnStop?.('cancelled')
  }

  /** 引擎事件 → ACP session/update 翻译（订阅入口） */
  private async onEnvelope(acpId: string, e: SparkEventEnvelope): Promise<void> {
    if (e.sessionId !== this.sidMap.get(acpId)) return
    const session = this.sessions.get(acpId)
    if (session === undefined) return
    const notifyUpdate = (update: Record<string, unknown>): Promise<void> =>
      this.notify(acpId, update)
    switch (e.type) {
      case 'assistant.delta':
        await notifyUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: e.data.text },
        })
        break
      case 'assistant.message':
        // 定稿正文已在 delta 流过——定稿只补 usage，不重发正文（禁重复）
        break
      case 'tool.started':
        await notifyUpdate({
          sessionUpdate: 'tool_call',
          toolCallId: e.data.callId,
          title: e.data.name,
          kind: 'execute',
          status: 'in_progress',
          rawInput: e.data.input,
        })
        break
      case 'tool.completed':
        await notifyUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: e.data.callId,
          status: e.data.isError ? 'failed' : 'completed',
          rawOutput: e.data.output,
        })
        break
      case 'permission.asked':
        await this.requestPermission(acpId, e)
        break
      case 'turn.completed': {
        const finish = e.data.finish
        session.turnStop?.(finish === 'aborted' ? 'cancelled' : 'end_turn')
        break
      }
      default:
        break
    }
  }

  /** 审批挂起 → session/request_permission（outcome once/always 直映 PermissionReply） */
  private async requestPermission(
    acpId: string,
    e: SparkEventEnvelope & { type: 'permission.asked' },
  ): Promise<void> {
    const sid = this.sidMap.get(acpId)
    if (sid === undefined) return
    const cx = this.clientContext
    if (cx === undefined) return
    const response = await cx.request(acp.methods.client.session.requestPermission, {
      sessionId: acpId,
      toolCall: {
        toolCallId: e.data.callId,
        title: `${e.data.action} ${e.data.resource}`,
        kind: 'execute',
        status: 'pending',
        rawInput: { resource: e.data.resource, reason: e.data.reason },
      },
      options: [
        { kind: 'allow_once', name: '允许一次', optionId: 'once' },
        { kind: 'allow_always', name: '总是允许', optionId: 'always' },
        { kind: 'reject_once', name: '拒绝', optionId: 'reject' },
      ],
    })
    const outcome = response.outcome.outcome
    if (outcome === 'cancelled') {
      await this.client.transport.replyPermission(e.data.requestId, 'reject', 'ACP 客户端取消')
      return
    }
    const optionId = response.outcome.optionId
    const reply: 'once' | 'always' | 'reject' =
      optionId === 'always' ? 'always' : optionId === 'reject' ? 'reject' : 'once'
    await this.client.transport.replyPermission(
      e.data.requestId,
      reply,
      optionId === 'reject' ? 'ACP 客户端拒绝' : undefined,
    )
  }

  /** AgentContext 注入点（connect 时由 runAcpServer 装入——request 反向通道） */
  clientContext: acp.AgentContext | undefined = undefined

  private async notify(acpId: string, update: Record<string, unknown>): Promise<void> {
    const cx = this.clientContext
    if (cx === undefined) return
    await cx.notify(acp.methods.client.session.update, {
      sessionId: acpId,
      update,
    } as never)
  }
}

/** 生产入口（`spark acp`）：装配真实 Engine（~/.spark 数据根）+ ndJson stdio 流 */
export async function runAcpServer(): Promise<void> {
  const config = loadConfig()
  const clamped = Math.min(config.spark.engine.permissionTimeoutMs, ACP_PERMISSION_TIMEOUT_MS)
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
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  await engine.ready()
  const agent = new SparkAcpAgent(client, {
    info: (msg, fields) => engine.logger.info(msg, fields),
  })
  const input = Writable.toWeb(process.stdout)
  const output = Readable.toWeb(process.stdin)
  const stream = acp.ndJsonStream(input as never, output as never)
  // AgentContext 装入（request 反向通道——requestPermission/notify 消费）
  const connected = acp
    .agent({ name: 'spark', version: '1.0.0' })
    .onRequest('initialize', (ctx) => agent.initialize(ctx.params))
    .onRequest('session/new', (ctx) => agent.newSession(ctx.params))
    .onRequest('authenticate', (ctx) => agent.authenticate(ctx.params))
    .onRequest('session/prompt', (ctx) => agent.prompt(ctx.params, ctx.client))
    .onNotification('session/cancel', (ctx) => agent.cancel(ctx.params))
    .connect(stream)
  // AgentContext 是 connect 后由 SDK 维护的会话侧通道——适配器经 clientContext 转发
  agent.clientContext = connected as unknown as acp.AgentContext
  process.stderr.write(`Spark ACP server 已就绪（stdio；数据根 ${root}；fs/* 反向请求不支持——文件面自带边界）\n`)
}
