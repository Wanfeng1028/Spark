/**
 * 小程序会话级事件流（工单 9.4——SessionEventSource 的微信小程序适配；
 * 工单 R-B.5d 起重连状态机下沉 @spark/protocol 的 SessionStreamCore）。
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
 * 留在本端的只有平台差异（doc/08 §5B 产品③「平台被迫部分不进 Core」）：分块双路
 * 鉴权闸门（评审 I1：onHeadersReceived 与 requestTask.then 可能各见一次 401/403，
 * 局部 authCounted 防双计）、分块回调缺失的单向降级（评审 I7）、轮询降级的实现本体、
 * 轮询路从 REST 错误消息解析真实鉴权状态码（评审 I6：`HTTP_403: ...` → 403）。
 *
 * 四态 / since 水位续播 / 退避序列 1/2/5/10s / 鉴权收敛（同码 onError 只上抛一次、
 * 重连成功复位、连续 3 次进 closed 终态——评审 I2：不静默滞留 reconnecting，UI 据此
 * 呈现「连接已停止」）一律由 SessionStreamCore 承担，与四端同口径；轮询成功一轮 =
 * 健康空闲，内核按 idleDelayMs（= pollIntervalMs）续轮，不退避不报断线。
 */
import Taro from '@tarojs/taro'
import type {
  ConnectOutcome,
  SessionId,
  SparkEventEnvelope,
  StreamConnectionStatus,
  StreamCoreContext,
} from '@spark/protocol'
import { SessionStreamCore } from '@spark/protocol'
import { MiniRestClient } from './rest'
import { SseFramePump } from './sse-pump'
import { filterFreshEvents } from './poll'
import { sdkSupportsChunked } from './support'

/**
 * 连接态（工单 R-B.5d 起 = SessionStreamCore 的 StreamConnectionStatus）——本端此前已是
 * 同字面量的四态本地副本（评审 I2 要求终态发 closed），现改为直接引用单源。
 */
