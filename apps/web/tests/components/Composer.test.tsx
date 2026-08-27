// @vitest-environment jsdom
/**
 * Composer 组件测试（doc/06 §1 L2 首批：三态优先——空闲 Enter 发送 /
 * 运行中按分段档插话·排队·停止 / 审批挂起禁用，doc/02 §6.2.2 / DESIGN §13.E）。
 */
import './dom-stubs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SubmitOutcome } from '@spark/protocol'
import { Composer } from '@/features/chat/Composer'

afterEach(cleanup)

const STARTED: SubmitOutcome = { result: 'started' }
const QUEUED: SubmitOutcome = { result: 'queued' }
const STEERED: SubmitOutcome = { result: 'steered' }

function renderComposer(
  props: Partial<Parameters<typeof Composer>[0]> = {},
): { onSend: ReturnType<typeof vi.fn>; onInterrupt: ReturnType<typeof vi.fn> } {
  const onSend = vi.fn().mockResolvedValue(STARTED)
  const onInterrupt = vi.fn()
  render(
    <Composer
      busy={false}
      waiting={false}
      onSend={onSend}
      onInterrupt={onInterrupt}
      onCommand={() => Promise.resolve()}
      {...props}
    />,
  )
  return { onSend, onInterrupt }
}

const textarea = (): HTMLTextAreaElement => screen.getByRole<HTMLTextAreaElement>('textbox')

describe('Composer 空闲态', () => {
  it('Enter 发送（delivery=now），成功后清空草稿并提示「已开始本轮」', async () => {
    const { onSend } = renderComposer()
    fireEvent.change(textarea(), { target: { value: '你好 Spark' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await vi.waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('你好 Spark', 'now', undefined)
    })
    await vi.waitFor(() => {
      expect(textarea().value).toBe('')
      expect(screen.getByText('已开始本轮')).toBeTruthy()
    })
  })

  it('Shift+Enter 换行不发送；空文本 Enter 不发送', () => {
    const { onSend } = renderComposer()
    fireEvent.change(textarea(), { target: { value: '第一行' } })
    fireEvent.keyDown(textarea(), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()

    fireEvent.change(textarea(), { target: { value: '   ' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('发送失败：草稿回填不丢用户输入，提示人话错误（E_ 码走文案表）', async () => {
    const { onSend } = renderComposer()
    onSend.mockRejectedValueOnce(new Error('E_INTERNAL: boom'))
    fireEvent.change(textarea(), { target: { value: '重试我' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await vi.waitFor(() => {
      expect(screen.getByText('服务内部错误，请重试；若持续出现请查看服务端日志')).toBeTruthy()
    })
    expect(textarea().value).toBe('重试我')
  })
})

describe('Composer 运行中（busy）态', () => {
  it('输入不禁用；发送钮变停止钮，点击回调 onInterrupt', () => {
    const { onInterrupt } = renderComposer({ busy: true })
    expect(textarea().disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '停止当前轮' }))
    expect(onInterrupt).toHaveBeenCalledTimes(1)
  })

  it('分段档：立即段禁用（本轮已在进行），切「插话」后 Enter 按 steer 发送', async () => {
    const { onSend } = renderComposer({ busy: true })
    onSend.mockResolvedValueOnce(STEERED)
    const now = screen.getByRole<HTMLButtonElement>('radio', { name: '立即' })
    expect(now.disabled).toBe(true)

    fireEvent.change(textarea(), { target: { value: '改用 pnpm' } })
    fireEvent.click(screen.getByRole('radio', { name: '插话' }))
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await vi.waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('改用 pnpm', 'steer', undefined)
      expect(screen.getByText('已插话注入当前轮')).toBeTruthy()
    })
  })

  it('切「排队」后 Enter 按 queue 发送；Ctrl+Enter 恒排队', async () => {
    const { onSend } = renderComposer({ busy: true })
    onSend.mockResolvedValue(QUEUED)
    fireEvent.change(textarea(), { target: { value: '下一轮做 X' } })
    fireEvent.click(screen.getByRole('radio', { name: '排队' }))
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await vi.waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('下一轮做 X', 'queue', undefined)
    })

    fireEvent.change(textarea(), { target: { value: '排队 Y' } })
    fireEvent.keyDown(textarea(), { key: 'Enter', ctrlKey: true })
    await vi.waitFor(() => {
      expect(onSend).toHaveBeenLastCalledWith('排队 Y', 'queue', undefined)
    })
  })
})

describe('Composer 审批挂起（waiting）态', () => {
  it('输入禁用、无分段控件、提示等待审批；Enter 不发送', () => {
    const { onSend } = renderComposer({ waiting: true })
    expect(textarea().disabled).toBe(true)
    expect(screen.getByText('等待审批中——请先处理上方审批卡')).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('Composer 命令分发（工单 7.4：首词 / 命中注册表 → onCommand）', () => {
  it('/compact Esc 关菜单后 Enter → onCommand("compact","")，不进消息通道（注册表迁入回归）', async () => {
    const onCommand = vi.fn().mockResolvedValue(undefined)
    const { onSend } = renderComposer({ onCommand })
    fireEvent.change(textarea(), { target: { value: '/compact' } })
    // / 菜单开放时 Enter 归菜单确认（回写草稿）；Esc 关闭后 Enter 才发送
    fireEvent.keyDown(textarea(), { key: 'Escape' })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await vi.waitFor(() => {
      expect(onCommand).toHaveBeenCalledWith('compact', '')
    })
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea().value).toBe('')
  })

  it('/review 带补充参数 → onCommand 收到完整 args', async () => {
    const onCommand = vi.fn().mockResolvedValue(undefined)
    const { onSend } = renderComposer({
      onCommand,
      commands: [{ name: 'review', description: '审查', kind: 'prompt' }],
    })
    fireEvent.change(textarea(), { target: { value: '/review src/a.ts 重点看并发' } })
    fireEvent.keyDown(textarea(), { key: 'Escape' }) // 关 / 菜单
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await vi.waitFor(() => {
      expect(onCommand).toHaveBeenCalledWith('review', 'src/a.ts 重点看并发')
    })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('未注册 / 词 → 走普通发送（不误伤路径式输入）', async () => {
    const { onSend } = renderComposer()
    fireEvent.change(textarea(), { target: { value: '/nope 这不是命令' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await vi.waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('/nope 这不是命令', 'now', undefined)
    })
  })
})
