/**
 * 子代理执行体（工单 5.4 / ADR D17；工单 R-D 第⑤刀自 engine.ts 拆出）：
 * Task 工具执行体——独立子会话（header.parentSession）跑一轮任务，返回最终
 * assistant 文本。父 turn 中断级联 interrupt 子会话；单层限制——正在派生
 * 子代理的会话不可再派生（E_SUBAGENT_DEPTH）。
 * 会话派生与状态经 deps 注入（引擎门面持有 Map/Set 所有权）。
 * 工单 13.5：task 入参 `preset` 只透传——预设解析、模型覆盖、工具面收窄与
 * system 附加段均在 Engine.createSession（预设档所有权在引擎，本层不感知）。
 */
import type { EventId, SessionId, TaskId, TurnFinish } from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { BackgroundTaskManager } from './background-task.js'
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
    /** 预设档名（工单 13.5）；解析与收窄均在 Engine.createSession，本层只透传 */
    preset?: string
  }) => Promise<SessionHandle>
  /** 引擎进程内会话仓储（异常收尾 interrupt 用——引用同一 Map） */
  sessions: Map<SessionId, SessionEntry>
  /** 事件总线（订阅子会话 turn 收尾与 assistant 文本） */
  bus: EventBus
  /** 在途子代理登记（单层限制判定；shutdown 收尾清点） */
  children: Set<SessionId>
  /** CK-2 批 2：用户 hooks（subagent_start/subagent_stop 双挂点；缺省不接线 = 不触发）。
   *  载荷 sessionId = 父会话（挂点属于派生它的会话流），childSessionId 在 data 里 */
  hooks?: {
    fire(
      point: 'subagent_start' | 'subagent_stop',
      payload: {
        sessionId: SessionId
        cwd: string
        sourceEventId: EventId | null
        data: Record<string, unknown>
      },
    ): void
  }
  /** CK-1 批 2：后台任务平面（缺省 undefined——runInBackground 如实报 E_TASK_NO_PLANE，
   *  不静默降级前台假装后台）。注册 kind:'agent' 任务 + 完成结清（回注在 manager 内）。
   *  Pick 收窄：调用方（engine 构造序晚于本接线）以懒箭头注入，不快照实例 */
  background?: Pick<BackgroundTaskManager, 'register' | 'complete'>
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
    // CK-1 批 2：后台化守卫在 createSession 之前——不建注定失败的子会话
    if (input.runInBackground === true && deps.background === undefined) {
      throw new Error(
        'E_TASK_NO_PLANE: 后台任务平面未接线——runInBackground 不可用（不静默转前台假装后台）',
      )
    }
    /** 已注册的后台任务 id（订阅回调发 task.progress 用；前台模式恒 undefined） */
    const taskIdRef: { taskId: TaskId | undefined } = { taskId: undefined }
    const child = await deps.createSession({
      // 标题：task 入参优先；缺省由 Engine.createSession 施加（预设档 title → '子代理'，工单 13.5）
      ...(input.title !== undefined ? { title: input.title } : {}),
      cwd: parent.meta.cwd,
      parentId: ctx.sessionId,
      ...(input.preset !== undefined ? { preset: input.preset } : {}),
      // 工单 7.8：锚定派生它的 tool.started 事件 → 树视图可见子代理运行态
      ...(ctx.sourceEventId !== undefined ? { parentEventId: ctx.sourceEventId } : {}),
    })
    deps.children.add(child.id)
    // CK-2 批 2：subagent_start 挂点（fire-and-forget——hook 不阻塞派生主路径）
    deps.hooks?.fire('subagent_start', {
      sessionId: ctx.sessionId,
      cwd: parent.meta.cwd,
      sourceEventId: ctx.sourceEventId ?? null,
      data: {
        childSessionId: child.id,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.preset !== undefined ? { preset: input.preset } : {}),
      },
    })
    let lastText = ''
    // holder 对象：闭包内赋值不触发控制流窄化（TS let 闭包窄化限制的绕法）
    const done = { finish: 'stop' as TurnFinish }
    const startedAtMs = Date.now()
    // CK-2 批 2：subagent_stop 挂点改为显式路径触发——后台模式函数早退时子代理仍在跑，
    // finally 时机错误（挂点须随 turn 收尾走）
    const fireStop = (): void => {
      deps.hooks?.fire('subagent_stop', {
        sessionId: ctx.sessionId,
        cwd: parent.meta.cwd,
        sourceEventId: ctx.sourceEventId ?? null,
        data: { childSessionId: child.id },
      })
    }
    // 父 turn 中断 → 级联 interrupt 子会话（子 turn 收尾后本工具返回 E_ABORTED）。
    // 声明在 try 外：catch 收尾路径也要摘除监听（作用域可达）
    const onAbort = (): void => {
      void child.interrupt()
    }
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    try {
      // 订阅先于提交：user.message/turn.* 事件不漏
      const turnSettled = new Promise<void>((resolve) => {
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
              // CK-1 批 2：后台任务的输出尾随（live-only 不落盘）——四端任务卡数据源；
              // 仅后台模式发（前台消费者正等最终文本，progress 冗余）
              if (backgrounded && taskIdRef.taskId !== undefined) {
                deps.bus.emitLive(ctx.sessionId, 'task.progress', {
                  taskId: taskIdRef.taskId,
                  text: lastText,
                })
              }
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

      // CK-1 批 2：后台化——注册 kind:'agent' 任务后早退，turn 收尾在闭包内续跑
      //（结清经 manager.complete：task.completed 事件 + 回注通道都在那条路径上）
      if (input.runInBackground === true) {
        // 幂等守卫（顶部已挡，此处承 TS 收窄——跨语句属性收窄不保持）
        const plane = deps.background
        if (plane === undefined) {
          throw new Error('E_TASK_NO_PLANE: 后台任务平面未接线')
        }
        const taskId = plane.register({
          sessionId: ctx.sessionId,
          command: `task(${input.title ?? input.prompt.slice(0, 40)})`,
          kind: 'agent',
          pid: undefined,
          // 部分输出实时可读（assistant.message 流经闭包 lastText；task_output 直接消费）
          read: () => ({ buffer: lastText, truncated: false }),
          stop: () => {
            void deps.sessions.get(child.id)?.runtime.interrupt()
          },
        })
        taskIdRef.taskId = taskId
        void turnSettled.then(() => {
          ctx.signal.removeEventListener('abort', onAbort)
          fireStop()
          // complete 内部已闭合 emit/notify 失败（log）；此处兜未处理拒绝
          plane.complete(taskId, {
            exitCode: done.finish === 'error' ? 1 : 0,
            aborted: done.finish === 'aborted',
            timedOut: false,
            durationMs: Date.now() - startedAtMs,
            outputChars: lastText.length,
          }).catch(() => undefined)
        })
        return {
          output: {
            taskId,
            backgrounded: true,
            note: `后台任务 ${taskId} 已启动：完成后本会话将收到回注通知，进度与输出用 task_output 查询（taskId=${taskId}）`,
          },
          isError: false,
        }
      }

      await turnSettled
      ctx.signal.removeEventListener('abort', onAbort)
      fireStop()
      if (ctx.signal.aborted || done.finish === 'aborted') {
        return { output: { code: 'E_ABORTED' }, isError: true }
      }
      return {
        output: lastText.length > 0 ? lastText : '(子代理无文本输出)',
        isError: done.finish === 'error',
      }
    } catch (err) {
      // 子会话创建成功后异常（send 拒绝等）：interrupt 收尾，不让子 turn 悬挂
      ctx.signal.removeEventListener('abort', onAbort)
      const childHandle = deps.sessions.get(child.id)
      childHandle?.runtime.interrupt()
      fireStop()
      throw err
    }
  }
}
