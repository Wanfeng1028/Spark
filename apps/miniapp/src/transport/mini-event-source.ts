/**
 * 小程序会话级事件流（工单 9.4——SessionEventSource 的微信小程序适配）。
 *
 * 主路径（SSE）：小程序无 EventSource/fetch/ReadableStream——用
 * `Taro.request({ enableChunked: true })` 的 onChunkReceived（ArrayBuffer 分块）
 * 自解帧：字节 → Utf8StreamDecoder → splitSseFrames → envelopeFromSseFrame
 * （全部 @spark/protocol 共享资产，与四端同口径）。基础库门槛 2.20.2（support.ts）。
 *
 * 降级路径（轮询）：低基础库或分块连接异常（未收到任何数据即失败，且非鉴权问题）
 * 时退化为定时 `GET /api/sessions/:id?limit=200` 取尾部、过滤 seq>水位补齐事件。
 * 取舍：轮询时延 ~3s 且多 REST 开销，但保证低端设备可用；两路共用同一帧解析与
 * seq 去重口径（applyEvent 去重），切换重叠期不重复投影。进入轮询后本实例生命期内
 * 不再回试 SSE（避免在两路间振荡；重建实例即重新探测）。
 *
 * 契约对齐 RN 端 RnSessionEventSource：connecting/open/reconnecting 三态 + since
 * 水位续播 + 退避序列 1/2/5/10s（DEFAULT_BACKOFF_MS）+ 鉴权收敛（连续 3 次
 * 401/403 进终态；同一错误码 onError 只上抛一次，重连成功复位）。
 */
import Taro from '@tarojs/taro'
import type { SessionId, SparkEventEnvelope } from '@spark/protocol'
import { DEFAULT_BACKOFF_MS, abortableSleep } from '@spark/protocol'
import { MiniRestClient } from './rest'
import { SseFramePump } from './sse-pump'
import { filterFreshEvents } from './poll'
import { sdkSupportsChunked } from './support'

export type MiniConnectionStatus = 'connecting' | 'open' | 'reconnecting'

/** 轮询降级参数：3s 一轮（时延与开销折中）；尾部切片 200（服务端上限） */
const POLL_INTERVAL_MS = 3000
const POLL_PAGE_LIMIT = 200

export interface MiniSessionEventSourceOptions {
  baseUrl: string
  sessionId: SessionId
  /** 首连回放水位：服务端补发 seq>since 的 durable（0 = 全量回放） */
  since?: number
  backoffMs?: readonly number[]
  onStatus?: (s: MiniConnectionStatus) => void
  onEvent?: (e: SparkEventEnvelope) => void
  /** 鉴权失败（401/403）人话错误源：`E_AUTH: ...`（调用方走 ERROR_COPY 呈现） */
  onError?: (err: Error) => void
  /** 配对长效 token（工单 9.1 / D24）：SSE URL 附 &token=（服务端双口径） */
  authToken?: string
  /** 强制轮询模式（调试/低端机排查用） */
  forcePolling?: boolean
  /** 分块能力注入（测试用）；缺省读基础库版本探测 */
  chunkedSupported?: boolean
  /** 轮询间隔注入（测试用） */
  pollIntervalMs?: number
}

/** Taro.request 任务的最小结构面（chunked 回调在部分类型档未暴露——收窄自用） */
interface ChunkRequestTask {
  abort(option?: { errMsg?: string }): void
  onChunkReceived(callback: (res: { data: ArrayBuffer }) => void): void
  onHeadersReceived(callback: (res: { statusCode: number }) => void): void
}

export class MiniSessionEventSource {
  private readonly opts: MiniSessionEventSourceOptions
  private readonly backoffMs: readonly number[]
  private readonly abort = new AbortController()
  private readonly rest: MiniRestClient
  private watermark: number
  private disposed = false
  private retries = 0
  /** 代际计数：close 后残余回调不再驱动状态机（防竞态，同 RN 口径） */
  private generation = 0
  /** 鉴权收敛：连续失败计数（≥3 进终态）；同一错误码去重标记（重连成功复位） */
  private authFailures = 0
  private lastAuthErrorCode: string | null = null
  /** 传输模式：SSE 主路径 / 轮询降级（生命期内单向降级，不回试） */
  private mode: 'sse' | 'polling'

