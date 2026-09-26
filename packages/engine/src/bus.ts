/**
 * 事件总线（doc/02 §5.3）：durable/live 双路广播——server SSE 的数据源。
 * durable：zod 校验 → per-session 互斥队列内赋 seq → sink.append（落盘）→
 *          落盘完成后才广播（订阅者看到 durable 事件时它已持久化——崩溃后 UI 与磁盘一致）。
 * live：zod 校验 → 同步广播（不落盘不计数；delta 先于 message 定稿，RunLoop 内天然满足）。
 * 订阅者隔离：每个 handler 独立 try/catch，异常回调 warn 不影响其他订阅者（dsh）。
 * 背压（AUD-11 分级策略）：handler 返回 false | Promise<false> 暂停该订阅者，事件进
 *       环形缓冲；缓冲满时**优先丢 live-only**（直播语义可丢），durable 先驱逐缓冲内
 *       最老 live 腾位，全是 durable 时通知宿主断开该订阅（onDurableOverflow——客户端
 *       按水位重连补播），**绝不静默丢弃 durable**（旧 shift() 丢最老会撕出无法自动
 *       补齐的水位缺口）；resume() 续传并复位溢出标记。
 */
import { eventSchemaOf, isExtendedLiveOnly, isLiveOnlyType } from '@spark/protocol'
import type { z } from 'zod'
import type {
  DurableEventType,
  LiveOnlyEventType,
  SessionId,
  SparkEventEnvelope,
  SparkEventMap,
  SparkEventType,
  SurfaceEventType,
} from '@spark/protocol'
import { newIds } from './ulid.js'

/** durable 事件落盘端口：SessionStore 实现——填 parentId 并持久化，返回最终信封 */
export interface EventSink {
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope>
}

export type EventHandler = (
  e: SparkEventEnvelope,
) => void | false | Promise<void | false>

export interface SubscribeHandle {
  unsubscribe(): void
  /** 背压恢复：订阅者写出缓冲排空（如 SSE drain）后调用，续传暂停期间缓冲的事件 */
  resume(): void
  /**
   * LA-36：durable 溢出后的恢复确认——宿主完成重放（或回退水位重建）后调用。
   * 溢出置位的 degraded 粘滞标志仅由此清除：drain 排空只是缓冲恢复，不代表
   * 缺口已补齐；未确认前该订阅者按降级态对待（再次溢出仍会重新通知）。
   */
  recovered(): void
}

interface Subscriber {
  handler: EventHandler
  sessionId: SessionId | undefined
  paused: boolean
  buffer: SparkEventEnvelope[]
  /** per-subscriber 派发串行队列：handler 按事件序逐个调用，不并发 */
  queue: Promise<void>
  /** AUD-11：缓冲溢出已通知过宿主（durable 无法保全）——LA-36：仅 recovered() 时复位 */
  overflowed: boolean
  /** LA-36：durable 溢出降级粘滞标志——drain 不复位，宿主 recovered() 显式清除 */
  degraded: boolean
  /** AUD-11：durable 溢出回调（宿主应断开该订阅让客户端按水位重连补播）；缺省仅丢事件 */
  onDurableOverflow?: (e: SparkEventEnvelope) => void
}

export interface EventBusOptions {
  sink: EventSink
  /** 订阅者异常回调（pino 工单接入）；缺省 console.warn——不吞异常 */
  onSubscriberError?: (err: unknown, e: SparkEventEnvelope) => void
  /**
   * LA-34：error 事件文案脱敏（单点）——emit('error') 落盘与广播前对 data.message
   * 过完整模式集（env 活取 + 密钥仓值活取 + sk-/Bearer 静态形状）。宿主注入引擎级
   * 闭包（redactErrorMessage + secrets.values()），compaction/checkpoint/run-loop 等
   * 全部 error 发射点无需各自脱敏。
   */
  redactError?: (message: string) => string
  /** 暂停订阅者环形缓冲容量（默认 256） */
  bufferCapacity?: number
  /** AUD-11：durable 溢出兜底回调（subscribe 未逐订阅者给 onDurableOverflow 时） */
  onDurableOverflow?: (e: SparkEventEnvelope) => void
}

interface SessionState {
  /** 已分配的最大 durable seq（== 会话日志事件行号） */
  seq: number
  /** per-session 串行队列：seq 分配与 store.append 在同一互斥链（§5.3 顺序保证） */
  tail: Promise<unknown>
}

function isSurface(type: SparkEventType): type is SurfaceEventType {
  return type === 'user.message' || type === 'assistant.message'
}

export class EventBus {
  private readonly subscribers = new Set<Subscriber>()
  private readonly sessions = new Map<SessionId, SessionState>()
  private readonly capacity: number

  constructor(private readonly opts: EventBusOptions) {
    this.capacity = opts.bufferCapacity ?? 256
  }

