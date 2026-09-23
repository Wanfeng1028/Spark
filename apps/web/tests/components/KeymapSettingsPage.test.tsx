// @vitest-environment jsdom
/**
 * 键位页测试（阶段十九 19.39 第二批）：只有带 spec 的行可编辑（其余只读并标"未接入"）、
 * 冲突与解析不出的键串都在保存前挡下、保存后写回 ui store（否则要重载才生效 = 另一种"改了不生效"）。
 */
import './dom-stubs'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KEYMAP_ACTIONS } from '@spark/protocol'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
import { useUiStore } from '@/stores/ui'
import { KeymapSettingsPage } from '@/features/settings/KeymapSettingsPage'

afterEach(() => {
  cleanup()
  useUiStore.setState({ keymapOverrides: [] })
})

function renderPage(): MockTransport {
  const transport = new MockTransport('normal')
  render(
    <TestTransportContext.Provider
      value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
    >
      <KeymapSettingsPage />
    </TestTransportContext.Provider>,
  )
  return transport
}

describe('KeymapSettingsPage（19.39 第二批）', () => {
  it('已接入的行可编辑，未接入的行只读并如实标注——不给一个改了不生效的输入框', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(KEYMAP_ACTIONS.palette)).toBeTruthy())
    expect(screen.getByLabelText(KEYMAP_ACTIONS.settings)).toBeTruthy()
    // '发送消息' 在内置表里没有 spec（Composer 的 Enter 未接覆盖层）→ 不得有输入框
    expect(screen.queryByLabelText('发送消息')).toBeNull()
    expect(screen.getByText('发送消息')).toBeTruthy()
    expect(screen.getAllByText('未接入').length).toBeGreaterThan(0)
  })

  it('无改动时保存禁用；改一个键后可编辑', async () => {
    renderPage()
    // 读 hasAttribute 而非 `.disabled`：getByRole 返回 HTMLElement（上没有 disabled 属性），
    // 补 `as HTMLButtonElement` 又被 no-unnecessary-type-assertion 判多余——两道闸互斥，
    // 只能换成读真实属性（按钮禁用本就以该属性呈现，语义等价）
    const save = await waitFor(() => screen.getByRole('button', { name: '保存' }))
    expect(save.hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText(KEYMAP_ACTIONS.palette), { target: { value: 'Ctrl+J' } })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(false))
  })

  it('冲突在保存前挡下：两条绑到同一个键 → 提示 + 保存禁用', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(KEYMAP_ACTIONS.palette)).toBeTruthy())
    // 与「设置面」的缺省 Ctrl/Cmd+, 撞车（palette=web、settings=both，共享生效面）
    fireEvent.change(screen.getByLabelText(KEYMAP_ACTIONS.palette), { target: { value: 'Ctrl/Cmd+,' } })
    await waitFor(() => expect(screen.getByText(/键位冲突/)).toBeTruthy())
    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(true)
  })

  it('解析不出的键串在保存前挡下——放行等于静默解绑', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(KEYMAP_ACTIONS.palette)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(KEYMAP_ACTIONS.palette), { target: { value: 'Ctrl+C ×2' } })
    await waitFor(() => expect(screen.getByText(/解析不出单一按键/)).toBeTruthy())
    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(true)
  })

  it('保存后落盘并写回 ui store（快捷键当场生效，不必重载）', async () => {
    const transport = renderPage()
    await waitFor(() => expect(screen.getByLabelText(KEYMAP_ACTIONS.palette)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(KEYMAP_ACTIONS.palette), { target: { value: 'Ctrl+J' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    const expected = [{ action: KEYMAP_ACTIONS.palette, keys: 'Ctrl+J' }]
    await waitFor(() => expect(useUiStore.getState().keymapOverrides).toEqual(expected))
    expect((await transport.getSettings()).ui?.keymap?.overrides).toEqual(expected)
  })

  it('留空 = 解除绑定，行上如实标"未绑定"而不是显示内置键当作仍生效', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(KEYMAP_ACTIONS.palette)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(KEYMAP_ACTIONS.palette), { target: { value: '' } })
    await waitFor(() => expect(screen.getByText('未绑定')).toBeTruthy())
  })
})
