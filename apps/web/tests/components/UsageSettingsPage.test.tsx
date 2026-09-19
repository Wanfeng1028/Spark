// @vitest-environment jsdom
/**
 * 使用统计与成本看板组件测试（工单 13.6 单测要求④：两态——有数据 / 空态；13.6a 可视化图表扩展）。
 * 数据源 = MockTransport（getRouting + usageSummary 对等实现）；断言点：
 * 按日 tokens 堆叠柱状（峰值标尺/图例）、模型占比条、命中率按三分量恒等式还原、
 * 空态给如实文案且**不渲染任何图表假图形、不显示 0% 假命中率**。
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

describe('UsageSettingsPage 有数据态（工单 13.6 / 13.6a）', () => {
  it('按日堆叠柱状 + 模型占比条 + 命中率 = cacheRead ÷（cacheRead + 未命中输入）', async () => {
    renderPage(new MockTransport('normal'))
    await vi.waitFor(() => expect(screen.getByText('按日用量')).toBeTruthy())
    // 堆叠柱：mock 两日（09-07 经手 15,400 / 09-08 经手 25,100 → 峰值 25.1k），日期与成本数字在柱下
    const chart = screen.getByLabelText('按日 tokens 柱状图')
    expect(chart).toBeTruthy()
    expect(screen.getByText('峰值 25.1k tokens/日')).toBeTruthy()
    expect(screen.getByText('2026-09-07')).toBeTruthy()
    expect(screen.getByText('2026-09-08')).toBeTruthy()
    // 图例四分量（「输出」与模型表表头同词，用 getAllByText 断言）
    expect(screen.getByText('cache 读')).toBeTruthy()
    expect(screen.getByText('cache 写')).toBeTruthy()
    expect(screen.getByText('未命中输入')).toBeTruthy()
    expect(screen.getAllByText('输出').length).toBeGreaterThanOrEqual(2)
    // 模型占比条 + 表行（mock 单模型 deepseek/deepseek-chat）
    expect(screen.getByLabelText('模型 tokens 占比条')).toBeTruthy()
    expect(screen.getByText('deepseek/deepseek-chat')).toBeTruthy()
    // 总账命中率：input 33500 / cacheRead 14000 / cacheWrite 1200 → 14000 ÷ 32300 = 43.3%
    await vi.waitFor(() => expect(screen.getByText('43.3%')).toBeTruthy())
    // 旧账如实单列（mock 的 unbucketed 非零）
    expect(screen.getByText('其中无明细旧账')).toBeTruthy()
  })
})

describe('UsageSettingsPage 空态（工单 13.6 / 13.6a）', () => {
  it('无明细：如实文案，不渲染图表假图形，命中率显示「—」而非 0%', async () => {
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
    await vi.waitFor(() => expect(screen.getByText('按日用量')).toBeTruthy())
    await vi.waitFor(() =>
      expect(
        screen.getByText(
          '还没有明细——跑过回合后按本地日历日聚合（旧格式时期只有总账，见上方「无明细旧账」）。',
        ),
      ).toBeTruthy(),
    )
    // 两张图表在零明细下一律不渲染（禁假状态：没有 0 高度柱与空占比条）
    expect(screen.queryByLabelText('按日 tokens 柱状图')).toBeNull()
    expect(screen.queryByLabelText('模型 tokens 占比条')).toBeNull()
    expect(screen.getByText('按供应商 / 模型')).toBeTruthy()
    // 分母为 0 → 「—」（禁假状态：不显示 0%）
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('0.0%')).toBeNull()
    // 旧账为零 → 不单列该行
    expect(screen.queryByText('其中无明细旧账')).toBeNull()
  })
})