  /** resume 会话时设定 seq 起点（磁盘最后一行 durable seq）；活动会话再 restore = 编程错误 */
  restoreSeq(sid: SessionId, lastSeq: number): void {
    const st = this.sessions.get(sid)
    if (st !== undefined && st.seq > 0) {
      throw new Error(`E_BUS_SESSION_ACTIVE: 会话 ${sid} 已在总线活动，禁止重设 seq 起点`)
    }
    this.sessions.set(sid, { seq: lastSeq, tail: Promise.resolve() })
  }

  /** 会话卸载（回滚覆写后重载前调用，§5.8.7）：清除 seq 水位，restoreSeq 才能重设截断后的起点 */
  forgetSession(sid: SessionId): void {
    this.sessions.delete(sid)
  }

  /** durable 发射：落盘并广播；返回最终信封（run-loop 需 userEventId 引用，§5.5） */
  async emit<T extends DurableEventType>(
    sid: SessionId,
    type: T,
    data: SparkEventMap[T],
  ): Promise<SparkEventEnvelope<T>> {
    // LA-34：error 文案单点脱敏——落盘前过宿主注入的完整模式集
    const finalData = (
      type === 'error' && this.opts.redactError !== undefined
        ? { ...data, message: this.opts.redactError((data as SparkEventMap['error']).message) }
        : data
    ) as SparkEventMap[T]
    const parsed = this.validate(type, finalData)
    const st = this.stateOf(sid)
    const task = st.tail.then(() =>
      this.emitDurable(sid, type, parsed as SparkEventMap[T]),
    )
    // 队列不断：单个 emit 失败不阻塞同会话后续 emit（失败由调用方处理——失败闭合）
    st.tail = task.catch(() => undefined)
    return task
  }

  emitLive<T extends LiveOnlyEventType>(
    sid: SessionId,
    type: T,
    data: SparkEventMap[T],
  ): void {
    const parsed = this.validate(type, data)
    const envelope = {
      id: newIds.event(),
      sessionId: sid,
      version: 1,
      time: Date.now(),
      type,
      data: parsed,
    } as SparkEventEnvelope<T>
    this.broadcast(envelope)
  }

  subscribe(
    handler: EventHandler,
    filter?: { sessionId?: SessionId; onDurableOverflow?: (e: SparkEventEnvelope) => void },
  ): SubscribeHandle {
    const sub: Subscriber = {
      handler,
      sessionId: filter?.sessionId,
      paused: false,
      buffer: [],
      queue: Promise.resolve(),
      overflowed: false,
      degraded: false,
      ...(filter?.onDurableOverflow !== undefined
        ? { onDurableOverflow: filter.onDurableOverflow }
        : {}),
    }
    this.subscribers.add(sub)
    return {
      unsubscribe: () => {
        this.subscribers.delete(sub)
      },
      resume: () => {
        this.resumeSubscriber(sub)
      },
      recovered: () => {
        sub.degraded = false
        sub.overflowed = false // recovered 后重新武装一次性溢出通知
      },
    }
  }

  private stateOf(sid: SessionId): SessionState {
    let st = this.sessions.get(sid)
    if (st === undefined) {
      st = { seq: 0, tail: Promise.resolve() }
      this.sessions.set(sid, st)
    }
    return st
  }

  /** zod 校验：失败 = 编程错误，直接 throw（fail-fast 在写入点——dsh append site 思想） */
  private validate<T extends SparkEventType>(type: T, data: SparkEventMap[T]): unknown {
    const schema: z.ZodType | undefined = eventSchemaOf(type)
    if (schema === undefined) {
      throw new Error(`E_BUS_UNKNOWN_TYPE: 未知事件类型 ${type}`)
    }
    const result = schema.safeParse(data)
    if (!result.success) {
      throw new Error(
        `E_BUS_INVALID_DATA: ${type} 事件 data 校验失败：${result.error.message}`,
      )
    }
    return result.data
  }

  /**
   * 扩展事件发射（§4.3 merge-extensible，工单 5.5 / ADR D18）：插件注册的类型，
   * liveOnly 声明走 live 直播（不落盘不计数），否则走同一 durable 管线；
   * 信封一律带 ignorable:true——插件卸载后旧会话仍可加载/旧帧仍可被未装
   * 插件的前端跳过（store 读端与 web transport 对未知 type + ignorable 跳过）。
   */
  async emitExtended(sid: SessionId, type: string, data: unknown): Promise<SparkEventEnvelope> {
    const schema = eventSchemaOf(type)
    if (schema === undefined) {
      throw new Error(`E_BUS_UNKNOWN_TYPE: 未知事件类型 ${type}`)
    }
    // LA-34：扩展事件同样过 error 脱敏单点（engine.error 等动态注册类型）
    const finalData =
      type === 'error' && this.opts.redactError !== undefined &&
      typeof data === 'object' && data !== null && 'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? { ...(data as Record<string, unknown>), message: this.opts.redactError((data as { message: string }).message) }
        : data
    const parsed = schema.safeParse(finalData)
    if (!parsed.success) {
      throw new Error(`E_BUS_INVALID_DATA: ${type} 事件 data 校验失败：${parsed.error.message}`)
    }
    if (isExtendedLiveOnly(type)) {
      const envelope = {
        id: newIds.event(),
        sessionId: sid,
        version: 1,
        ignorable: true,
        time: Date.now(),
        type,
        data: parsed.data,
      } as SparkEventEnvelope
      this.broadcast(envelope)
      return envelope
    }
    const st = this.stateOf(sid)
    const task = st.tail.then(async () => {
      const seq = st.seq + 1
      const draft = {
        id: newIds.event(),
        sessionId: sid,
        seq,
        version: 1,
        ignorable: true,
        time: Date.now(),
        type,
        data: parsed.data,
      } as SparkEventEnvelope
      const final = await this.opts.sink.append(draft)
      st.seq = seq
      this.broadcast(final)
      return final
    })
    st.tail = task.catch(() => undefined)
    return task
  }

