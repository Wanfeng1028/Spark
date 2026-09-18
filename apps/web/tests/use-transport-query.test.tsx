// @vitest-environment jsdom
/**
 * useTransportQuery 竞态单测（AUD-14）：
 * ① 一次失败后旧 error 永久停留——成功提交必须同时清 error（错误态可恢复）；
 * ② effect 与 refresh 无共同代际——晚到的旧响应不得覆盖新数据。
 * 经 TestTransportContext 注入延迟 transport stub（既有 RTL 设施，零新增依赖）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Transport } from '@spark/protocol'
import { TestTransportContext } from '@/transports/context'
import type { MockScenario } from '@/transports/mock'
import { useTransportQuery } from '@/hooks/useTransportQuery'

afterEach(cleanup)

interface Deferred<T> {
  resolve: (v: T) => void
  reject: (err: unknown) => void
}

/** 延迟 transport stub：listModels 每次调用挂起，由测试逐个放行（放行顺序 = 调用顺序） */
function makeTransport(gets: Deferred<string>[]): Transport {
  return {
    listModels: () =>
      new Promise<string>((resolve, reject) => {
        gets.push({ resolve, reject })
      }),
  } as unknown as Transport
}

function makeWrapper(transport: Transport): (props: { children: ReactNode }) => ReactNode {
  const value = {
    transport,
    mock: true,
    scenario: 'normal' as MockScenario,
    setScenario: () => undefined,
  }
  return ({ children }) => (
    <TestTransportContext.Provider value={value}>{children}</TestTransportContext.Provider>
  )
}

describe('useTransportQuery（AUD-14 代际闸门）', () => {
  it('一次失败后，后续成功同时恢复数据并清掉 error', async () => {
    const gets: Deferred<string>[] = []
    const { result } = renderHook(() => useTransportQuery((t) => t.listModels()), {
      wrapper: makeWrapper(makeTransport(gets)),
    })
    expect(result.current.data).toBeNull()
    gets[0]?.reject(new Error('裸查询失败'))
    await waitFor(() => expect(result.current.error).toContain('裸查询失败'))
    act(() => {
      void result.current.refresh()
    })
    gets[1]?.resolve('新数据')
    await waitFor(() => expect(result.current.data).toBe('新数据'))
    expect(result.current.error).toBeNull() // 成功提交同时清 error——错误态可恢复
  })

  it('晚到的旧代响应不覆盖新数据（deps 切换 + refresh 竞态）', async () => {
    const gets: Deferred<string>[] = []
    const { result, rerender } = renderHook(
      ({ deps }: { deps: readonly unknown[] }) =>
        useTransportQuery((t) => t.listModels(), deps),
      { initialProps: { deps: ['a'] }, wrapper: makeWrapper(makeTransport(gets)) },
    )
    rerender({ deps: ['b'] }) // 代2 effect 发起（代1 作废）
    act(() => {
      void result.current.refresh() // 代3 发起
    })
    gets[2]?.resolve('新数据')
    await waitFor(() => expect(result.current.data).toBe('新数据'))
    gets[1]?.resolve('旧数据') // 代2 晚到返回
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.data).toBe('新数据') // 未被晚到的旧响应覆盖
  })
})
