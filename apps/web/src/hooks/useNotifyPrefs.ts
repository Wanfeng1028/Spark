/**
 * 任务通知偏好（阶段十九 19.13）：web 本地偏好（localStorage）——不写 spark.json
 * （服务端设置是引擎行为，通知是端侧偏好；desktop 端另有 desktop.json 开关，互不跨管）。
 * 降级面：Notification API 缺失（非安全上下文/浏览器限制）→ enabled 强制 false 并如实呈现；
 * 提示音走 WebAudio 合成（无音频文件依赖），通知权限在设置页开关开启时请求
 * （浏览器要求用户手势——notifyTask 只在已授权时发，未授权不静默假装发送）。
 */
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'spark.notify'

export interface NotifyPrefs {
  /** 回合完成/失败时发系统通知（页面在前台时不发） */
  enabled: boolean
  /** 通知时播放提示音 */
  sound: boolean
}

const DEFAULTS: NotifyPrefs = { enabled: false, sound: false }

function load(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<NotifyPrefs>
    return {
      enabled: parsed.enabled === true,
      sound: parsed.sound === true,
    }
  } catch {
    // 坏数据按默认（本地偏好，不值得 fail loudly——同 settings-store 口径）
    return { ...DEFAULTS }
  }
}

function persist(p: NotifyPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // 存不进（隐私模式等）——仅本次会话内生效
  }
}

/** 偏好读写 hook（set 部分合并；Notification API 缺失时 enabled 恒 false） */
export function useNotifyPrefs(): { enabled: boolean; sound: boolean; set: (patch: Partial<NotifyPrefs>) => void } {
  const supported = typeof Notification !== 'undefined'
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => {
    const p = load()
    return supported ? p : { ...p, enabled: false }
  })

  const set = useCallback((patch: Partial<NotifyPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      if (typeof Notification === 'undefined') next.enabled = false
      persist(next)
      return next
    })
  }, [])

  return { enabled: prefs.enabled && supported, sound: prefs.sound, set }
}

/** 提示音（WebAudio 合成短促双音；无音频文件依赖，失败静默）。只由 useTaskNotifier 按偏好调用，
 *  不导出——第二个发声入口就是漂移的起点。 */
function playNotifySound(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor === undefined) return
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => void ctx.close()
  } catch {
    // 音频不可用（自动播放策略等）——静默，通知本身不依赖它
  }
}

/**
 * 发一条任务通知（阶段十九 19.13）：页面可见时不发（前台无需打扰）；
 * 权限未授权 → 不请求不发送（浏览器要求用户手势——设置页开关即为授权入口，
 * 启用时由 requestNotifyPermission 请求）。失败静默（通知是增强，不是正确性依赖）。
 * 同 playNotifySound：只由 useTaskNotifier 按偏好调用，不导出。
 */
function notifyTask(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined') return
    if (document.visibilityState === 'visible') return
    if (Notification.permission !== 'granted') return
    new Notification(title, { body, tag: 'spark-task' })
  } catch {
    // 通知失败（权限/平台限制）——静默
  }
}

/** 启用通知时请求权限（设置页开关调用；返回是否获得授权） */
export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** 回合终止通知的订阅回调签名（title/body 由派发方给） */
type TurnSettledHandler = (title: string, body: string) => void

/** 订阅登记处（模块级单例，与 transports/context.tsx 的 replayCoordinator、各 store 同口径——
 *  应用只有一个 TransportProvider，也不允许第二个通知出口）。 */
const turnSettledHandlers = new Set<TurnSettledHandler>()

function subscribeTurnSettled(handler: TurnSettledHandler): () => void {
  turnSettledHandlers.add(handler)
  return () => {
    turnSettledHandlers.delete(handler)
  }
}

/**
 * 事件流回合终止 → 通知订阅点（阶段十九 19.13 接线）：由 transports/context.tsx 的 rAF
 * flush 判据命中后调用一次（每帧至多一条），useTaskNotifier 侧按偏好决定是否发声。
 * 遍历取快照：订阅者在回调里退订也不影响本次派发。
 */
export function publishTurnSettled(title: string, body: string): void {
  for (const handler of [...turnSettledHandlers]) handler(title, body)
}

/** 订阅事件流派发的回合终止通知（阶段十九 19.13 接线；派发点在 transports/context.tsx）。
 *  偏好**每次派发时现读 localStorage**：设置页的开关与本订阅点是两个 useNotifyPrefs 实例，
 *  跟着组件 state 走会让刚拨的开关非得刷新页面才生效。
 *  前台（visible）静默：通知与提示音都不打扰正在看的用户；两项偏好相互独立——
 *  Notification API 缺失的环境下提示音仍可用（不依赖通知权限）。 */
export function useTaskNotifier(): void {
  useEffect(
    () =>
      subscribeTurnSettled((title, body) => {
        if (document.visibilityState === 'visible') return
        const prefs = load()
        if (prefs.enabled) notifyTask(title, body)
        if (prefs.sound) playNotifySound()
      }),
    [],
  )
}
