/**
 * Transport 内核（工单 8.1 / ADR D22 四端共享资产）：自 apps/web 下沉，web 与 cli 共用。
 * 运行时中立——只用 fetch/ReadableStream/TextDecoder/AbortController 全局（浏览器与 Node 24 同构），
 * protocol 依赖纪律不变（除 zod 无运行时依赖）。
 * 1) HttpTransport：REST 全方法 + 全局 SSE 单连接（直播全部会话），断线指数退避重连，
 *    重连成功 onResync 通知已打开会话集合（调用方做全量回放——冷启动与断线重连同一路径）。
 * 2) envelopeFromSseFrame：SSE 单帧 → 信封的共享解析（注释帧/无 data 帧 → null；
 *    ignorable 未知扩展事件跳过；坏帧抛错由调用方驱动断开重连——失败闭合）。
 * 3) REST 错误映射：非 2xx 读错误体 {code, message} 抛 `Error("code: message")`（文案表单一来源）。
 *
 * 重连状态机（退避序列 / 水位推进 / 鉴权收敛 / dispose 防竞态）在 session-stream-core.ts
 * （工单 R-B.5）：本文件的 HttpTransport 与 SessionEventSource 都是 SessionStreamCore 的消费者，
 * 各自只注入一个单次连接钩子（下方共享的 connectSseOnce）。index.ts 一并再导出，四端导入点不变。
 */
import { eventSchemaOf } from './extend.js'
import { errorFromResponse } from './error-copy.js'
import { parseEnvelope } from './schema.js'
import { SessionStreamCore } from './session-stream-core.js'
import type { StreamConnectionStatus, StreamCoreContext } from './session-stream-core.js'
import type { SparkEventEnvelope } from './events.js'
import type { AgentPresetDto, ArenaHistoryDto, ArenaStatusDto, AttachmentDto, AuditEntryDto, AuditQuery, AutomationCreate, AutomationRunDto, AutomationTriggerDto, BrowserCleanupResultDto, CheckpointDto, CommandDto, ExtensionDto, FeedbackEntryDto, FeedbackInput, FeedbackQuery, FeedbackVote, FsListDto, FsTreeDto, IndexStatsDto, LspInstallResultDto, LspServerStatusDto, LogsDto, LogsQuery, McpConfigInput, McpServerDto, MemoryDto, ModelTestResultDto, ModelsDto, PairCodeDto, PairRedeemBody, PairStatusDto, PairTokenDto, PermissionPreset, PermissionRuleDto, PromptsDto, PromptsUpdate, RebuildResultDto, RebuildVectorsResultDto, RoutingDto, RoutingUpdate, SandboxNetworkStatusDto, SearchHitDto, SecretStatusDto, SessionDto, SessionEventsQuery, SettingsDto, SettingsUpdate, LinkPreviewDto, SkillDto, StorageCleanupDto, StorageExportDto, StorageImportDto, StorageReportDto, TraceDto, TranscribeRequest, TranscribeResultDto, TreeNodeDto, TrustStatusDto, UsageSummaryDto, VacuumResultDto } from './api.js'
import type { CheckpointId, EventId, RequestId, SessionId } from './ids.js'
import type { PermissionReply, PermissionScope, ReasoningEffort } from './primitives.js'
import type { SendMessageOptions, SubmitOutcome, Transport } from './transport.js'

/**
 * 连接态（工单 R-B.5b 起 = SessionStreamCore 的 StreamConnectionStatus，3 态 → 4 态）。
 * closed 此前不在本类型里，导致 cli Footer 的「连接已断开」与 web StatusBar/AppShell 的
 * CLOSED_TEXT 运行时永不可达（静默缺陷——文案写了却显示不出来）；现已由内核的鉴权收敛发出。
 */
export type HttpConnectionStatus = StreamConnectionStatus

export interface HttpTransportOptions {
  /** API 基址：缺省空串（浏览器同源；Node 侧调用方显式给 127.0.0.1 地址） */
  baseUrl?: string
  /** 退避序列（测试注入缩短）；末位封顶 */
  backoffMs?: readonly number[]
  /** 连接状态变化 */
  onStatus?: (s: HttpConnectionStatus) => void
  /** 重连成功后的重放通知（曾成功连过又断开的场景） */
  onResync?: (sids: readonly SessionId[]) => void
  /** 是否启动全局 SSE 直播（缺省启动；cli 走 SessionEventSource 会话级流时传 false 仅用 REST） */
  eventStream?: boolean
  /** 配对长效 token（工单 9.1 / D24）：REST 附 Bearer 头，SSE URL 附 ?token=（与服务端 tokenOf 双口径一致） */
  authToken?: string
}

