// @vitest-environment jsdom
/**
 * 辅助会话抽屉接线单测（工单 19.36 / V2-09）：
 * ① 选择器只列非主会话（同一条会话绝不开两个实例——那就是串流）；
 * ② 点选后抽屉里挂的是第二个会话页实例（variant='drawer'，sessionId 为所选那条），
 *    且「当前会话」指针仍指主会话（抽屉不劫持侧栏状态点/水位）；
 * ③ 非模态（无遮罩 / 不抢 dialog 角色）——主工作区必须可继续操作；
 * ④ 关闭只收面板：auxSessionId 保留、不触碰 interrupt（在途 turn 不中断），重开续看同一条；
 * ⑤ 零新端点：新建辅助会话走既有 transport.createSession。
 * SessionSurface 打桩成轻量替身（真实实例含 Composer/Virtuoso，jsdom 无 ResizeObserver；
 * 「投影互不串流」按真实 reducer 的断言在 tests/aux-session-isolation.test.ts）。
 */
import './dom-stubs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { SessionDto } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { MockTransport } from '@/transports/mock'
import { TestTransportContext } from '@/transports/context'
import { AuxSessionDrawer } from '@/features/chat/AuxSessionDrawer'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

interface StubSurfaceProps {
  sessionId: string
  variant?: string
  onClose?: () => void
  onSwitchSession?: () => void
}

vi.mock('@/features/chat/SessionSurface', () => ({
  SessionSurface: (props: StubSurfaceProps) => (
    <div data-testid="surface" data-sid={props.sessionId} data-variant={props.variant ?? ''}>
      <button type="button" aria-label="桩关闭" onClick={props.onClose} />
      <button type="button" aria-label="桩换一条" onClick={props.onSwitchSession} />
    </div>
  ),
}))

const T0 = Date.UTC(2026, 0, 1)
const MAIN = ids.session('ses_main0000000000000001')
const AUX = ids.session('ses_aux0000000000000001')
const CREATED = ids.session('ses_created000000000001')

function dto(id: SessionDto['id'], title: string): SessionDto {
  return {
    id,
    title,
    model: 'deepseek/chat',
    cwd: '/work/x',
    createdAt: T0,
    updatedAt: T0 + 1000,
    lastSeq: 1,
    status: 'idle',
  }
}

const SESSIONS: SessionDto[] = [dto(MAIN, '主会话一条'), dto(AUX, '辅助候选')]

/** 挂载抽屉并返回两个 spy（AppShell 里抽屉由 auxOpen 控制挂载，测试直接挂它本体） */
function renderDrawer() {
  const transport = new MockTransport('normal')
  vi.spyOn(MockTransport.prototype, 'listSessions').mockImplementation((archived = false) =>
    Promise.resolve(archived ? [] : SESSIONS),
  )
  const create = vi
    .spyOn(MockTransport.prototype, 'createSession')
    .mockResolvedValue(dto(CREATED, '新建辅助'))
  const interrupt = vi.spyOn(MockTransport.prototype, 'interrupt')
  render(
    <TestTransportContext.Provider
      value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
    >
      <MemoryRouter initialEntries={[`/session/${MAIN}`]}>
        <AuxSessionDrawer />
      </MemoryRouter>
    </TestTransportContext.Provider>,
  )
  return { create, interrupt }
}

beforeEach(() => {
  useSessionStore.setState({ byId: {}, activeId: MAIN })
  useUiStore.setState({ auxSessionId: null, auxOpen: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('辅助会话抽屉（工单 19.36）', () => {
  it('未选辅助会话 → 选择器只列非主会话', async () => {
    renderDrawer()
    expect(await screen.findByText('辅助候选')).toBeTruthy()
    expect(screen.queryByText('主会话一条')).toBeNull()
  })

  it('点选 → 挂 drawer 形态的第二实例，且「当前会话」仍是主会话', async () => {
    renderDrawer()
    fireEvent.click(await screen.findByText('辅助候选'))
    const surface = screen.getByTestId('surface')
    expect(surface.getAttribute('data-sid')).toBe(AUX)
    expect(surface.getAttribute('data-variant')).toBe('drawer')
    expect(useUiStore.getState().auxSessionId).toBe(AUX)
    expect(useSessionStore.getState().activeId).toBe(MAIN)
  })

  it('非模态：无遮罩、不抢 dialog 角色', async () => {
    renderDrawer()
    await screen.findByText('辅助候选')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('complementary', { name: '辅助会话' })).toBeTruthy()
  })

  it('关闭只收面板：会话保留、不打断在途 turn，重开续看同一条', async () => {
    const { interrupt } = renderDrawer()
    fireEvent.click(await screen.findByText('辅助候选'))
    fireEvent.click(screen.getByLabelText('桩关闭'))
    expect(useUiStore.getState().auxOpen).toBe(false)
    expect(useUiStore.getState().auxSessionId).toBe(AUX)
    expect(interrupt).not.toHaveBeenCalled()
    // 重开（AppShell 依 auxOpen 重挂）：直接续原会话，不再回选择器
    cleanup()
    renderDrawer()
    expect(screen.getByTestId('surface').getAttribute('data-sid')).toBe(AUX)
    expect(screen.queryByText('辅助候选')).toBeNull()
  })

  it('换一条 → 回选择器', async () => {
    renderDrawer()
    fireEvent.click(await screen.findByText('辅助候选'))
    fireEvent.click(screen.getByLabelText('桩换一条'))
    expect(useUiStore.getState().auxSessionId).toBeNull()
    await waitFor(() => expect(screen.getByText('辅助候选')).toBeTruthy())
  })

  it('Esc 收起抽屉（只改开关，不动已选会话）', async () => {
    renderDrawer()
    await screen.findByText('辅助候选')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useUiStore.getState().auxOpen).toBe(false)
    expect(useUiStore.getState().auxSessionId).toBeNull()
  })

  it('新建辅助会话走既有 createSession（零新端点）', async () => {
    const { create } = renderDrawer()
    fireEvent.click(await screen.findByText('新建辅助会话'))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('surface').getAttribute('data-sid')).toBe(CREATED)
  })
})
