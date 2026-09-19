// @vitest-environment jsdom
/**
 * 电脑控制设置页测试（阶段十九 19.2）：主开关读写走 Transport（updateSettings
 * engine.computerUseEnabled，热档无重启标注）；八操作档位摘要缺省"逐次询问"；
 * 平台执行体说明如实呈现（mac 授权 / Linux 工具依赖 / Wayland 不支持）。
 */
import './dom-stubs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
import { ComputerSettingsPage } from '@/features/settings/ComputerSettingsPage'

afterEach(cleanup)

function renderPage(): MockTransport {
  const transport = new MockTransport('normal')
  render(
    <TestTransportContext.Provider
      value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
    >
      <ComputerSettingsPage />
    </TestTransportContext.Provider>,
  )
  return transport
}

describe('ComputerSettingsPage（阶段十九 19.2 / ADR D44）', () => {
  it('八操作清单 + 缺省档位摘要 + 平台说明如实呈现', async () => {
    renderPage()
    expect(screen.getByText('启用电脑控制')).toBeTruthy()
    await vi.waitFor(() => expect(screen.getAllByText('缺省逐次询问').length).toBe(8))
    // 档位摘要卡列出八操作的 resource 名
    for (const op of ['screenshot', 'click', 'type', 'key', 'scroll', 'window', 'app', 'clipboard']) {
      expect(screen.getByText(op)).toBeTruthy()
    }
    // 平台执行体三行（Windows 全量 / mac 授权 / Linux 工具依赖 + Wayland 不支持）
    expect(screen.getByText('Windows')).toBeTruthy()
    expect(screen.getByText('macOS')).toBeTruthy()
    expect(screen.getByText('Linux（X11）')).toBeTruthy()
    expect(screen.getByText(/Wayland 会话不支持/)).toBeTruthy()
  })

  it('主开关 toggle：写入 engine.computerUseEnabled 并回读生效（热档）', async () => {
    const transport = renderPage()
    const sw = (await vi.waitFor(() => screen.getByRole('switch', { name: '启用电脑控制' }))) as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false') // mock 缺省关（fail-closed 缺省的可视对齐）
    fireEvent.click(sw)
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'))
    // mock settings 真被更新（后续 getSettings 回读一致）
    const settings = await transport.getSettings()
    expect(settings.engine.computerUseEnabled).toBe(true)
  })
})