/**
 * SSE 单帧解析：注释帧（: connected / : heartbeat）与无 data 行帧（event: bye）→ null；
 * data 行 JSON → parseEnvelope 校验后返回。插件扩展事件（工单 5.5 / ADR D18）：
 * 本端未注册词表的 ignorable 帧跳过（与引擎 SessionStore 读端同策略——不因未装插件断流）。
 * 坏帧（非法 JSON / 非法信封）抛错——调用方冒泡断开走重连自愈（失败闭合，不静默跳过）。
 */
export function envelopeFromSseFrame(frame: string): SparkEventEnvelope | null {
  if (frame.startsWith(':')) return null
  const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))
  if (dataLine === undefined) return null
  const payload: unknown = JSON.parse(dataLine.slice('data: '.length))
  const p = payload as { type?: unknown; ignorable?: unknown }
  if (
    p.ignorable === true &&
    typeof p.type === 'string' &&
    eventSchemaOf(p.type) === undefined
  ) {
    return null
  }
  return parseEnvelope(payload)
}

/**
 * SSE 切帧纯函数（四端共享，供小程序端复用的契约——工单 9.4）：
 * 新 chunk 拼接缓冲后先归一化 `\r\n`→`\n`（部分网络栈/代理按 CRLF 分行），
 * 再按 `\n\n` 切出完整帧，返回帧序列与残余缓冲（尾帧未收齐时留存）。
 */
export function splitSseFrames(chunk: string, buffer: string): { frames: string[]; rest: string } {
  let buf = (buffer + chunk).replace(/\r\n/g, '\n')
  const frames: string[] = []
  for (;;) {
    const idx = buf.indexOf('\n\n')
    if (idx === -1) break
    frames.push(buf.slice(0, idx))
    buf = buf.slice(idx + 2)
  }
  return { frames, rest: buf }
}

/** ReadableStream → 帧切分（\n\n）→ envelopeFromSseFrame 分发；坏帧冒泡（失败闭合） */
export async function pumpSseStream(
  body: ReadableStream<Uint8Array>,
  onEnvelope: (e: SparkEventEnvelope) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const { frames, rest } = splitSseFrames(decoder.decode(value, { stream: true }), buf)
    buf = rest
    for (const frame of frames) {
      const envelope = envelopeFromSseFrame(frame)
      if (envelope !== null) onEnvelope(envelope)
    }
  }
}

/**
 * SSE 单次连接（全局流与会话级流共用——两形态的 URL 差异全在内核）：fetch → 报 open → 泵读分发。
 * 非 2xx / 无响应体 / 坏帧 / 流异常一律冒泡，SessionStreamCore 接住后退避重连（失败闭合）；
 * 401/403 先交 ctx.noteAuthFailure 走鉴权收敛（连续 3 次进 closed 终态）再冒泡。
 */
async function connectSseOnce(ctx: StreamCoreContext): Promise<void> {
  // SSE 无法自定义头：token 走 ?token= 查询参数（服务端 tokenOf 双口径，工单 9.1）
  const res = await fetch(ctx.url(), {
    signal: ctx.signal,
    headers: { accept: 'text/event-stream' },
  })
  if (!res.ok || res.body === null) {
    if (res.status === 401 || res.status === 403) ctx.noteAuthFailure(res.status)
    throw new Error(`SSE 连接失败：HTTP ${res.status}`)
  }
  ctx.noteOpen()
  // 流正常结束（server 优雅退出 bye 帧后关闭）——返回，内核走重连
  await pumpSseStream(res.body, (e) => ctx.noteEnvelope(e))
}

export class HttpTransport implements Transport {
  protected readonly base: string
  private readonly opts: HttpTransportOptions
  private readonly authToken: string | undefined
  private readonly handlers = new Set<(e: SparkEventEnvelope) => void>()
  private readonly openSessions = new Set<SessionId>()
  /**
   * 全局 SSE 直播的重连状态机（工单 R-B.5b：原 HttpTransport.loop 与 SessionEventSource.loop
   * 两份逐字近似，现合一到 SessionStreamCore）。eventStream:false 时为 null（cli 仅用 REST）。
   */
  private readonly stream: SessionStreamCore | null
  private disposed = false

