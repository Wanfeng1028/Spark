/**
 * task_output / task_stop 工具族（CK-1 批 1）：后台任务的拉取式观察面。
 * - task_output：按字符偏移读输出缓冲（首响应头尾预算 24KiB——长输出先给头尾概览，
 *   续读走 nextOffset；done 后可反复读，running 中轮询读）；会话隔离——只能读本会话任务。
 * - task_stop：树杀在跑任务（SIGTERM → 宽限 → SIGKILL，与前台超时同法）；已结束 →
 *   E_TASK_ALREADY_DONE，未知/他会话 → E_TASK_NOT_FOUND。
 * 权限：task.read / task.stop 独立 action（browser 家族同模式——开放 action 空间，
 * confirm-each 缺省 ask，可用 always 固化）。工具只触碰 manager 内存态，
 * 不经文件系统、不 spawn——stop 的树杀目标是已审批过的 bash 命令进程。
 * （与 task.ts 的子代理 Task 工具无共族关系：那是 agent.task 域，本文件是 bash
 * 后台平面的观察面——CK-1 批 2 agent 后台化时再评估合族。）
 */
import { z } from 'zod'
import { TaskIdSchema } from '@spark/protocol'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import type { BackgroundTaskManager } from '../../background-task.js'

/** 首响应总预算（字符；MiniMax 24KiB 头尾预算同值） */
const FIRST_READ_BUDGET = 24 * 1024
/** 首响应的头/尾切分 */
const FIRST_READ_HEAD = 12 * 1024
/** 非首响应的单次读取上限 */
const SLICE_LIMIT = 24 * 1024

const TaskOutputInput = z.strictObject({
  taskId: TaskIdSchema,
  /** 输出缓冲的字符偏移（首读省略 = 0；续读传上一响应的 nextOffset） */
  offset: z.number().int().nonnegative().optional(),
})

const TaskStopInput = z.strictObject({
  taskId: TaskIdSchema,
})

type TaskOutputInput = z.infer<typeof TaskOutputInput>
type TaskStopInput = z.infer<typeof TaskStopInput>

export function makeTaskTools(
  manager: BackgroundTaskManager,
): [ToolDefinition<TaskOutputInput>, ToolDefinition<TaskStopInput>] {
  const taskOutput: ToolDefinition<TaskOutputInput> = {
    name: 'task_output',
    description:
      '读取后台任务（bash runInBackground / 自动转后台）的输出与状态。' +
      'taskId 来自后台化响应；首读省略 offset 给头尾概览，续读传上一次响应的 nextOffset。' +
      '任务进行中也可读（轮询）；done=true 时 exitCode/aborted/timedOut 为终态。',
    inputSchema: TaskOutputInput,
    permission: {
      action: 'task.read',
      resourceOf: (input) => `task:${input.taskId}`,
    },
    parallelizable: true,
    execute(ctx: ToolContext, input: TaskOutputInput): Promise<ToolOutput> {
      const task = manager.get(ctx.sessionId, input.taskId)
      if (task === undefined) {
        return Promise.resolve({
          output: {
            code: 'E_TASK_NOT_FOUND',
            message: `后台任务 ${input.taskId} 不存在（或属其他会话）`,
          },
          isError: true,
        })
      }
      const offset = input.offset ?? 0
      if (offset > task.totalChars) {
        return Promise.resolve({
          output: {
            code: 'E_TASK_OFFSET',
            message: `偏移 ${offset} 超出缓冲长度 ${task.totalChars}（任务输出可能仍在增长，请用更小偏移重试）`,
          },
          isError: true,
        })
      }
      const slice = task.buffer.slice(offset)
      let output: string
      let nextOffset: number | null = null
      if (offset === 0 && task.totalChars > FIRST_READ_BUDGET) {
        // 首响应头尾预算：先概览再续读（nextOffset 指向尾部起点——中段通常无需逐字读）
        const head = task.buffer.slice(0, FIRST_READ_HEAD)
        const tailStart = task.totalChars - (FIRST_READ_BUDGET - FIRST_READ_HEAD)
        const omitted = tailStart - FIRST_READ_HEAD
        output = `${head}\n…[略去 ${omitted} 字符，续读传 offset=${tailStart}]…\n${task.buffer.slice(tailStart)}`
        nextOffset = tailStart
      } else if (slice.length > SLICE_LIMIT) {
        output = slice.slice(0, SLICE_LIMIT)
        nextOffset = offset + SLICE_LIMIT
      } else {
        output = slice
      }
      return Promise.resolve({
        output: {
          taskId: input.taskId,
          done: task.done,
          ...(task.done && task.settle !== undefined
            ? {
                exitCode: task.settle.exitCode,
                ...(task.settle.signal !== undefined ? { signal: task.settle.signal } : {}),
                aborted: task.settle.aborted,
                timedOut: task.settle.timedOut,
                durationMs: task.settle.durationMs,
              }
            : {}),
          output,
          nextOffset,
          truncatedBuffer: task.truncated,
          totalChars: task.totalChars,
        },
        isError: false,
      })
    },
  }

  const taskStop: ToolDefinition<TaskStopInput> = {
    name: 'task_stop',
    description:
      '终止一个在跑的后台任务（树杀：进程组 SIGTERM → 宽限 → SIGKILL）。' +
      '已结束的任务不可再停（E_TASK_ALREADY_DONE）；终止完成后任务输出仍可 task_output 读取。',
    inputSchema: TaskStopInput,
    permission: {
      action: 'task.stop',
      resourceOf: (input) => `task:${input.taskId}`,
    },
    parallelizable: false,
    execute(ctx: ToolContext, input: TaskStopInput): Promise<ToolOutput> {
      const task = manager.get(ctx.sessionId, input.taskId)
      if (task === undefined) {
        return Promise.resolve({
          output: {
            code: 'E_TASK_NOT_FOUND',
            message: `后台任务 ${input.taskId} 不存在（或属其他会话）`,
          },
          isError: true,
        })
      }
      if (task.done) {
        return Promise.resolve({
          output: {
            code: 'E_TASK_ALREADY_DONE',
            message: `后台任务 ${input.taskId} 已结束（exitCode=${task.settle?.exitCode ?? 'null'}），无需终止`,
          },
          isError: true,
        })
      }
      // 杀进程；close 事件落回 bash 侧处理器后由其调 manager.complete（aborted=true）——
      // task.completed 事件与回注都在那条路径上，本工具只负责发起停止
      manager.stop(input.taskId)
      return Promise.resolve({
        output: { taskId: input.taskId, stopped: true },
        isError: false,
      })
    },
  }

  // CK-1 批 2：任务清单（bash/agent 两族统一注册表的导航面；不含输出——读细节走 task_output）
  const taskList: ToolDefinition<Record<string, never>> = {
    name: 'task_list',
    description:
      '列出本会话全部后台任务（bash 进程与后台子代理）。' +
      '返回 id/族/命令/状态（注册序）；任务输出与终态走 task_output。',
    inputSchema: z.strictObject({}),
    permission: {
      action: 'task.read',
      resourceOf: () => 'tasks',
    },
    parallelizable: true,
    execute(ctx: ToolContext): Promise<ToolOutput> {
      return Promise.resolve({ output: { tasks: manager.list(ctx.sessionId) }, isError: false })
    },
  }

  return [taskOutput, taskStop, taskList]
}
