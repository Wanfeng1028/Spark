/**
 * BackgroundTaskManager（CK-1 批 1）：bash 后台任务的注册表 + 生命周期事件 + 完成回注。
 *
 * 职责边界（对照 Claude Code tasks.ts / MiniMax background-task manager 的取舍得失）：
 * - 进程 spawn 与输出收集**留在 bash 工具侧**（复用其树杀/解码器/收集上限——后台与前台
 *   唯一的差别是"不等待"）；manager 只持注册项（stop 钩子 + 缓冲读访问器），
 *   不拥有 child 进程——两层抽象若强合并，超时/中断/沙箱三条前台路径都会被搅进来。
 * - 事件面：task.started（注册时）/ task.completed（结清时），均 durable 非 surface——
 *   模型可见面是完成回注的合成 user.message（surface 纪律由那条消息承担）。
 * - 完成回注（OpenClaw notifyOnExit 同思路）：经 notify 回调走会话输入队列
 *   delivery='queue'（goal 合成续跑同通道），驱动主会话主动汇报一轮；会话不在册
 *   （已删除/进程重启后）→ notified=false 如实记录，不假装已通知。
 * - 会话隔离：task_output 只能读本会话注册的任务（路径硬边界同精神）；task id 全局唯一。
 * - 无超时：后台任务跑到自然结束或 TaskStop/引擎 shutdown 树杀（前台 timeoutMs 语义不变；
 *   前台阻塞预算转后台后同样不再受 timeoutMs 管——转后台即脱离前台超时语境）。
 */
import type { SessionId, TaskId } from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { SparkLogger } from './logger.js'
import { newIds } from './ulid.js'

/** 后台任务收集缓冲上限（字符；超出停收并标 truncated——与执行期收集上限同型，不是流式无限缓冲） */
export const TASK_BUFFER_CAP_CHARS = 256 * 1024

/** 前台阻塞预算（CK-1 ①）：前台命令超过该时长仍未结束即自动转后台（MiniMax 60s 同值） */
export const FOREGROUND_BUDGET_MS = 60_000

/** 结清信息（bash 工具在 child close 时回填；结构性类型——消费方按形状使用无需导入） */
interface TaskSettleInfo {
  exitCode: number | null
  signal?: string | undefined
  aborted: boolean
  timedOut: boolean
  durationMs: number
  outputChars: number
}

/** 注册项（manager 可见的全部——进程 internals 留在 bash 侧） */
interface TaskEntry {
  taskId: TaskId
  sessionId: SessionId
  command: string
  startedAt: number
  pid: number | undefined
  done: boolean
  /** 已结清信息（done=true 时有值） */
  settle: TaskSettleInfo | undefined
  /** 缓冲只读访问（bash 侧闭包提供；返回当前全量字符串与 truncated 标记） */
  read: () => { buffer: string; truncated: boolean }
  /** 树杀钩子（TaskStop / shutdownAll 用） */
  stop: () => void
}

export interface BackgroundTaskManagerDeps {
  bus: EventBus
  logger: SparkLogger
  /**
   * 完成回注：合成通知文本经会话输入队列 delivery='queue' 提交（goal 续跑同通道）。
   * 返回 false = 会话不在册或提交被拒（如实记 notified=false）。引擎侧接线见 engine.ts。
   */
  notify: (sessionId: SessionId, text: string) => boolean
  now?: () => number
  newTaskId?: () => TaskId
}

export class BackgroundTaskManager {
  private readonly tasks = new Map<TaskId, TaskEntry>()

  constructor(private readonly deps: BackgroundTaskManagerDeps) {}

