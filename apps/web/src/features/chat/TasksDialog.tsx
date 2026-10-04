/**
 * 后台任务视图（CK-1 批 2 尾片：四端任务卡 web 面）——slice.tasks 投影。
 * 只读列表（任务 id / 族 / 命令 / 状态 / 输出尾随）；无任务不渲染入口（禁假状态）。
 * 运行中任务的 tail 由 task.progress live 事件实时更新（读细节走模型的 task_output）。
 */
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface TaskRow {
  taskId: string
  kind: 'bash' | 'agent'
  command: string
  done: boolean
  tail: string
}

export interface TasksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: readonly TaskRow[]
}

export function TasksDialog({ open, onOpenChange, tasks }: TasksDialogProps) {
  const running = tasks.filter((t) => !t.done).length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogTitle>后台任务</DialogTitle>
        <DialogDescription>
          {running > 0
            ? `${tasks.length} 个任务（运行中 ${running}）——输出尾随实时更新`
            : `${tasks.length} 个任务（全部结束）`}
        </DialogDescription>
        <ul className="max-h-[50vh] overflow-y-auto rounded-xl border border-border font-mono text-xs">
          {tasks.map((t) => (
            <li key={t.taskId} className="border-b border-border px-3 py-1.5 last:border-b-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    t.done ? 'bg-muted-foreground/40' : 'bg-[var(--spark-ok)]',
                  )}
                  title={t.done ? '已结束' : '运行中'}
                  aria-label={t.done ? '已结束' : '运行中'}
                />
                <span className="shrink-0 text-muted-foreground/70">
                  {t.kind === 'agent' ? '代理' : '命令'}
                </span>
                <span className="truncate">{t.command}</span>
              </div>
              {t.tail !== '' && (
                <p className="mt-1 truncate pl-5 text-muted-foreground" title={t.tail}>
                  {t.tail.split('\n')[0]}
                </p>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
