/**
 * 会话任务清单（CK-4 批 1）：todo_write / todo_read 两工具 + 验证 nudge。
 * 存储 = 引擎内存态 Map<SessionId, items[]>；持久化靠 todo.updated durable 事件
 * （reducer 回放即重建——与 checkpoint 同思路，不落独立文件）。
 * nudge（Claude Code verificationNudgeNeeded 收窄版）：单次写入把 ≥3 项置为
 * completed 时，toolResult 注入结构化提醒（防"列举完成"冒充验证）——判据比
 * Claude 的"本 turn 无验证调用"宽松（本仓工具间无 turn 历史访问面），保守方向
 * 不漏报；登记为已知差异。
 */
import { z } from 'zod'
import type { SessionId } from '@spark/protocol'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** nudge 触发阈值（单次写入新完成 ≥3 项） */
export const TODO_NUDGE_THRESHOLD = 3

const TodoItemSchema = z.strictObject({
  id: z.string().min(1).max(40),
  content: z.string().min(1).max(500),
  status: z.enum(['pending', 'in_progress', 'completed']),
})

const TodoWriteInput = z.strictObject({
  /** 整表替换（新表即完整状态——不含的条目视为删除） */
  todos: z.array(TodoItemSchema).max(50),
})

const TodoReadInput = z.strictObject({})

type TodoWriteInput = z.infer<typeof TodoWriteInput>
type TodoReadInput = z.infer<typeof TodoReadInput>

export interface TodoBoardDeps {
  /** 写入时 emit todo.updated（durable 持久化事件；失败 = 写入失败闭合） */
  emit: (sessionId: SessionId, todos: TodoItem[]) => Promise<void>
}

export class TodoBoard {
  private readonly tables = new Map<SessionId, TodoItem[]>()

  constructor(private readonly deps: TodoBoardDeps) {}

  get(sessionId: SessionId): TodoItem[] {
    return this.tables.get(sessionId) ?? []
  }

  /** 整表替换：emit 成功才落内存（事件是持久化事实源）；失败上抛（工具侧闭合） */
  async write(sessionId: SessionId, items: TodoItem[]): Promise<void> {
    await this.deps.emit(sessionId, items)
    this.tables.set(sessionId, items)
  }

  /** nudge 判定：新表相对旧表新完成的条数 ≥ 阈值 */
  static needsVerificationNudge(oldTable: TodoItem[], newTable: TodoItem[]): boolean {
    const wasCompleted = new Set(oldTable.filter((t) => t.status === 'completed').map((t) => t.id))
    const newlyCompleted = newTable.filter(
      (t) => t.status === 'completed' && !wasCompleted.has(t.id),
    )
    return newlyCompleted.length >= TODO_NUDGE_THRESHOLD
  }
}

const NUDGE_TEXT =
  '提醒：本轮批量关闭了多项待办，但清单中没有任何验证类记录（测试/构建/人工核验）。' +
  '在向用户报告完成前，请先用 bash 跑验证（或说明每项的验证方式）——列举完成不等于验证完成。'

export function makeTodoTools(board: TodoBoard): [
  ToolDefinition<typeof TodoWriteInput>,
  ToolDefinition<typeof TodoReadInput>,
] {
  const todoWrite: ToolDefinition<TodoWriteInput> = {
    name: 'todo_write',
    description:
      '维护本会话的任务清单（整表替换——提交完整列表，不在表中的条目即删除）。' +
      '用于多步骤任务：开始前列计划（pending/in_progress），推进中把当前项置 in_progress' +
      '（同时最多一项），完成后置 completed。单次关闭 ≥3 项时会收到验证提醒。' +
      '清单对用户可见（会话流任务面板）。',
    inputSchema: TodoWriteInput,
    permission: {
      action: 'todo.write',
      resourceOf: () => 'session-todo',
    },
    parallelizable: false,
    async execute(ctx: ToolContext, input: TodoWriteInput): Promise<ToolOutput> {
      const oldTable = board.get(ctx.sessionId)
      await board.write(ctx.sessionId, input.todos)
      const nudge = TodoBoard.needsVerificationNudge(oldTable, input.todos)
      return {
        output: {
          count: input.todos.length,
          ...(nudge ? { nudge: NUDGE_TEXT } : {}),
        },
        isError: false,
      }
    },
  }

  const todoRead: ToolDefinition<TodoReadInput> = {
    name: 'todo_read',
    description: '读取本会话当前任务清单（跨 turn 记忆面——上一轮写到一半的计划在这里）。',
    inputSchema: TodoReadInput,
    permission: {
      action: 'todo.read',
      resourceOf: () => 'session-todo',
    },
    parallelizable: true,
    async execute(ctx: ToolContext): Promise<ToolOutput> {
      return { output: { todos: board.get(ctx.sessionId) }, isError: false }
    },
  }

  return [todoWrite, todoRead]
}
