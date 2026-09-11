// @vitest-environment jsdom
/**
 * useVoiceInput 单测（工单 16.6）：jsdom 无 MediaRecorder/getUserMedia——全局 stub 最小
 * 假实现，断言状态机 idle→recording→transcribing→idle、文本回填、权限拒绝 fail-closed、
 * stop 幂等。转写错误路径以 reject 的 transport 假体覆盖（错误如实呈现不假成功）。
 */
import './dom-stubs'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transport } from '@spark/protocol'
import { useVoiceInput } from '@/features/chat/useVoiceInput'

afterEach(cleanup)

/** 最小 MediaRecorder 假体：start/stop 可控，onstop 手动触发 */
class FakeRecorder {
  static instances: FakeRecorder[] = []
  static supports: string[] = ['audio/webm;codecs=opus']
  mimeType = 'audio/webm;codecs=opus'
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((ev: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  stopped = 0
  constructor() {
    FakeRecorder.instances.push(this)
  }
  start(): void {
    this.state = 'recording'
    this.ondataavailable?.({ data: new Blob(['a'], { type: 'audio/webm' }) })
  }
  stop(): void {
    if (this.state !== 'recording') return
    this.state = 'inactive'
    this.stopped += 1
    this.onstop?.()
  }
}

const fakeStream = { getTracks: () => [{ stop: () => {} }] } as unknown as MediaStream

function stubGlobals(opts?: { deny?: boolean }): void {
  FakeRecorder.instances = []
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(FakeRecorder, 'isTypeSupported', {
    value: (t: string) => FakeRecorder.supports.includes(t),
    writable: true,
  })
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: () => {
        if (opts?.deny === true) {
          return Promise.reject(new DOMException('denied', 'NotAllowedError'))
        }
        return Promise.resolve(fakeStream)
      },
    },
  })
  vi.stubGlobal('btoa', (s: string) => Buffer.from(s, 'binary').toString('base64'))
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('useVoiceInput（工单 16.6）', () => {
  it('tap 全链路：start→recording，stop→transcribing→idle 并回填文本', async () => {
    stubGlobals()
    const received: string[] = []
    const transport = {
      transcribe: () => Promise.resolve({ text: '你好世界', provider: 'mock', model: 'mock-transcribe' }),
    } as unknown as Transport
    const { result } = renderHook(() => useVoiceInput({ transport, onText: (t) => received.push(t) }))
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.phase).toBe('recording')
    await act(async () => {
      result.current.stop()
    })
    // waitFor 不嵌在 act 内（RTL 纪律：嵌套会与 act 刷新队列互锁，phase 停在最后刷新值 'recording'）
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(received).toEqual(['你好世界'])
    expect(FakeRecorder.instances[0]?.stopped).toBe(1)
  })

  it('权限拒绝 fail-closed：error 人话呈现且不回填文本', async () => {
    stubGlobals({ deny: true })
    const received: string[] = []
    const transport = { transcribe: () => Promise.resolve({ text: 'x', provider: 'm', model: 'm' }) } as unknown as Transport
    const { result } = renderHook(() => useVoiceInput({ transport, onText: (t) => received.push(t) }))
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.phase).toBe('idle')
    expect(result.current.error).toContain('麦克风权限被拒绝')
    expect(received).toEqual([])
  })

  it('转写失败：error 如实透出（不假成功），dismissError 可清除', async () => {
    stubGlobals()
    const transport = {
      transcribe: () => Promise.reject(new Error('E_TRANSCRIBE_UPSTREAM: 转写服务返回 500')),
    } as unknown as Transport
    const { result } = renderHook(() => useVoiceInput({ transport, onText: () => {} }))
    await act(async () => {
      await result.current.start()
    })
    await act(async () => {
      result.current.stop()
    })
    // waitFor 不嵌在 act 内（同上：避免与 act 刷新互锁）
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(result.current.error).toContain('E_TRANSCRIBE_UPSTREAM')
    act(() => {
      result.current.dismissError()
    })
    expect(result.current.error).toBeNull()
  })

  it('stop 幂等：重复调用只触发一次 recorder.stop', async () => {
    stubGlobals()
    const transport = { transcribe: () => Promise.resolve({ text: 'x', provider: 'm', model: 'm' }) } as unknown as Transport
    const { result } = renderHook(() => useVoiceInput({ transport, onText: () => {} }))
    await act(async () => {
      await result.current.start()
    })
    act(() => {
      result.current.stop()
      result.current.stop()
    })
    expect(FakeRecorder.instances[0]?.stopped).toBe(1)
  })
})
