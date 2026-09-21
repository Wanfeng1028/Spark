/**
 * 壳层窗口行为纯判据单测（工单 19.30）：关窗隐藏/退出的决策矩阵、保持运行的持锁生命周期
 * （防 powerSaveBlocker 泄漏）、开机自启的平台支持面、托盘位图形状。
 * Electron 的 Tray/powerSaveBlocker/登录项本体不在此——只测注入面。
 */
import { describe, expect, test } from 'vitest'
import { buildTrayBitmap, TRAY_ICON_PX } from '../src/tray-icon.js'
import {
  decideCloseAction,
  resolveAutoLaunch,
  SleepBlocker,
  type PowerSaveBlockerLike,
} from '../src/window-behavior.js'

describe('decideCloseAction（关窗隐藏还是退出）', () => {
  test('缺省（hideOnClose=false）= 既有语义：关窗销毁窗口', () => {
    expect(decideCloseAction({ hideOnClose: false, trayReady: true, quitting: false })).toBe('quit')
    expect(decideCloseAction({ hideOnClose: false, trayReady: false, quitting: false })).toBe('quit')
  })

  test('hideOnClose + 托盘可用才隐藏', () => {
    expect(decideCloseAction({ hideOnClose: true, trayReady: true, quitting: false })).toBe('hide')
  })

  test('托盘不可用时回退退出——藏起来找不回来比退出更糟', () => {
    expect(decideCloseAction({ hideOnClose: true, trayReady: false, quitting: false })).toBe('quit')
  })

  test('退出意图一律放行销毁（否则 preventDefault 会卡住 app.quit）', () => {
    expect(decideCloseAction({ hideOnClose: true, trayReady: true, quitting: true })).toBe('quit')
  })
})

describe('resolveAutoLaunch（开机自启的平台支持面如实处理）', () => {
  test('打包态 win32/darwin：照配置写登录项（false 也要写——清掉历史注册）', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      expect(resolveAutoLaunch({ autoLaunch: true }, { platform, packaged: true })).toEqual({
        supported: true,
        openAtLogin: true,
        note: null,
      })
      expect(resolveAutoLaunch({ autoLaunch: false }, { platform, packaged: true })).toEqual({
        supported: true,
        openAtLogin: false,
        note: null,
      })
    }
  })

  test('Linux 无从生效：不注册，配了 true 才吭一声（缺省 false 无话可说）', () => {
    expect(resolveAutoLaunch({ autoLaunch: false }, { platform: 'linux', packaged: true })).toEqual({
      supported: false,
      openAtLogin: false,
      note: null,
    })
    const on = resolveAutoLaunch({ autoLaunch: true }, { platform: 'linux', packaged: true })
    expect(on.supported).toBe(false)
    expect(on.note).toContain('Linux')
  })

  test('开发态（未打包）不写登录项——那会把 electron.exe 注册进用户开机启动', () => {
    const off = resolveAutoLaunch({ autoLaunch: false }, { platform: 'win32', packaged: false })
    expect(off.supported).toBe(false)
    expect(off.note).toBeNull()
    const on = resolveAutoLaunch({ autoLaunch: true }, { platform: 'win32', packaged: false })
    expect(on.supported).toBe(false)
    expect(on.note).toContain('未打包')
  })
})

function fakeBlocker(): { blocker: PowerSaveBlockerLike; started: string[]; stopped: number[] } {
  const started: string[] = []
  const stopped: number[] = []
  let nextId = 10
  return {
    started,
    stopped,
    blocker: {
      start: (type) => {
        started.push(type)
        return nextId++
      },
      stop: (id) => {
        stopped.push(id)
        return true
      },
    },
  }
}

describe('SleepBlocker（保持运行的持锁生命周期，19.30 keepAwake）', () => {
  test('keepAwake=false → 一次都不 start', () => {
    const f = fakeBlocker()
    const b = new SleepBlocker(f.blocker)
    b.apply(false)
    b.apply(false)
    expect(f.started).toEqual([])
    expect(f.stopped).toEqual([])
  })

  test('重复 apply(true) 不叠加持锁（每次 start 都是一个系统级持锁）', () => {
    const f = fakeBlocker()
    const b = new SleepBlocker(f.blocker)
    b.apply(true)
    b.apply(true)
    // 取 prevent-display-sleep 而非 prevent-app-suspension：后者不阻止系统入睡（见模块注释）
    expect(f.started).toEqual(['prevent-display-sleep'])
    expect(b.active).toBe(true)
  })

  test('关掉后 stop 一次且只一次；再关不重复 stop', () => {
    const f = fakeBlocker()
    const b = new SleepBlocker(f.blocker)
    b.apply(true)
    b.apply(false)
    b.apply(false)
    expect(f.stopped).toEqual([10])
    expect(b.active).toBe(false)
  })

  test('退出收口 release() 幂等：任何 apply 序列后 release 都不留持锁', () => {
    const f = fakeBlocker()
    const b = new SleepBlocker(f.blocker)
    b.release() // 没启动过就退出：不该 stop 别人的 id
    expect(f.stopped).toEqual([])
    b.apply(true)
    b.apply(true)
    b.release()
    b.release()
    expect(f.stopped).toEqual([10])
    expect(b.active).toBe(false)
  })

  test('stop 返回 false（id 已失效）时记一句，不静默', () => {
    const logs: string[] = []
    const b = new SleepBlocker(
      { start: () => 42, stop: () => false },
      (m) => logs.push(m),
    )
    b.apply(true)
    b.release()
    expect(logs.join('\n')).toContain('42')
  })
})

describe('buildTrayBitmap（托盘位图，无位图资产的几何缺省）', () => {
  const at = (px: Buffer, size: number, x: number, y: number): number[] => {
    const i = (y * size + x) * 4
    return [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0, px[i + 3] ?? 0]
  }

  test('字节数 = size*size*4（createFromBitmap 的硬要求）', () => {
    expect(buildTrayBitmap(TRAY_ICON_PX).length).toBe(TRAY_ICON_PX * TRAY_ICON_PX * 4)
    expect(buildTrayBitmap(8).length).toBe(8 * 8 * 4)
  })

  test('四角透明、圆心不透明白、外环不透明黑（深浅托盘底都看得见）', () => {
    const size = TRAY_ICON_PX
    const px = buildTrayBitmap(size)
    expect(at(px, size, 0, 0)[3]).toBe(0)
    expect(at(px, size, size - 1, size - 1)[3]).toBe(0)
    const c = Math.floor(size / 2)
    expect(at(px, size, c, c)).toEqual([255, 255, 255, 255])
    // (7,1) 落在外环（6.0 < d ≤ 7.5）：黑且不透明
    expect(at(px, size, 7, 1)).toEqual([0, 0, 0, 255])
  })

  test('不传尺寸时用 TRAY_ICON_PX', () => {
    expect(buildTrayBitmap().length).toBe(buildTrayBitmap(TRAY_ICON_PX).length)
  })
})