  constructor(opts: HttpTransportOptions = {}) {
    this.opts = opts
    this.base = opts.baseUrl ?? ''
    this.authToken = opts.authToken
    this.stream =
      opts.eventStream === false
        ? null
        : new SessionStreamCore({
            baseUrl: this.base,
            ...(opts.backoffMs !== undefined ? { backoffMs: opts.backoffMs } : {}),
            ...(opts.authToken !== undefined ? { authToken: opts.authToken } : {}),
            onStatus: (s) => this.setStatus(s),
            onEvent: (e) => {
              for (const h of [...this.handlers]) h(e)
            },
            // 首连无需重放（无旧快照）；重连成功才 resync 已打开会话集合（§6.10 时序④）
            onReopen: () => this.opts.onResync?.([...this.openSessions]),
            connectOnce: connectSseOnce,
          })
  }

  // ---------- 事件流 ----------

  onEvent(handler: (e: SparkEventEnvelope) => void): () => void {
    this.assertNotDisposed()
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  protected setStatus(s: HttpConnectionStatus): void {
    this.opts.onStatus?.(s)
  }

  /** 记录已打开会话（重连 resync 集合，§6.6 要点 2） */
  protected noteOpenSession(sessionId: SessionId): void {
    this.openSessions.add(sessionId)
  }

  // ---------- REST ----------

  /** 统一请求：非 2xx 读错误体 {code,message} 抛 `code: message`；JSON 响应直返；空 body 如实回 undefined */
  protected async req<T>(path: string, init?: RequestInit): Promise<T> {
    this.assertNotDisposed()
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        // 仅带 body 时才声明 content-type：Fastify 5 对 application/json + 空 body
        // 在路由前即拒（FST_ERR_CTP_EMPTY_JSON_BODY），无 body 的 11 处调用点
        // （interrupt/compact/rollback/删密钥/测连接/签发配对码…）因此不得带头
        ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
        ...(this.authToken !== undefined ? { authorization: `Bearer ${this.authToken}` } : {}),
      },
    })
    if (!res.ok) {
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        // 非 JSON 错误体：保留 HTTP 状态信息（状态码与 statusText 已足够定位）
      }
      throw errorFromResponse(res.status, body, res.statusText)
    }
    // 空 body 的 2xx（如 DELETE /api/sessions/:id 的 204）如实回 undefined——
    // 不能直接 res.json()：JSON.parse('') 抛 SyntaxError（工单 14.2 的 Transport 契约套件抓到：
    // web 侧栏的"删除会话"因此一直报错，而 mock 走查与 e2e 四场景都不经真实 HTTP DELETE 所以未暴露）
    const text = await res.text()
    return (text === '' ? undefined : JSON.parse(text)) as T
  }

  sendMessage(sessionId: SessionId, text: string, opts?: SendMessageOptions): Promise<SubmitOutcome> {
    // attachments 暂不发送：server SendMessageBody 为 strictObject（§7.2 v1 无此字段，协议演进未用项）
    return this.req<SubmitOutcome>(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        delivery: opts?.delivery ?? 'now',
        ...(opts?.expectedTurnId !== undefined ? { expectedTurnId: opts.expectedTurnId } : {}),
      }),
    })
  }

  interrupt(sessionId: SessionId): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/sessions/${sessionId}/interrupt`, {
      method: 'POST',
    }).then(() => undefined)
  }

  compact(sessionId: SessionId): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/sessions/${sessionId}/compact`, {
      method: 'POST',
    }).then(() => undefined)
  }

  replyPermission(
    requestId: RequestId,
    reply: PermissionReply,
    feedback?: string,
    scope?: PermissionScope,
  ): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/permissions/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({
        reply,
        ...(feedback !== undefined ? { feedback } : {}),
        ...(scope !== undefined ? { scope } : {}),
      }),
    }).then(() => undefined)
  }

  async getSession(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto> {
    // 分页参数全缺省 = 不带查询串（缺省全量红线，与无参调用完全同形）
    const params = new URLSearchParams()
    if (query !== undefined) {
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      if (query.before !== undefined) params.set('before', String(query.before))
    }
    const qs = params.toString()
    const dto = await this.req<SessionDto>(
      `/api/sessions/${sessionId}${qs !== '' ? `?${qs}` : ''}`,
    )
    this.noteOpenSession(sessionId)
    return dto
  }

  listSessions(archived?: boolean): Promise<SessionDto[]> {
    return this.req<SessionDto[]>(archived === true ? '/api/sessions?archived=true' : '/api/sessions')
  }

  /** 归档/恢复（工单 12.4） */
  archiveSession(sessionId: SessionId, archived: boolean): Promise<SessionDto> {
    return this.req<SessionDto>(`/api/sessions/${sessionId}/archive`, {
      method: 'PUT',
      body: JSON.stringify({ archived }),
    })
  }

  /** 置顶/取消置顶（工单 19.41） */
  pinSession(sessionId: SessionId, pinned: boolean): Promise<SessionDto> {
    return this.req<SessionDto>(`/api/sessions/${sessionId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pinned }),
    })
  }

  /** 两段式删除（工单 12.4）：confirm 由本方法恒带（客户端 API 不裸删） */
  deleteSession(sessionId: SessionId): Promise<void> {
    return this.req<void>(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true }),
    })
  }

  createSession(opts?: { title?: string; model?: string; cwd?: string }): Promise<SessionDto> {
    const body: Record<string, string> = {}
    if (opts?.title !== undefined) body['title'] = opts.title
    if (opts?.model !== undefined) body['model'] = opts.model
    // cwd（工单 14.4）：服务端 CreateSessionBody 一直收，本处补上透传（缺省不携带 = 行为不变）
    if (opts?.cwd !== undefined) body['cwd'] = opts.cwd
    return this.req<SessionDto>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  getTree(sessionId: SessionId): Promise<TreeNodeDto[]> {
    return this.req<TreeNodeDto[]>(`/api/sessions/${sessionId}/tree`)
  }

  getSessionTrace(sessionId: SessionId): Promise<TraceDto> {
    return this.req<TraceDto>(`/api/sessions/${sessionId}/trace`)
  }

  fork(sessionId: SessionId, fromEventId: EventId): Promise<SessionDto> {
    return this.req<SessionDto>(`/api/sessions/${sessionId}/fork`, {
      method: 'POST',
      body: JSON.stringify({ fromEventId }),
    })
  }

  listCheckpoints(sessionId: SessionId): Promise<CheckpointDto[]> {
    return this.req<CheckpointDto[]>(`/api/sessions/${sessionId}/checkpoints`)
  }

  rollbackCheckpoint(sessionId: SessionId, checkpointId: CheckpointId): Promise<SessionDto> {
    return this.req<SessionDto>(`/api/sessions/${sessionId}/checkpoints/${checkpointId}/rollback`, {
      method: 'POST',
    })
  }

  /** GET /api/trust：文件夹信任清单 + 当前 cwd 有效档（工单 16.4 / ADR D37） */
  getTrust(): Promise<TrustStatusDto> {
    return this.req<TrustStatusDto>('/api/trust')
  }

  /** PUT /api/trust：设置一条目录信任档（引擎侧原子写） */
  setTrust(path: string, trust: 'trusted' | 'untrusted'): Promise<void> {
    return this.req<{ ok: boolean }>('/api/trust', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, trust }),
    }).then(() => undefined)
  }

  /** GET /api/extensions：扩展清单（工单 16.5 / ADR D38） */
  listExtensions(): Promise<ExtensionDto[]> {
    return this.req<ExtensionDto[]>('/api/extensions')
  }

  /** PUT /api/extensions/:id/enabled：启停扩展（重启档） */
  setExtensionEnabled(id: string, enabled: boolean): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/extensions/${encodeURIComponent(id)}/enabled`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then(() => undefined)
  }

  /** GET /api/sessions/:id/arena：竞答快照（工单 16.8 / ADR D42） */
  getArena(sessionId: SessionId): Promise<ArenaStatusDto | null> {
    return this.req<ArenaStatusDto | null>(`/api/sessions/${sessionId}/arena`)
  }

  /** POST /api/sessions/:id/arena/winner：应用胜者改动 */
  applyArenaWinner(sessionId: SessionId, contenderSessionId: SessionId): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/sessions/${sessionId}/arena/winner`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contenderSessionId }),
    }).then(() => undefined)
  }

  /** POST /api/sessions/:id/arena/cancel：取消竞答 */
  cancelArena(sessionId: SessionId): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/sessions/${sessionId}/arena/cancel`, {
      method: 'POST',
    }).then(() => undefined)
  }

  /** GET /api/arena/history?limit=20：竞答历史摘要（工单 19.10，翻案 D42 内存态） */
  listArenaHistory(limit?: number): Promise<ArenaHistoryDto> {
    const query = limit !== undefined ? `?limit=${limit}` : ''
    return this.req<ArenaHistoryDto>(`/api/arena/history${query}`)
  }


  listPermissionRules(): Promise<PermissionRuleDto[]> {
    return this.req<{ rules: PermissionRuleDto[] }>('/api/permissions/rules').then(
      (r) => r.rules,
    )
  }

  addPermissionRule(rule: PermissionRuleDto): Promise<void> {
    return this.req<{ ok: boolean }>('/api/permissions/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    }).then(() => undefined)
  }

  removePermissionRule(action: string, resource: string, scope?: 'user' | 'project'): Promise<void> {
    return this.req<{ ok: boolean }>('/api/permissions/rules', {
      method: 'DELETE',
      body: JSON.stringify({ action, resource, ...(scope !== undefined ? { scope } : {}) }),
    }).then(() => undefined)
  }

  listSecrets(): Promise<SecretStatusDto[]> {
    return this.req<{ secrets: SecretStatusDto[] }>('/api/secrets').then((r) => r.secrets)
  }

  setSecret(provider: string, value: string): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/secrets/${encodeURIComponent(provider)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }).then(() => undefined)
  }

  removeSecret(provider: string): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/secrets/${encodeURIComponent(provider)}`, {
      method: 'DELETE',
    }).then(() => undefined)
  }

  getPermissionPreset(sessionId: SessionId): Promise<PermissionPreset> {
    return this.req<{ preset: PermissionPreset }>(
      `/api/sessions/${sessionId}/permission-preset`,
    ).then((r) => r.preset)
  }

  setPermissionPreset(sessionId: SessionId, preset: PermissionPreset): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/sessions/${sessionId}/permission-preset`, {
      method: 'PUT',
      body: JSON.stringify({ preset }),
    }).then(() => undefined)
  }

  listModels(): Promise<ModelsDto> {
    return this.req<ModelsDto>('/api/models')
  }

  testModelProvider(providerId: string): Promise<ModelTestResultDto> {
    return this.req<ModelTestResultDto>(`/api/models/${encodeURIComponent(providerId)}/test`, {
      method: 'POST',
    })
  }

  setSessionModel(sessionId: SessionId, model: string): Promise<string> {
    return this.req<{ model: string }>(`/api/sessions/${sessionId}/model`, {
      method: 'PUT',
      body: JSON.stringify({ model }),
    }).then((r) => r.model)
  }

  setSessionEffort(sessionId: SessionId, effort: ReasoningEffort): Promise<ReasoningEffort> {
    return this.req<{ effort: ReasoningEffort }>(`/api/sessions/${sessionId}/effort`, {
      method: 'PUT',
      body: JSON.stringify({ effort }),
    }).then((r) => r.effort)
  }

  getRouting(): Promise<RoutingDto> {
    return this.req<RoutingDto>('/api/routing')
  }

  updateRouting(patch: RoutingUpdate): Promise<RoutingDto> {
    return this.req<RoutingDto>('/api/routing', {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
  }

  resetUsage(): Promise<RoutingDto> {
    return this.req<RoutingDto>('/api/routing/usage', { method: 'DELETE' })
  }

  getSettings(): Promise<SettingsDto> {
    return this.req<SettingsDto>('/api/settings')
  }

  updateSettings(patch: SettingsUpdate): Promise<SettingsDto> {
    return this.req<SettingsDto>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
  }

  listCommands(): Promise<CommandDto[]> {
    return this.req<CommandDto[]>('/api/commands')
  }

  executeCommand(sessionId: SessionId, name: string, args?: string): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/sessions/${sessionId}/commands/${encodeURIComponent(name)}`, {
      method: 'POST',
      // body 可省（无补充参数）；args 空串不发送——引擎侧 undefined 语义相同
      body: JSON.stringify(args !== undefined && args !== '' ? { args } : {}),
    }).then(() => undefined)
  }

  listMcpServers(): Promise<McpServerDto[]> {
    return this.req<McpServerDto[]>('/api/mcp')
  }

  /** GET /api/mcp/config：mcp.json 读回（RT3-07；env 值一律 MCP_ENV_MASK 占位） */
  getMcpConfig(): Promise<McpConfigInput> {
    return this.req<McpConfigInput>('/api/mcp/config')
  }

  listSkills(): Promise<SkillDto[]> {
    return this.req<SkillDto[]>('/api/skills')
  }

  listAgentPresets(): Promise<AgentPresetDto[]> {
    return this.req<AgentPresetDto[]>('/api/agents')
  }

  cleanupBrowserArtifacts(): Promise<BrowserCleanupResultDto> {
    return this.req<BrowserCleanupResultDto>('/api/browser/cleanup', { method: 'POST' })
  }

  listLspServers(): Promise<LspServerStatusDto[]> {
    return this.req<LspServerStatusDto[]>('/api/lsp')
  }

  installLspServer(id: string): Promise<LspInstallResultDto> {
    return this.req<LspInstallResultDto>('/api/lsp/install', {
      method: 'POST',
      body: JSON.stringify({ id }),
    })
  }

  /** GET /api/index/stats：索引库统计（工单 19.11） */
  indexStats(): Promise<IndexStatsDto> {
    return this.req<IndexStatsDto>('/api/index/stats')
  }

  /** 数据目录占用统计（阶段十九 19.37 第二批）：GET /api/storage/report */
  storageReport(): Promise<StorageReportDto> {
    return this.req<StorageReportDto>('/api/storage/report')
  }

  /** 桶清理（19.37 第三批）：POST /api/storage/cleanup */
  storageCleanup(bucket: string): Promise<StorageCleanupDto> {
    return this.req<StorageCleanupDto>('/api/storage/cleanup', {
      method: 'POST',
      body: JSON.stringify({ bucket }),
    })
  }

  /** 打包导出（19.37 第三批）：GET /api/storage/export */
  storageExport(): Promise<StorageExportDto> {
    return this.req<StorageExportDto>('/api/storage/export')
  }

  /** 回导（19.37 第三批）：POST /api/storage/import */
  storageImport(bundle: string): Promise<StorageImportDto> {
    return this.req<StorageImportDto>('/api/storage/import', {
      method: 'POST',
      body: JSON.stringify({ bundle }),
    })
  }

  /** 链接预览（19.21 / V2-24）：POST /api/link-preview（引擎侧 SSRF 防护） */
  fetchLinkPreview(url: string): Promise<LinkPreviewDto> {
    return this.req<LinkPreviewDto>('/api/link-preview', {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  }

  /** PUT /api/sessions/:id/title（阶段十九 19.20） */
  renameSession(sessionId: SessionId, title: string): Promise<SessionDto> {
    return this.req<SessionDto>(`/api/sessions/${sessionId}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    })
  }

  /** POST /api/feedback（阶段十九 19.19 / V2-25） */
  submitFeedback(input: FeedbackInput): Promise<FeedbackEntryDto> {
    return this.req<FeedbackEntryDto>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  /** GET /api/feedback（阶段十九 19.19；query 可选） */
  listFeedback(query?: FeedbackQuery): Promise<FeedbackEntryDto[]> {
    const params = new URLSearchParams()
    if (query?.sessionId !== undefined) params.set('sessionId', query.sessionId)
    if (query?.vote !== undefined) params.set('vote', query.vote)
    if (query?.limit !== undefined) params.set('limit', String(query.limit))
    const qs = params.toString()
    return this.req<FeedbackEntryDto[]>(`/api/feedback${qs === '' ? '' : `?${qs}`}`)
  }

  /** DELETE /api/feedback（阶段十九 19.19；撤回） */
  withdrawFeedback(sessionId: SessionId, eventId: EventId, vote: FeedbackVote): Promise<boolean> {
    return this.req<boolean>('/api/feedback', {
      method: 'DELETE',
      body: JSON.stringify({ sessionId, eventId, vote }),
    })
  }

  /** GET /api/prompts：提示词模板三槽位快照（阶段十九 19.18 / V2-16） */
  promptsInfo(): Promise<PromptsDto> {
    return this.req<PromptsDto>('/api/prompts')
  }

  /** PUT /api/prompts：写槽位模板（阶段十九 19.18；重启档） */
  updatePrompt(update: PromptsUpdate): Promise<PromptsDto> {
    return this.req<PromptsDto>('/api/prompts', {
      method: 'PUT',
      body: JSON.stringify(update),
    })
  }

  /** GET /api/sandbox/network：沙箱网络隔离代理运行时状态（阶段十九 19.7 / ADR D50） */
  sandboxNetworkStatus(): Promise<SandboxNetworkStatusDto> {
    return this.req<SandboxNetworkStatusDto>('/api/sandbox/network')
  }

  /** GET /api/logs：引擎日志尾部（阶段十九 19.38 / V2-14 诊断页） */
  getLogs(query?: LogsQuery): Promise<LogsDto> {
    const params = new URLSearchParams()
    if (query?.level !== undefined) params.set('level', query.level)
    if (query?.match !== undefined && query.match !== '') params.set('match', query.match)
    if (query?.limit !== undefined) params.set('limit', String(query.limit))
    const qs = params.toString()
    return this.req<LogsDto>(qs === '' ? '/api/logs' : `/api/logs?${qs}`)
  }

  /** POST /api/index/rebuild：清表重扫全量重建（等待完成回条目数；工单 19.11） */
  rebuildIndex(): Promise<RebuildResultDto> {
    return this.req<RebuildResultDto>('/api/index/rebuild', { method: 'POST' })
  }

  /** POST /api/index/vacuum：SQLite VACUUM 空间回收（工单 19.11） */
  vacuumIndex(): Promise<VacuumResultDto> {
    return this.req<VacuumResultDto>('/api/index/vacuum', { method: 'POST' })
  }

  /** POST /api/index/vectors/rebuild：向量索引增量补嵌（阶段十九 19.8 / ADR D51） */
  rebuildVectors(): Promise<RebuildVectorsResultDto> {
    return this.req<RebuildVectorsResultDto>('/api/index/vectors/rebuild', { method: 'POST' })
  }

  usageSummary(since?: string): Promise<UsageSummaryDto> {
    // since 缺省 = 不带查询串（全量），与无参调用同形
    const qs = since !== undefined ? `?since=${encodeURIComponent(since)}` : ''
    return this.req<UsageSummaryDto>(`/api/usage/summary${qs}`)
  }

  listMemories(): Promise<MemoryDto[]> {
    return this.req<MemoryDto[]>('/api/memories')
  }

  removeMemory(id: number): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/memories/${id}`, { method: 'DELETE' }).then(
      () => undefined,
    )
  }

  listAutomation(): Promise<AutomationTriggerDto[]> {
    return this.req<AutomationTriggerDto[]>('/api/automation')
  }

  createAutomation(input: AutomationCreate): Promise<AutomationTriggerDto> {
    return this.req<AutomationTriggerDto>('/api/automation', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  removeAutomation(id: string): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/automation/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).then(() => undefined)
  }

  setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/automation/${encodeURIComponent(id)}/enabled`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }).then(() => undefined)
  }

  listAutomationRuns(limit?: number): Promise<AutomationRunDto[]> {
    const query = limit !== undefined ? `?limit=${limit}` : ''
    return this.req<AutomationRunDto[]>(`/api/automation/runs${query}`)
  }

  fireAutomationWebhook(id: string): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/automation/webhook/${encodeURIComponent(id)}`, {
      method: 'POST',
    }).then(() => undefined)
  }

  fireAutomationManual(id: string): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/automation/${encodeURIComponent(id)}/run`, {
      method: 'POST',
    }).then(() => undefined)
  }

  listAudit(query?: AuditQuery): Promise<AuditEntryDto[]> {
    const params = new URLSearchParams()
    if (query !== undefined) {
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      if (query.kind !== undefined) params.set('kind', query.kind)
      if (query.result !== undefined) params.set('result', query.result)
      if (query.tool !== undefined) params.set('tool', query.tool)
      if (query.since !== undefined) params.set('since', String(query.since))
    }
    const qs = params.toString()
    return this.req<AuditEntryDto[]>(`/api/audit${qs !== '' ? `?${qs}` : ''}`)
  }

  search(q: string, limit?: number): Promise<SearchHitDto[]> {
    const params = new URLSearchParams({ q })
    if (limit !== undefined) params.set('limit', String(limit))
    return this.req<SearchHitDto[]>(`/api/search?${params.toString()}`)
  }

  listFs(sessionId: SessionId, path = ''): Promise<FsListDto> {
    // path 空串 = 列举 cwd 根（不带查询串，与缺省同形）
    const qs = path === '' ? '' : `?path=${encodeURIComponent(path)}`
    return this.req<FsListDto>(`/api/sessions/${sessionId}/fs${qs}`)
  }


  /** GET /api/sessions/:id/fs/tree?path=：递归文件树（工单 12.5；深度 ≤4、条目 ≤500） */
  listFsTree(sessionId: SessionId, path = ''): Promise<FsTreeDto> {
    // path 空串 = 树根（不带查询串，与 listFs 同形）
    const qs = path === '' ? '' : `?path=${encodeURIComponent(path)}`
    return this.req<FsTreeDto>(`/api/sessions/${sessionId}/fs/tree${qs}`)
  }


  /** POST /api/sessions/:id/attachments：raw 图片字节（工单 12.2a；x-file-name 头带原始名） */
  uploadAttachment(
    sessionId: SessionId,
    file: { name: string; mime: string; bytes: Uint8Array },
  ): Promise<AttachmentDto> {
    return this.req<AttachmentDto>(`/api/sessions/${sessionId}/attachments`, {
      method: 'POST',
      headers: {
        'content-type': file.mime,
        'x-file-name': encodeURIComponent(file.name),
      },
      // Uint8Array 在 Node/DOM/RN 三套 lib 下均为合法 fetch body（类型面差异用宽化收口）
      body: file.bytes as unknown as Parameters<typeof fetch>[1] extends infer I ? I extends { body?: infer B } ? B : never : never,
    })
  }

  /** POST /api/transcribe：语音转写（工单 16.6；JSON base64 直传——音频体量小，multipart 无必要） */
  transcribe(req: TranscribeRequest): Promise<TranscribeResultDto> {
    return this.req<TranscribeResultDto>('/api/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
  }

  /** PUT /api/mcp：整文件校验后原子写（工单 12.6） */
  updateMcpConfig(config: McpConfigInput): Promise<{ ok: true }> {
    return this.req<{ ok: true }>('/api/mcp', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    })
  }

  getPairStatus(): Promise<PairStatusDto> {
    return this.req<PairStatusDto>('/api/pair')
  }

  createPairCode(): Promise<PairCodeDto> {
    return this.req<PairCodeDto>('/api/pair/code', { method: 'POST' })
  }

  redeemPair(body: PairRedeemBody): Promise<PairTokenDto> {
    return this.req<PairTokenDto>('/api/pair', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  revokePairDevice(id: string): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/pair/devices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).then(() => undefined)
  }

  dispose(): void {
    this.disposed = true
    // Core 内部 abort 的正是 connectSseOnce 交给 fetch 的那条 signal
    this.stream?.dispose()
    this.handlers.clear()
  }

  protected assertNotDisposed(): void {
    if (this.disposed) throw new Error('E_HTTP_DISPOSED: HttpTransport 已 dispose')
  }
}

