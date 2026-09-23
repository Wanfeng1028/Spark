// @vitest-environment jsdom
/**
 * 引导设置页测试（阶段十九 19.15）：状态呈现（完成/未完成 + 步骤名）、
 * 供应商配置态走 Transport 真实数据源、重跑引导清标记、自动弹开关读写 localStorage。
 */
import './dom-stubs'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
import { OnboardingSettingsPage } from '@/features/settings/OnboardingSettingsPage'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function renderPage(): void {
  const transport = new MockTransport('normal')
  render(
    <MemoryRouter>
      <TestTransportContext.Provider
        value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
      >
        <OnboardingSettingsPage />
      </TestTransportContext.Provider>
    </MemoryRouter>,
  )
}

describe('OnboardingSettingsPage（阶段十九 19.15）', () => {
  it('未完成态：步骤与供应商配置态如实呈现', async () => {
    renderPage()
    expect(screen.getByText(/未完成/)).toBeTruthy()
    // 供应商配置态来自 MockTransport 的 MOCK_MODELS：四家供应商、deepseek 带 apiKeyEnv（hasKey）→ 1 / 4
    await waitFor(() => expect(screen.getByText(/^1 \/ \d+$/)).toBeTruthy())
  })

  it('已完成态：done 徽标与步骤回显', () => {
    localStorage.setItem('spark-onboarding-done', '1')
    localStorage.setItem('spark-onboarding-step', '2')
    renderPage()
    expect(screen.getByText(/已完成/)).toBeTruthy()
    expect(screen.getByText('done')).toBeTruthy()
  })

  it('自动弹开关：默认开，点击后落 localStorage', async () => {
    renderPage()
    const sw = (await waitFor(() => screen.getByRole('switch', { name: '首启自动弹引导' }))) as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    await waitFor(() => expect(localStorage.getItem('spark-onboarding-autopop')).toBe('0'))
  })

  it('重跑引导：清完成标记与步骤', () => {
    localStorage.setItem('spark-onboarding-done', '1')
    localStorage.setItem('spark-onboarding-step', '2')
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '重新运行引导' }))
    expect(localStorage.getItem('spark-onboarding-done')).toBeNull()
    expect(localStorage.getItem('spark-onboarding-step')).toBeNull()
  })
})
