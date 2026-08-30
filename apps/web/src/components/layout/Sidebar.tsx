/**
 * 会话侧栏（DESIGN.md §13.A，取代 §2 的 240px 常栏）：
 * 264px 展开 / 48px 图标态（AppShell 栅格驱动），底色 --sidebar-bg 与内容区分层；
 * 会话分组双模式（工单 10.5②）：项目=按 cwd 目录（数据源 = DTO cwd 的投影，纯前端点亮）；
 * 时间=按更新时间段（今天/昨天/7 天内/更早）。ZCode 实测「分组」为自定义分组，
 * 需后端支持（无数据源不做假状态），v1 以时间分组为真实数据替代；
 * 分组头 28px（12px 字号，可折叠 ▸/▾）；会话项 32px、行内边距 12px；
 * 组内渐进展开（工单 10.5③：先 5 条，「显示更多」逐次 +5）；
 * 选中项 zinc-100 底 + 1px 边（§13.C 侧栏选中项）。
 * 快捷键提示（工单 10.5①，§5 菜单右侧 kbd 样式）：新建会话 c、搜索 /、设置 ⌘,——
 * 单键快捷键仅在非输入态生效（AppShell 全局键位，§6.11 登记）。
 * 状态点（DESIGN §8）：绿=空闲、accent 脉动=运行中、amber=等待审批——当前激活会话
 * 由事件流实时推导（UI 状态只来自事件流），其余用 DTO 携带的 status。
 */
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CalendarClock, ChevronRight, FolderGit2, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, User } from 'lucide-react'
import type { SessionDto, SessionStatus } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useActiveSlice } from '@/stores/session'
import { useSessionList } from '@/hooks/useSessionList'
import { useUiStore } from '@/stores/ui'
import { formatRelative } from '@/lib/time'
import { cn } from '@/lib/utils'

/** 状态点（DESIGN §8；animate-pulse 属状态点白名单） */
export function SessionStatusDot({ status }: { status: SessionStatus }) {
  const cls =
    status === 'running'
      ? 'bg-[var(--spark-accent)] animate-pulse'
      : status === 'waiting-approval'
        ? 'bg-[var(--spark-warn)]'
        : 'bg-[var(--spark-ok)]'
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', cls)} />
}

/** 项目名 = cwd 目录名（跨平台分隔符；空 cwd 兜底「未分组」）——分组数据源，纯前端 */
export function projectOf(cwd: string): string {
  const seg = cwd.split(/[\\/]/).filter((s) => s.length > 0)
  const last = seg[seg.length - 1]
  return last ?? '未分组'
}

/** 时间分组段（工单 10.5②；自然日边界，固定展示序） */
export const TIME_GROUP_ORDER: readonly string[] = ['今天', '昨天', '7 天内', '更早']

export function timeGroupOf(ts: number): string {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const DAY = 86400000
  if (ts >= startOfToday) return '今天'
  if (ts >= startOfToday - DAY) return '昨天'
  if (ts >= startOfToday - 6 * DAY) return '7 天内'
  return '更早'
}

