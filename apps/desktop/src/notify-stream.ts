/**
 * 通知事件流订阅（阶段十九工单 19.30）：GET /api/event 全局直播流 + **断线退避重连**。
 * 19.30 前只在启动时连一次，断了就静默没通知（notify-wiring.ts 旧注释「壳层不重连」）。
 *
 * 重连口径与 packages/protocol/src/session-stream-core.ts 一致（退避 1/2/5/10s 封顶、
 * 任何断开一律退避重连、abort 即刻收口），但**不 import 它**：@spark/protocol 在仓内的
 * main 字段指向 `src/index.ts`（TS 源、内部以 `.js` 指自己），而本包主进程是 tsc 直出
 * CJS 且无打包步骤，运行时 require 过去解析不到文件——所以壳侧留一份同值常量，判据以
 * session-stream-core.ts 为单一来源（要改退避先改那边，再同步这里）。
 *
 * 全局流不回放（server/sse.ts：sessionId 省略即纯直播），所以重连不会补发历史事件、
 * 也不会重放旧通知；断线窗口内的通知如实丢失（比"重启应用才恢复"少一个长空窗）。
 *
 * 不 import electron：fetch 与帧回调全部注入，可单测。
 */

/** 与 protocol/session-stream-core.ts 的 DEFAULT_BACKOFF_MS 同表（末位封顶） */
export const NOTIFY_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10_000]

export type NotifyStreamStatus = 'open' | 'reconnecting'

export interface NotifyStreamOptions {
  url: string
  fetchFn: typeof fetch
  /** stop() 的 abort 信号：接线到 fetch 与退避延时，空闲（心跳帧）时也能即刻断开 */
  signal: AbortSignal
  /** 一帧 data: payload（已 JSON.parse）；抛错按断连处理，不静默 */
  onEvent: (payload: unknown) => void
  onStatus?: (s: NotifyStreamStatus) => void
  /** 退避序列（测试注入缩短）；末位封顶 */
  backoffMs?: readonly number[]
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

/**
 * 帧切分（与 protocol/transport-node.ts 的 splitSseFrames 同语义：先归一 CRLF→LF，再按
 * 空行切，余下半截留到下轮）。刻意**不**沿用协议侧"坏帧抛错驱动重连"：会话流有 seq 水位，
 * 抛错重连能补齐缺口；通知旁路没水位可续（全局流不回放），重连也补不回坏帧，跳过即可。
 */
function splitFrames(buffer: string, chunk: string): { frames: string[]; rest: string } {
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

/** SSE 帧解析：取 data: 行拼 JSON（server 帧 = `event: message\ndata: {...}`）；注释帧/坏 JSON 返回 null */
export function parseSseFrame(frame: string): unknown {
  const dataLines = frame
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
  if (dataLines.length === 0) return null
  try {
    return JSON.parse(dataLines.join('\n')) as unknown
  } catch {
    return null
  }
}

/** 可被 abort 打断的延时（与 session-stream-core.ts 的 abortableSleep 同实现） */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
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

/** 单次连接：resolve = 本次流结束；返回是否真的建立起流（决定退避计数是否复位） */
async function connectOnce(opts: NotifyStreamOptions): Promise<boolean> {
  const res = await opts.fetchFn(opts.url, {
    signal: opts.signal,
    headers: { Accept: 'text/event-stream' },
  })
  // 非 2xx（sidecar 重启窗口/鉴权失败）与无响应体 = 这次连接没成，交上层退避重连
  if (!res.ok || res.body === null) return false
  opts.onStatus?.('open')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return true
    const { frames, rest } = splitFrames(buf, decoder.decode(value, { stream: true }))
    buf = rest
    for (const frame of frames) {
      const payload = parseSseFrame(frame)
      if (payload !== null) opts.onEvent(payload)
    }
  }
}

/**
 * 重连循环：dispose（abort）后返回。永不 reject——失败闭合在这里意味着"一直退避重连"，
 * 而不是把通知子系统搞成半死状态。
 */
export async function runNotifyStream(opts: NotifyStreamOptions): Promise<void> {
  const backoff = opts.backoffMs ?? NOTIFY_BACKOFF_MS
  const sleep = opts.sleep ?? abortableSleep
  let retries = 0
  while (!opts.signal.aborted) {
    let opened = false
    try {
      opened = await connectOnce(opts)
    } catch {
      // 连接抛错与断流同路径（含 dispose 的 AbortError）：opened 留在 false = 这次没连上，
      // 退避继续加档；下面 aborted 分支负责即刻收口
    }
    if (opts.signal.aborted) return
    // 建立起过流再断开 = 新的一次故障，退避从头计；连都没连上 = 继续按序列加档
    if (opened) retries = 0
    opts.onStatus?.('reconnecting')
    const delay = backoff[Math.min(retries, backoff.length - 1)] ?? 1000
    retries++
    await sleep(delay, opts.signal)
  }
}
