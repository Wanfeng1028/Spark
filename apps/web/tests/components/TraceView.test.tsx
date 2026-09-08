// @vitest-environment jsdom
/**
 * 会话链路视图组件测试（工单 13.7 单测要求④：两态——正常回合 / 含重试回合）。
 * 直接渲染 TraceView（不经 Radix 浮层壳与 portal）：含重试态吃 MockTransport 的对等数据
 * （失败 + 重试 + 护栏告警 + 审批互链），正常态用手搭的干净回合（含无 usage 的步 → 「—」）。
 */
import './dom-stubs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ids } from '@spark/protocol'
import type { TraceDto } from '@spark/protocol'
import { MockTransport } from '@/transports/mock'
import { TraceView } from '@/features/chat/TraceDialog'

afterEach(cleanup)

const CLEAN: TraceDto = {
  sessionId: ids.session('ses_cleantrace1'),
  totals: {
    turns: 1,
    steps: 2,
    toolCalls: 0,
    toolErrors: 0,
    errors: 0,
    durationMs: 1200,
    usage: { costUsd: 0.001, inputTokens: 500, outputTokens: 60, cacheRead: 0, cacheWrite: 0 },
  },
  turns: [
    {
      turnId: ids.turn('trn_cleantrace1'),
      delivery: 'now',
      startedAt: 1000,
      durationMs: 1200,
      finish: 'stop',
      steps: [
        {
          index: 0,
          at: 1400,
          durationMs: 800,
          toolCalls: 0,
          usage: { costUsd: 0.001, inputTokens: 500, outputTokens: 60, cacheRead: 0, cacheWrite: 0 },
        },
        // 无 usage 的步：显示「—」而不是 0（禁假状态）
        { index: 1, at: 2200, durationMs: 0, toolCalls: 0, usage: null },
      ],
      tools: [],
      marks: [],
      errors: [],
      usage: { costUsd: 0.001, inputTokens: 500, outputTokens: 60, cacheRead: 0, cacheWrite: 0 },
    },
  ],
  looseErrors: [],
}

describe('TraceView 含重试回合（工单 13.7）', () => {
  it('失败 / 重试 / 护栏告警 / 记忆标记如实呈现，审批过的调用给审计互链', async () => {
    const trace = await new MockTransport('normal').getSessionTrace(ids.session('ses_mocktrace1'))
    const onAudit = vi.fn()
    render(<TraceView trace={trace} onAudit={onAudit} />)

    expect(screen.getAllByText('write').length).toBe(2)
    expect(screen.getAllByText('失败').length).toBe(1)
    expect(screen.getAllByText('重试').length).toBe(1)
    expect(screen.getByText('密钥告警')).toBeTruthy()
    expect(screen.getByText(/注入 2 条记忆/)).toBeTruthy()
    expect(screen.getByText(/E_IO: 目标路径只读/)).toBeTruthy()

    // 只有挂起过审批的那次调用给「审计」入口，点击带工具名跳审计页过滤
    fireEvent.click(screen.getByText('审计'))
    expect(onAudit).toHaveBeenCalledWith('write')
  })
})

describe('TraceView 正常回合（工单 13.7）', () => {
  it('干净回合无失败/重试/告警/审计入口；无 usage 的步显示「—」', () => {
    render(<TraceView trace={CLEAN} onAudit={() => {}} />)

    expect(screen.getByText('正常结束')).toBeTruthy()
    expect(screen.queryByText('失败')).toBeNull()
    expect(screen.queryByText('重试')).toBeNull()
    expect(screen.queryByText('审计')).toBeNull()
    expect(screen.getAllByText('无工具').length).toBe(2)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('空会话：给如实空态文案，不造回合', () => {
    render(
      <TraceView
        trace={{ ...CLEAN, turns: [], looseErrors: [] }}
        onAudit={() => {}}
      />,
    )
    expect(screen.getByText('还没有回合——发一条消息后再看链路。')).toBeTruthy()
  })
})