export interface SessionEventSourceOptions {
  baseUrl: string
  sessionId: SessionId
  /** 首连回放水位：服务端补发 seq>since 的 durable（0 = 全量回放） */
  since?: number
  backoffMs?: readonly number[]
  onStatus?: (s: HttpConnectionStatus) => void
  onEvent?: (e: SparkEventEnvelope) => void
  /** 配对长效 token（工单 9.1 / D24）：SSE URL 附 &token=（服务端 tokenOf 双口径） */
  authToken?: string
}

/**
 * 会话级 SSE 续播流（server §7.3 /api/event?sessionId&since，opencode 语义）：
 * 首连 = 回放 seq>since 的 durable + 直播；断线自动退避重连，since = 已收 durable 水位
 * （取最大 seq）——续播不丢不重、无需全量重放。帧解析/泵读/退避与全局通道同一实现
 * （SessionStreamCore + connectSseOnce），失败闭合同纪律（坏帧断开重连；dispose 后不再重连）。
 */
export class SessionEventSource {
  private readonly core: SessionStreamCore

  constructor(opts: SessionEventSourceOptions) {
    this.core = new SessionStreamCore({
      baseUrl: opts.baseUrl,
      sessionId: opts.sessionId,
      ...(opts.since !== undefined ? { since: opts.since } : {}),
      ...(opts.backoffMs !== undefined ? { backoffMs: opts.backoffMs } : {}),
      ...(opts.authToken !== undefined ? { authToken: opts.authToken } : {}),
      ...(opts.onStatus !== undefined ? { onStatus: opts.onStatus } : {}),
      ...(opts.onEvent !== undefined ? { onEvent: opts.onEvent } : {}),
      connectOnce: connectSseOnce,
    })
  }

  /** 当前回放水位（已收 durable 最大 seq）——切换会话/重建流时作 since */
  get since(): number {
    return this.core.since
  }

  dispose(): void {
    this.core.dispose()
  }
}
