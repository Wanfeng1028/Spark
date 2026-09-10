// @vitest-environment jsdom
/**
 * StatusBar 计划模式徽标（工单 16.3 第三批 B）：断言「slice.mode → 渲染」这一段——
 * 徽标只在 plan 模式出现、回 default 即消失、无激活会话不渲染（禁假状态）。
 * 数据源是 durable 事件投影，所以冷启动回放与直播走的是同一条路径（这里直接喂事件）。
 */
import './dom-stubs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
import { StatusBar } from '@/components/layout/StatusBar'

afterEach(cleanup)

const SID = ids.session('ses_statusbar0001')

let seq = 0

/** 构造 durable 信封（带递增 seq，模拟 JSONL 行号——同 applyEvent.test 口径） */
function ev<T extends SparkEventType>(
  type: T,
  data: SparkEventEnvelope<T>['data'],
): SparkEventEnvelope<T> {
  seq += 1
  return {
    id: ids.event(`evt_statusbar${String(seq).padStart(4, '0')}`),
    sessionId: SID,
    seq,
    time: 1000 + seq,
    type,
    data,
  }
}

function apply(e: SparkEventEnvelope): void {
  act(() => {
    useSessionStore.getState().applyEvent(e)
  })
}

function renderBar(): void {
  const transport = new MockTransport('normal')
  render(
    <TestTransportContext.Provider
      value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
    >
      <StatusBar />
    </TestTransportContext.Provider>,
  )
}

beforeEach(() => {
  seq = 0
  // store 是模块级单例：逐例清空，避免上一例的 slice/激活态漏进下一例
  act(() => {
    useSessionStore.setState({ byId: {}, activeId: null })
  })
})

describe('StatusBar 计划模式徽标（工单 16.3）', () => {
  it('slice.mode=plan → 渲染 plan 徽标；回 default 即消失', () => {
    apply(ev('session.created', { title: '状态条会话', cwd: '/tmp', model: 'deepseek/chat' }))
    renderBar()
    expect(screen.queryByText('plan')).toBeNull() // 缺省常态不渲染（禁假状态）

    apply(ev('session.mode.changed', { mode: 'plan', previous: 'default' }))
    expect(screen.getByText('plan')).toBeTruthy()
    // 徽标带解释文案：写类全拒 + 退出需批准（用户看到写被拒时的唯一线索）
    expect(screen.getByTitle(/计划模式：写类工具全拒/)).toBeTruthy()

    apply(ev('session.mode.changed', { mode: 'default', previous: 'plan' }))
    expect(screen.queryByText('plan')).toBeNull()
  })

  it('无激活会话 → 不渲染徽标（slice 为 null 时如实呈现）', () => {
    renderBar()
    expect(screen.queryByText('plan')).toBeNull()
  })
})

describe('StatusBar 持续目标徽标（工单 16.7）', () => {
  it('goal.set → 渲染 goal 徽标；paused 后消失', () => {
    apply(ev('session.created', { title: '状态条会话', cwd: '/tmp', model: 'deepseek/chat' }))
    renderBar()
    expect(screen.queryByText('goal')).toBeNull() // 无目标不渲染（禁假状态）

    apply(ev('goal.set', { goal: '修好所有失败的测试' }))
    expect(screen.getByText('goal')).toBeTruthy()
    // 徽标带解释文案：轮次 + 目标文本（/goal status 的可见面）
    expect(screen.getByTitle(/持续目标（第 0 轮）：修好所有失败的测试/)).toBeTruthy()

    apply(ev('goal.paused', { reason: 'interrupt', iterations: 3, usedTokens: 1200 }))
    expect(screen.queryByText('goal')).toBeNull()
  })

  it('goal.completed → 徽标消失（目标已闭环）', () => {
    apply(ev('session.created', { title: '状态条会话', cwd: '/tmp', model: 'deepseek/chat' }))
    apply(ev('goal.set', { goal: 'g' }))
    apply(ev('goal.completed', { iterations: 2, usedTokens: 900 }))
    renderBar()
    expect(screen.queryByText('goal')).toBeNull()
  })
})
