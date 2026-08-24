/**
 * SessionRuntime（doc/02 §5.4 / §5.0）：每会话运行时状态机——
 * idle/running 迁移、三通道提交路由、interrupt 级联入口、唤醒合并（pendingWake）。
 * RunLoop 经 takeInput/beginTurn/endTurn 驱动；本类不触碰 bus/store（纯状态机）。
 *
 * 路由表（§5.4）：
 *   now   : idle → 主队列启动 'started'；running 且可 steer → steerQueue 'steered'；
 *           否则 → queue 'queued'
 *   steer : running → steerQueue 'steered'；idle → 主队列启动 'started'（升级，宽容路由）
 *   queue : 主队列 'queued'（当前 turn 完成后依序作为后续 turn 输入）
 * 可 steer = 有活动 turn 且未在收尾（interrupt 后收尾中，now 降级 queued）。
 * 三态之外不设拒绝态（刻意宽容，对照 Codex NotSubmittedReason 八种——v2 再引入）。
 */
import type { Delivery, SessionId } from '@spark/protocol'
import { newIds } from '../ulid.js'
import { InputQueue } from './input-queue.js'
import type { InputItem, SubmitResult } from './input-queue.js'

export type RuntimeStatus = 'idle' | 'running'

export class SessionRuntime {
  readonly queue = new InputQueue()
  readonly steerQueue: InputItem[] = []

  private status: RuntimeStatus = 'idle'
  /** 收尾中（interrupt 已请求）：now 提交降级 queued */
  private finalizing = false
  /** 当前 turn 的 abort 入口（null = 无活动 turn：idle 或 turn 间隙） */
  private turnAbort: AbortController | null = null

  constructor(readonly sessionId: SessionId) {}

  get state(): RuntimeStatus {
    return this.status
  }

  /** 三通道提交路由（同步受理；HTTP 层 zod 已拒空文本，此处兜底 fail-fast） */
  submit(text: string, delivery: Delivery = 'now', attachments?: string[]): SubmitResult {
    if (text.length === 0) {
      throw new Error('E_INPUT_EMPTY: 输入为空（与 user.message zod min(1) 同源）')
    }
    const item: InputItem = {
      id: newIds.event(),
      turnId: newIds.turn(),
      text,
      ...(attachments !== undefined ? { attachments } : {}),
      delivery,
      admittedAt: Date.now(),
    }

    if (delivery === 'queue') {
      this.queue.push(item)
      return { result: 'queued' }
    }
    if (this.status === 'idle') {
      // now/steer 在 idle：入主队列启动（steer 升级为 started）
      this.status = 'running'
      this.queue.push(item)
      return { result: 'started', turnId: item.turnId }
    }
    if (delivery === 'steer' || (this.turnAbort !== null && !this.finalizing)) {
      this.steerQueue.push(item)
      return { result: 'steered' }
    }
    // running 但无活动 turn（turn 间隙）或收尾中：降级排队
    this.queue.push(item)
    return { result: 'queued' }
  }

  /** interrupt：级联 abort 当前 turn（LLM 流/工具 signal 由 RunLoop 接线）；无 turn 时幂等 no-op */
  interrupt(): void {
    if (this.turnAbort === null) return
    this.finalizing = true
    this.turnAbort.abort()
  }

  /** RunLoop：阻塞取下一输入（turn 的开启项） */
  takeInput(): Promise<InputItem> {
    return this.queue.take()
  }

  /** RunLoop：turn 开始——登记 abort 入口；已有活动 turn = 编程错误（fail-fast） */
  beginTurn(): AbortController {
    if (this.turnAbort !== null) {
      throw new Error('E_RUNTIME_TURN_ACTIVE: 上一 turn 未结束（beginTurn 重入）')
    }
    const controller = new AbortController()
    this.turnAbort = controller
    this.finalizing = false
    this.status = 'running'
    return controller
  }

  /**
   * RunLoop：turn 结束。steer 残留转入主队列（§5.4 补漏：插话不丢失）；
   * 有积压保持 running（唤醒合并，不空转一轮）——返回是否续跑；无积压回 idle。
   */
  endTurn(): boolean {
    for (const item of this.steerQueue.splice(0)) {
      this.queue.push(item)
    }
    this.turnAbort = null
    this.finalizing = false
    if (this.queue.isEmpty()) {
      this.status = 'idle'
      return false
    }
    return true
  }

  /** RunLoop step ①：注入本 step 前到达的 steer 项（admission 序） */
  drainSteer(): InputItem[] {
    return this.steerQueue.splice(0)
  }

  /** steer/queue 积压（唤醒合并判据） */
  hasBacklog(): boolean {
    return !this.queue.isEmpty() || this.steerQueue.length > 0
  }
}
