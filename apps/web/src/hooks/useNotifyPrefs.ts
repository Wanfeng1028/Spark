/**
 * 任务通知偏好（阶段十九 19.13）：web 本地偏好（localStorage）——不写 spark.json
 * （服务端设置是引擎行为，通知是端侧偏好；desktop 端另有 desktop.json 开关，互不跨管）。
 * 降级面：Notification API 缺失（非安全上下文/浏览器限制）→ enabled 强制 false 并如实呈现；
 * 提示音走 WebAudio 合成（无音频文件依赖），权限在首次触发时由浏览器询问。
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

/** 提示音（WebAudio 合成短促双音；无音频文件依赖，失败静默） */
export function playNotifySound(): void {
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
 * 首次启用时由调用处 requestPermission）。失败静默（通知是增强，不是正确性依赖）。
 */
export function notifyTask(title: string, body: string): void {
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

/** 订阅通知触发源：会话回合结束时按偏好发通知 + 提示音。
 *  hidden 时才发系统通知；提示音同样只在 hidden（前台用户已在看，不需要声音）。 */
export function useTaskNotifier(onTurnSettled: (handler: (title: string, body: string) => void) => () => void): void {
  const { enabled, sound } = useNotifyPrefs()
  useEffect(() => {
    if (!enabled && !sound) return
    return onTurnSettled((title, body) => {
      if (document.visibilityState !== 'visible') {
        if (enabled) notifyTask(title, body)
        if (sound) playNotifySound()
      }
    })
  }, [enabled, sound, onTurnSettled])
}