interface ProjectGroup {
  name: string
  sessions: SessionDto[]
}

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { transport } = useTransport()
  const { sessions, error, refresh } = useSessionList()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const groupMode = useUiStore((s) => s.sidebarGroupMode)
  const setGroupMode = useUiStore((s) => s.setSidebarGroupMode)
  const [query, setQuery] = useState('')
  const [foldedGroups, setFoldedGroups] = useState<Set<string>>(new Set())
  const activeSlice = useActiveSlice()

  const routeSessionId = location.pathname.startsWith('/session/')
    ? (location.pathname.split('/')[2] ?? '')
    : ''

  /** 当前激活会话的状态由事件流推导（activeTurn.waiting / running），覆盖 DTO 静态值 */
  const liveStatus = (dto: SessionDto): SessionStatus => {
    if (activeSlice === null || activeSlice.meta.id !== dto.id) return dto.status
    const t = activeSlice.activeTurn
    if (t === null) return dto.status
    return t.waiting ? 'waiting-approval' : 'running'
  }

  /** 当前激活会话的标题由事件流推导（session.title 实时生效），覆盖 DTO 静态值 */
  const liveTitle = (dto: SessionDto): string => {
    if (activeSlice === null || activeSlice.meta.id !== dto.id) return dto.title
    return activeSlice.meta.title !== '' ? activeSlice.meta.title : dto.title
  }

  /** 分组推导（工单 10.5②）：项目=按 cwd 目录名；时间=按更新时间段；组间按最近活动序（时间模式固定段序），组内按 updatedAt 倒序 */
  const groups = useMemo<ProjectGroup[] | null>(() => {
    if (sessions === null) return null
    const filtered = sessions.filter((s) =>
      (s.title === '' ? '新会话' : s.title).toLowerCase().includes(query.trim().toLowerCase()),
    )
    const keyOf = groupMode === 'project' ? (s: SessionDto) => projectOf(s.cwd) : (s: SessionDto) => timeGroupOf(s.updatedAt)
    const byKey = new Map<string, SessionDto[]>()
    for (const s of filtered) {
      const key = keyOf(s)
      const list = byKey.get(key)
      if (list === undefined) byKey.set(key, [s])
      else list.push(s)
    }
    const entries = [...byKey.entries()].map(([name, list]) => ({
      name,
      sessions: [...list].sort((a, b) => b.updatedAt - a.updatedAt),
    }))
    if (groupMode === 'time') {
      const order = TIME_GROUP_ORDER
      return entries.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
    }
    return entries.sort((a, b) => (b.sessions[0]?.updatedAt ?? 0) - (a.sessions[0]?.updatedAt ?? 0))
  }, [sessions, query, groupMode])

  async function createSession() {
    const dto = await transport.createSession()
    void navigate(`/session/${dto.id}`)
  }

  function toggleGroup(name: string): void {
    setFoldedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (collapsed) {
    return (
      <nav
        aria-label="会话列表（折叠）"
        className="flex h-full min-h-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-2"
      >
        <button
          type="button"
          aria-label="展开侧栏"
          title="展开侧栏"
          onClick={toggleSidebar}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
        <button
          type="button"
          aria-label="新建会话"
          title="新建会话（c）"
          onClick={() => void createSession()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="搜索会话"
          title="搜索会话（/）"
          onClick={() => void navigate('/search')}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground',
            location.pathname === '/search'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground',
          )}
        >
          <Search className="size-4" />
        </button>
        <button
          type="button"
          aria-label="自动化"
          title="自动化"
          onClick={() => void navigate('/automation')}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground',
            location.pathname === '/automation'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground',
          )}
        >
          <CalendarClock className="size-4" />
        </button>
        <button
          type="button"
          aria-label="设置中心"
          title="设置中心"
          onClick={() => void navigate('/settings/appearance')}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Settings className="size-4" />
        </button>
        {groups !== null &&
          groups.map((g) => {
            const active = g.sessions.some((s) => s.id === routeSessionId)
            return (
              <button
                key={g.name}
                type="button"
                aria-label={`项目 ${g.name}（${g.sessions.length} 个会话）`}
                title={`${g.name} · ${g.sessions.length} 个会话`}
                onClick={toggleSidebar}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground',
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                )}
              >
                <FolderGit2 className="size-4" />
              </button>
            )
          })}
      </nav>
    )
  }

  return (
    <nav
      aria-label="会话列表"
      className="flex h-full min-h-0 flex-col gap-2 border-r border-border bg-sidebar p-2"
    >
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="折叠侧栏"
          title="折叠侧栏"
          onClick={toggleSidebar}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => void createSession()}
          title="新建会话（c）"
          className="flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-[13px] font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3.5 shrink-0" />
          新建会话
          <kbd className="shrink-0 rounded border border-primary-foreground/30 px-1 font-mono text-[10px] leading-4 text-primary-foreground/70">
            c
          </kbd>
        </button>
      </div>

      <div className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话"
          className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
      </div>

      {/* 分组双模式（工单 10.5②）：项目=按 cwd；时间=按更新时间段 */}
      <div role="tablist" aria-label="会话分组模式" className="flex shrink-0 gap-1 rounded-md bg-muted p-0.5">
        {(
          [
            { mode: 'project', label: '项目' },
            { mode: 'time', label: '时间' },
          ] as const
        ).map((t) => (
          <button
            key={t.mode}
            type="button"
            role="tab"
            aria-selected={groupMode === t.mode}
            onClick={() => setGroupMode(t.mode)}
            title={t.mode === 'time' ? '按更新时间分组（自定义分组需后端支持，v1 以时间分组替代）' : '按项目目录分组'}
            className={cn(
              'h-6 flex-1 rounded text-xs',
              groupMode === t.mode
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error !== null && (
          <div className="flex flex-col gap-1.5 px-2 py-2 text-xs text-muted-foreground">
            <span className="text-[var(--spark-err)]">会话列表加载失败</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="self-start rounded-md border border-border px-2 py-0.5 hover:bg-accent"
            >
              重试
            </button>
          </div>
        )}
        {error === null && groups === null && <SidebarSkeleton />}
        {error === null && groups !== null && groups.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground/70">
            {query.trim() === '' ? '暂无会话' : '无匹配会话'}
          </p>
        )}
        {groups !== null &&
          groups.map((g) => (
            <SidebarGroup
              key={g.name}
              group={g}
              folded={foldedGroups.has(g.name)}
              onToggle={() => toggleGroup(g.name)}
              activeId={routeSessionId}
              statusOf={liveStatus}
              titleOf={liveTitle}
            />
          ))}
      </div>

      {/* 全文搜索入口（工单 7.13 / H12；快捷键提示工单 10.5①） */}
      <button
        type="button"
        onClick={() => void navigate('/search')}
        aria-current={location.pathname === '/search' ? 'page' : undefined}
        title="搜索（/）"
        className={cn(
          'flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
          location.pathname === '/search'
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground',
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 text-left">搜索</span>
        <kbd className="shrink-0 rounded border border-border bg-background px-1 font-mono text-[10px] leading-4 text-muted-foreground">
          /
        </kbd>
      </button>

      {/* 自动化入口（工单 7.6 / §13.F.3） */}
      <button
        type="button"
        onClick={() => void navigate('/automation')}
        aria-current={location.pathname === '/automation' ? 'page' : undefined}
        className={cn(
          'flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
          location.pathname === '/automation'
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground',
        )}
      >
        <CalendarClock className="size-4 shrink-0" />
        自动化
      </button>

      {/* 用户卡（工单 10.5④，§13:368 本地形态）：Spark 无账号体系——头像占位 + 本机标识 + 齿轮进设置 */}
      <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-border px-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="size-3.5 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">本机用户</span>
        <button
          type="button"
          aria-label="设置中心"
          title="设置（Cmd/Ctrl+,）"
          onClick={() => void navigate('/settings/appearance')}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Settings className="size-3.5" />
        </button>
      </div>
    </nav>
  )
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-1" aria-label="加载中">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-muted/60" />
      ))}
    </div>
  )
}