  /**
   * 注册一个已在运行的后台任务（bash 工具 spawn 后调用）。emit task.started；
   * 事件落盘失败不撤销注册（进程已在跑，如实 log——completed 时仍会如实记录）。
   */
  register(input: {
    sessionId: SessionId
    command: string
    pid: number | undefined
    read: () => { buffer: string; truncated: boolean }
    stop: () => void
  }): TaskId {
    const taskId = (this.deps.newTaskId ?? newIds.task)()
    this.tasks.set(taskId, {
      taskId,
      sessionId: input.sessionId,
      command: input.command,
      startedAt: (this.deps.now ?? Date.now)(),
      pid: input.pid,
      done: false,
      settle: undefined,
      read: input.read,
      stop: input.stop,
    })
    void this.deps.bus
      .emit(input.sessionId, 'task.started', {
        taskId,
        kind: 'bash',
        command: input.command,
        ...(input.pid !== undefined ? { pid: input.pid } : {}),
      })
      .catch((err: unknown) => {
        this.deps.logger.error('task.started.emit.error', { taskId, err })
      })
    return taskId
  }

  /** 结清（bash 工具 child close 时调用；幂等——重复结清只记首次）。回注 → emit task.completed。 */
  async complete(taskId: TaskId, info: TaskSettleInfo): Promise<void> {
    const entry = this.tasks.get(taskId)
    if (entry === undefined || entry.done) return
    entry.done = true
    entry.settle = info
    // 回注先于落事件：notified 字段一次为真（completed 是审计事实，不发明占位值）；
    // 事件落盘失败只 log——任务已结束、回注已发生，进程侧无可为（失败闭合：可查可 grep）
    const notified = this.notifyOf(entry, info)
    if (!notified) {
      this.deps.logger.warn('task.notify.skipped', { taskId, sessionId: entry.sessionId })
    }
    try {
      await this.deps.bus.emit(entry.sessionId, 'task.completed', {
        taskId,
        exitCode: info.exitCode,
        ...(info.signal !== undefined ? { signal: info.signal } : {}),
        aborted: info.aborted,
        timedOut: info.timedOut,
        durationMs: info.durationMs,
        outputChars: info.outputChars,
        notified,
      })
    } catch (err) {
      this.deps.logger.error('task.completed.emit.error', { taskId, err })
    }
  }

  /** 本会话任务快照（task_output 数据源；会话隔离——他会话任务不可见） */
  get(sessionId: SessionId, taskId: TaskId): {
    command: string
    done: boolean
    settle: TaskSettleInfo | undefined
    buffer: string
    truncated: boolean
    totalChars: number
    startedAt: number
  } | undefined {
    const entry = this.tasks.get(taskId)
    if (entry === undefined || entry.sessionId !== sessionId) return undefined
    const { buffer, truncated } = entry.read()
    return {
      command: entry.command,
      done: entry.done,
      settle: entry.settle,
      buffer,
      truncated,
      totalChars: buffer.length,
      startedAt: entry.startedAt,
    }
  }

  /** 发起停止（task_stop 工具用；树杀细节在 bash 侧 stop 钩子里）。未知 id 静默忽略——调用方先 get 过。 */
  stop(taskId: TaskId): void {
    this.tasks.get(taskId)?.stop()
  }

  /** 引擎 shutdown 收尾：全部在跑任务树杀（结清走 bash 侧 close 处理器——aborted 语义） */
  shutdownAll(): void {
    for (const entry of this.tasks.values()) {
      if (!entry.done) entry.stop()
    }
  }

  /** 完成通知文案（合成 user.message 回注；给模型的行动指令明确：读输出、再汇报） */
  private notifyOf(entry: TaskEntry, info: TaskSettleInfo): boolean {
    const seconds = Math.max(1, Math.round(info.durationMs / 1000))
    const commandBrief = entry.command.length > 80 ? `${entry.command.slice(0, 80)}…` : entry.command
    const head =
      info.aborted
        ? `后台任务 ${entry.taskId} 已终止（收到停止请求）`
        : `后台任务 ${entry.taskId} 已完成：命令「${commandBrief}」，退出码 ${info.exitCode ?? `信号 ${info.signal ?? '未知'}`}，耗时 ${seconds}s`
    const text = `${head}。请用 task_output 工具读取该任务输出（taskId=${entry.taskId}），汇总后向用户简报。`
    try {
      return this.deps.notify(entry.sessionId, text)
    } catch {
      return false
    }
  }
}
