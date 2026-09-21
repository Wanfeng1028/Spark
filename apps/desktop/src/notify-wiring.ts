/**
 * 通知订阅接线（工单 12.7；阶段十九 19.30 补断线重连与配置面扩容）：全局事件流 →
 * 过滤/去抖/取会话标题（判据全在 notify.ts、连接与重连在 notify-stream.ts）→ 系统通知。
 * body 只含会话标题与状态词（脱敏红线：无消息正文）。
 *
 * 点击通知唤窗（19.30）：关窗隐藏形态下它与托盘并列，是把窗口找回来的入口；窗口引用
 * 因此换成壳层注入的 reveal 回调——本模块不持 BrowserWindow，electron 依赖只剩
 * Notification 本体。
 */
import type { Notification as ElectronNotification } from 'electron'
import {
  handleNotifyEnvelope,
  notificationSoundOf,
  NotifyGate,
  toNotifyEnvelope,
  type DesktopConfig,
} from './notify.js'
import { runNotifyStream } from './notify-stream.js'

export interface NotifyWiring {
  stop(): void
}

export function startNotifications(opts: {
  port: number
  /** 已装载的桌面配置：与拉起 sidecar 用的是同一份（避免二次读文件、二次 warn） */
  cfg: DesktopConfig
  NotificationCtor: typeof ElectronNotification
  /** 托盘隐藏态下的窗口唤回（restore + show + focus） */
  reveal: () => void
  platform?: NodeJS.Platform
  fetchFn?: typeof fetch
}): NotifyWiring {
  const fetchFn = opts.fetchFn ?? fetch
  const cfg = opts.cfg
  const gate = new NotifyGate(() => Date.now(), cfg.notifications.debounceMs)
  const titles = new Map<string, string>()
  const controller = new AbortController()

  // 提示音：sound=false 在 Linux 无从生效（Electron 不实现该平台 silent）——如实 warn 一次
  const sound = notificationSoundOf(opts.platform ?? process.platform, cfg.notifications.sound)
  if (sound.caveat !== null) console.warn(`[desktop] ${sound.caveat}`)

  const titleOf = async (sessionId: string): Promise<string> => {
    const hit = titles.get(sessionId)
    if (hit !== undefined) return hit
    try {
      const res = await fetchFn(`http://127.0.0.1:${opts.port}/api/sessions`)
      if (res.ok) {
        const list = (await res.json()) as Array<{ id: string; title: string }>
        for (const s of list) titles.set(s.id, s.title === '' ? '新会话' : s.title)
      }
    } catch {
      // 标题取不到就用短 id（不阻塞通知本身）
    }
    return titles.get(sessionId) ?? sessionId.slice(-8)
  }

  const emit = (title: string, body: string): void => {
    const n = new opts.NotificationCtor({ title, body, silent: sound.silent })
    n.on('click', () => opts.reveal())
    n.show()
  }

  /** 断线只报一次：sidecar 未恢复时退避序列会一直重连，逐次刷 stderr 是噪声 */
  let warnedReconnect = false
  void runNotifyStream({
    url: `http://127.0.0.1:${opts.port}/api/event`,
    fetchFn,
    signal: controller.signal,
    onStatus: (s) => {
      if (s === 'open') {
        warnedReconnect = false
        return
      }
      if (warnedReconnect) return
      warnedReconnect = true
      console.warn('[desktop] 通知事件流断开，退避重连中（sidecar 恢复即自动接上）')
    },
    onEvent: (payload) => {
      const env = toNotifyEnvelope(payload)
      if (env === null) return
      handleNotifyEnvelope(env, { cfg, gate, titleOf, emit }).catch((err: unknown) => {
        console.error('[desktop] 通知投递失败', err)
      })
    },
  })

  return {
    stop() {
      controller.abort()
    },
  }
}
