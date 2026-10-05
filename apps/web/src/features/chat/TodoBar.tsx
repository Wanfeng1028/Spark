/**
 * 会话待办常显条（19.41 / V2-38 翻案恢复）：todo.updated 整表快照投影
 * （slice.todos，CK-4）在会话页顶部的只读清单——模型经 todo_write 维护，
 * 端侧只读不写（无任何写工具面）。slice.todos === null（本会话未用过清单）
 * 或常规页「显示会话待办清单」开关关闭时不渲染——禁假状态、禁无效开关。
 */
import type { SessionId } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

export function TodoBar({ sessionId }: { sessionId: SessionId }) {
  const showTodo = useSettingsStore((s) => s.showTodo)
  const todos = useSessionStore((s) => s.byId[sessionId]?.todos)
  if (!showTodo || todos === null || todos === undefined) return null
  // 常显条只放未完成项——已完成的历史不再打扰（清空即整条消失，不渲染空壳）
  const open = todos.filter((t) => t.status !== 'completed')
  if (open.length === 0) return null
  return (
    <div className="mb-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
      <div className="mb-1 font-medium text-foreground">
        待办 {open.length}/{todos.length}
      </div>
      <ul className="flex flex-col gap-0.5">
        {open.map((t) => (
          <li key={t.id} className="flex min-w-0 items-start gap-1.5 text-muted-foreground">
            <span
              aria-hidden
              className={
                t.status === 'in_progress'
                  ? 'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--spark-accent)]'
                  : 'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full border border-border'
              }
            />
            <span className="min-w-0 truncate">{t.content}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
