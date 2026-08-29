/**
 * 传输运行时（工单 9.2）：配置 → 传输实例的单例缓存。
 * REST：直接复用 @spark/protocol 的 HttpTransport（eventStream:false——
 * 移动端会话级流走 RnSessionEventSource，不起全局 SSE）。
 * SSE：RnSessionEventSource（rn-event-source.ts）。
 * 配置变更（设置页保存/断开）→ rebuild 释放旧实例（失败闭合：旧连接不残留）。
 */
import type { SessionId, SparkEventEnvelope, Transport } from '@spark/protocol'
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

export interface SessionStreamOptions {
  sessionId: SessionId
  serverUrl: string
  token: string
  since?: number
  onEvent: (e: SparkEventEnvelope) => void
  onStatus?: (s: RnConnectionStatus) => void
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
    onEvent: opts.onEvent,
  })
}
