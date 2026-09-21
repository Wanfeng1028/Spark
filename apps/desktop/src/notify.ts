/**
 * 桌面壳配置与通知纯逻辑（阶段十二工单 12.7 / V2-05；配置面 19.31 扩证书、
 * 19.30 扩通知面与窗口行为）：desktop.json 装载（fail-closed 回缺省）、事件→通知映射、
 * 去抖闸门、通知投递判据。Notification / Tray / powerSaveBlocker / 登录项本体由壳层
 * （main.ts、notify-wiring.ts）注入——本模块不 import electron，保持可单测。
 */
import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'

/**
 * 两枚内置开关之外的可通知事件白名单（19.30「通知面扩容」）：只收「用户回到窗口才有事
 * 可做」的事件。写白名单外的值 = 形状不符 → 整份配置回缺省并 warn（宁可报废，也不留
 * "配了没反应"的假开关）。
 */
export const EXTRA_NOTIFY_EVENTS = ['error', 'goal.completed', 'goal.paused'] as const
export type ExtraNotifyEvent = (typeof EXTRA_NOTIFY_EVENTS)[number]

/** 内置开关对应的通知种类 */
export type NotifyKind = 'turnCompleted' | 'approvalWaiting'
/** 全部可通知种类（闸门 key 与文案表同源） */
export type NotifyTarget = NotifyKind | ExtraNotifyEvent

const NotificationsSchema = z.strictObject({
  turnCompleted: z.boolean().default(true),
  approvalWaiting: z.boolean().default(true),
  /** 提示音：经 Notification.silent 反向生效（Linux 不实现 silent——notificationSoundOf） */
  sound: z.boolean().default(true),
  /** 同会话同类通知的合并窗口（19.30 前是硬编码 2000ms） */
  debounceMs: z.number().int().min(0).max(60_000).default(2000),
  /** 额外订阅的事件类型；缺省空 = 通知面与 19.30 前完全一致 */
  events: z.array(z.enum(EXTRA_NOTIFY_EVENTS)).default([]),
})

const CertificatesSchema = z.strictObject({
  nodeExtraCaCerts: z.string().nullable().default(null),
})

/** 段缺省值 = 本段 schema 自己 parse 空对象的结果：内层默认值的单一来源
 * （手写第二份字面量迟早与内层漂） */
const NOTIFICATIONS_DEFAULT = NotificationsSchema.parse({})
const CERTIFICATES_DEFAULT = CertificatesSchema.parse({})

const DesktopConfigSchema = z.strictObject({
  /** 段与各键皆可缺省——只配一段的手写文件不该连带判废另一段（19.31 口径） */
  notifications: NotificationsSchema.default(NOTIFICATIONS_DEFAULT),
  /** 自定义 CA（19.31 / V2-06 桌面半边）：壳层拉起 sidecar 前注入 NODE_EXTRA_CA_CERTS */
  certificates: CertificatesSchema.default(CERTIFICATES_DEFAULT),
  /** 关窗隐藏到托盘（缺省 false = 既有语义：关窗即退出）；仅托盘可用时才隐藏 */
  hideOnClose: z.boolean().default(false),
  /** 运行期间阻止系统空闲入睡（powerSaveBlocker 'prevent-display-sleep'，退出即 stop） */
  keepAwake: z.boolean().default(false),
  /** 开机自启（仅打包态 Windows/macOS 生效——resolveAutoLaunch 的平台判据在壳层） */
  autoLaunch: z.boolean().default(false),
})

export type DesktopConfig = z.infer<typeof DesktopConfigSchema>

/** 缺省值由 schema 现推（单一来源）：新增键不必再手改第二份常量，也不会漂 */
export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = DesktopConfigSchema.parse({})

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
      warn(`desktop.json 形状不符，整份配置回缺省：${result.error.issues[0]?.path.join('.') ?? ''}`)
      return DEFAULT_DESKTOP_CONFIG
    }
    return result.data
  } catch (err) {
    warn(`desktop.json 不是合法 JSON，整份配置回缺省：${err instanceof Error ? err.message : String(err)}`)
    return DEFAULT_DESKTOP_CONFIG
  }
}

/**
 * 通知文案（body 只含会话标题与状态词——脱敏红线：消息正文/错误文本/目标内容一律不进
 * 系统通知，它们可能带密钥或私有路径）。`{session}` 由投递时替换成会话标题。
 */
