// @vitest-environment jsdom
/**
 * 使用统计与成本看板组件测试（工单 13.6 单测要求④：两态——有数据 / 空态）。
 * 数据源 = MockTransport（getRouting + usageSummary 对等实现）；断言点：
 * 按日柱状与按供应商表出现、命中率按三分量恒等式还原、空态给如实文案且**不显示 0% 假命中率**。
 */
import './dom-stubs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
import { UsageSettingsPage } from '@/features/settings/UsageSettingsPage'

afterEach(cleanup)

function renderPage(transport: MockTransport): void {
  render(
    <TestTransportContext.Provider
      value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
    >
      <UsageSettingsPage />
    </TestTransportContext.Provider>,
  )
}

describe('UsageSettingsPage 有数据态（工单 13.6）', () => {
  it('按日柱状与按供应商表渲染；命中率 = cacheRead ÷（cacheRead + 未命中输入）', async () => {
    renderPage(new MockTransport('normal'))
    await vi.waitFor(() => expect(screen.getByText('按日成本')).toBeTruthy())
    // mock 两日明细
    await vi.waitFor(() => expect(screen.getByText('2026-09-07')).toBeTruthy())
    expect(screen.getByText('2026-09-08')).toBeTruthy()
    expect(screen.getByText('deepseek/deepseek-chat')).toBeTruthy()
    // 总账：input 33500 / cacheRead 14000 / cacheWrite 1200 → 14000 ÷ 32300 = 43.3%
    await vi.waitFor(() => expect(screen.getByText('43.3%')).toBeTruthy())
    // 旧账如实单列（mock 的 unbucketed 非零）
    expect(screen.getByText('其中无明细旧账')).toBeTruthy()
  })
})

describe('UsageSettingsPage 空态（工单 13.6）', () => {
  it('无明细：两张表给如实文案，命中率显示「—」而非 0%', async () => {
    const transport = new MockTransport('normal')
    const zero = { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 }
    transport.usageSummary = () =>
      Promise.resolve({
        total: zero,
        buckets: [],
        unbucketed: zero,
        costLimitUsd: null,
        exceeded: false,
      })
    renderPage(transport)
    await vi.waitFor(() => expect(screen.getByText('按日成本')).toBeTruthy())
    await vi.waitFor(() =>
      expect(
        screen.getByText(
          '还没有明细——跑过回合后按本地日历日聚合（旧格式时期只有总账，见上方「无明细旧账」）。',
        ),
      ).toBeTruthy(),
    )
    expect(screen.getByText('按供应商 / 模型')).toBeTruthy()
    // 分母为 0 → 「—」（禁假状态：不显示 0%）
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('0.0%')).toBeNull()
    // 旧账为零 → 不单列该行
    expect(screen.queryByText('其中无明细旧账')).toBeNull()
  })
})
