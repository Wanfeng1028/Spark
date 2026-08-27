/**
 * HttpTransport（doc/02 §6.6 要点 / §4.6 订阅语义）：真实引擎通道。
 * 1) SSE 全局单连接：GET /api/event（省略 sessionId——直播全部会话）+ ReadableStream
 *    手解析（不用原生 EventSource：无法自定义重连参数；帧格式固定无需引 eventsource-parser）。
 * 2) 断线指数退避 1/2/5/10s 封顶重连；重连成功后 onResync 通知已打开会话集合
 *    （context 层执行 getSession → resetSlice → 批量 apply，冷启动与断线重连同一路径）。
 * 3) REST fetch：sendMessage 三态原样返回；错误体 {code,message} 抛 Error（code: message）。
 * 4) dispose：abort SSE + 清订阅；此后一切调用抛错（不静默）。
 */
import { eventSchemaOf, parseEnvelope } from '@spark/protocol'
import type {
  CheckpointDto,
  CheckpointId,
  CommandDto,
  EventId,
  McpServerDto,
  ModelTestResultDto,
  ModelsDto,
  PermissionPreset,
  PermissionReply,
  PermissionRuleDto,
  RequestId,
  RoutingDto,
  RoutingUpdate,
  SecretStatusDto,
  SessionDto,
  SessionId,
  SkillDto,
  SparkEventEnvelope,
  SubmitOutcome,
  TreeNodeDto,
  Transport,
} from '@spark/protocol'
import type { SendMessageOptions } from '@spark/protocol'

/** §6.6：指数退避 1/2/5/10s 封顶 */
const DEFAULT_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10_000]

export type HttpConnectionStatus = 'connecting' | 'open' | 'reconnecting'

export interface HttpTransportOptions {
  /** API 基址：缺省同源（dev 走 vite proxy → 127.0.0.1:4318；VITE_SPARK_API 覆盖） */
  baseUrl?: string
  /** 退避序列（测试注入缩短）；末位封顶 */
  backoffMs?: readonly number[]
  /** 连接状态变化（context 层写 connection-store） */
  onStatus?: (s: HttpConnectionStatus) => void
  /** 重连成功后的重放通知（曾成功连过又断开的场景；context 层做 resetSlice 重放） */
  onResync?: (sids: readonly SessionId[]) => void
}

/** server 错误体（§7.4）：{code, message} */
interface ErrorBody {
  code?: string
  message?: string
}

export class HttpTransport implements Transport {
  private readonly base: string
  private readonly backoffMs: readonly number[]
  private readonly opts: HttpTransportOptions
  private readonly handlers = new Set<(e: SparkEventEnvelope) => void>()
  private readonly abort = new AbortController()
  private readonly openSessions = new Set<SessionId>()
  private disposed = false
  private everOpen = false
  private retries = 0

  constructor(opts: HttpTransportOptions = {}) {
    this.opts = opts
    this.base = opts.baseUrl ?? import.meta.env.VITE_SPARK_API ?? ''
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS
    this.setStatus('connecting')
    void this.loop()
  }

  // ---------- 事件流 ----------

  onEvent(handler: (e: SparkEventEnvelope) => void): () => void {
    this.assertNotDisposed()
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  private setStatus(s: HttpConnectionStatus): void {
    this.opts.onStatus?.(s)
  }

  /** SSE 主循环：连接 → 泵读 → 断开 → 退避重连（dispose 或 abort 退出） */
  private async loop(): Promise<void> {
    while (!this.disposed) {
      try {
        const res = await fetch(`${this.base}/api/event`, {
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
        await this.pump(res.body)
        // 流正常结束（server 优雅退出 bye 帧后关闭）——走重连
      } catch {
        if (this.disposed || this.abort.signal.aborted) return
      }
      if (this.disposed) return
      this.setStatus('reconnecting')
      const delay = this.backoffMs[Math.min(this.retries, this.backoffMs.length - 1)] ?? 1000
      this.retries++
      await sleep(delay, this.abort.signal)
      if (this.disposed) return
    }
  }

  /** ReadableStream → 帧切分（\n\n）→ 信封分发；坏帧冒泡断开走重连（失败闭合） */
  private async pump(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      for (;;) {
        const idx = buf.indexOf('\n\n')
        if (idx === -1) break
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        this.handleFrame(frame)
      }
    }
  }

  /** 单帧：注释帧（: connected / : heartbeat）忽略；data: 行 JSON → parseEnvelope 校验后分发 */
  private handleFrame(frame: string): void {
    if (frame.startsWith(':')) return
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))
    if (dataLine === undefined) return // event: bye 等无 data 帧——连接关闭由流结束驱动
    const payload: unknown = JSON.parse(dataLine.slice('data: '.length))
    // 插件扩展事件（工单 5.5 / ADR D18）：本端未注册词表的 ignorable 帧跳过
    // （与引擎 SessionStore 读端同策略——不因未装插件断流重连）
    const p = payload as { type?: unknown; ignorable?: unknown }
    if (
      p.ignorable === true &&
      typeof p.type === 'string' &&
      eventSchemaOf(p.type) === undefined
    ) {
      return
    }
    const envelope = parseEnvelope(payload) // 非法信封抛错 → pump 冒泡 → 断开重连自愈
    for (const h of [...this.handlers]) h(envelope)
  }

  // ---------- REST ----------

  /** 统一请求：非 2xx 读错误体 {code,message} 抛 `code: message`；JSON 响应直返 */
  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    this.assertNotDisposed()
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
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

  async getSession(sessionId: SessionId): Promise<SessionDto> {
    const dto = await this.req<SessionDto>(`/api/sessions/${sessionId}`)
    this.openSessions.add(sessionId) // 重连 resync 集合（§6.6 要点 2）
    return dto
  }

  listSessions(): Promise<SessionDto[]> {
    return this.req<SessionDto[]>('/api/sessions')
  }

  createSession(opts?: { title?: string }): Promise<SessionDto> {
    return this.req<SessionDto>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(opts?.title !== undefined ? { title: opts.title } : {}),
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

  dispose(): void {
    this.disposed = true
    this.abort.abort()
    this.handlers.clear()
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('E_HTTP_DISPOSED: HttpTransport 已 dispose')
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
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