export type MiniConnectionStatus = StreamConnectionStatus

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
  private readonly rest: MiniRestClient
  /** 传输模式：SSE 主路径 / 轮询降级（生命期内单向降级，不回试）——内核不管模式，端侧持有 */
  private mode: 'sse' | 'polling'
  private readonly core: SessionStreamCore

  constructor(opts: MiniSessionEventSourceOptions) {
    this.opts = opts
    this.rest = new MiniRestClient({
      baseUrl: opts.baseUrl,
      ...(opts.authToken !== undefined ? { token: opts.authToken } : {}),
    })
    const chunked =
      opts.chunkedSupported ?? sdkSupportsChunked(Taro.getSystemInfoSync().SDKVersion ?? '')
    this.mode = opts.forcePolling === true || !chunked ? 'polling' : 'sse'
    // 内核必须在 rest/mode 之后构造：其构造函数同步启动 loop，首轮 connectOnce 立即读这两者
    this.core = new SessionStreamCore({
      baseUrl: opts.baseUrl,
      sessionId: opts.sessionId,
      ...(opts.since !== undefined ? { since: opts.since } : {}),
      ...(opts.backoffMs !== undefined ? { backoffMs: opts.backoffMs } : {}),
      // 轮询成功一轮 = 健康空闲：按此间隔续轮（原 pollIntervalMs 语义，缺省 3s）
      idleDelayMs: opts.pollIntervalMs ?? POLL_INTERVAL_MS,
      ...(opts.authToken !== undefined ? { authToken: opts.authToken } : {}),
      ...(opts.onStatus !== undefined ? { onStatus: opts.onStatus } : {}),
      ...(opts.onEvent !== undefined ? { onEvent: opts.onEvent } : {}),
      ...(opts.onError !== undefined ? { onError: opts.onError } : {}),
      connectOnce: (ctx) =>
        this.mode === 'polling' ? this.pollOnce(ctx) : this.connectOnceSse(ctx),
    })
  }

  /** 当前回放水位（已收最大 seq）——切换会话/重建流时作 since */
  get since(): number {
    return this.core.since
  }

  dispose(): void {
    this.core.dispose()
  }

  // ---------- SSE 主路径 ----------

  /** 单次 SSE 连接：分块收帧直到流结束/失败后返回 */
  private connectOnceSse(ctx: StreamCoreContext): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false
      let chunkReceived = false
      let authBlocked = false
      // 同一响应的鉴权失败只计一次：onHeadersReceived 与 requestTask.then 两条
      // 路径可能各见一次 401/403——局部闸门防双计（评审 I1，平台特有，不入内核）
      let authCounted = false
      const countAuthOnce = (status: number): void => {
        if (authCounted) return
        authCounted = true
        ctx.noteAuthFailure(status)
      }

      const pump = new SseFramePump((e) => ctx.noteEnvelope(e))

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
        url: ctx.url(),
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
          if (ctx.stale()) {
            finish()
            return
          }
          const status = res.statusCode
          if (status === 401 || status === 403) {
            authBlocked = true
            countAuthOnce(status)
          }
          finish()
        })
        .catch(() => {
          if (ctx.stale()) {
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
          if (ctx.stale()) return
          if (res.statusCode === 401 || res.statusCode === 403) {
            authBlocked = true
            countAuthOnce(res.statusCode)
            finish()
            return
          }
          if (res.statusCode >= 200 && res.statusCode < 300) ctx.noteOpen()
        })
      }
      const chunkOf = task as Partial<ChunkRequestTask>
      if (typeof chunkOf.onChunkReceived === 'function') {
        chunkOf.onChunkReceived((res) => {
          if (ctx.stale()) {
            finish()
            return
          }
          chunkReceived = true
          ctx.noteOpen()
          try {
            pump.feedBytes(new Uint8Array(res.data))
          } catch {
            // 坏帧抛错 → 冒泡断开走退避重连（失败闭合，不静默跳过——四端同纪律）
            finish()
          }
        })
      } else {
        // 分块回调缺失（类型档异常/能力退化）：不静默挂死——
        // 与 catch 分支同口径单向降级轮询（评审 I7）
        this.mode = 'polling'
        finish()
        return
      }

      // dispose 的 abort 信号接线：空闲（心跳是注释帧、无回调）也能即刻断开
      if (ctx.signal.aborted) {
        finish()
        return
      }
      ctx.signal.addEventListener('abort', finish, { once: true })
    })
  }

  // ---------- 轮询降级路径 ----------

  /** 单轮轮询：尾部切片过滤水位后补发。成功 → 'idle'（内核按 idleDelayMs 续轮，不退避） */
  private async pollOnce(ctx: StreamCoreContext): Promise<ConnectOutcome> {
    try {
      const dto = await this.rest.getSession(this.opts.sessionId, { limit: POLL_PAGE_LIMIT })
      if (ctx.stale()) return 'idle'
      // 只取 fresh：返回的 watermark 不再取用——内核 noteEnvelope 逐条推进水位，与一次性
      // 赋值等价（fresh 按 seq 升序，服务端不重排；无 seq 的 live 不推水位但原样放行）
      const { fresh } = filterFreshEvents(dto.events ?? [], ctx.since())
      ctx.noteOpen()
      for (const e of fresh) ctx.noteEnvelope(e)
      return 'idle'
    } catch (err: unknown) {
      if (ctx.stale()) return 'idle'
      // REST 鉴权失败（`E_AUTH: ...`）走同一收敛纪律；其余错误静默进退避重试。
      // 状态码从错误消息解析真实值（`HTTP_401: ...`，与 SSE 路去重口径一致），
      // 解析不到再落 401（评审 I6）
      const msg = err instanceof Error ? err.message : String(err)
      if (/^E_AUTH/.test(msg) || /^HTTP_(40[13])/.test(msg)) {
        const parsed = /^HTTP_(40[13])/.exec(msg)?.[1]
        ctx.noteAuthFailure(parsed !== undefined ? Number(parsed) : 401)
      }
      return 'disconnected'
    }
  }
}
