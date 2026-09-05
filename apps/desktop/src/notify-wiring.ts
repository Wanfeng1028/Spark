/**
 * 通知订阅接线（工单 12.7）：GET /api/event 全局直播流 → 过滤 turn.completed /
 * permission.asked → 系统通知（body 只含会话标题与状态词——脱敏红线：无消息正文）；
 * click 聚焦主窗口。SSE 最小手写解析（fetch 流 + 空行分帧），不引新依赖。
 */
import type { BrowserWindow, Notification as ElectronNotification } from 'electron'
import { loadDesktopConfig, NotifyGate, shouldNotify, type DesktopConfig } from './notify.js'

/** SSE 帧解析：按空行分帧，取 data: 行拼 JSON（server 帧 = `event: message\ndata: {...}`）；解析失败返回 null */
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

export interface NotifyWiring {
  stop(): void
}

export function startNotifications(opts: {
  port: number
  win: BrowserWindow
  NotificationCtor: typeof ElectronNotification
  configPath: string
  fetchFn?: typeof fetch
}): NotifyWiring {
  const fetchFn = opts.fetchFn ?? fetch
  const cfg: DesktopConfig = loadDesktopConfig(opts.configPath, (m) => console.warn(m))
  const gate = new NotifyGate()
  const titles = new Map<string, string>()
  const controller = new AbortController()

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

  const notify = (title: string, body: string): void => {
    const n = new opts.NotificationCtor({ title, body })
    n.on('click', () => {
      if (opts.win.isMinimized()) opts.win.restore()
      opts.win.focus()
    })
    n.show()
  }

  void (async () => {
    try {
      const res = await fetchFn(`http://127.0.0.1:${opts.port}/api/event`, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      })
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        buf += decoder.decode(value, { stream: true })
        let idx = buf.indexOf('\n\n')
        while (idx !== -1) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const e = parseSseFrame(frame) as {
            type?: string
            sessionId?: string
            data?: { requestId?: string }
            id?: string
          } | null
          if (e !== null && typeof e.type === 'string' && typeof e.sessionId === 'string') {
            if (e.type === 'turn.completed' && shouldNotify(cfg, 'turnCompleted')) {
              if (gate.decide(e.sessionId, 'turnCompleted')) {
                void titleOf(e.sessionId).then((t) =>
                  notify('Spark · 回合完成', `「${t}」的回合已结束`),
                )
              }
            }
            if (e.type === 'permission.asked' && shouldNotify(cfg, 'approvalWaiting')) {
              const rid = e.data?.requestId
              if (typeof rid === 'string' && gate.decide(e.sessionId, 'approvalWaiting', rid)) {
                void titleOf(e.sessionId).then((t) =>
                  notify('Spark · 等待审批', `「${t}」有一个操作等待你的批准`),
                )
              }
            }
            if (e.type === 'permission.resolved') {
              const rid = e.data?.requestId
              if (typeof rid === 'string') gate.markResolved(rid)
            }
          }
          idx = buf.indexOf('\n\n')
        }
      }
    } catch {
      // 订阅断开（退出/网络）：通知静默停止——壳层不重连（桌面重启即恢复）
    }
  })()

  return {
    stop() {
      controller.abort()
    },
  }
}