export const NOTIFY_COPY: Record<NotifyTarget, { title: string; body: string }> = {
  turnCompleted: { title: 'Spark · 回合完成', body: '「{session}」的回合已结束' },
  approvalWaiting: { title: 'Spark · 等待审批', body: '「{session}」有一个操作等待你的批准' },
  error: { title: 'Spark · 运行出错', body: '「{session}」报告了一个错误，请回到窗口查看' },
  'goal.completed': { title: 'Spark · 目标已完成', body: '「{session}」的持续目标已结束' },
  'goal.paused': { title: 'Spark · 目标已暂停', body: '「{session}」的持续目标已暂停，需你决定下一步' },
}

/** 事件类型 → 通知种类（null = 不发：开关关了，或不在通知面内） */
export function notifyTargetOf(cfg: DesktopConfig, eventType: string): NotifyTarget | null {
  if (eventType === 'turn.completed') return cfg.notifications.turnCompleted ? 'turnCompleted' : null
  if (eventType === 'permission.asked') return cfg.notifications.approvalWaiting ? 'approvalWaiting' : null
  const subscribed: readonly string[] = cfg.notifications.events
  return EXTRA_NOTIFY_EVENTS.find((t) => t === eventType && subscribed.includes(t)) ?? null
}

/**
 * 提示音 → Notification.silent（Electron 只在 Windows/macOS 实现 silent，Linux 忽略该
 * 键）：sound=false 在 Linux 无从生效，如实回一句 caveat 供壳层 warn，不谎称已静音。
 */
export function notificationSoundOf(
  platform: NodeJS.Platform,
  sound: boolean,
): { silent: boolean; caveat: string | null } {
  if (platform === 'linux') {
    return {
      silent: false,
      caveat: sound
        ? null
        : 'Linux 桌面通知不实现 silent——notifications.sound=false 在本平台不生效',
    }
  }
  return { silent: !sound, caveat: null }
}

/** 通知视角的信封切片（SSE 帧 payload 的 JSON 形状） */
export interface NotifyEnvelope {
  type: string
  sessionId: string
  requestId: string | null
}

/**
 * 帧 payload → 信封切片（不合格返回 null）。刻意不做全量 schema 校验：通知是尽力而为的
 * 旁路，坏帧忽略即可，事件校验的红线在 protocol/server 侧，壳侧再校一遍是幻觉防御。
 */
export function toNotifyEnvelope(raw: unknown): NotifyEnvelope | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as { type?: unknown; sessionId?: unknown; data?: unknown }
  if (typeof o.type !== 'string' || typeof o.sessionId !== 'string') return null
  const data = o.data
  const rid =
    typeof data === 'object' && data !== null
      ? (data as { requestId?: unknown }).requestId
      : undefined
  return { type: o.type, sessionId: o.sessionId, requestId: typeof rid === 'string' ? rid : null }
}

/** 去抖闸门：同 (session, kind) 一个合并窗口内只发一次；审批按 requestId 一次一发（resolved 移除） */
export class NotifyGate {
  private readonly lastSentAt = new Map<string, number>()
  private readonly pendingApprovals = new Set<string>()

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly mergeWindowMs = 2000,
  ) {}

  /** 返回 true = 该发；false = 被合并/去重 */
  decide(sessionId: string, kind: NotifyTarget, requestId?: string): boolean {
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

/**
 * 一条信封的通知投递判据（配置过滤 → 去抖闸门 → 取标题 → emit）。
 * titleOf 由壳层实现（取不到时回退短 id，不抛错）；本函数把 emit 的异常上抛给调用方记
 * 日志——通知失败要看得见，不留悬空 promise。
 */
export async function handleNotifyEnvelope(
  env: NotifyEnvelope,
  deps: {
    cfg: DesktopConfig
    gate: NotifyGate
    titleOf: (sessionId: string) => Promise<string>
    emit: (title: string, body: string) => void
  },
): Promise<void> {
  if (env.type === 'permission.resolved') {
    // resolved 与开关无关：不清就得不到新审批的通知
    if (env.requestId !== null) deps.gate.markResolved(env.requestId)
    return
  }
  const target = notifyTargetOf(deps.cfg, env.type)
  if (target === null) return
  if (!deps.gate.decide(env.sessionId, target, env.requestId ?? undefined)) return
  const copy = NOTIFY_COPY[target]
  const title = await deps.titleOf(env.sessionId)
  deps.emit(copy.title, copy.body.replaceAll('{session}', title))
}
