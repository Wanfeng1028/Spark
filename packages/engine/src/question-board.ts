/**
 * QuestionBoard（CK-6 批 1）：ask_user 工具的挂起表——与 PermissionService 同纪律
 * （挂起等待 / 超时 fail-closed / abort 级联 / dispose 全拒），但裁决主体是用户的
 * 结构化选择而非权限策略。事件面：question.asked（挂起）/ question.resolved（翻牌）。
 * 答案不落权限审计流（这不是权限裁决）；fail-closed 时 resolved 带 aborted=true
 * + 每问空选占位——事件流永不悬空（引擎铁律）。
 */
import type { RequestId, SessionId, SparkEventMap } from '@spark/protocol'
import type { EventBus } from './bus.js'
import { newIds } from './ulid.js'

/** 单问答案（wire 形状 = question.resolved 事件载荷单问——单一来源，禁手写副本） */
export type QuestionAnswer = SparkEventMap['question.resolved']['answers'][number]

/** ask 输入单问形状（= question.asked 事件载荷单问；zod 校验在工具 inputSchema 层） */
export type QuestionSpec = SparkEventMap['question.asked']['questions'][number]

interface PendingEntry {
  requestId: RequestId
  sessionId: SessionId
  resolve: (answers: QuestionAnswer[] | null) => void
  settled: boolean
  timer: ReturnType<typeof setTimeout>
  onAbort: () => void
}

export interface QuestionBoardDeps {
  bus: EventBus
  /** 等答超时（复用 permissionTimeoutMs 同值与同纪律：无人应答 = fail-closed 拒绝） */
  timeoutMs: number
  now?: () => number
}

export class QuestionBoard {
  private readonly pending = new Map<RequestId, PendingEntry>()

  constructor(private readonly deps: QuestionBoardDeps) {}

  /**
   * 挂起提问：emit question.asked → 等用户作答。返回 null = 超时/中断（工具侧
   * 如实报错，不假装拿到答案）。asked 落盘失败 → 直接 null（fail-closed）。
   */
  async ask(sessionId: SessionId, questions: QuestionSpec[], signal: AbortSignal): Promise<QuestionAnswer[] | null> {
    if (signal.aborted) return null
    const requestId = newIds.request()
    try {
      await this.deps.bus.emit(sessionId, 'question.asked', { requestId, questions })
    } catch {
      return null
    }
    const placeholder = questions.map(() => ({ selected: [] as string[] }))
    return new Promise<QuestionAnswer[] | null>((resolve) => {
      const entry: PendingEntry = {
        requestId,
        sessionId,
        resolve,
        settled: false,
        timer: setTimeout(() => {
          void this.settleAborted(entry, placeholder)
        }, this.deps.timeoutMs),
        onAbort: () => {
          void this.settleAborted(entry, placeholder)
        },
      }
      signal.addEventListener('abort', entry.onAbort, { once: true })
      this.pending.set(requestId, entry)
    })
  }

  /** UI 作答入口（facade replyQuestion）。未知/已结清 → false（server 层 404） */
  async reply(requestId: RequestId, answers: QuestionAnswer[]): Promise<boolean> {
    const entry = this.pending.get(requestId)
    if (entry === undefined) return false
    if (entry.settled) return false
    entry.settled = true
    clearTimeout(entry.timer)
    entry.resolve(answers)
    this.pending.delete(requestId)
    await this.deps.bus.emit(entry.sessionId, 'question.resolved', { requestId, answers })
    return true
  }

  /** 超时/中断结清：resolved 带 aborted=true + 空选占位（事件流闭合不悬空） */
  private async settleAborted(entry: PendingEntry, placeholder: QuestionAnswer[]): Promise<void> {
    if (entry.settled) return
    entry.settled = true
    clearTimeout(entry.timer)
    entry.resolve(null)
    this.pending.delete(entry.requestId)
    try {
      await this.deps.bus.emit(entry.sessionId, 'question.resolved', {
        requestId: entry.requestId,
        answers: placeholder,
        aborted: true,
      })
    } catch {
      // resolved 落盘失败只剩日志（asked 已在流里，回放者能看到悬空问——
      // 与 checkpoint 快照失败同判：如实 log 不吞）
    }
  }

  /** 引擎 shutdown：全部挂起 fail-closed 结清（同 permission.dispose） */
  disposeAll(): void {
    const placeholder: QuestionAnswer[] = [{ selected: [] }]
    for (const entry of [...this.pending.values()]) {
      void this.settleAborted(entry, placeholder)
    }
  }
}
