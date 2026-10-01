/**
 * 后台任务平面单测（CK-1 批 1）：显式后台化（立即返回 taskId）/ task_output 偏移续读
 * 与首响应头尾预算 / task_stop 树杀与 aborted 结清 / 前台预算自动转后台 / 会话隔离 /
 * 完成回注入队（notify 收集器断言）/ shutdownAll 排水。
 * 命令走真 shell（CI Linux /bin/bash；Windows 本地 skip 不影响 CI 裁决）。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import { makeBashTool } from '../src/tools/builtin/bash.js'
import { makeTaskTools } from '../src/tools/builtin/background-task-tools.js'
import { BackgroundTaskManager } from '../src/background-task.js'
import { EventBus, type EventSink } from '../src/bus.js'
import type { SessionId, TaskId } from '@spark/protocol'
import type { ToolContext } from '../src/tools/definition.js'
import type { SparkLogger } from '../src/logger.js'

const SID = ids.session('ses_bgtasktest00000000000000')
const SID2 = ids.session('ses_bgtasktest20000000000000')

class MemSink implements EventSink {
  readonly events: SparkEventEnvelope[] = []
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    this.events.push(e)
    return Promise.resolve(e)
  }
}

const SILENT_LOGGER = {
  level: 'silent',
  info() {},
  warn() {},
  error() {},
  debug() {},
} as unknown as SparkLogger

interface Fixture {
  manager: BackgroundTaskManager
  bash: ReturnType<typeof makeBashTool>
  taskOutput: ReturnType<typeof makeTaskTools>[0]
  taskStop: ReturnType<typeof makeTaskTools>[1]
  sink: MemSink
  notified: { sessionId: SessionId; text: string }[]
  ctx: (sid?: SessionId) => ToolContext
}

async function makeFixture(budgetMs?: number): Promise<Fixture> {
  const sink = new MemSink()
  const bus = new EventBus({ sink })
  const notified: { sessionId: SessionId; text: string }[] = []
  const manager = new BackgroundTaskManager({
    bus,
    logger: SILENT_LOGGER,
    notify: (sessionId, text) => {
      notified.push({ sessionId, text })
      return true
    },
  })
  const bash = makeBashTool({
    sandbox: 'off',
    background: manager,
    ...(budgetMs !== undefined ? { backgroundBudgetMs: budgetMs } : {}),
  })
  const [taskOutput, taskStop] = makeTaskTools(manager)
  const controller = new AbortController()
  const baseCtx: ToolContext = {
    sessionId: SID,
    turnId: ids.turn('trn_bgtasktest000000000000000'),
    callId: ids.call('cal_bgtasktest000000000000000'),
    signal: controller.signal,
    onProgress: () => {},
    cwd: await mkdtemp(join(tmpdir(), 'spark-bgtask-')),
    outputLimitBytes: 32 * 1024,
  }
  return {
    manager,
    bash,
    taskOutput,
    taskStop,
    sink,
    notified,
    ctx: (sid?: SessionId) => (sid === undefined ? baseCtx : { ...baseCtx, sessionId: sid }),
  }
}

async function waitForDone(manager: BackgroundTaskManager, sid: SessionId, taskId: TaskId): Promise<void> {
  await vi.waitFor(
    () => {
      const t = manager.get(sid, taskId)
      expect(t?.done).toBe(true)
    },
    { timeout: 10_000, interval: 50 },
  )
}

describe('后台任务平面（CK-1 批 1）', () => {
  test('显式 runInBackground：立即返回 taskId，完成后 task.completed 事件 + 回注入队', async () => {
    const f = await makeFixture()
    const out = await f.bash.execute(f.ctx(), { command: 'echo hello-bg', runInBackground: true })
    expect(out.isError).toBe(false)
    const payload = out.output as { taskId: TaskId; backgrounded: boolean }
    expect(payload.backgrounded).toBe(true)
    const taskId = payload.taskId

    await waitForDone(f.manager, SID, taskId)
    const completed = f.sink.events.filter(
      (e): e is SparkEventEnvelope<'task.completed'> => e.type === 'task.completed',
    )
    expect(completed).toHaveLength(1)
    expect(completed[0]?.data).toMatchObject({ taskId, exitCode: 0, aborted: false, notified: true })
    expect(f.notified).toHaveLength(1)
    expect(f.notified[0]?.sessionId).toBe(SID)
    expect(f.notified[0]?.text).toContain(String(taskId))

    // task_output 读到输出（首读省略 offset）
    const read = await f.taskOutput.execute(f.ctx(), { taskId })
    expect(read.isError).toBe(false)
    expect((read.output as { done: boolean; output: string }).done).toBe(true)
    expect((read.output as { output: string }).output).toContain('hello-bg')
  })

  test('task_output：长输出首读给头尾概览（nextOffset 指向尾部起点），续读取尾段', async () => {
    const f = await makeFixture()
    const out = await f.bash.execute(f.ctx(), {
      command: 'for i in $(seq 1 3000); do echo line-$i; done',
      runInBackground: true,
    })
    const taskId = (out.output as { taskId: TaskId }).taskId
    await waitForDone(f.manager, SID, taskId)

    const first = (await f.taskOutput.execute(f.ctx(), { taskId })).output as {
      output: string
      nextOffset: number | null
      totalChars: number
    }
    expect(first.totalChars).toBeGreaterThan(24 * 1024)
    expect(first.nextOffset).not.toBeNull()
    expect(first.output).toContain('line-1\n')
    expect(first.output).toContain('…[略去')

    const next = (await f.taskOutput.execute(f.ctx(), { taskId, offset: first.nextOffset ?? 0 }))
      .output as { output: string; nextOffset: number | null }
    expect(next.output).toContain('line-3000')
    expect(next.nextOffset).toBeNull()
  })

  test.skipIf(process.platform === 'win32')('task_stop：在跑任务树杀 → completed(aborted=true) + 回注；重复停与未知 id 如实报错', { timeout: 20_000 }, async () => {
    const f = await makeFixture()
    const out = await f.bash.execute(f.ctx(), { command: 'sleep 30', runInBackground: true })
    const taskId = (out.output as { taskId: TaskId }).taskId
    // 等注册完成（task.started 事件先于 stop 可用）
    await vi.waitFor(() => expect(f.sink.events.some((e) => e.type === 'task.started')).toBe(true))

    const stop = await f.taskStop.execute(f.ctx(), { taskId })
    expect(stop.isError).toBe(false)
    expect((stop.output as { stopped: boolean }).stopped).toBe(true)

    await waitForDone(f.manager, SID, taskId)
    const completed = f.sink.events.filter(
      (e): e is SparkEventEnvelope<'task.completed'> => e.type === 'task.completed',
    )
    expect(completed[0]?.data.aborted).toBe(true)
    expect(completed[0]?.data.notified).toBe(true)

    const again = await f.taskStop.execute(f.ctx(), { taskId })
    expect(again.isError).toBe(true)
    expect((again.output as { code: string }).code).toBe('E_TASK_ALREADY_DONE')

    const unknown = await f.taskStop.execute(f.ctx(), { taskId: ids.task('tsk_nosuch000000000000000') })
    expect(unknown.isError).toBe(true)
    expect((unknown.output as { code: string }).code).toBe('E_TASK_NOT_FOUND')
  })

  test.skipIf(process.platform === 'win32')('前台阻塞预算：超预算自动转后台（回 taskId 与部分输出），完成后照常回注', { timeout: 20_000 }, async () => {
    const f = await makeFixture(200)
    const result = await f.bash.execute(f.ctx(), { command: 'sleep 2; echo tail-marker' })
    expect(result.isError).toBe(false)
    const payload = result.output as {
      taskId: TaskId
      backgrounded: boolean
      autoBackgrounded: boolean
      output: string
    }
    expect(payload.autoBackgrounded).toBe(true)
    expect(payload.backgrounded).toBe(true)

    await waitForDone(f.manager, SID, payload.taskId)
    expect(f.notified).toHaveLength(1)
    const read = await f.taskOutput.execute(f.ctx(), { taskId: payload.taskId })
    expect((read.output as { output: string }).output).toContain('tail-marker')
  })

  test('会话隔离：他会话 task_output/task_stop 一律 E_TASK_NOT_FOUND', async () => {
    const f = await makeFixture()
    const out = await f.bash.execute(f.ctx(), { command: 'echo iso', runInBackground: true })
    const taskId = (out.output as { taskId: TaskId }).taskId
    await waitForDone(f.manager, SID, taskId)

    const read = await f.taskOutput.execute(f.ctx(SID2), { taskId })
    expect((read.output as { code: string }).code).toBe('E_TASK_NOT_FOUND')
    expect(f.manager.get(SID2, taskId)).toBeUndefined()
  })

  test.skipIf(process.platform === 'win32')('shutdownAll：在跑任务被树杀（aborted 结清，notified 如实）', { timeout: 20_000 }, async () => {
    const f = await makeFixture()
    const out = await f.bash.execute(f.ctx(), { command: 'sleep 30', runInBackground: true })
    const taskId = (out.output as { taskId: TaskId }).taskId
    await vi.waitFor(() => expect(f.sink.events.some((e) => e.type === 'task.started')).toBe(true))

    f.manager.shutdownAll()
    await waitForDone(f.manager, SID, taskId)
    const completed = f.sink.events.filter(
      (e): e is SparkEventEnvelope<'task.completed'> => e.type === 'task.completed',
    )
    expect(completed[0]?.data.aborted).toBe(true)
  })
})
