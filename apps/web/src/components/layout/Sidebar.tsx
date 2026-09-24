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
 *
 * 工单 19.40（V2-36 + V2-39）侧栏三形态（mode 由 AppShell 依折叠态与视口宽度推导）：
 * - rail：48px 图标态，分组钮悬停/点击弹**非模态浮层**列出该组会话并可直点切换
 *   （V2-36 盲区消解：折叠态不再只能先展开；数据源仍是同一份 useSessionList，零新请求）；
 * - inline：264px 常规列（桌面缺省）；
 * - overlay：窄视口（<640px）展开态改**模态抽屉**——遮罩 + 面板覆盖在内容上，栅格列
 *   仍留 48px，内容列不被挤扁（V2-39）；关闭三途径：遮罩点击 / Esc / 面板内折叠钮。
 * 浮层与遮罩视觉沿用既有 token（DESIGN §13.L.6 弹层影、DialogOverlay 的 bg-black/60 遮罩），
 * 条款文本随本单交付补入 DESIGN §13（本轮不改 DESIGN 文件）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useLocation, useNavigate } from 'react-router'
import { Archive, CalendarClock, ChevronRight, FolderGit2, PanelLeftClose, PanelLeftOpen, Pin, Plus, Search, Settings, Trash2, Undo2, User } from 'lucide-react'
import { dotTokenOf, type DotTokenKey, type SessionDto, type SessionStatus } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useActiveSlice } from '@/stores/session'
import { useSessionList } from '@/hooks/useSessionList'
import { useUiStore } from '@/stores/ui'
import { errorMessageOf } from '@/lib/error-copy'
import { formatRelative } from '@/lib/time'
import { cn } from '@/lib/utils'
import { groupSessionsForSidebar } from './session-groups'

/**
 * 会话状态点（DESIGN §13.J.2.2；animate-pulse 属状态点白名单）。
 * 「归档压过状态色」这条规则不在本组件里判断——取 protocol `dotTokenOf` 的键再映射类名
 * （mobile/miniapp 走同一个键取色值），三端不再各写一遍分支。web 侧映射到 Tailwind token
 * 类而非内联色值（§2.6）：`--spark-*` 是 CSS 变量，运行时才解析。
 * 已归档会话未装载，引擎 statusOf 一律回 'idle'——若仍画绿点等于谎称它在你工作区里活跃。
 * 归档位来自 SessionMetaDto.archivedAt（12.4：仅已归档携带，禁假状态）。
 */
const DOT_CLASS: Record<DotTokenKey, string> = {
  sparkAccent: 'bg-[var(--spark-accent)] animate-pulse',
  sparkWarn: 'bg-[var(--spark-warn)]',
  sparkOk: 'bg-[var(--spark-ok)]',
  mutedForeground: 'bg-muted-foreground',
}

export function SessionStatusDot({ status, archived = false }: { status: SessionStatus; archived?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[dotTokenOf(status, archived)])}
    />
  )
}

/** 项目名 = cwd 目录名（跨平台分隔符；空 cwd 兜底「未分组」）——分组数据源，纯前端 */
export function projectOf(cwd: string): string {
  const seg = cwd.split(/[\\/]/).filter((s) => s.length > 0)
  const last = seg[seg.length - 1]
  return last ?? '未分组'
}

/** 时间分组段（工单 10.5②；自然日边界，固定展示序） */
const TIME_GROUP_ORDER: readonly string[] = ['今天', '昨天', '7 天内', '更早']

export function timeGroupOf(ts: number): string {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const DAY = 86400000
  // 段界整点归更早段（开区间下界）：恰为昨日零点/六天前零点的时间戳不算上一段
  if (ts >= startOfToday) return '今天'
  if (ts > startOfToday - DAY) return '昨天'
  if (ts > startOfToday - 6 * DAY) return '7 天内'
  return '更早'
}

interface ProjectGroup {
  name: string
  sessions: SessionDto[]
}

/** 侧栏三形态（工单 19.40）：图标轨 / 264px 常规列 / 窄屏覆盖式抽屉 */
export type SidebarMode = 'rail' | 'inline' | 'overlay'

/**
 * 形态推导（纯函数，单测点）：折叠优先于窄屏——窄屏折叠时仍是 48px 图标轨
 * （抽屉是"展开态在窄屏的呈现方式"，不是第三个开关）；展开 + 窄屏才 overlay。
 */
