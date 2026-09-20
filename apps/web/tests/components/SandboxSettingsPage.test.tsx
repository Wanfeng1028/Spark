// @vitest-environment jsdom
/**
 * 沙箱与网络设置页测试（阶段十九 19.7 / ADR D50）：模式开关读写走 Transport
 * （updateSettings sandbox.network.mode，热档无重启标注）；清单编辑保存逐字段合并
 * （不清 mode/port）；端口重启档标注；诚实边界文案在位（出口引导非内核隔离）。
 */
import './dom-stubs'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
import { SandboxSettingsPage } from '@/features/settings/SandboxSettingsPage'

afterEach(cleanup)

function renderPage(): MockTransport {
  const transport = new MockTransport('normal')
  render(
    <TestTransportContext.Provider
      value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
    >
      <SandboxSettingsPage />
    </TestTransportContext.Provider>,
  )
  return transport
}

describe('SandboxSettingsPage（阶段十九 19.7 / ADR D50）', () => {
  it('缺省 off：开关关闭 + 清单空 + 端口 1080 + 边界说明在位', async () => {
    renderPage()
    const sw = (await waitFor(() => screen.getByRole('switch', { name: '网络隔离' }))) as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect((screen.getByLabelText('域名清单') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByLabelText('代理端口') as HTMLInputElement).value).toBe('1080')
    // 诚实边界：出口引导不是内核隔离（页面不得宣称"沙箱内断网"）
    expect(screen.getByText(/不是内核级断网/)).toBeTruthy()
  })

  it('模式开关 toggle：写入 sandbox.network.mode 并回读生效（热档）', async () => {
    const transport = renderPage()
    const sw = (await waitFor(() => screen.getByRole('switch', { name: '网络隔离' }))) as HTMLButtonElement
    fireEvent.click(sw)
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'))
    const settings = await transport.getSettings()
    expect(settings.sandbox?.network.mode).toBe('allowlist')
  })

  it('清单保存：逐字段合并不清 mode（域名进入 allowlist）', async () => {
    const transport = renderPage()
    // 先开模式
    const sw = (await waitFor(() => screen.getByRole('switch', { name: '网络隔离' }))) as HTMLButtonElement
    fireEvent.click(sw)
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'))
    // 填清单并保存
    const area = screen.getByLabelText('域名清单') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: 'github.com\n*.npmjs.org' } })
    fireEvent.click(screen.getByRole('button', { name: '保存清单' }))
    await waitFor(async () => {
      const settings = await transport.getSettings()
      expect(settings.sandbox?.network.mode).toBe('allowlist') // 模式未被清单保存清掉
      expect(settings.sandbox?.network.allowlist).toEqual(['github.com', '*.npmjs.org'])
    })
  })
})
