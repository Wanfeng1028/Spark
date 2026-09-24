/**
 * 传输运行时（工单 9.2）：配置 → 传输实例的单例缓存。
 * REST：直接复用 @spark/protocol 的 HttpTransport（eventStream:false——
 * 移动端会话级流走 RnSessionEventSource，不起全局 SSE）。
 * SSE：RnSessionEventSource（rn-event-source.ts）。
 * 配置变更（设置页保存/断开）→ rebuild 释放旧实例（失败闭合：旧连接不残留）。
 */
import type { Language, SessionId, SparkEventEnvelope, Transport } from '@spark/protocol'
import { HttpTransport } from '@spark/protocol'
import { useAppStore } from '../store/app-store'
import { RnSessionEventSource } from './rn-event-source'
import type { RnConnectionStatus } from './rn-event-source'

interface RuntimeEntry {
  key: string
  transport: Transport
}

let current: RuntimeEntry | null = null

/**
 * 按配置取 REST 传输（同配置复用实例；未配置返回 null）。
 * onStatus 直写 app-store；事件流经 app-store 批处理入口（调用方装配，见 9.3）。
 */
export function getHttpTransport(serverUrl: string, token: string): Transport | null {
  const baseUrl = serverUrl.trim()
  if (baseUrl === '') {
    invalidateTransport()
    return null
  }
  const key = `${baseUrl}#${token}`
  if (current !== null && current.key === key) return current.transport
  invalidateTransport()
  const transport = new HttpTransport({
    baseUrl,
    // exactOptionalPropertyTypes：无 token 时直接不传该键（而非传 undefined）
    ...(token !== '' ? { authToken: token } : {}),
    eventStream: false,
    onStatus: (s) => useAppStore.getState().setStatus(s),
  })
  current = { key, transport }
  return transport
}

/** 释放当前传输（断开连接/配置变更/退出）——幂等 */
export function invalidateTransport(): void {
  if (current === null) return
  current.transport.dispose()
  current = null
  useAppStore.getState().setStatus('closed')
}

/**
 * 从服务端拉当前界面语言（工单 19.17：boot 与配对/改址后各调一次）。
 * 放在本模块而不是 src/i18n.ts：拉语言要用传输实例，而 i18n.ts 被 session/*.ts 那批
 * 依赖注入形态的控制器引用，从那里牵进本模块会把 react-native-sse 拖进它们的单测模块图。
 *
 * @returns 取到的语言；null = 未配对或读取失败——**调用方无需处置**：语言保持现值即正确
 *   行为，且不写任何猜测值。读取失败不在此弹 notice：启动期连不上会由各屏自己的取数路径
 *   （会话列表/设置页）如实报出，这里再报一遍是同一条故障的两处重复。
 */
export async function syncUiLanguage(serverUrl: string, token: string): Promise<Language | null> {
  const transport = getHttpTransport(serverUrl, token)
  if (transport === null) return null
  try {
    const settings = await transport.getSettings()
    const lang = settings.ui?.language ?? null
    if (lang !== null) useAppStore.getState().setLanguage(lang)
    return lang
  } catch {
    return null
  }
}

export interface SessionStreamOptions {
  sessionId: SessionId
  serverUrl: string
  token: string
  since?: number
  onEvent: (e: SparkEventEnvelope) => void
  onStatus?: (s: RnConnectionStatus) => void
  /** 鉴权失败（401/403）人话错误源（工单 9.3：会话页走 ERROR_COPY 呈现） */
  onError?: (err: Error) => void
}

/** 新建会话级续播流（调用方持有生命周期：切换会话/卸载时 dispose） */
export function openSessionStream(opts: SessionStreamOptions): RnSessionEventSource | null {
  const baseUrl = opts.serverUrl.trim()
  if (baseUrl === '') return null
  return new RnSessionEventSource({
    baseUrl,
    sessionId: opts.sessionId,
    ...(opts.since !== undefined ? { since: opts.since } : {}),
    ...(opts.token !== '' ? { authToken: opts.token } : {}),
    ...(opts.onStatus !== undefined ? { onStatus: opts.onStatus } : {}),
    ...(opts.onError !== undefined ? { onError: opts.onError } : {}),
    onEvent: opts.onEvent,
  })
}