interface SidebarGroupProps {
  group: ProjectGroup
  folded: boolean
  onToggle: () => void
  activeId: string
  statusOf: (dto: SessionDto) => SessionStatus
  titleOf: (dto: SessionDto) => string
}

/** 分组头 28px（12px 字号，▸/▾ 折叠）+ 会话项 32px（§13.A 数值清单）；组内渐进展开（工单 10.5③：5 条起步，逐次 +5） */
function SidebarGroup({ group, folded, onToggle, activeId, statusOf, titleOf }: SidebarGroupProps) {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(GROUP_VISIBLE_STEP)
  const shown = Math.min(visible, group.sessions.length)
  const rest = group.sessions.length - shown
  return (
    <section className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!folded}
        className="flex h-7 w-full items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', !folded && 'rotate-90')}
        />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{group.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground/70">{group.sessions.length}</span>
      </button>
      {!folded && (
        <ul className="flex flex-col">
          {group.sessions.slice(0, shown).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => void navigate(`/session/${s.id}`)}
                aria-current={s.id === activeId ? 'page' : undefined}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-md border border-transparent px-3 text-left hover:bg-accent',
                  s.id === activeId && 'border-border bg-secondary',
                )}
              >
                <SessionStatusDot status={statusOf(s)} />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {titleOf(s) === '' ? '新会话' : titleOf(s)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground/70">
                  {formatRelative(s.updatedAt)}
                </span>
              </button>
            </li>
          ))}
          {rest > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setVisible((v) => v + GROUP_VISIBLE_STEP)}
                className="flex h-7 w-full items-center px-3 text-xs text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground"
              >
                显示更多（剩 {rest}）
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

/** 渐进展开步长（工单 10.5③） */
const GROUP_VISIBLE_STEP = 5
