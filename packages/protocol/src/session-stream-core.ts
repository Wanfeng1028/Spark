/**
 * 会话流状态机内核（工单 R-B.5 / ADR D22 四端共享资产）：重连循环 + 指数退避 +
 * 水位推进 + 401/403 鉴权收敛 + dispose/generation 防竞态。四份逐字近似的实现合一
 * （transport-node.ts 的 HttpTransport.loop 与 SessionEventSource.loop、
 * mobile rn-event-source.ts、miniapp mini-event-source.ts）。
 *
 * 平台差异不进内核：怎么建一条连接由各端注入 connectOnce 钩子——Node/浏览器用
 * fetch+ReadableStream、RN 用 react-native-sse（含 G4 库自行轮询重开的偏离）、
 * 小程序用 Taro.request 分块（含 I1 headers/then 双路鉴权闸门）与轮询降级。
 * 内核只管「一次连接结束后该退避多久、该不该继续、状态该报什么」。
 *
 * 运行时中立：只用 setTimeout/AbortController 全局（浏览器与 Node 24 同构），
 * protocol 依赖纪律不变（除 zod 无运行时依赖）。
 */
import type { SparkEventEnvelope } from './events.js'
import type { SessionId } from './ids.js'

/** §6.6：指数退避 1/2/5/10s 封顶 */
export const DEFAULT_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10_000]

/** 健康空闲后的续轮间隔（miniapp 轮询降级：取到一轮数据 → 固定 3s 后再轮，不退避） */
const DEFAULT_IDLE_DELAY_MS = 3000

/** 连续鉴权失败上限：达到即进 closed 终态（mobile 评审 G5 / miniapp 同律） */
const AUTH_FAILURE_LIMIT = 3

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
 * 连接态四态（四端逐字同；前三态文案见 ui-copy.ts CONNECTION_TEXT）。
 * closed = 终态，不再重连，由内核的鉴权收敛独占发出（dispose 是静默退出，不发 closed——
 * 主动关闭无需 UI 呈现"连接已停止"）。closed 的人话文案各端本地：触发源语义分叉
 * （鉴权终态 vs 配置 invalidate），见 ui-copy.ts 头注释边界说明 1。
 */
export type StreamConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** connectOnce 的返回值：本次连接为何结束（省略 = 'disconnected'） */
export type ConnectOutcome =
  /** 流断开或失败（含服务端正常关流）：报 reconnecting 并走退避序列 */
  | 'disconnected'
  /** 健康空闲（miniapp 轮询取到一轮数据）：按 idleDelayMs 续轮，不报断线不退避 */
  | 'idle'

/** 内核交给平台侧 connectOnce 钩子的可写面（状态机权威仍在内核，钩子只能报事实） */
export interface StreamCoreContext {
  /** 本代际是否已失效（dispose 或换代）：平台侧的迟到回调据此即刻收敛，不再驱动状态机 */
  stale(): boolean
  /** 本次连接该用的 URL（会话级带 sessionId+since 水位；全局流只带 token） */
  url(): string
  /** dispose 的 abort 信号：接线到底层连接，空闲时（心跳是注释帧、无回调）也能即刻断开 */
  readonly signal: AbortSignal
  /** 当前回放水位（已收最大 seq）：轮询降级据此过滤尾部切片 */
  since(): number
  /** 连接建立或仍健康：退避与鉴权计数复位 + 报 open（可高频调用，幂等） */
  noteOpen(): void
  /** 收到一条信封：推进水位（取最大 seq 防乱序）后交 onEvent */
  noteEnvelope(e: SparkEventEnvelope): void
  /** 401/403：同一错误码只上抛一次；连续达上限进 closed 终态 */
  noteAuthFailure(status: number): void
  /**
   * 补报一次 reconnecting（平台偏离专用）。react-native-sse 对服务端正常关流不派发
   * error 而是自行约 5s 轮询重开（mobile 评审 G4）——端侧探测到同实例第二次 open 时
   * 先补报 reconnecting 再 noteOpen，状态机不撒谎。
   */
  reportReconnecting(): void
}

/** 平台侧单次连接实现：resolve = 本次连接结束，内核接着决定退避重连还是续轮 */
export type ConnectOnce = (ctx: StreamCoreContext) => Promise<ConnectOutcome | void>

export interface SessionStreamCoreOptions {
  baseUrl: string
  /** 会话级流给 sessionId（URL 带 sessionId+since）；全局流（直播全部会话）省略 */
  sessionId?: SessionId
  /** 首连回放水位：服务端补发 seq>since 的 durable（0 = 全量回放） */
  since?: number
  /** 退避序列（测试注入缩短）；末位封顶 */
  backoffMs?: readonly number[]
  /** connectOnce 返回 'idle' 后的续轮间隔（缺省 3s） */
  idleDelayMs?: number
  /** 配对长效 token（工单 9.1 / D24）：SSE 无法自定义头 → URL 附 ?token=（服务端双口径） */
  authToken?: string
  onStatus?: (s: StreamConnectionStatus) => void
  onEvent?: (e: SparkEventEnvelope) => void
  /** 鉴权失败（401/403）人话错误源：`E_AUTH: ...`（调用方走 ERROR_COPY 呈现） */
  onError?: (err: Error) => void
  /** 非首次 open（重连成功）：全局流据此驱动全量重放（§6.10 时序④ 的 onResync） */
  onReopen?: () => void
  connectOnce: ConnectOnce
}

