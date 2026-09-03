/**
 * Transport 内核（工单 8.1 / ADR D22 四端共享资产）：自 apps/web 下沉，web 与 cli 共用。
 * 运行时中立——只用 fetch/ReadableStream/TextDecoder/AbortController 全局（浏览器与 Node 24 同构），
 * protocol 依赖纪律不变（除 zod 无运行时依赖）。
 * 1) HttpTransport：REST 全方法 + 全局 SSE 单连接（直播全部会话），断线指数退避重连，
 *    重连成功 onResync 通知已打开会话集合（调用方做全量回放——冷启动与断线重连同一路径）。
 * 2) envelopeFromSseFrame：SSE 单帧 → 信封的共享解析（注释帧/无 data 帧 → null；
 *    ignorable 未知扩展事件跳过；坏帧抛错由调用方驱动断开重连——失败闭合）。
 * 3) REST 错误映射：非 2xx 读错误体 {code, message} 抛 `Error("code: message")`（文案表单一来源）。
 */
import { eventSchemaOf } from './extend.js'
import { parseEnvelope } from './schema.js'
import type { SparkEventEnvelope } from './events.js'
import type {
  AuditEntryDto,
  AuditQuery,
  AutomationCreate,
  AutomationRunDto,
  AutomationTriggerDto,
  CheckpointDto,
  CommandDto,
  FsListDto,
  McpServerDto,
  MemoryDto,
  ModelTestResultDto,
  ModelsDto,
  PairCodeDto,
  PairRedeemBody,
  PairStatusDto,
  PairTokenDto,
  PermissionPreset,
  PermissionRuleDto,
  RoutingDto,
  RoutingUpdate,
  SecretStatusDto,
  SearchHitDto,
  SessionDto,
  SessionEventsQuery,
  SettingsDto,
  SettingsUpdate,
  SkillDto,
  TreeNodeDto,
} from './api.js'
import type { CheckpointId, EventId, RequestId, SessionId } from './ids.js'
import type { PermissionReply, ReasoningEffort } from './primitives.js'
import type { SendMessageOptions, SubmitOutcome, Transport } from './transport.js'

/** §6.6：指数退避 1/2/5/10s 封顶 */
export const DEFAULT_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10_000]

export type HttpConnectionStatus = 'connecting' | 'open' | 'reconnecting'

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

/** server 错误体（§7.4）：{code, message} */
interface ErrorBody {
  code?: string
  message?: string
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

/** 可被 abort 打断的延时（退避重连用） */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
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

export class HttpTransport implements Transport {
  protected readonly base: string
  private readonly backoffMs: readonly number[]
  private readonly opts: HttpTransportOptions
  private readonly authToken: string | undefined
  private readonly handlers = new Set<(e: SparkEventEnvelope) => void>()
  private readonly abort = new AbortController()
  private readonly openSessions = new Set<SessionId>()
  private disposed = false
  private everOpen = false
  private retries = 0

  constructor(opts: HttpTransportOptions = {}) {
    this.opts = opts
    this.base = opts.baseUrl ?? ''
    this.authToken = opts.authToken
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS
    if (opts.eventStream !== false) {
      this.setStatus('connecting')
      void this.loop()
    }
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

  /** SSE 主循环：连接 → 泵读 → 断开 → 退避重连（dispose 或 abort 退出） */
  protected async loop(): Promise<void> {
    while (!this.disposed) {
      try {
        // SSE 无法自定义头：token 走 ?token= 查询参数（服务端 tokenOf 双口径，工单 9.1）
        const url = `${this.base}/api/event${
          this.authToken !== undefined ? `?token=${encodeURIComponent(this.authToken)}` : ''
        }`
        const res = await fetch(url, {
          signal: this.abort.signal,
          headers: { accept: 'text/event-stream' },
        })
        if (!res.ok || res.body === null) {
          throw new Error(`SSE 连接失败：HTTP ${res.status}`)
        }
        this.retries = 0
        this.setStatus('open')
        // 首连无需重放（无旧快照）；重连成功才 resync（§6.10 时序④）
        if (this.everOpen) this.opts.onResync?.([...this.openSessions])
        this.everOpen = true
        await pumpSseStream(res.body, (e) => {
          for (const h of [...this.handlers]) h(e)
        })
        // 流正常结束（server 优雅退出 bye 帧后关闭）——走重连
      } catch {
        if (this.disposed || this.abort.signal.aborted) return
      }
      if (this.disposed) return
      this.setStatus('reconnecting')
      const delay = this.backoffMs[Math.min(this.retries, this.backoffMs.length - 1)] ?? 1000
      this.retries++
      await abortableSleep(delay, this.abort.signal)
      if (this.disposed) return
    }
  }

  /** 记录已打开会话（重连 resync 集合，§6.6 要点 2） */
  protected noteOpenSession(sessionId: SessionId): void {
    this.openSessions.add(sessionId)
  }

  // ---------- REST ----------

  /** 统一请求：非 2xx 读错误体 {code,message} 抛 `code: message`；JSON 响应直返 */
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
      let code = `HTTP_${res.status}`
      let message = res.statusText
      try {
        const body = (await res.json()) as ErrorBody
        if (typeof body.code === 'string') code = body.code
        if (typeof body.message === 'string') message = body.message
      } catch {
        // 非 JSON 错误体：保留 HTTP 状态信息（状态码与 statusText 已足够定位）
      }
      throw new Error(`${code}: ${message}`)
    }
    return (await res.json()) as T
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

  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/permissions/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({ reply, ...(feedback !== undefined ? { feedback } : {}) }),
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

