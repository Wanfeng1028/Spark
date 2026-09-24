// @vitest-environment jsdom
/**
 * 文档标题（工单 19.33）：桌面壳的窗口菜单靠 webContents.getTitle() 取窗口名，
 * 多窗口下没有它就只剩「窗口 1／窗口 2」这种分不清的项。这里锁三条口径——
 * 有标题用「标题 · Spark」、无会话与空标题都落 'Spark'（壳层据此退到「窗口 N」）、
 * 切会话即改（不留在上一个会话的标题上）。
 */
import './dom-stubs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { emptySessionSlice, ids } from '@spark/protocol'
import type { SessionId } from '@spark/protocol'
import { DocumentTitle } from '@/components/DocumentTitle'
import { useSessionStore } from '@/stores/session'

const A = ids.session('ses_a000000000000000000000001')
const B = ids.session('ses_b0000000000000000000000002')

function seed(sid: SessionId, title: string): void {
  const slice = emptySessionSlice(sid)
  slice.meta.title = title
  act(() => {
    useSessionStore.setState((s) => ({ byId: { ...s.byId, [sid]: slice }, activeId: sid }))
  })
}

beforeEach(() => {
  // store 是模块级单例：逐例清空，避免上一例的标题漏进下一例
  act(() => {
    useSessionStore.setState({ byId: {}, activeId: null })
  })
  document.title = 'Spark'
})

afterEach(() => {
  cleanup()
})

describe('DocumentTitle（19.33 窗口菜单的取名依据）', () => {
  it('无激活会话 → Spark（壳层据此显示「窗口 N」，不拿会话 id 顶替标题）', () => {
    render(<DocumentTitle />)
    expect(document.title).toBe('Spark')
  })

  it('有标题 → 「标题 · Spark」', () => {
    render(<DocumentTitle />)
    seed(A, '重构登录模块')
    expect(document.title).toBe('重构登录模块 · Spark')
  })

  it('空标题会话落回 Spark——不显示空串也不编一个标题', () => {
    render(<DocumentTitle />)
    seed(A, '')
    expect(document.title).toBe('Spark')
  })

  it('切激活会话即改标题（多窗口下每个窗口各自一份 store，故各窗标题独立）', () => {
    render(<DocumentTitle />)
    seed(A, '甲会话')
    expect(document.title).toBe('甲会话 · Spark')
    seed(B, '乙会话')
    expect(document.title).toBe('乙会话 · Spark')
    act(() => {
      useSessionStore.setState({ activeId: A })
    })
    expect(document.title).toBe('甲会话 · Spark')
  })
})
