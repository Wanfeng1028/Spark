/**
 * RN 会话级 SSE 续播流（工单 9.2——SessionEventSource 的 React Native 适配；
 * 工单 R-B.5c 起重连状态机下沉 @spark/protocol 的 SessionStreamCore）。
 *
 * 方案选择（汇报②）：RN 的 fetch polyfill 不支持流式响应体（ReadableStream 缺位），
 * 且 iOS 上 XMLHttpRequest 的 onprogress 增量读取不可靠（已知平台限制，readystate=3
 * 阶段不增量回调）——故不自写 XHR 帧泵，采用 react-native-sse（MIT，专为此场景）：
 * 它按平台屏蔽差异提供逐帧 message 事件。
 *
 * 留在本端的只有平台差异（doc/08 §5B 产品③「平台被迫部分不进 Core」）：
 * 1) 帧重建与解析——库的 message 事件 → SSE 帧文本（frameFromMessage）→ envelopeFromSseFrame；
 * 2) 偏离记录（评审 G4）：react-native-sse 对服务端正常关流（2 系 DONE）不派发任何事件，
 *    而是自行约 5s 轮询重开（复用首连 since URL）——接受其轮询续播（durable seq 去重
 *    已验证安全，回放×直播重叠不重复投影），仅在 open 回调以连接级 openedOnce 探测：
 *    同一实例第二次 open 时经 ctx.reportReconnecting() 补报，使状态机诚实；
 * 3) G1：ctx.signal 接线到本连接——连接 open 且空闲时（心跳是注释帧、库不派发事件）
 *    也能即刻 es.close()，防僵尸连接累积。
 *
 * 退避序列（1/2/5/10s 封顶）/ 水位推进 / 鉴权收敛（评审 G5：同一错误码 onError 只上抛一次、
 * 重连成功复位、连续 3 次 401/403 进 closed 终态停止重连）/ dispose 与 generation 防竞态
 * 一律由 SessionStreamCore 承担，与四端同口径（不复用库内自动重试的理由不变）。
 */
import EventSource from 'react-native-sse'
import type { MessageEvent } from 'react-native-sse'
import type {
  SessionId,
  SparkEventEnvelope,
  StreamConnectionStatus,
  StreamCoreContext,
} from '@spark/protocol'
import { SessionStreamCore, envelopeFromSseFrame } from '@spark/protocol'

/**
 * 连接态（工单 R-B.5c 起 = SessionStreamCore 的 StreamConnectionStatus，3 态 → 4 态）。
 * closed 此前不在本类型里：内核鉴权终态发出的 closed 无处呈现（与 web/cli 同型的静默缺陷）。
 */
export type RnConnectionStatus = StreamConnectionStatus

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

/**
 * RN 单次连接：挂库的事件回调，等到断开（error / dispose 的 abort）后 resolve。
 * 状态机权威在 SessionStreamCore——本函数只报事实（open / 信封 / 鉴权状态码）。
 */
function connectRnOnce(ctx: StreamCoreContext): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false
    let es: EventSource | null = null
    /** G4：连接级首次 open 探测（库轮询重开 = 同实例第二次 open，需补报状态） */
    let openedOnce = false
    const finish = (): void => {
      if (settled) return
      settled = true
      if (es !== null) es.close()
      resolve()
    }

    try {
      es = new EventSource(ctx.url())
    } catch {
      finish()
      return
    }

    es.addEventListener('open', () => {
      if (ctx.stale()) {
        finish()
        return
      }
      // G4 偏离：库轮询重开复用本实例——先补报 reconnecting 再 noteOpen
      if (openedOnce) ctx.reportReconnecting()
      openedOnce = true
      ctx.noteOpen()
    })
    es.addEventListener('message', (event: MessageEvent) => {
      if (ctx.stale()) {
        finish()
        return
      }
      // 坏帧抛错 → 冒泡断开走重连（与 SessionEventSource 同纪律，不静默跳过）
      try {
        const frame = frameFromMessage(event)
        if (frame === null) return
        const envelope = envelopeFromSseFrame(frame)
        if (envelope !== null) ctx.noteEnvelope(envelope)
      } catch {
        finish()
      }
    })
    es.addEventListener('error', (event) => {
      // 库的 ErrorEvent 暴露 xhrStatus：401/403 交内核走鉴权收敛（G5 同码去重与终态）
      if (!ctx.stale() && 'xhrStatus' in event) {
        const status = event.xhrStatus
        if (status === 401 || status === 403) ctx.noteAuthFailure(status)
      }
      finish()
    })

    // G1：dispose 的 abort 信号接线到本连接（finish 幂等）
    if (ctx.signal.aborted) {
      finish()
      return
    }
    ctx.signal.addEventListener('abort', finish, { once: true })
  })
}

export class RnSessionEventSource {
  private readonly core: SessionStreamCore

  constructor(opts: RnSessionEventSourceOptions) {
    this.core = new SessionStreamCore({
      baseUrl: opts.baseUrl,
      sessionId: opts.sessionId,
      ...(opts.since !== undefined ? { since: opts.since } : {}),
      ...(opts.backoffMs !== undefined ? { backoffMs: opts.backoffMs } : {}),
      ...(opts.authToken !== undefined ? { authToken: opts.authToken } : {}),
      ...(opts.onStatus !== undefined ? { onStatus: opts.onStatus } : {}),
      ...(opts.onEvent !== undefined ? { onEvent: opts.onEvent } : {}),
      ...(opts.onError !== undefined ? { onError: opts.onError } : {}),
      connectOnce: connectRnOnce,
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
