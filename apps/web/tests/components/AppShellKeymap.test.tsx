// @vitest-environment jsdom
/**
 * AppShell 快捷键查生效键位表（阶段十九 19.39 第二批）：这几条是"覆盖层真接管了按下"的
 * 判别性证据——把 AppShell 改回硬编码 `e.key === 'k'`，第 2、3 条必须红。
 * 走真实链路（mock settings → boot 装载进 ui store → useEffectiveKeymap → keydown 比对），
 * 不直接捅 store：那样既测不到装载路径，也会与 boot 的异步写入打架。
 */
import './dom-stubs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { KEYMAP_ACTIONS, type KeyOverride } from '@spark/protocol'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
import { useUiStore } from '@/stores/ui'
import { AppShell } from '@/components/layout/AppShell'

/**
 * 只替掉 cmdk 那一层：Ctrl+K 一旦开面板，CommandPalette 挂载就会调 jsdom 未实现的
 * `Element.scrollIntoView`（cmdk@1.1.1 抛 TypeError）——那是测试环境缺口，不是产品缺陷。
 * 本用例要证的是"keydown 查生效键位表并翻转 paletteOpen"，与面板自身渲染无关。
 * 整棵 web 树里 cmdk 只有一条入口（ui/command.tsx → CommandPalette → AppShell），替掉即全隔离。
 */
vi.mock('@/features/palette/CommandPalette', () => ({ CommandPalette: () => null }))

afterEach(() => {
  cleanup()
  useUiStore.setState({ paletteOpen: false, keymapOverrides: [] })
})

async function renderShell(overrides?: readonly KeyOverride[]): Promise<void> {
  const transport = new MockTransport('normal')
  if (overrides !== undefined) {
    await transport.updateSettings({ ui: { keymap: { overrides: [...overrides] } } })
  }
  render(
    <MemoryRouter initialEntries={['/']}>
      <TestTransportContext.Provider
        value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
      >
        <AppShell>
          <div>内容</div>
        </AppShell>
      </TestTransportContext.Provider>
    </MemoryRouter>,
  )
  // 等 boot 装载落定：否则随后的 keydown 会打在尚未写入的覆盖层上（假绿或假红都可能）
  await waitFor(() =>
    expect(useUiStore.getState().keymapOverrides).toEqual(overrides === undefined ? [] : [...overrides]),
  )
}

describe('AppShell 快捷键 = 生效键位表（19.39 第二批）', () => {
  it('缺省 Ctrl+K 开命令面板', async () => {
    await renderShell()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await waitFor(() => expect(useUiStore.getState().paletteOpen).toBe(true))
  })

  it('改绑后旧键失效、新键生效', async () => {
    await renderShell([{ action: KEYMAP_ACTIONS.palette, keys: 'Ctrl+J' }])
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(useUiStore.getState().paletteOpen).toBe(false)
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(useUiStore.getState().paletteOpen).toBe(true))
  })

  it('解绑后内置键不再触发（不得静默回落）', async () => {
    await renderShell([{ action: KEYMAP_ACTIONS.palette, keys: '' }])
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(useUiStore.getState().paletteOpen).toBe(false)
  })

  it('Cmd 与 Ctrl 任一即算（Ctrl/Cmd+K 的跨平台写法）', async () => {
    await renderShell()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await waitFor(() => expect(useUiStore.getState().paletteOpen).toBe(true))
  })

  it('多一个 Shift 不触发——可改键位后必须精确匹配，否则改绑 Ctrl+Shift+K 会与旧键同时命中', async () => {
    await renderShell()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true })
    expect(useUiStore.getState().paletteOpen).toBe(false)
  })
})
