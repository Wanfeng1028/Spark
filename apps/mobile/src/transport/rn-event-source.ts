/**
 * RN 会话级 SSE 续播流（工单 9.2——SessionEventSource 的 React Native 适配）。
 *
 * 方案选择（汇报②）：RN 的 fetch polyfill 不支持流式响应体（ReadableStream 缺位），
 * 且 iOS 上 XMLHttpRequest 的 onprogress 增量读取不可靠（已知平台限制，readystate=3
 * 阶段不增量回调）——故不自写 XHR 帧泵，采用 react-native-sse（MIT，专为此场景）：
 * 它按平台屏蔽差异提供逐帧 message 事件；切帧后的帧解析/水位/退避一律复用
 * @spark/protocol 共享资产（envelopeFromSseFrame / DEFAULT_BACKOFF_MS / abortableSleep），
 * 对外契约与 SessionEventSource 对齐（connecting/open/reconnecting + since 水位续播）。
 *
 * 重连语义与 SessionEventSource 同：自管重连循环（error → close → 退避 → 重建），
 * 不复用库内自动重试——退避序列与状态回调必须与四端同口径（1/2/5/10s 封顶）。
 * 鉴权失败（401/403）：库的 ErrorEvent 暴露 xhrStatus——构造 `E_AUTH: ...` 错误
 * 走 onError 回调，调用方经 ERROR_COPY 人话化呈现（工单 9.1 双口径同律）。
 */
import EventSource from 'react-native-sse'
import type { MessageEvent } from 'react-native-sse'
import type { SessionId, SparkEventEnvelope } from '@spark/protocol'
import {
  DEFAULT_BACKOFF_MS,
  abortableSleep,
  envelopeFromSseFrame,
} from '@spark/protocol'

export type RnConnectionStatus = 'connecting' | 'open' | 'reconnecting'

export interface RnSessionEventSourceOptions {
  baseUrl: string
  sessionId: SessionId
  /** 首连回放水位：服务端补发 seq>since 的 durable（0 = 全量回放） */
  since?: number
  backoffMs?: readonly number[]
  onStatus?: (s: RnConnectionStatus) => void
  onEvent?: (e: SparkEventEnvelope) => void
  /** 鉴权失败（401/403）人话错误源：`E_AUTH: ...`（调用方走 ERROR_COPY 呈现） */
  onError?: (err: Error) => void
  /** 配对长效 token（工单 9.1 / D24）：SSE URL 附 &token=（服务端 tokenOf 双口径） */
  authToken?: string
}

/** 库的 message 事件 → SSE 帧文本重建（data 可能多行，逐行补 'data: ' 前缀） */
function frameFromMessage(event: MessageEvent): string | null {
  if (event.data === null) return null
  return event.data.split('\n').map((line) => `data: ${line}`).join('\n')
}

export class RnSessionEventSource {
  private readonly opts: RnSessionEventSourceOptions
  private readonly backoffMs: readonly number[]
  private readonly abort = new AbortController()
  private watermark: number
  private disposed = false
  private retries = 0
  /** 代际计数：close 后残余回调不再驱动状态机（防竞态） */
  private generation = 0

  constructor(opts: RnSessionEventSourceOptions) {
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
    this.generation++
    this.abort.abort()
  }

  private setStatus(s: RnConnectionStatus): void {
    this.opts.onStatus?.(s)
  }

  private async loop(): Promise<void> {
    while (!this.disposed) {
      const gen = this.generation
      await this.connectOnce(gen)
      if (this.disposed || this.abort.signal.aborted) return
      if (this.generation !== gen) continue
      // 失败闭合：任何断开一律退避重连（坏帧/网络/鉴权同路径自愈）
      this.setStatus('reconnecting')
      const delay = this.backoffMs[Math.min(this.retries, this.backoffMs.length - 1)] ?? 1000
      this.retries++
      await abortableSleep(delay, this.abort.signal)
    }
  }

  /** 单次连接：挂事件回调，等到断开（error/手动关闭）后返回 */
  private connectOnce(gen: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let url = `${this.opts.baseUrl}/api/event?sessionId=${this.opts.sessionId}&since=${this.watermark}`
      if (this.opts.authToken !== undefined) url += `&token=${encodeURIComponent(this.opts.authToken)}`

      let settled = false
      let es: EventSource | null = null
      const finish = (): void => {
        if (settled) return
        settled = true
        if (es !== null) es.close()
        resolve()
      }
      const stale = (): boolean => this.disposed || this.generation !== gen

      try {
        es = new EventSource(url)
      } catch {
        finish()
        return
      }

      es.addEventListener('open', () => {
        if (stale()) {
          finish()
          return
        }
        this.retries = 0
        this.setStatus('open')
      })
      es.addEventListener('message', (event: MessageEvent) => {
        if (stale()) {
          finish()
          return
        }
        // 坏帧抛错 → 冒泡断开走重连（与 SessionEventSource 同纪律，不静默跳过）
        try {
          const frame = frameFromMessage(event)
          if (frame === null) return
          const envelope = envelopeFromSseFrame(frame)
          if (envelope !== null) {
            if (envelope.seq !== undefined && envelope.seq > this.watermark) {
              this.watermark = envelope.seq
            }
            this.opts.onEvent?.(envelope)
          }
        } catch {
          finish()
        }
      })
      es.addEventListener('error', (event) => {
        if (!stale() && 'xhrStatus' in event) {
          const status = event.xhrStatus
          // 401/403：token 无效/已撤销——重连无意义但不断流（配置修复后自愈），
          // 错误上抛给调用方人话呈现（失败闭合，不静默吞）
          if (status === 401 || status === 403) {
            this.opts.onError?.(
              new Error(`E_AUTH: SSE 鉴权失败（HTTP ${status}）`),
            )
          }
        }
        finish()
      })
    })
  }
}
