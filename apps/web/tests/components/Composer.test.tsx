// @vitest-environment jsdom
/**
 * Composer 组件测试（doc/06 §1 L2 首批：三态优先——空闲 Enter 发送 /
 * 运行中按分段档插话·排队·停止 / 审批挂起禁用，doc/02 §6.2.2 / DESIGN §13.E）。
 */
import './dom-stubs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SubmitOutcome } from '@spark/protocol'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
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
  const mock = new MockTransport('normal')
  render(
    <TestTransportContext.Provider
      value={{ transport: mock, mock: true, scenario: 'normal', setScenario: () => {} }}
    >
      <Composer
        busy={false}
        waiting={false}
        onSend={onSend}
        onInterrupt={onInterrupt}
        onCommand={() => Promise.resolve()}
        {...props}
      />
    </TestTransportContext.Provider>,
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

  it('模式档：立即项禁用（本轮已在进行），切「插话」后 Enter 按 steer 发送', async () => {
    const { onSend } = renderComposer({ busy: true })
    onSend.mockResolvedValueOnce(STEERED)
    // §13.L L.8（DSH 三批）：提交模式上移为卡上 chip 下拉——先开菜单再选项
    fireEvent.click(screen.getByRole('button', { name: '提交模式' }))
    const now = screen.getByRole<HTMLButtonElement>('menuitemradio', { name: /立即/ })
    expect(now.disabled).toBe(true)

    fireEvent.click(screen.getByRole('menuitemradio', { name: /插话/ }))
    fireEvent.change(textarea(), { target: { value: '改用 pnpm' } })
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    await vi.waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('改用 pnpm', 'steer', undefined)
      expect(screen.getByText('已插话注入当前轮')).toBeTruthy()
    })
  })

  it('切「排队」后 Enter 按 queue 发送；Ctrl+Enter 恒排队', async () => {
    const { onSend } = renderComposer({ busy: true })
    onSend.mockResolvedValue(QUEUED)
    fireEvent.click(screen.getByRole('button', { name: '提交模式' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /排队/ }))
    fireEvent.change(textarea(), { target: { value: '下一轮做 X' } })
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
  it('输入禁用、模式 chip 禁用、提示等待审批；Enter 不发送', () => {
    const { onSend } = renderComposer({ waiting: true })
    expect(textarea().disabled).toBe(true)
    // §13.L L.1：无常驻提示行，等待提示改由 textarea 占位符承载（DSH 二批）
    expect(screen.getByPlaceholderText('等待审批中——请先处理上方审批卡')).toBeTruthy()
    // §13.L L.8：模式 chip 仍渲染但禁用（等待中不可切档）
    expect(screen.getByRole('button', { name: '提交模式' })).toHaveProperty('disabled', true)
    fireEvent.keyDown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('Composer 上下文行（§13.L L.8，DSH 三批）', () => {
  it('文件夹 chip：下拉选 cwd 回调 onPick；未选显示占位', () => {
    const onPick = vi.fn()
    renderComposer({
      folder: {
        label: '选择文件夹',
        options: [
          { cwd: 'E:/code/alpha', label: 'alpha' },
          { cwd: 'E:/code/beta', label: 'beta' },
        ],
        selected: null,
        onPick,
      },
    })
    expect(screen.getByRole('button', { name: '工作区文件夹' }).textContent).toContain('选择文件夹')
    fireEvent.click(screen.getByRole('button', { name: '工作区文件夹' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'alpha' }))
    expect(onPick).toHaveBeenCalledWith('E:/code/alpha')
  })

  it('语音错误走瞬态提示行（不再以红字常驻工具条——L.8）', async () => {
    renderComposer()
    // jsdom 无 mediaDevices：hold 按下即 fail-closed 报错
    fireEvent.pointerDown(screen.getByRole('button', { name: '开始语音听写' }))
    await vi.waitFor(() => {
      expect(
        screen.getByText('当前环境不支持麦克风采集（需浏览器 getUserMedia）'),
      ).toBeTruthy()
    })
    // 工具条内不再渲染内联错误钮（原红字 pill 已撤——DSH Toast 同位）
    expect(
      screen.queryByTitle('当前环境不支持麦克风采集（需浏览器 getUserMedia）'),
    ).toBeNull()
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