  constructor(opts: MiniSessionEventSourceOptions) {
    this.opts = opts
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS
    this.watermark = opts.since ?? 0
    this.rest = new MiniRestClient({
      baseUrl: opts.baseUrl,
      ...(opts.authToken !== undefined ? { token: opts.authToken } : {}),
    })
    const chunked =
      opts.chunkedSupported ?? sdkSupportsChunked(Taro.getSystemInfoSync().SDKVersion ?? '')
    this.mode = opts.forcePolling === true || !chunked ? 'polling' : 'sse'
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

  private setStatus(s: MiniConnectionStatus): void {
    this.opts.onStatus?.(s)
  }

  private async loop(): Promise<void> {
    while (!this.disposed) {
      const gen = this.generation
      if (this.mode === 'polling') {
        const ok = await this.pollOnce(gen)
        if (this.disposed || this.abort.signal.aborted) return
        if (this.generation !== gen) continue
        if (ok) {
          // 轮询成功：正常间隔续轮，不退避
          await abortableSleep(this.opts.pollIntervalMs ?? POLL_INTERVAL_MS, this.abort.signal)
          continue
        }
      } else {
        await this.connectOnceSse(gen)
        if (this.disposed || this.abort.signal.aborted) return
        if (this.generation !== gen) continue
      }
      // 失败闭合：任何断开/失败一律退避重连（退避序列四端同口径）
      this.setStatus('reconnecting')
      const delay = this.backoffMs[Math.min(this.retries, this.backoffMs.length - 1)] ?? 1000
      this.retries++
      await abortableSleep(delay, this.abort.signal)
    }
  }

  /** 鉴权失败处理（SSE 响应码与轮询错误码共用；收敛纪律同 RN G5） */
  private handleAuthFailure(status: number): void {
    const code = `E_AUTH_${status}`
    if (this.lastAuthErrorCode !== code) {
      this.lastAuthErrorCode = code
      this.opts.onError?.(new Error(`E_AUTH: 事件流鉴权失败（HTTP ${status}）`))
    }
    this.authFailures++
    if (this.authFailures >= 3) this.disposed = true
  }

  /** 连接建立成功：退避/鉴权计数复位 + open 状态 */
  private noteOpen(): void {
    this.retries = 0
    this.authFailures = 0
    this.lastAuthErrorCode = null
    this.setStatus('open')
  }

  // ---------- SSE 主路径 ----------

  /** 单次 SSE 连接：分块收帧直到流结束/失败后返回 */
  private connectOnceSse(gen: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let url = `${this.opts.baseUrl}/api/event?sessionId=${this.opts.sessionId}&since=${this.watermark}`
      if (this.opts.authToken !== undefined) {
        url += `&token=${encodeURIComponent(this.opts.authToken)}`
      }
      const stale = (): boolean => this.disposed || this.generation !== gen
      let settled = false
      let chunkReceived = false
      let authBlocked = false

      const pump = new SseFramePump((e) => {
        if (e.seq !== undefined && e.seq > this.watermark) this.watermark = e.seq
        this.opts.onEvent?.(e)
      })

      let task: ChunkRequestTask | null = null
      const finish = (): void => {
        if (settled) return
        settled = true
        if (task !== null) {
          try {
            task.abort()
          } catch {
            // 已结束的请求 abort 失败无副作用
          }
        }
        resolve()
      }

      const requestTask = Taro.request({
        url,
        method: 'GET',
        header: { accept: 'text/event-stream' },
        responseType: 'arraybuffer',
        timeout: 0,
        enableChunked: true,
      })
      task = requestTask as unknown as ChunkRequestTask

      requestTask
        .then((res) => {
          // 流正常结束（服务端关流）：状态码鉴权检查后走重连循环
          if (stale()) {
            finish()
            return
          }
          const status = res.statusCode
          if (status === 401 || status === 403) {
            authBlocked = true
            this.handleAuthFailure(status)
          }
          finish()
        })
        .catch(() => {
          if (stale()) {
            finish()
            return
          }
          // 分块路径异常：未收到任何数据且非鉴权问题 → 单向降级轮询
          if (!chunkReceived && !authBlocked) {
            this.mode = 'polling'
          }
          finish()
        })

      // 头部早达：鉴权失败即刻断开（不等流结束）；2xx 即置 open
      const headersOf = task as Partial<ChunkRequestTask>
      if (typeof headersOf.onHeadersReceived === 'function') {
        headersOf.onHeadersReceived((res) => {
          if (stale()) return
          if (res.statusCode === 401 || res.statusCode === 403) {
            authBlocked = true
            this.handleAuthFailure(res.statusCode)
            finish()
            return
          }
          if (res.statusCode >= 200 && res.statusCode < 300) this.noteOpen()
        })
      }
      const chunkOf = task as Partial<ChunkRequestTask>
      if (typeof chunkOf.onChunkReceived === 'function') {
        chunkOf.onChunkReceived((res) => {
          if (stale()) {
            finish()
            return
          }
          chunkReceived = true
          this.noteOpen()
          try {
            pump.feedBytes(new Uint8Array(res.data))
          } catch {
            // 坏帧抛错 → 冒泡断开走退避重连（失败闭合，不静默跳过——四端同纪律）
            finish()
          }
        })
      }

      // dispose 的 abort 信号接线：空闲（心跳是注释帧、无回调）也能即刻断开
      if (this.abort.signal.aborted) {
        finish()
        return
      }
      this.abort.signal.addEventListener('abort', finish, { once: true })
    })
  }

  // ---------- 轮询降级路径 ----------

  /** 单轮轮询：尾部切片过滤水位后补发；成功返回 true */
  private async pollOnce(gen: number): Promise<boolean> {
    const stale = (): boolean => this.disposed || this.generation !== gen
    try {
      const dto = await this.rest.getSession(this.opts.sessionId, { limit: POLL_PAGE_LIMIT })
      if (stale()) return true
      const { fresh, watermark } = filterFreshEvents(dto.events ?? [], this.watermark)
      this.watermark = watermark
      this.noteOpen()
      for (const e of fresh) this.opts.onEvent?.(e)
      return true
    } catch (err: unknown) {
      if (stale()) return true
      // REST 鉴权失败（`E_AUTH: ...`）走同一收敛纪律；其余错误静默进退避重试
      const msg = err instanceof Error ? err.message : String(err)
      if (/^E_AUTH/.test(msg)) this.handleAuthFailure(401)
      return false
    }
  }
}
