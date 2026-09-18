// @vitest-environment jsdom
/**
 * useCopy 单测（AUD-13）：复制态定时器「先清旧再设新」防连点提前复位 +
 * 卸载清理。jsdom 无 navigator.clipboard——测试内桩掉 writeText（零新增依赖）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useCopy } from '@/hooks/useCopy'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function stubClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
}

describe('useCopy（AUD-13 定时器纪律）', () => {
  it('连点复制：旧定时器被清，已复制态不被提前复位', async () => {
    stubClipboard()
    vi.useFakeTimers()
    const { result } = renderHook(() => useCopy())
    await act(async () => {
      await result.current.copy('第一次') // 定时器 A：t=1500 到期
    })
    expect(result.current.copied).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1000) // t=1000
    })
    await act(async () => {
      await result.current.copy('第二次') // 清掉 A，定时器 B：t=2500 到期
    })
    act(() => {
      vi.advanceTimersByTime(500) // t=1500：若无"先清旧"，A 在此刻提前复位
    })
    expect(result.current.copied).toBe(true) // 仍已复制
    act(() => {
      vi.advanceTimersByTime(1000) // t=2500：B 到期
    })
    expect(result.current.copied).toBe(false)
  })

  it('复制失败（writeText reject）→ 复制态复位、不向调用方抛出', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('E_CLIP: 拒绝')) },
      configurable: true,
    })
    const { result } = renderHook(() => useCopy())
    await act(async () => {
      await result.current.copy('x')
    })
    expect(result.current.copied).toBe(false)
  })

  it('卸载后定时器被清理（冒烟：推进时钟不抛、无残留回调）', async () => {
    stubClipboard()
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useCopy())
    await act(async () => {
      await result.current.copy('x')
    })
    unmount()
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(2000)
      })
    }).not.toThrow()
  })
})
