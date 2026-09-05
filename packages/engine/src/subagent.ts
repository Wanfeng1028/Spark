/**
 * 子代理执行体（工单 5.4 / ADR D17；工单 R-D 第⑤刀自 engine.ts 拆出）：
 * Task 工具执行体——独立子会话（header.parentSession）跑一轮任务，返回最终
 * assistant 文本。父 turn 中断级联 interrupt 子会话；单层限制——正在派生
 * 子代理的会话不可再派生（E_SUBAGENT_DEPTH）。
 * 会话派生与状态经 deps 注入（引擎门面持有 Map/Set 所有权）。
 */
import type { EventId, SessionId, TurnFinish } from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { SessionEntry, SessionHandle } from './engine-types.js'
import type { ToolContext, ToolOutput } from './tools/definition.js'
import type { TaskInput } from './tools/builtin/task.js'

export interface SubagentDeps {
  /** 会话派生入口（引擎 createSession；parentEventId 锚定派生它的 tool.started） */
  createSession: (opts: {
    title?: string
    model?: string
    cwd?: string
    parentId?: SessionId
    parentEventId?: EventId
  }) => Promise<SessionHandle>
  /** 引擎进程内会话仓储（异常收尾 interrupt 用——引用同一 Map） */
  sessions: Map<SessionId, SessionEntry>
  /** 事件总线（订阅子会话 turn 收尾与 assistant 文本） */
  bus: EventBus
  /** 在途子代理登记（单层限制判定；shutdown 收尾清点） */
  children: Set<SessionId>
}

export function makeSubagentRunner(deps: SubagentDeps): (input: TaskInput, ctx: ToolContext) => Promise<ToolOutput> {
  return async (input, ctx) => {
    if (deps.children.has(ctx.sessionId)) {
      throw new Error('E_SUBAGENT_DEPTH: 子会话不可再派生子代理（单层）')
    }
    const parent = deps.sessions.get(ctx.sessionId)
    if (parent === undefined) {
      throw new Error(`E_ENGINE_NO_SESSION: 父会话 ${ctx.sessionId} 未加载，拒绝派生子代理`)
    }
    const child = await deps.createSession({
      title: input.title ?? '子代理',
      cwd: parent.meta.cwd,
      parentId: ctx.sessionId,
      // 工单 7.8：锚定派生它的 tool.started 事件 → 树视图可见子代理运行态
      ...(ctx.sourceEventId !== undefined ? { parentEventId: ctx.sourceEventId } : {}),
    })
    deps.children.add(child.id)
    try {
      // 父 turn 中断 → 级联 interrupt 子会话（子 turn 收尾后本工具返回 E_ABORTED）
      const onAbort = (): void => {
        void child.interrupt()
      }
      ctx.signal.addEventListener('abort', onAbort, { once: true })
      let lastText = ''
      // holder 对象：闭包内赋值不触发控制流窄化（TS let 闭包窄化限制的绕法）
      const done = { finish: 'stop' as TurnFinish }
      try {
        // 订阅先于提交：user.message/turn.* 事件不漏
        await new Promise<void>((resolve) => {
          const sub = deps.bus.subscribe(
            (e) => {
              // 父先中断、子 turn 后开始：turn.started 时补一次 interrupt
              //（interrupt 在 turn 未开始时是 no-op——本行关闭该竞态）
              if (e.type === 'turn.started' && ctx.signal.aborted) {
                void child.interrupt()
              }
              if (e.type === 'assistant.message') {
                const texts = (e.data as { content: Array<{ type: string; text?: string }> })
                  .content.filter((c) => c.type === 'text' && typeof c.text === 'string')
                  .map((c) => c.text as string)
                if (texts.length > 0) lastText = texts.join('\n')
              }
              if (e.type === 'turn.completed') {
                done.finish = (e.data as { finish: TurnFinish }).finish
                sub.unsubscribe()
                resolve()
              }
            },
            { sessionId: child.id },
          )
          void child.send(input.prompt, 'now')
        })
      } finally {
        ctx.signal.removeEventListener('abort', onAbort)
      }
      if (ctx.signal.aborted || done.finish === 'aborted') {
        return { output: { code: 'E_ABORTED' }, isError: true }
      }
      return {
        output: lastText.length > 0 ? lastText : '(子代理无文本输出)',
        isError: done.finish === 'error',
      }
    } catch (err) {
      // 子会话创建成功后异常（send 拒绝等）：interrupt 收尾，不让子 turn 悬挂
      const childHandle = deps.sessions.get(child.id)
      childHandle?.runtime.interrupt()
      throw err
    }
  }
}
