/**
 * 会话任务清单单测（CK-4 批 1）：
 * todo_write 整表替换 + todo.updated 事件 emit + todo_read 回读；
 * nudge 触发（单次新完成 ≥3）与不触发（<3 / 已完成重复置位）；
 * write 失败闭合（emit 抛错 → 不落内存，工具 isError）。
 */
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import { makeTodoTools, TodoBoard, type TodoItem } from '../src/tools/builtin/todo.js'
import type { ToolContext } from '../src/tools/definition.js'

const SID = ids.session('ses_todotest00000000000000')

function makeCtx(): ToolContext {
  return {
    sessionId: SID,
    turnId: ids.turn('trn_todotest000000000000001'),
    callId: ids.call('cal_todotest000000000000001'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd: '/tmp',
  }
}

function item(id: string, status: TodoItem['status']): TodoItem {
  return { id, content: `任务 ${id}`, status }
}

interface Harness {
  board: TodoBoard
  todoWrite: ReturnType<typeof makeTodoTools>[0]
  todoRead: ReturnType<typeof makeTodoTools>[1]
  emitted: TodoItem[][]
}

function makeHarness(emitFail = false): Harness {
  const emitted: TodoItem[][] = []
  const board = new TodoBoard({
    emit: (_sid, todos): Promise<void> => {
      if (emitFail) return Promise.reject(new Error('E_IO_FAIL'))
      emitted.push(todos)
      return Promise.resolve()
    },
  })
  const [todoWrite, todoRead] = makeTodoTools(board)
  return { board, todoWrite, todoRead, emitted }
}

describe('todo 工具（CK-4 批 1）', () => {
  test('write：整表替换 + todo.updated emit + read 回读', async () => {
    const h = makeHarness()
    const r = await h.todoWrite.execute(makeCtx(), {
      todos: [item('t1', 'completed'), item('t2', 'in_progress'), item('t3', 'pending')],
    })
    expect(r.isError).toBe(false)
    expect(h.emitted).toHaveLength(1)
    expect((r.output as { count: number }).count).toBe(3)
    const read = await h.todoRead.execute(makeCtx(), {})
    expect((read.output as { todos: TodoItem[] }).todos).toHaveLength(3)
    expect((read.output as { todos: TodoItem[] }).todos[1]?.status).toBe('in_progress')
  })

  test('nudge：单次新完成 ≥3 → toolResult 注入 nudge 文案', async () => {
    const h = makeHarness()
    const r = await h.todoWrite.execute(makeCtx(), {
      todos: [item('a', 'completed'), item('b', 'completed'), item('c', 'completed'), item('d', 'pending')],
    })
    expect((r.output as { nudge?: string }).nudge).toContain('验证')
  })

  test('nudge 不触发：新完成 <3 / 已完成条目重复置位不计入', async () => {
    const h = makeHarness()
    // 第一轮完成 a/b
    await h.todoWrite.execute(makeCtx(), { todos: [item('a', 'completed'), item('b', 'completed')] })
    // 第二轮 a 重复 completed + c 单个新完成 → 1 < 3
    const r = await h.todoWrite.execute(makeCtx(), {
      todos: [item('a', 'completed'), item('b', 'completed'), item('c', 'completed')],
    })
    expect((r.output as { nudge?: string }).nudge).toBeUndefined()
  })

  test('emit 失败闭合：不落内存（read 看不到）、工具 isError', async () => {
    const h = makeHarness(true)
    const r = await h.todoWrite.execute(makeCtx(), { todos: [item('x', 'pending')] })
    expect(r.isError).toBe(true)
    expect(h.board.get(SID)).toEqual([])
    const read = await h.todoRead.execute(makeCtx(), {})
    expect((read.output as { todos: TodoItem[] }).todos).toEqual([])
  })

  test('TodoBoard.needsVerificationNudge 边界：空表全完成 3 项触发', () => {
    expect(TodoBoard.needsVerificationNudge([], [item('a', 'completed'), item('b', 'completed'), item('c', 'completed')])).toBe(true)
    expect(TodoBoard.needsVerificationNudge([], [item('a', 'completed'), item('b', 'in_progress')])).toBe(false)
  })
})
