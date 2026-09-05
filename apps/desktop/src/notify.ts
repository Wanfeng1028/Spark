/**
 * 桌面通知纯逻辑（阶段十二工单 12.7，V2-05）：配置装载（fail-closed 回缺省）、
 * 开关过滤、去抖闸门（同会话同类 2s 内合并；审批 resolved 后不补发）。
 * Notification 本体由壳层（main.ts）注入——本模块不 import electron，保持可单测。
 */
import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'

export const DesktopConfigSchema = z.strictObject({
  notifications: z.strictObject({
    turnCompleted: z.boolean(),
    approvalWaiting: z.boolean(),
  }),
})

export type DesktopConfig = z.infer<typeof DesktopConfigSchema>

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = {
  notifications: { turnCompleted: true, approvalWaiting: true },
}

/** 坏 JSON / 形状不符 → 回缺省并返回 warn（fail-closed：静默失败即造假状态） */
export function loadDesktopConfig(
  path: string,
  warn: (msg: string) => void = () => undefined,
): DesktopConfig {
  if (!existsSync(path)) return DEFAULT_DESKTOP_CONFIG
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const result = DesktopConfigSchema.safeParse(parsed)
    if (!result.success) {
      warn(`desktop.json 形状不符，通知配置回缺省：${result.error.issues[0]?.path.join('.') ?? ''}`)
      return DEFAULT_DESKTOP_CONFIG
    }
    return result.data
  } catch (err) {
    warn(`desktop.json 不是合法 JSON，通知配置回缺省：${err instanceof Error ? err.message : String(err)}`)
    return DEFAULT_DESKTOP_CONFIG
  }
}

export type NotifyKind = 'turnCompleted' | 'approvalWaiting'

export function shouldNotify(cfg: DesktopConfig, kind: NotifyKind): boolean {
  return cfg.notifications[kind]
}

/** 去抖闸门：同 (session, kind) 2s 内合并；审批按 requestId 一次一发（resolved 移除） */
export class NotifyGate {
  private readonly lastSentAt = new Map<string, number>()
  private readonly pendingApprovals = new Set<string>()

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly mergeWindowMs = 2000,
  ) {}

  /** 返回 true = 该发；false = 被合并/去重 */
  decide(sessionId: string, kind: NotifyKind, requestId?: string): boolean {
    if (kind === 'approvalWaiting') {
      if (requestId === undefined) return false
      if (this.pendingApprovals.has(requestId)) return false
      this.pendingApprovals.add(requestId)
      return true
    }
    const key = `${sessionId}:${kind}`
    const last = this.lastSentAt.get(key)
    if (last !== undefined && this.now() - last < this.mergeWindowMs) return false
    this.lastSentAt.set(key, this.now())
    return true
  }

  /** permission.resolved → 该请求不再补发 */
  markResolved(requestId: string): void {
    this.pendingApprovals.delete(requestId)
  }
}
