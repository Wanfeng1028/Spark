/**
 * 传输运行时（工单 9.4）：配置 → 传输实例的单例缓存（语义对齐 apps/mobile runtime.ts）。
 * REST：MiniRestClient（Taro.request 封装）；会话级流：MiniSessionEventSource
 * （SSE 分块主路径 + 轮询降级）。配置变更（设置页保存/断开）→ invalidate
 * 释放旧实例（失败闭合：旧连接不残留）。
 */
import type { PairTokenDto, SessionId, SparkEventEnvelope } from '@spark/protocol'
import { useAppStore } from '../store/app-store'
import { MiniRestClient } from './rest'
import { MiniSessionEventSource } from './mini-event-source'
import type { MiniConnectionStatus } from './mini-event-source'

interface RuntimeEntry {
  key: string
  rest: MiniRestClient
}

let current: RuntimeEntry | null = null

/**
 * 按配置取 REST 客户端（同配置复用实例；未配置返回 null）。
 * 事件流状态直写 app-store；事件流经批处理入口（会话页装配）。
 */
export function getRestClient(serverUrl: string, token: string): MiniRestClient | null {
  const baseUrl = serverUrl.trim()
  if (baseUrl === '') {
    invalidateRest()
    return null
  }
  const key = `${baseUrl}#${token}`
  if (current !== null && current.key === key) return current.rest
  invalidateRest()
  const rest = new MiniRestClient({
    baseUrl,
    // exactOptionalPropertyTypes：无 token 时直接不传该键（而非传 undefined）
    ...(token !== '' ? { token } : {}),
  })
  current = { key, rest }
  return rest
}

/** 释放当前实例缓存（断开连接/配置变更）——幂等 */
export function invalidateRest(): void {
  if (current === null) return
  current = null
  useAppStore.getState().setStatus('closed')
}

export interface SessionStreamOptions {
  sessionId: SessionId
  serverUrl: string
  token: string
  since?: number
  onEvent: (e: SparkEventEnvelope) => void
  onStatus?: (s: MiniConnectionStatus) => void
  /** 鉴权失败（401/403）人话错误源（会话页走 ERROR_COPY 呈现） */
  onError?: (err: Error) => void
}

/** 新建会话级事件流（调用方持有生命周期：切换会话/卸载时 dispose） */
export function openSessionStream(opts: SessionStreamOptions): MiniSessionEventSource | null {
  const baseUrl = opts.serverUrl.trim()
  if (baseUrl === '') return null
  return new MiniSessionEventSource({
    baseUrl,
    sessionId: opts.sessionId,
    ...(opts.since !== undefined ? { since: opts.since } : {}),
    ...(opts.token !== '' ? { authToken: opts.token } : {}),
    ...(opts.onStatus !== undefined ? { onStatus: opts.onStatus } : {}),
    ...(opts.onError !== undefined ? { onError: opts.onError } : {}),
    onEvent: opts.onEvent,
  })
}

/**
 * 配对兑换（手输 6 位码与扫码共用路径）：无 token 直调兑换口（鉴权自举，9.1）。
 * 独立短命客户端——兑换成功与否都不碰主实例缓存。
 */
export function redeemPairCode(baseUrl: string, code: string): Promise<PairTokenDto> {
  const rest = new MiniRestClient({ baseUrl })
  return rest.redeemPair({ code, name: '微信小程序' })
}