export function sidebarModeOf(collapsed: boolean, narrow: boolean): SidebarMode {
  if (collapsed) return 'rail'
  return narrow ? 'overlay' : 'inline'
}

/** 浮层/抽屉面板的边界阴影（DESIGN §13.L.6 同源 token：0.5px 描边环 + 一层柔影，不画矩形框线） */
const OVERLAY_SHADOW =
  'shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_3px_8px_rgba(0,0,0,0.03),0_0_16px_rgba(0,0,0,0.02)] dark:shadow-[0_0_0_0.5px_rgb(255_255_255/0.16),0_3px_8px_rgb(0_0_0/0.25)]'

export interface SidebarProps {
  mode?: SidebarMode
  /** overlay 形态的关闭回调（遮罩点击 / Esc / 折叠钮）；其余形态忽略 */
  onOverlayClose?: () => void
}

export function Sidebar({ mode = 'inline', onOverlayClose }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { transport } = useTransport()
  const { sessions, error, refresh } = useSessionList()
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const groupMode = useUiStore((s) => s.sidebarGroupMode)
  const setGroupMode = useUiStore((s) => s.setSidebarGroupMode)
  const [query, setQuery] = useState('')
  const [foldedGroups, setFoldedGroups] = useState<Set<string>>(new Set())
  /** 折叠态分组浮层锚定的分组名（null = 关闭；工单 19.40 V2-36） */
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null)
  const activeSlice = useActiveSlice()
  // 工单 12.4：归档/删除动作 + 已归档抽屉（列表按需拉取）
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [archived, setArchived] = useState<SessionDto[] | null>(null)
  /** 二轮 P2-2：内联删除确认的待确认会话 id（3s 超时自清，DESIGN §5 两段式） */
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const askConfirmDel = (id: string): void => {
    setConfirmDel(id)
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmDel(null), 3000)
  }
  const [opError, setOpError] = useState<string | null>(null)

  const loadArchived = async (): Promise<void> => {
    try {
      setArchived(await transport.listSessions(true))
    } catch (err) {
      setOpError(errorMessageOf(err))
    }
  }

  const archiveSession = async (s: SessionDto, archived: boolean): Promise<void> => {
    try {
      await transport.archiveSession(s.id, archived)
      await refresh()
      if (archivedOpen) await loadArchived()
    } catch (err) {
      setOpError(errorMessageOf(err))
    }
  }

  /** 置顶/取消（工单 19.41）：写完 refresh() 重取——组归属与"置顶首组"由服务端回显决定，不在本地挪位（禁乐观更新） */
  const pinSession = async (s: SessionDto, pinned: boolean): Promise<void> => {
    try {
      await transport.pinSession(s.id, pinned)
      await refresh()
      if (archivedOpen) await loadArchived()
    } catch (err) {
      setOpError(errorMessageOf(err))
    }
  }

  const deleteSession = async (s: SessionDto): Promise<void> => {
    // 确认由触发点内联两段式完成（DESIGN §5：禁原生 confirm）；此处明示去向：
    // 记录移入 ~/.spark/trash/ 可人工找回（非硬删）
    try {
      await transport.deleteSession(s.id)
      await refresh()
      if (archivedOpen) await loadArchived()
    } catch (err) {
      setOpError(errorMessageOf(err))
    }
  }

  const toggleArchived = (): void => {
    if (!archivedOpen && archived === null) void loadArchived()
    setArchivedOpen((v) => !v)
  }

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

  /** 分组推导（工单 10.5②）：项目=按 cwd 目录名；时间=按更新时间段；组内 updatedAt 倒序。
   *  置顶单列首组的规则在 session-groups.ts（纯函数，可单测）。 */
  const groups = useMemo<ProjectGroup[] | null>(() => {
    if (sessions === null) return null
    return groupSessionsForSidebar(
      sessions,
      query,
      groupMode === 'project' ? (s) => projectOf(s.cwd) : (s) => timeGroupOf(s.updatedAt),
      groupMode === 'time' ? (name) => TIME_GROUP_ORDER.indexOf(name) : () => -1,
    )
  }, [sessions, query, groupMode])

  async function createSession() {
    const dto = await transport.createSession()
    openSession(dto.id)
  }

  /**
   * 打开会话的唯一出口（列表项 / 折叠态浮层 / 新建）：overlay 形态点选即收抽屉——
   * 窄屏下"选完还得手动关"会把刚切的会话 again 遮住一半（工单 19.40）。
   */
  function openSession(id: string): void {
    if (mode === 'overlay') onOverlayClose?.()
    void navigate(`/session/${id}`)
  }

  // overlay 形态 Esc 关闭（DESIGN §5「Esc 关闭浮层」，与遮罩点击同一关闭途径）；
  // rail 的分组浮层随鼠标移出即收，不吃 Esc
  useEffect(() => {
    if (mode !== 'overlay') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOverlayClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onOverlayClose])

  function toggleGroup(name: string): void {
    setFoldedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (mode === 'rail') {
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
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
        <button
          type="button"
          aria-label="新建会话"
          title="新建会话（c）"
          onClick={() => void createSession()}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="搜索会话"
          title="搜索会话（/）"
          onClick={() => void navigate('/search')}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground',
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
            'flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground',
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
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Settings className="size-4" />
        </button>
        {groups !== null &&
          groups.map((g) => {
            const active = g.sessions.some((s) => s.id === routeSessionId)
            const open = flyoutGroup === g.name
            return (
              // 折叠态会话直点（V2-36）：悬停即弹、点击钉住（触屏与键盘无 hover 时的替代路径）；
              // 浮层内联在触发钮的 relative 容器里（与 FileTreePopover/PermissionTierMenu 同做法，
              // 不走 portal——左栏 overflow 可见，z-40 已盖住内容列）
              <div
                key={g.name}
                className="relative shrink-0"
                onMouseLeave={() => setFlyoutGroup((cur) => (cur === g.name ? null : cur))}
              >
                <button
                  type="button"
                  aria-label={`项目 ${g.name}（${g.sessions.length} 个会话）`}
                  aria-expanded={open}
                  onMouseEnter={() => setFlyoutGroup(g.name)}
                  onFocus={() => setFlyoutGroup(g.name)}
                  onBlur={(e) => {
                    // 焦点移出整个容器（含浮层内部）才收——Tab 进浮层项不应瞬闭
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setFlyoutGroup((cur) => (cur === g.name ? null : cur))
                    }
                  }}
                  onClick={() => setFlyoutGroup((cur) => (cur === g.name ? null : g.name))}
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground',
                    active || open ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <FolderGit2 className="size-4" />
                </button>
                {open && (
                  <GroupSessionFlyout
                    group={g}
                    activeId={routeSessionId}
                    statusOf={liveStatus}
                    titleOf={liveTitle}
                    onOpenSession={openSession}
                    onExpandSidebar={toggleSidebar}
                  />
                )}
              </div>
            )
          })}
      </nav>
    )
  }

  const nav = (
    <nav
      aria-label="会话列表"
      role={mode === 'overlay' ? 'dialog' : undefined}
      aria-modal={mode === 'overlay' ? true : undefined}
      className={cn(
        'flex min-h-0 flex-col gap-2 bg-sidebar p-2',
        // overlay：覆盖式抽屉（fixed 脱栅格，列宽仍由 AppShell 留 48px）；inline：常规列
        mode === 'overlay' ? cn('fixed inset-y-0 left-0 z-40 w-[264px]', OVERLAY_SHADOW) : 'h-full border-r border-border',
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={mode === 'overlay' ? '收起侧栏' : '折叠侧栏'}
          title={mode === 'overlay' ? '收起侧栏（Esc）' : '折叠侧栏'}
          onClick={mode === 'overlay' ? (onOverlayClose ?? toggleSidebar) : toggleSidebar}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => void createSession()}
          title="新建会话（c）"
          className="flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-2 text-[13px] font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3.5 shrink-0" />
          新建会话
          <kbd className="shrink-0 rounded-full border border-primary-foreground/30 px-1 font-mono text-[10px] leading-4 text-primary-foreground/70">
            c
          </kbd>
        </button>
      </div>

      <div className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话"
          className="h-7 pl-7 pr-2 text-xs"
        />
      </div>

      {/* 分组双模式（工单 10.5②）：项目=按 cwd；时间=按更新时间段 */}
      <div role="tablist" aria-label="会话分组模式" className="flex shrink-0 gap-1 rounded-full bg-muted p-0.5">
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
              'h-6 flex-1 rounded-full text-xs',
              groupMode === t.mode
                ? 'bg-background text-foreground'
                : 'text-foreground/70 hover:text-foreground',
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
              className="self-start rounded-full border border-border px-2 py-0.5 hover:bg-accent"
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
              confirmDel={confirmDel}
              askConfirmDel={askConfirmDel}
              onOpenSession={openSession}
              statusOf={liveStatus}
              titleOf={liveTitle}
              onArchive={(s) => void archiveSession(s, true)}
              onPin={(s, pinned) => void pinSession(s, pinned)}
              onDelete={(s) => void deleteSession(s)}
            />
          ))}
      </div>

      {/* 已归档抽屉（工单 12.4）：按需拉取，列出/恢复/删除（删除走两段式 confirm） */}
      <button
        type="button"
        onClick={toggleArchived}
        aria-expanded={archivedOpen}
        className="flex h-8 shrink-0 items-center gap-2 rounded-full px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Archive className="size-3.5" />
        <span className="flex-1 text-left">已归档</span>
        {archived !== null && archived.length > 0 && (
          <span className="text-[11px] text-muted-foreground/70">{archived.length}</span>
        )}
      </button>
      {opError !== null && (
        <p className="px-2 py-1 font-mono text-xs text-destructive">{opError}</p>
      )}
      {archivedOpen && archived !== null && archived.length > 0 && (
        <ul aria-label="已归档会话" className="max-h-40 shrink-0 overflow-y-auto rounded-xl border border-border p-1">
          {archived.map((s) => (
            <li key={s.id} className="flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-accent">
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {s.title === '' ? '新会话' : s.title}
              </span>
              <button
                type="button"
                aria-label={`恢复会话 ${s.title === '' ? '新会话' : s.title}`}
                title="恢复到会话列表"
                onClick={() => void archiveSession(s, false)}
                className="rounded-full p-1 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
              >
                <Undo2 className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={confirmDel === s.id ? `确认删除 ${s.title === '' ? '新会话' : s.title}` : `删除会话 ${s.title === '' ? '新会话' : s.title}`}
                title={confirmDel === s.id ? '再次点击确认删除（移入 trash）' : '删除（移入 trash，可人工找回）'}
                onClick={() => {
                  // 内联两段式确认（DESIGN §5）：首击变红 3s 内再击才执行
                  if (confirmDel !== s.id) {
                    setConfirmDel(s.id)
                    return
                  }
                  setConfirmDel(null)
                  void deleteSession(s)
                }}
                className={cn(
                  'rounded-full p-1 text-muted-foreground/70 hover:bg-accent',
                  confirmDel === s.id && 'bg-destructive/10 text-destructive hover:text-destructive',
                )}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 全文搜索入口（工单 7.13 / H12；快捷键提示工单 10.5①） */}
      <button
        type="button"
        onClick={() => void navigate('/search')}
        aria-current={location.pathname === '/search' ? 'page' : undefined}
        title="搜索（/）"
        className={cn(
          'flex h-8 shrink-0 items-center gap-2 rounded-full px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
          location.pathname === '/search'
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground',
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 text-left">搜索</span>
        <kbd className="shrink-0 rounded-full border border-border bg-background px-1 font-mono text-[10px] leading-4 text-muted-foreground">
          /
        </kbd>
      </button>

      {/* 自动化入口（工单 7.6 / §13.F.3） */}
      <button
        type="button"
        onClick={() => void navigate('/automation')}
        aria-current={location.pathname === '/automation' ? 'page' : undefined}
        className={cn(
          'flex h-8 shrink-0 items-center gap-2 rounded-full px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
          location.pathname === '/automation'
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground',
        )}
      >
        <CalendarClock className="size-4 shrink-0" />
        自动化
      </button>

      {/* 用户卡（工单 10.5④，§13:368 本地形态）：Spark 无账号体系——头像占位 + 本机标识 + 齿轮进设置 */}
      <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border px-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="size-3.5 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">本机用户</span>
        <button
          type="button"
          aria-label="设置中心"
          title="设置（Cmd/Ctrl+,）"
          onClick={() => void navigate('/settings/appearance')}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Settings className="size-3.5" />
        </button>
      </div>
    </nav>
  )

  if (mode !== 'overlay') return nav

  return (
    <>
      {/* 遮罩（V2-39）：与 DialogOverlay 同 token（bg-black/60，无 backdrop-blur——DESIGN §12.2
          禁毛玻璃遮罩）；做成 button 让键盘 Tab 的首站即「关闭侧栏」，与点遮罩同一语义 */}
      <button
        type="button"
        aria-label="关闭侧栏"
        onClick={() => onOverlayClose?.()}
        className="fixed inset-0 z-30 cursor-default bg-black/60"
      />
      {nav}
    </>
  )
}

/** 折叠态分组浮层列出条数上限（超出走「展开侧栏」出口——浮层不做分页，避免在 48px 轨里再造一套列表交互） */
const FLYOUT_MAX_SESSIONS = 8

interface GroupSessionFlyoutProps {
  group: ProjectGroup
  activeId: string
  statusOf: (dto: SessionDto) => SessionStatus
  titleOf: (dto: SessionDto) => string
  onOpenSession: (id: string) => void
  onExpandSidebar: () => void
}

/**
 * 折叠态分组浮层（工单 19.40 / V2-36）：48px 图标态下直达该组会话。
 * 数据源是 Sidebar 已算好的 groups（同一份 useSessionList 投影），零新请求；
 * 行高 32px / 13px 字号与会话项同规格，边界走 §13.L.6 弹层影（不画矩形框线）。
 */
function GroupSessionFlyout({
  group,
  activeId,
  statusOf,
  titleOf,
  onOpenSession,
  onExpandSidebar,
}: GroupSessionFlyoutProps) {
  const shown = group.sessions.slice(0, FLYOUT_MAX_SESSIONS)
  const rest = group.sessions.length - shown.length
  return (
    <div
      role="menu"
      aria-label={`${group.name} 的会话`}
      className={cn(
        'absolute left-full top-0 z-40 ml-1 w-64 overflow-hidden rounded-xl bg-popover py-1',
        OVERLAY_SHADOW,
      )}
    >
      <p className="border-b border-border px-2.5 pb-1 text-[11px] text-muted-foreground">
        {group.name}
      </p>
      <ul>
        {shown.map((s) => (
          <li key={s.id} role="none">
            <button
              type="button"
              role="menuitem"
              aria-current={s.id === activeId ? 'page' : undefined}
              onClick={() => onOpenSession(s.id)}
              className={cn(
                'flex h-8 w-full items-center gap-2 px-2.5 text-left text-[13px] hover:bg-accent',
                s.id === activeId && 'bg-secondary',
              )}
            >
              <SessionStatusDot status={statusOf(s)} archived={s.archivedAt !== undefined} />
              <span className="min-w-0 flex-1 truncate">{titleOf(s) === '' ? '新会话' : titleOf(s)}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground/70">
                {formatRelative(s.updatedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={onExpandSidebar}
          className="flex h-7 w-full items-center px-2.5 text-left text-xs text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground"
        >
          剩余 {rest} 个（展开侧栏）
        </button>
      )}
    </div>
  )
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-1" aria-label="加载中">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/60" />
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
  onArchive: (s: SessionDto) => void
  /** 置顶/取消置顶（工单 19.41） */
  onPin: (s: SessionDto, pinned: boolean) => void
  onDelete: (s: SessionDto) => void
  /** 打开会话的唯一出口（工单 19.40：overlay 形态点选要顺带收抽屉，故由 Sidebar 持有） */
  onOpenSession: (id: string) => void
  /** 右键菜单的两段式删除确认 id（状态提升到 Sidebar——与抽屉共用一套语义） */
  confirmDel: string | null
  askConfirmDel: (id: string) => void
}

/** 分组头 28px（12px 字号，▸/▾ 折叠）+ 会话项 32px（§13.A 数值清单）；组内渐进展开（工单 10.5③：5 条起步，逐次 +5） */
function SidebarGroup({
  group,
  folded,
  onToggle,
  activeId,
  statusOf,
  titleOf,
  onArchive,
  onPin,
  onDelete,
  onOpenSession,
  confirmDel,
  askConfirmDel,
}: SidebarGroupProps) {
  const [visible, setVisible] = useState(GROUP_VISIBLE_STEP)
  /** 二轮 P2-2：右键上下文菜单锚定的会话 id（null = 关闭） */
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const shown = Math.min(visible, group.sessions.length)
  const rest = group.sessions.length - shown
  return (
    <section className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!folded}
        className="flex h-7 w-full items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
              <div
                onContextMenu={(e) => {
                  // 二轮 P2-2（DESIGN §5 上下文菜单）：右键弹会话操作菜单
                  e.preventDefault()
                  setMenuFor(s.id)
                }}
                className={cn(
                  'group relative flex h-8 w-full items-center gap-2 rounded-full border border-transparent pl-3 pr-1 text-left hover:bg-accent',
                  s.id === activeId && 'border-border bg-secondary',
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpenSession(s.id)}
                  aria-current={s.id === activeId ? 'page' : undefined}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <SessionStatusDot status={statusOf(s)} archived={s.archivedAt !== undefined} />
                  {/* 置顶态常驻可见（悬停钮只在 hover 时出现，不能承载状态显示）——工单 19.41 */}
                  {s.pinned === true && <Pin className="size-3 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {titleOf(s) === '' ? '新会话' : titleOf(s)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground/70 group-hover:hidden">
                    {formatRelative(s.updatedAt)}
                  </span>
                </button>
                {/* 悬停动作（工单 12.4）：归档 / 删除（删除确认在 deleteSession 内） */}
                <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    aria-label={`${s.pinned === true ? '取消置顶' : '置顶'}会话 ${titleOf(s) === '' ? '新会话' : titleOf(s)}`}
                    aria-pressed={s.pinned === true}
                    title={s.pinned === true ? '取消置顶' : '置顶（恒在列表最上方的「置顶」组）'}
                    onClick={() => onPin(s, s.pinned !== true)}
                    className={cn(
                      'rounded-full p-1 text-muted-foreground/70 hover:bg-accent hover:text-foreground',
                      s.pinned === true && 'text-foreground',
                    )}
                  >
                    <Pin className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`归档会话 ${titleOf(s) === '' ? '新会话' : titleOf(s)}`}
                    title="归档"
                    onClick={() => onArchive(s)}
                    className="rounded-full p-1 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                  >
                    <Archive className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除会话 ${titleOf(s) === '' ? '新会话' : titleOf(s)}`}
                    title={confirmDel === s.id ? '再次点击确认删除（移入 trash）' : '删除（移入 trash，可人工找回）'}
                    onClick={() => {
                      if (confirmDel !== s.id) {
                        askConfirmDel(s.id)
                        return
                      }
                      onDelete(s)
                    }}
                    className={cn(
                      'rounded-full p-1 text-muted-foreground/70 hover:bg-accent',
                      confirmDel === s.id && 'bg-destructive/10 text-destructive hover:text-destructive',
                    )}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
                {/* 右键上下文菜单（DESIGN §5：会话列表项——置顶/归档/删除，与悬停动作同项同序）。
                    重命名不在此菜单：端点自 19.20 已有，入口是命令面板的内联改名（本菜单加同项
                    要先定"菜单里怎么编辑"的形态，属 19.21 会话流小件批的口径，不在此半做） */}
                {menuFor === s.id && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} onContextMenu={(e) => { e.preventDefault(); setMenuFor(null) }} />
                    <ul
                      role="menu"
                      aria-label={`会话操作：${titleOf(s) === '' ? '新会话' : titleOf(s)}`}
                      className="absolute right-1 top-9 z-40 w-36 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-md"
                    >
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          aria-pressed={s.pinned === true}
                          onClick={() => {
                            setMenuFor(null)
                            onPin(s, s.pinned !== true)
                          }}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-accent"
                        >
                          <Pin className="size-3.5 text-muted-foreground" />
                          {s.pinned === true ? '取消置顶' : '置顶'}
                        </button>
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuFor(null)
                            onArchive(s)
                          }}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-accent"
                        >
                          <Archive className="size-3.5 text-muted-foreground" />
                          归档
                        </button>
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (confirmDel !== s.id) {
                              askConfirmDel(s.id)
                              return
                            }
                            setMenuFor(null)
                            onDelete(s)
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-accent',
                            confirmDel === s.id && 'text-destructive',
                          )}
                        >
                          <Trash2 className="size-3.5" />
                          {confirmDel === s.id ? '确认删除？' : '删除'}
                        </button>
                      </li>
                    </ul>
                  </>
                )}
              </div>
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