  listSessions(): Promise<SessionDto[]> {
    return this.req<SessionDto[]>('/api/sessions')
  }

  createSession(opts?: { title?: string; model?: string }): Promise<SessionDto> {
    const body: Record<string, string> = {}
    if (opts?.title !== undefined) body['title'] = opts.title
    if (opts?.model !== undefined) body['model'] = opts.model
    return this.req<SessionDto>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  getTree(sessionId: SessionId): Promise<TreeNodeDto[]> {
    return this.req<TreeNodeDto[]>(`/api/sessions/${sessionId}/tree`)
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

  removePermissionRule(action: string, resource: string): Promise<void> {
    return this.req<{ ok: boolean }>('/api/permissions/rules', {
      method: 'DELETE',
      body: JSON.stringify({ action, resource }),
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

  listSkills(): Promise<SkillDto[]> {
    return this.req<SkillDto[]>('/api/skills')
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
    this.abort.abort()
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
 * （取最大 seq）——续播不丢不重、无需全量重放。帧解析/泵读/退避与全局通道同一实现，
 * 失败闭合同纪律（坏帧断开重连；dispose 后不再重连）。
 */
export class SessionEventSource {
  private readonly opts: SessionEventSourceOptions
  private readonly backoffMs: readonly number[]
  private readonly abort = new AbortController()
  private watermark: number
  private disposed = false
  private retries = 0

  constructor(opts: SessionEventSourceOptions) {
    this.opts = opts
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS
    this.watermark = opts.since ?? 0
    this.setStatus('connecting')
    void this.loop()
  }

  /** 当前回放水位（已收 durable 最大 seq）——切换会话/重建流时作 since */
  get since(): number {
    return this.watermark
  }

  dispose(): void {
    this.disposed = true
    this.abort.abort()
  }

  private setStatus(s: HttpConnectionStatus): void {
    this.opts.onStatus?.(s)
  }

  private async loop(): Promise<void> {
    while (!this.disposed) {
      try {
        let url = `${this.opts.baseUrl}/api/event?sessionId=${this.opts.sessionId}&since=${this.watermark}`
        if (this.opts.authToken !== undefined) url += `&token=${encodeURIComponent(this.opts.authToken)}`
        const res = await fetch(url, {
          signal: this.abort.signal,
          headers: { accept: 'text/event-stream' },
        })
        if (!res.ok || res.body === null) {
          throw new Error(`SSE 连接失败：HTTP ${res.status}`)
        }
        this.retries = 0
        this.setStatus('open')
        await pumpSseStream(res.body, (e) => {
          if (e.seq !== undefined && e.seq > this.watermark) this.watermark = e.seq
          this.opts.onEvent?.(e)
        })
      } catch {
        if (this.disposed || this.abort.signal.aborted) return
      }
      if (this.disposed) return
      this.setStatus('reconnecting')
      const delay = this.backoffMs[Math.min(this.retries, this.backoffMs.length - 1)] ?? 1000
      this.retries++
      await abortableSleep(delay, this.abort.signal)
      if (this.disposed) return
    }
  }
}
