/**
 * 辅助会话抽屉（工单 19.36 / V2-09；DESIGN §13.A 右栏「辅助对话」的抽屉化实现）：
 * 主会话留在原区，这里挂第二个 SessionSurface 实例（variant='drawer'）——引擎跨会话并发
 * 本来就支持（一 session 一 runtime），**零新端点、零新事件、Transport 接口零新增方法**。
 *
 * 三条形态红线：
 * ① **非模态**：不铺遮罩——主工作区必须能继续操作，否则不叫"辅助"（与工单 19.40 的
 *    窄屏侧栏抽屉相反，那个是模态的）；
 * ② **互不串流**：两实例各自只读自己 sessionId 的投影分片（session store byId），
 *    drawer 不登记「当前会话」、不吃命令面板的一次性全局信号（见 SessionSurface 头注释）；
 * ③ **关闭不打断**：closeAux 只收面板、保留 auxSessionId——在途 turn 由引擎继续跑，
 *    事件经 TransportProvider 的全局 onEvent → applyEvent 落 store，与实例是否挂载无关。
 *
 * 宽度 360px 取 DESIGN §13.A 右栏既有档（不新增尺寸档），窄视口 max-w-full 兜底；
 * 停靠面板用 1px 左边框定边界（§3「分隔优先边框与留白、不用阴影」），不做浮层影。
 */
import { useEffect, useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'
import type { SessionDto, SessionId } from '@spark/protocol'
import { SessionSurface } from '@/features/chat/SessionSurface'
import { SessionStatusDot } from '@/components/layout/Sidebar'
import { useSessionList } from '@/hooks/useSessionList'
import { useTransport } from '@/transports/context'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { errorMessageOf } from '@/lib/error-copy'
import { formatRelative } from '@/lib/time'

export function AuxSessionDrawer() {
  const auxSessionId = useUiStore((s) => s.auxSessionId)
  const setAuxSession = useUiStore((s) => s.setAuxSession)
  const closeAux = useUiStore((s) => s.closeAux)

  // Esc 收抽屉（与窄屏侧栏抽屉同一条键盘出口）；不清 auxSessionId——重开续看同一条
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeAux()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeAux])

  return (
    <aside
      aria-label="辅助会话"
      className="fixed right-0 top-0 bottom-6 z-40 flex w-[360px] max-w-full flex-col border-l border-border bg-background"
    >
      {auxSessionId === null ? (
        <AuxSessionPicker
          onPick={setAuxSession}
          onClose={closeAux}
        />
      ) : (
        <SessionSurface
          sessionId={auxSessionId}
          variant="drawer"
          onClose={closeAux}
          onSwitchSession={() => setAuxSession(null)}
        />
      )}
    </aside>
  )
}

interface AuxSessionPickerProps {
  onPick: (sid: SessionId) => void
  onClose: () => void
}

/**
 * 抽屉内的会话选择器（未选辅助会话时的呈现）：数据源 = 既有 useSessionList（与侧栏同一份
 * 列表投影，不新造请求面）；主会话自己不列（同一条会话开两个实例即串流）。
 */
function AuxSessionPicker({ onPick, onClose }: AuxSessionPickerProps) {
  const { transport } = useTransport()
  const mainId = useSessionStore((s) => s.activeId)
  const { sessions, error, refresh } = useSessionList()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const list = (sessions ?? []).filter((s) => s.id !== mainId)

  async function createAux(): Promise<void> {
    setCreating(true)
    setCreateError(null)
    try {
      const dto = await transport.createSession()
      onPick(dto.id)
    } catch (err) {
      // 失败闭合：不如实造会话、不静默——错误留在选择器里，用户看得见
      setCreateError(errorMessageOf(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">辅助会话</h2>
        <button
          type="button"
          aria-label="关闭辅助会话"
          title="关闭（Esc）"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <button
          type="button"
          onClick={() => void createAux()}
          disabled={creating}
          className="mb-1 flex h-8 w-full items-center gap-2 rounded-full px-2.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MessageSquarePlus className="size-4 shrink-0" />
          {creating ? '新建中…' : '新建辅助会话'}
        </button>
        {createError !== null && (
          <p className="px-2 py-1 font-mono text-xs text-destructive">{createError}</p>
        )}
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
        {error === null && sessions !== null && list.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground/70">暂无可作为辅助的会话</p>
        )}
        <ul aria-label="选择辅助会话">
          {list.map((s) => (
            <li key={s.id}>
              <PickerRow
                session={s}
                onPick={() => onPick(s.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/** 选择行：32px / 13px（§13.A 会话项规格），状态点走 DTO status（未打开的会话无事件流） */
function PickerRow({ session, onPick }: { session: SessionDto; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex h-8 w-full items-center gap-2 rounded-full px-2.5 text-left hover:bg-accent"
    >
      <SessionStatusDot status={session.status} archived={session.archivedAt !== undefined} />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {session.title === '' ? '新会话' : session.title}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground/70">
        {formatRelative(session.updatedAt)}
      </span>
    </button>
  )
}
