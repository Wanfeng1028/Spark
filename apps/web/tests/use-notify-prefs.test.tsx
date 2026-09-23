// @vitest-environment jsdom
/**
 * 任务通知与提示音单测（阶段十九 19.13 接线批）：useTaskNotifier 是「事件流回合终止 →
 * 端侧副作用」的唯一判定处——前台静默、系统通知与提示音各按自己的偏好决定、偏好每次派发
 * 现读 localStorage、卸载即退订；requestNotifyPermission 是设置页开关的用户手势入口
 * （未授权不得把开关拨成开）。
 * jsdom 无 Notification / AudioContext：全局 stub 最小假实现（同 voice-input.test 判例）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { publishTurnSettled, requestNotifyPermission, useTaskNotifier } from '@/hooks/useNotifyPrefs'

/** 最小 Notification 假体：记构造入参与 requestPermission 的返回值 */
class FakeNotification {
  static instances: { title: string; body: string }[] = []
  static permission: NotificationPermission = 'granted'
  static promptResult: NotificationPermission = 'granted'
  static promptCalls = 0
  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.instances.push({ title, body: options?.body ?? '' })
  }
  static requestPermission(): Promise<NotificationPermission> {
    FakeNotification.promptCalls += 1
    FakeNotification.permission = FakeNotification.promptResult
    return Promise.resolve(FakeNotification.promptResult)
  }
}

/** 最小 AudioContext 假体：playNotifySound 只用到 osc.start 与 close——记发声次数即可 */
class FakeAudioContext {
  static started = 0
  currentTime = 0
  destination = {}
  createGain(): { gain: { setValueAtTime: () => void; exponentialRampToValueAtTime: () => void } } {
    return {
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
    }
  }
  createOscillator(): {
    frequency: { value: number }
    type: string
    connect: () => { connect: () => void }
    start: () => void
    stop: () => void
    onended: (() => void) | null
  } {
    return {
      frequency: { value: 0 },
      type: 'sine',
      connect: () => ({ connect: () => {} }),
      start: () => {
        FakeAudioContext.started += 1
      },
      stop: () => {},
      onended: null,
    }
  }
  close(): void {}
}

/** jsdom 的 visibilityState 是 Document.prototype 上的只读 getter：在实例上遮蔽一个可改版本
 *  （可重复遮蔽，afterEach 无需还原——本文件每个用例都显式设定所需的前台/后台态） */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

/** 偏好落 localStorage（读入口 useNotifyPrefs 与设置页开关写入口同键） */
function seedPrefs(prefs: { enabled?: boolean; sound?: boolean }): void {
  localStorage.setItem('spark.notify', JSON.stringify({ enabled: false, sound: false, ...prefs }))
}

beforeEach(() => {
  FakeNotification.instances = []
  FakeNotification.permission = 'granted'
  FakeNotification.promptResult = 'granted'
  FakeNotification.promptCalls = 0
  FakeAudioContext.started = 0
  localStorage.clear()
  setVisibility('visible')
  vi.stubGlobal('Notification', FakeNotification)
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useTaskNotifier（阶段十九 19.13 接线）', () => {
  it('页面隐藏时两开关各触发一次：系统通知 + 提示音', () => {
    seedPrefs({ enabled: true, sound: true })
    setVisibility('hidden')
    renderHook(() => useTaskNotifier())
    publishTurnSettled('Spark', '任务有更新')
    expect(FakeNotification.instances).toEqual([{ title: 'Spark', body: '任务有更新' }])
    expect(FakeAudioContext.started).toBe(1)
  })

  it('只开提示音（Notification API 缺失的环境）仍发声，且不尝试发通知', () => {
    vi.stubGlobal('Notification', undefined)
    seedPrefs({ sound: true })
    setVisibility('hidden')
    renderHook(() => useTaskNotifier())
    publishTurnSettled('Spark', '任务有更新')
    expect(FakeAudioContext.started).toBe(1)
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('只开通知：发系统通知但不放提示音', () => {
    seedPrefs({ enabled: true })
    setVisibility('hidden')
    renderHook(() => useTaskNotifier())
    publishTurnSettled('Spark', '任务有更新')
    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeAudioContext.started).toBe(0)
  })

  it('两开关全关：派发无副作用', () => {
    setVisibility('hidden')
    renderHook(() => useTaskNotifier())
    publishTurnSettled('Spark', '任务有更新')
    expect(FakeNotification.instances).toHaveLength(0)
    expect(FakeAudioContext.started).toBe(0)
  })

  it('偏好现读：挂载后拨开关即生效（设置页与订阅点是两个实例，不靠组件 state 传递）', () => {
    setVisibility('hidden')
    renderHook(() => useTaskNotifier())
    publishTurnSettled('Spark', '任务有更新') // 此刻偏好还全关
    expect(FakeAudioContext.started).toBe(0)
    seedPrefs({ enabled: true, sound: true })
    publishTurnSettled('Spark', '任务有更新')
    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeAudioContext.started).toBe(1)
  })

  it('卸载即退订：卸载后的派发不再发声', () => {
    seedPrefs({ enabled: true, sound: true })
    setVisibility('hidden')
    const { unmount } = renderHook(() => useTaskNotifier())
    unmount()
    publishTurnSettled('Spark', '任务有更新')
    expect(FakeNotification.instances).toHaveLength(0)
    expect(FakeAudioContext.started).toBe(0)
  })

  it('前台静默：订阅在位，但可见态下不发不响', () => {
    seedPrefs({ enabled: true, sound: true })
    renderHook(() => useTaskNotifier())
    publishTurnSettled('Spark', '任务有更新')
    expect(FakeNotification.instances).toHaveLength(0)
    expect(FakeAudioContext.started).toBe(0)
  })
})

describe('requestNotifyPermission（设置页开关的用户手势入口）', () => {
  it('已授权直通：不再次请求权限', async () => {
    await expect(requestNotifyPermission()).resolves.toBe(true)
    expect(FakeNotification.promptCalls).toBe(0)
  })

  it('未决态（permission=default）请求权限，被拒即返回 false（开关不得置为开）', async () => {
    FakeNotification.permission = 'default'
    FakeNotification.promptResult = 'denied'
    await expect(requestNotifyPermission()).resolves.toBe(false)
    expect(FakeNotification.promptCalls).toBe(1)
  })

  it('已拒绝不再打扰：直接 false，不弹权限框', async () => {
    FakeNotification.permission = 'denied'
    await expect(requestNotifyPermission()).resolves.toBe(false)
    expect(FakeNotification.promptCalls).toBe(0)
  })

  it('Notification API 缺失返回 false', async () => {
    vi.stubGlobal('Notification', undefined)
    await expect(requestNotifyPermission()).resolves.toBe(false)
  })
})
