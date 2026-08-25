/**
 * 会话侧栏 SessionSidebar（doc/02 §6.2.2 / §6.3）：240px 常驻。
 * 顶部 [新建] + 搜索框（标题子串过滤，本地）；列表分组「今天/更早」；
 * 会话项 36px：状态点 + 标题（截断）+ 相对时间。无 footer（DESIGN §7.6）。
 * 状态点（DESIGN §8）：绿=空闲、accent 脉动=运行中、amber=等待审批——当前激活会话
 * 由事件流实时推导（UI 状态只来自事件流），其余用 DTO 携带的 status。
 */
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Plus, Search } from 'lucide-react'
import type { SessionDto, SessionStatus } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useActiveSlice } from '@/stores/session'
import { useSessionList } from '@/hooks/useSessionList'
import { formatRelative, isToday } from '@/lib/time'
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

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { transport } = useTransport()
  const { sessions, error, refresh } = useSessionList()
  const [query, setQuery] = useState('')
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

  const groups = useMemo(() => {
    if (sessions === null) return null
    const filtered = sessions.filter((s) =>
      (s.title === '' ? '新会话' : s.title).toLowerCase().includes(query.trim().toLowerCase()),
    )
    const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt)
    return {
      today: sorted.filter((s) => isToday(s.updatedAt)),
      earlier: sorted.filter((s) => !isToday(s.updatedAt)),
    }
  }, [sessions, query])

  async function createSession() {
    const dto = await transport.createSession()
    void navigate(`/session/${dto.id}`)
  }

  return (
    <nav className="flex h-full min-h-0 flex-col gap-2 p-2" aria-label="会话列表">
      <button
        type="button"
        onClick={() => void createSession()}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-[13px] text-foreground hover:bg-accent"
      >
        <Plus className="size-3.5" />
        新建会话
      </button>

      <div className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话"
          className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
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
        {error === null && groups !== null && groups.today.length === 0 && groups.earlier.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground/70">
            {query.trim() === '' ? '暂无会话' : '无匹配会话'}
          </p>
        )}
        {groups !== null && groups.today.length > 0 && (
          <SidebarGroup
            label="今天"
            items={groups.today}
            activeId={routeSessionId}
            statusOf={liveStatus}
            titleOf={liveTitle}
          />
        )}
        {groups !== null && groups.earlier.length > 0 && (
          <SidebarGroup
            label="更早"
            items={groups.earlier}
            activeId={routeSessionId}
            statusOf={liveStatus}
            titleOf={liveTitle}
          />
        )}
      </div>
    </nav>
  )
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-1" aria-label="加载中">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-muted/60" />
      ))}
    </div>
  )
}

interface SidebarGroupProps {
  label: string
  items: SessionDto[]
  activeId: string
  statusOf: (dto: SessionDto) => SessionStatus
  titleOf: (dto: SessionDto) => string
}

function SidebarGroup({ label, items, activeId, statusOf, titleOf }: SidebarGroupProps) {
  const navigate = useNavigate()
  return (
    <section className="mb-2">
      <h2 className="px-2 pb-1 pt-1 text-xs text-muted-foreground">{label}</h2>
      <ul className="flex flex-col gap-0.5">
        {items.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => void navigate(`/session/${s.id}`)}
              aria-current={s.id === activeId ? 'page' : undefined}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent',
                s.id === activeId && 'bg-accent',
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
      </ul>
    </section>
  )
}
