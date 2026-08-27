// @vitest-environment jsdom
/**
 * ApprovalCard 组件测试（doc/06 §1 L2 首批：审批卡三键——doc/02 §6.3 / DESIGN §8）。
 * 断言「事件→渲染 DOM」：三键回调参数、拒绝展开 feedback、resolved 结果徽标与收起。
 */
import './dom-stubs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ApprovalCard } from '@/features/chat/ApprovalCard'

afterEach(cleanup)

function renderCard(overrides: Partial<Parameters<typeof ApprovalCard>[0]> = {}) {
  const onReply = vi.fn()
  render(
    <ApprovalCard
      action="bash"
      resource="git status"
      reason="执行 shell 命令"
      status="pending"
      onReply={onReply}
      {...overrides}
    />,
  )
  return { onReply }
}

describe('ApprovalCard pending 态', () => {
  it('渲染三键：允许一次 / 总是允许 / 拒绝，含 action 与 resource 摘要', () => {
    renderCard()
    expect(screen.getByRole('button', { name: '允许一次' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '总是允许' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '拒绝' })).toBeTruthy()
    expect(screen.getByText('审批：bash')).toBeTruthy()
    expect(screen.getByText(/git status/)).toBeTruthy()
  })

  it('多 pattern 清单（>1 条）逐段展示', () => {
    renderCard({
      patterns: ['git add .', 'git commit -m x', 'git push'],
      alwaysPatterns: ['git add .', 'git commit -m x', 'git push'],
    })
    expect(screen.getByText(/· git add \./)).toBeTruthy()
    expect(screen.getByText(/· git push/)).toBeTruthy()
    // 模板行跨多个文本节点（{n} 插值）——按整段 textContent 断言
    const note = screen.getByText(/将固化以上/)
    expect(note.textContent).toContain('「总是允许」将固化以上 3 条模式规则（跨会话生效）')
  })

  it('允许一次 → onReply("once")；总是允许 → onReply("always")', () => {
    const { onReply } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '允许一次' }))
    fireEvent.click(screen.getByRole('button', { name: '总是允许' }))
    expect(onReply).toHaveBeenNthCalledWith(1, 'once')
    expect(onReply).toHaveBeenNthCalledWith(2, 'always')
  })
})

describe('ApprovalCard 拒绝路径（feedback 回喂）', () => {
  it('拒绝 → 展开 feedback 输入 → 确认拒绝回调带 feedback', () => {
    const { onReply } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    const input = screen.getByPlaceholderText(/拒绝原因/)
    fireEvent.change(input, { target: { value: '不要动工作区' } })
    fireEvent.click(screen.getByRole('button', { name: '确认拒绝' }))
    expect(onReply).toHaveBeenCalledWith('reject', '不要动工作区')
  })

  it('空 feedback 确认 → onReply("reject", undefined)；取消不回调且回到三键态', () => {
    const { onReply } = renderCard()
    // 先走取消路径：不回调、回到三键
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onReply).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '允许一次' })).toBeTruthy()

    // 再走空 feedback 确认路径
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    fireEvent.click(screen.getByRole('button', { name: '确认拒绝' }))
    expect(onReply).toHaveBeenCalledWith('reject', undefined)
    expect(onReply).toHaveBeenCalledTimes(1)
  })
})

describe('ApprovalCard resolved 态', () => {
  it('reply=once → 「已允许（once）」徽标，三键不可见', () => {
    renderCard({ status: 'resolved', reply: 'once' })
    expect(screen.getByText('已允许（once）')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '允许一次' })).toBeNull()
  })

  it('reply=reject → 「已拒绝（reject）」徽标', () => {
    renderCard({ status: 'resolved', reply: 'reject' })
    expect(screen.getByText('已拒绝（reject）')).toBeTruthy()
  })

  it('resolved 2s 后收起为摘要行（DESIGN §6）', () => {
    vi.useFakeTimers()
    try {
      renderCard({ status: 'resolved', reply: 'always' })
      expect(screen.getByText('已允许（always）')).toBeTruthy()
      act(() => {
        vi.advanceTimersByTime(2100)
      })
      // 摘要行模板跨文本节点——按 textContent 断言
      const summary = screen.getByText(/审批已/)
      expect(summary.textContent).toBe('审批已允许（always）')
    } finally {
      vi.useRealTimers()
    }
  })
})
