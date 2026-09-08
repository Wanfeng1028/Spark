/**
 * 客户端装配（两通道共用的单一来源，工单 14.4 / ADR D31 结论 3）。
 *
 * `SparkClient` 的形状与三组便利方法的转发**只在这里定义一次**：HTTP 通道
 * （`./index.ts` 的 `createClient`）与进程内通道（`./inprocess.ts` 的
 * `createInProcessClient`）都把各自的 transport 交给 `assembleClient`。
 * 于是"便利分组在两通道上语义一致"是**结构保证**，不是两份代码碰巧一样。
 *
 * 泛型参数 = transport 的具体类型（缺省 `HttpTransport`，保持 14.3 的调用面不变）：
 * 通道各自的 transport 类都有自己的能力面，用接口类型会把它们抹平。
 */
import type { HttpTransport } from '@spark/protocol'
import type {
  EventId,
  PermissionReply,
  RequestId,
  SendMessageOptions,
  SessionDto,
  SessionEventsQuery,
  SessionId,
  SparkEventEnvelope,
  SubmitOutcome,
  TraceDto,
  Transport,
  TreeNodeDto,
} from '@spark/protocol'

/**
 * 客户端 = 底层 transport + 三组便利方法。
 * 便利方法**只是 Transport 的薄转发**（同一实例、同一语义、同一错误），需要全量能力
 * （设置/路由/命令/MCP/审计/搜索…）时直接用 `transport`——不在此预先铺全 REST。
 */
export interface SparkClient<T extends Transport = HttpTransport> {
  /** 完整 API 面（`@spark/protocol` 的 Transport 实现）；便利分组是它的子集转发 */
  readonly transport: T

  readonly sessions: {
    /** 会话列表（archived=true 只列已归档；缺省排除归档） */
    list(archived?: boolean): Promise<SessionDto[]>
    /** 新建会话（model 为 "provider/model"；缺省 = 引擎 defaultModel） */
    create(opts?: { title?: string; model?: string }): Promise<SessionDto>
    /** meta + durable 事件（seq 升序）——冷启动回放数据源；query 为协议既有分页语义 */
    get(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto>
    /** 发消息（delivery=now 立即 / queue 排队；返回 started|steered|queued） */
    send(sessionId: SessionId, text: string, opts?: SendMessageOptions): Promise<SubmitOutcome>
    interrupt(sessionId: SessionId): Promise<void>
    /** 手动压缩（turn 进行中拒绝） */
    compact(sessionId: SessionId): Promise<void>
    /** 从指定事件分叉新会话（三拒绝码经错误消息透出） */
    fork(sessionId: SessionId, fromEventId: EventId): Promise<SessionDto>
    /** 归档/恢复（archived=false 为恢复） */
    archive(sessionId: SessionId, archived: boolean): Promise<SessionDto>
    /** 两段式删除：JSONL 移入 ~/.spark/trash/；运行中会话 409 */
    remove(sessionId: SessionId): Promise<void>
    /** 回合级链路聚合（工单 13.7） */
    trace(sessionId: SessionId): Promise<TraceDto>
    /** 事件树（分叉视图数据源，doc/02 §5.8.6） */
    tree(sessionId: SessionId): Promise<TreeNodeDto[]>
  }

  readonly events: {
    /** 订阅全局事件流；返回退订函数 */
    subscribe(onEvent: (e: SparkEventEnvelope) => void): () => void
    /**
     * 回放某会话的 durable 事件（冷启动/断线重连后用）。
     * **直接透传 `Transport.getSession` 的分页语义**（`limit` 升序尾部切片 / `before=seq` 游标）——
     * 工单文本写的 `replaySince(seq)` 没有另造：协议面已有 `SessionEventsQuery`，
     * 再定义一套 since 过滤就是双源（doc/02 §4.6.4 已备案）。按 seq 去重是消费方的事
     * （四端各自有 applyEvent 的 lastSeq 吸附，doc/02 §6.4）。
     */
    replay(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto>
  }

  readonly approvals: {
    /** 审批回复（once/always/reject）；feedback 为拒绝理由（可选） */
    resolve(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  }

  /**
   * 收口 = `Transport.dispose()`。
   * 两通道语义不同且各自如实：HTTP 关 SSE 流 + 清 handler；InProcess 只退订 + 清 handler，
   * **不关引擎**（引擎生命周期属宿主，见 inprocess.ts 头注）。
   */
  close(): void
}

/** 把任意 Transport 实现包成客户端（三组便利方法 = 薄转发，零业务逻辑） */
export function assembleClient<T extends Transport>(transport: T): SparkClient<T> {
  return {
    transport,
    sessions: {
      list: (archived) => transport.listSessions(archived),
      create: (opts) => transport.createSession(opts),
      get: (sessionId, query) => transport.getSession(sessionId, query),
      send: (sessionId, text, opts) => transport.sendMessage(sessionId, text, opts),
      interrupt: (sessionId) => transport.interrupt(sessionId),
      compact: (sessionId) => transport.compact(sessionId),
      fork: (sessionId, fromEventId) => transport.fork(sessionId, fromEventId),
      archive: (sessionId, archived) => transport.archiveSession(sessionId, archived),
      remove: (sessionId) => transport.deleteSession(sessionId),
      trace: (sessionId) => transport.getSessionTrace(sessionId),
      tree: (sessionId) => transport.getTree(sessionId),
    },
    events: {
      subscribe: (onEvent) => transport.onEvent(onEvent),
      replay: (sessionId, query) => transport.getSession(sessionId, query),
    },
    approvals: {
      resolve: (requestId, reply, feedback) => transport.replyPermission(requestId, reply, feedback),
    },
    close: () => transport.dispose(),
  }
}
