/**
 * 输入队列（doc/02 §5.4）：主队列 FIFO（阻塞 take 供 run-loop 唯一消费）+
 * steerQueue（下一 step 前注入）。turn 收尾时未消费的 steer 项转入主队列
 * （Codex 对照补漏：插话不凭空丢失）。提交路由与状态迁移在 SessionRuntime。
 */
import type { Delivery, EventId, TurnId } from '@spark/protocol'

export interface InputItem {
  /** 入队即预留的事件 id（'started' 响应与后续 user.message 的关联键） */
  readonly id: EventId
  /** 该项将开启的 turn id（steer 项不使用；'started' 响应回传） */
  readonly turnId: TurnId
  readonly text: string
  readonly attachments?: string[]
  readonly delivery: Delivery
  readonly admittedAt: number
}

export type SubmitResultKind = 'started' | 'steered' | 'queued'

/** §4.5 三态受理结果：HTTP 只表达"已受理"，不等待 turn */
export interface SubmitResult {
  result: SubmitResultKind
  turnId?: TurnId
}

export class InputQueue {
  private readonly items: InputItem[] = []
  private readonly waiters: Array<(item: InputItem) => void> = []

  /** 阻塞取（run-loop 唯一消费者；有积压立即兑现） */
  take(): Promise<InputItem> {
    const head = this.items.shift()
    if (head !== undefined) return Promise.resolve(head)
    return new Promise<InputItem>((resolve) => {
      this.waiters.push(resolve)
    })
  }

  /** 入队并唤醒等待的消费者 */
  push(item: InputItem): void {
    const wake = this.waiters.shift()
    if (wake !== undefined) wake(item)
    else this.items.push(item)
  }

  get length(): number {
    return this.items.length
  }

  isEmpty(): boolean {
    return this.items.length === 0
  }
}