export class SessionStreamCore {
  private readonly opts: SessionStreamCoreOptions
  private readonly backoffMs: readonly number[]
  private readonly idleDelayMs: number
  private readonly abort = new AbortController()
  private watermark: number
  private disposed = false
  private retries = 0
  /** 代际计数：dispose 后残余回调不再驱动状态机（防竞态） */
  private generation = 0
  /** 是否曾成功连过：非首次 open = 重连成功 → onReopen（首连无旧快照，不需重放） */
  private openedOnce = false
  /** 鉴权收敛：连续失败计数（达上限进终态）；同一错误码去重标记（重连成功复位） */
  private authFailures = 0
  private lastAuthErrorCode: string | null = null

  constructor(opts: SessionStreamCoreOptions) {
    this.opts = opts
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS
    this.idleDelayMs = opts.idleDelayMs ?? DEFAULT_IDLE_DELAY_MS
    this.watermark = opts.since ?? 0
    this.setStatus('connecting')
    void this.loop()
  }

  /** 当前回放水位（已收最大 seq）——切换会话/重建流时作 since */
  get since(): number {
    return this.watermark
  }

  dispose(): void {
    this.disposed = true
    this.generation++
    this.abort.abort()
  }

  private setStatus(s: StreamConnectionStatus): void {
    this.opts.onStatus?.(s)
  }

  /**
   * 本次连接的 URL。会话级流带 sessionId + since 水位（每次重连重取——续播不丢不重）；
   * 全局流省略 sessionId。刻意用字符串拼接而非 URLSearchParams：与原四份实现逐字等价
   * （sessionId 是 nanoid 字符集、since 是数字，都不需编码；只有 token 需要）。
   */
  private buildUrl(): string {
    const token =
      this.opts.authToken !== undefined ? `token=${encodeURIComponent(this.opts.authToken)}` : null
    if (this.opts.sessionId !== undefined) {
      const qs = `sessionId=${this.opts.sessionId}&since=${this.watermark}`
      return `${this.opts.baseUrl}/api/event?${qs}${token !== null ? `&${token}` : ''}`
    }
    return `${this.opts.baseUrl}/api/event${token !== null ? `?${token}` : ''}`
  }

  /** 每代际一个上下文：闭包捕获的 gen 不可变，平台侧迟到回调据此判定 stale */
  private contextFor(gen: number): StreamCoreContext {
    return {
      stale: () => this.disposed || this.generation !== gen,
      url: () => this.buildUrl(),
      signal: this.abort.signal,
      since: () => this.watermark,
      noteOpen: () => this.noteOpen(),
      noteEnvelope: (e) => this.noteEnvelope(e),
      noteAuthFailure: (status) => this.noteAuthFailure(status),
      reportReconnecting: () => this.setStatus('reconnecting'),
    }
  }

  /** 连接建立或仍健康：计数复位 + 报 open（miniapp 每个分块都调，幂等） */
  private noteOpen(): void {
    const reopen = this.openedOnce
    this.openedOnce = true
    this.retries = 0
    // 重连成功：鉴权收敛计数与错误码去重复位（mobile 评审 G5）
    this.authFailures = 0
    this.lastAuthErrorCode = null
    this.setStatus('open')
    // 首连无需重放（无旧快照）；重连成功才通知调用方 resync（§6.10 时序④）
    if (reopen) this.opts.onReopen?.()
  }

  private noteEnvelope(e: SparkEventEnvelope): void {
    if (e.seq !== undefined && e.seq > this.watermark) this.watermark = e.seq
    this.opts.onEvent?.(e)
  }

  /**
   * 401/403 收敛（mobile 评审 G5 / miniapp 同律）：同一错误码只上抛一次（重连成功复位）；
   * 连续达上限进 closed 终态——停止重连，不再发请求（配置修复需重建实例）。
   * 缺省 127.0.0.1 无鉴权部署下本方法永不被调用（行为不变红线）。
   */
  private noteAuthFailure(status: number): void {
    const code = `E_AUTH_${status}`
    if (this.lastAuthErrorCode !== code) {
      this.lastAuthErrorCode = code
      this.opts.onError?.(new Error(`E_AUTH: 事件流鉴权失败（HTTP ${status}）`))
    }
    this.authFailures++
    if (this.authFailures >= AUTH_FAILURE_LIMIT) {
      this.disposed = true
      // 终态：发 closed 让 UI 收敛（不滞留 reconnecting 谎报——miniapp 评审 I2）
      this.setStatus('closed')
    }
  }

  private async loop(): Promise<void> {
    while (!this.disposed) {
      const gen = this.generation
      let outcome: ConnectOutcome | void
      try {
        outcome = await this.opts.connectOnce(this.contextFor(gen))
      } catch {
        // 平台钩子抛错 = 本次连接失败：与正常断开同路径（失败闭合，不让 loop 悬空）
        outcome = 'disconnected'
      }
      if (this.disposed || this.abort.signal.aborted) return
      if (this.generation !== gen) continue
      if (outcome === 'idle') {
        // 健康空闲（轮询取到一轮数据）：固定间隔续轮，不报断线不退避
        await abortableSleep(this.idleDelayMs, this.abort.signal)
        continue
      }
      // 失败闭合：任何断开一律退避重连（坏帧/网络/鉴权同路径自愈）
      this.setStatus('reconnecting')
      const delay = this.backoffMs[Math.min(this.retries, this.backoffMs.length - 1)] ?? 1000
      this.retries++
      await abortableSleep(delay, this.abort.signal)
    }
  }
}
