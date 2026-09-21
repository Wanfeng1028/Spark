// @vitest-environment jsdom
/**
 * 侧栏两件（工单 19.40）组件单测：
 * ① rail 48px 图标态的分组浮层（V2-36 盲区消解）：悬停/点击分组即列该组会话、可直点切会话，
 *    且数据源仍是同一份 useSessionList（开浮层零新增请求）；
 * ② 窄屏 overlay 抽屉（V2-39）：遮罩点击与 Esc 各一条关闭途径、点选会话即收，
 *    inline 形态不出现遮罩（桌面常规列不受影响）；
 * ③ sidebarModeOf 形态推导（折叠优先于窄屏——窄屏展开才走抽屉）。
 * 真实窄视口缩放的观感走查留用户；此处锁结构与请求面不变量。
 */
import './dom-stubs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { SessionDto } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { MockTransport } from '@/transports/mock'
import { TestTransportContext } from '@/transports/context'
import { Sidebar, sidebarModeOf } from '@/components/layout/Sidebar'
import type { SidebarMode } from '@/components/layout/Sidebar'
import { useUiStore } from '@/stores/ui'

const T0 = Date.UTC(2026, 0, 1)
const ALPHA = ids.session('ses_alpha0000000000000001')
const BETA = ids.session('ses_beta0000000000000002')

function dto(id: SessionDto['id'], title: string, cwd: string, updatedAt: number): SessionDto {
  return {
    id,
    title,
    model: 'deepseek/chat',
    cwd,
    createdAt: T0,
    updatedAt,
    lastSeq: 3,
    status: 'idle',
  }
}

const DEFAULT_SESSIONS: SessionDto[] = [
  dto(ALPHA, '浮层里的会话', '/work/alpha', T0 + 3_000_000),
  dto(BETA, '另一个项目会话', '/work/beta', T0 + 4_000_000),
]

/** 用例可替换的列表数据源（listSessions 打桩读它——断言浮层不新起请求） */
let sessions: SessionDto[] = DEFAULT_SESSIONS
let listCalls = 0

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessions = DEFAULT_SESSIONS
})

beforeEach(() => {
  listCalls = 0
  sessions = DEFAULT_SESSIONS
  // 折叠态缺省 true：rail 形态在真实 AppShell 里正由它推导（mode 作 prop 传入，此处只服务
  // 「展开侧栏」出口那一条断言——点击后应变 false）
  useUiStore.setState({ sidebarCollapsed: true, sidebarGroupMode: 'project' })
  vi.spyOn(MockTransport.prototype, 'listSessions').mockImplementation((archived = false) => {
    if (!archived) listCalls += 1
    return Promise.resolve(archived ? [] : sessions)
  })
})

function LocationProbe() {
  return <span data-testid="location-span">{useLocation().pathname}</span>
}

function renderSidebar(mode: SidebarMode, onOverlayClose = vi.fn()): void {
  const transport = new MockTransport('normal')
  render(
    <TestTransportContext.Provider
      value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
    >
      <MemoryRouter initialEntries={[`/session/${ALPHA}`]}>
        <Sidebar mode={mode} onOverlayClose={onOverlayClose} />
        {/* 导航断点：直点后路由必须落到该会话（折叠态直点的验收面） */}
        <LocationProbe />
      </MemoryRouter>
    </TestTransportContext.Provider>,
  )
}

const locationOf = (): string => screen.getByTestId('location-span').textContent ?? ''

describe('rail 折叠态分组浮层（工单 19.40 / V2-36）', () => {
  it('悬停分组钮 → 浮层只列该组会话，且零新增请求', async () => {
    renderSidebar('rail')
    const groupBtn = await screen.findByRole('button', { name: '项目 alpha（1 个会话）' })
    expect(listCalls).toBe(1) // 列表只由 useSessionList 拉一次
    fireEvent.mouseEnter(groupBtn)
    expect(await screen.findByRole('menu', { name: 'alpha 的会话' })).toBeTruthy()
    expect(screen.getByText('浮层里的会话')).toBeTruthy()
    expect(screen.queryByText('另一个项目会话')).toBeNull() // 按组隔离
    expect(listCalls).toBe(1) // 开浮层不新起请求（数据源=既有 groups 投影）
  })

  it('直点浮层会话 → 切到该会话路由', async () => {
    renderSidebar('rail')
    const groupBtn = await screen.findByRole('button', { name: '项目 beta（1 个会话）' })
    fireEvent.mouseEnter(groupBtn)
    fireEvent.click(await screen.findByText('另一个项目会话'))
    await waitFor(() => expect(locationOf()).toBe(`/session/${BETA}`))
  })

  it('点击分组钮可开合钉住（无 hover 环境的替代路径）', async () => {
    renderSidebar('rail')
    const groupBtn = await screen.findByRole('button', { name: '项目 alpha（1 个会话）' })
    fireEvent.click(groupBtn)
    expect(await screen.findByRole('menu', { name: 'alpha 的会话' })).toBeTruthy()
    expect(groupBtn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(groupBtn)
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'alpha 的会话' })).toBeNull())
  })

  it('组内超 8 条 → 「剩余 N 个（展开侧栏）」出口点击走真实折叠 action', async () => {
    sessions = Array.from({ length: 9 }, (_, i) =>
      dto(ids.session(`ses_many${String(i).padStart(4, '0')}`), `会话 ${i}`, '/work/alpha', T0 + i),
    )
    renderSidebar('rail')
    const groupBtn = await screen.findByRole('button', { name: '项目 alpha（9 个会话）' })
    fireEvent.mouseEnter(groupBtn)
    fireEvent.click(await screen.findByText('剩余 1 个（展开侧栏）'))
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })
})

describe('窄屏 overlay 抽屉（工单 19.40 / V2-39）', () => {
  it('遮罩与面板并存：点遮罩、Esc 各触发一次关闭', async () => {
    const onOverlayClose = vi.fn()
    renderSidebar('overlay', onOverlayClose)
    expect(await screen.findByRole('dialog', { name: '会话列表' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭侧栏' }))
    expect(onOverlayClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onOverlayClose).toHaveBeenCalledTimes(2)
  })

  it('点选会话即收抽屉并导航', async () => {
    const onOverlayClose = vi.fn()
    renderSidebar('overlay', onOverlayClose)
    fireEvent.click(await screen.findByText('另一个项目会话'))
    expect(onOverlayClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(locationOf()).toBe(`/session/${BETA}`))
  })

  it('inline 形态不渲染遮罩（桌面常规列不变）', async () => {
    renderSidebar('inline')
    expect(await screen.findByText('浮层里的会话')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '关闭侧栏' })).toBeNull()
  })
})

describe('sidebarModeOf 形态推导（工单 19.40）', () => {
  it('折叠优先于窄屏；展开 + 窄屏才 overlay', () => {
    expect(sidebarModeOf(true, false)).toBe('rail')
    expect(sidebarModeOf(true, true)).toBe('rail')
    expect(sidebarModeOf(false, true)).toBe('overlay')
    expect(sidebarModeOf(false, false)).toBe('inline')
  })
})