  private async emitDurable<T extends DurableEventType>(
    sid: SessionId,
    type: T,
    data: SparkEventMap[T],
  ): Promise<SparkEventEnvelope<T>> {
    const st = this.sessions.get(sid)
    if (st === undefined) {
      throw new Error(`E_BUS_NO_STATE: 会话 ${sid} 状态缺失`) // 不可达：stateOf 已保证
    }
    const seq = st.seq + 1
    const draft = {
      id: newIds.event(),
      sessionId: sid,
      seq,
      version: 1,
      time: Date.now(),
      type,
      data,
      ...(isSurface(type) ? { surface: true as const } : {}),
    } as SparkEventEnvelope<T>
    // 落盘后才广播；append 失败 → emit reject、seq 不前进（事件未落盘未广播）
    const final = await this.opts.sink.append(draft)
    st.seq = seq
    this.broadcast(final)
    return final as SparkEventEnvelope<T>
  }

  private broadcast(e: SparkEventEnvelope): void {
    for (const sub of this.subscribers) {
      if (sub.sessionId !== undefined && sub.sessionId !== e.sessionId) continue
      this.deliver(sub, e)
    }
  }

  private deliver(sub: Subscriber, e: SparkEventEnvelope): void {
    if (sub.paused) {
      this.pushRing(sub, e)
      return
    }
    sub.queue = sub.queue.then(() => this.dispatch(sub, e))
  }

  private async dispatch(sub: Subscriber, e: SparkEventEnvelope): Promise<void> {
    if (sub.paused) {
      this.pushRing(sub, e) // 排队期间被暂停（前一个事件触发了背压）
      return
    }
    try {
      const r = sub.handler(e)
      if (r === false) {
        sub.paused = true // 同步背压：当前调用栈内立即生效
        return
      }
      const awaited = await r
      if (awaited === false) sub.paused = true
    } catch (err) {
      // 订阅者隔离：异常不影响其他订阅者与其他事件
      if (this.opts.onSubscriberError !== undefined) {
        this.opts.onSubscriberError(err, e)
      } else {
        console.warn('E_BUS_SUBSCRIBER_ERROR:', err)
      }
    }
  }

  private resumeSubscriber(sub: Subscriber): void {
    if (!sub.paused) return
    sub.paused = false
    // LA-36：drain 不再复位溢出标记——缺口是否补齐由宿主经 recovered() 确认
    const backlog = sub.buffer.splice(0)
    for (const e of backlog) {
      this.deliver(sub, e) // flush 中再背压则继续缓冲（递归安全：buffer 已 splice）
    }
  }

  /**
   * 暂停订阅者的入缓冲策略（AUD-11 分级）：
   * ① 缓冲未满 → 直接入队；
   * ② 满 + live-only → 丢弃（直播语义，可丢）；
   * ③ 满 + durable → 先驱逐缓冲内**最老的 live**腾位（丢直播保事实）；
   * ④ 满 + durable + 缓冲内已无 live → 通知宿主断开（onDurableOverflow，一次），
   *    事件丢弃——绝不静默丢弃 durable 也不覆写既有缓冲（旧 shift() 丢最老会撕出
   *    客户端水位无法自动补齐的缺口）。
   */
  private pushRing(sub: Subscriber, e: SparkEventEnvelope): void {
    if (sub.buffer.length < this.capacity) {
      sub.buffer.push(e)
      return
    }
    const live = isLiveOnlyType(e.type)
    if (live) return
    const evictIdx = sub.buffer.findIndex((b) => isLiveOnlyType(b.type))
    if (evictIdx >= 0) {
      sub.buffer.splice(evictIdx, 1)
      sub.buffer.push(e)
      return
    }
    // LA-36：降级粘滞——丢弃 durable 的同时置 degraded，宿主须显式 recovered()
    // 确认重放完成后才解除；drain 排空不再伪装"恢复正常"。
    sub.degraded = true
    if (!sub.overflowed) {
      sub.overflowed = true
      sub.onDurableOverflow?.(e)
      this.opts.onDurableOverflow?.(e)
    }
  }
}
