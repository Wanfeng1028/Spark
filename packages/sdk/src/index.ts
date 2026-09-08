/**
 * @spark/sdk —— 薄客户端（L2 层，工单 14.3；定位见 doc/08 §4.0 五层开发者面）。
 *
 * **就是 HttpTransport 的装配 + 便利分组**：零业务逻辑、零状态机、零策略类
 * （ARCHITECTURE §9 禁过度设计）。连接管理、退避重连、SSE 续播与去重、错误体映射、
 * 鉴权双口径（REST Bearer + SSE `?token=`）全部住在 `@spark/protocol` 的 transport-node
 * （四端共享核，ADR D22）——本包一行都不复制、不包装、不改写其行为。
 *
 * 四端（web / cli / desktop 壳 / mobile+miniapp）与外部脚本共用同一条装配路径，
 * 于是 SDK 永远被真实客户端压着测（doc/08 §4.0 关键设计）。
 *
 * 类型单一来源：所有 wire 与 DTO 类型都来自 `@spark/protocol`（AGENTS §2.5 禁私自定义），
 * 本包不 re-export 它们——需要类型就直接 `import type { ... } from '@spark/protocol'`。
 */
import { HttpTransport } from '@spark/protocol'
import type {
  EventId,
  HttpConnectionStatus,
  PermissionReply,
  RequestId,
  SendMessageOptions,
  SessionDto,
  SessionEventsQuery,
  SessionId,
  SparkEventEnvelope,
  SubmitOutcome,
  TraceDto,
  TreeNodeDto,
} from '@spark/protocol'

/**
 * createClient 的选项 = `HttpTransportOptions` 的**用户视角子集**（同义转发，不新增语义）。
 * 刻意不含 `fetch` 注入：HttpTransport 的两个出网点之一是模块级 `connectSseOnce(ctx)`，
 * 走 session-stream-core 的共享上下文（四端共用），注入 fetch 要改共享核的形状——
 * 收益不抵改动面（doc/08 §14.3 已备案）。需要代理出网走 Node 全局 dispatcher 或 12.9 的思路。
 */
export interface SparkClientOptions {
  /** 配对长效 token（工单 9.1 / D24）：REST 附 Bearer 头、SSE 附 `?token=`；缺省 = 无鉴权（127.0.0.1 缺省行为） */
  token?: string
  /** 是否启动全局 SSE 直播（缺省启动；只用 REST 时传 false——cli 走会话级 SessionEventSource） */
  eventStream?: boolean
  /** 退避序列（测试注入缩短）；末位封顶 */
  backoffMs?: readonly number[]
  /** 连接状态变化回调 */
  onStatus?: (status: HttpConnectionStatus) => void
  /** 重连成功后的重放通知（曾连上过又断开的场景） */
  onResync?: (sessionIds: readonly SessionId[]) => void
}

/**
 * 客户端 = 底层 transport + 三组便利方法。
 * 便利方法**只是 Transport 的薄转发**（同一实例、同一语义、同一错误），需要全量能力
 * （设置/路由/命令/MCP/审计/搜索/配对…）时直接用 `transport`——不在此预先铺全 REST。
 */
export interface SparkClient {
  /** 完整 API 面（`@spark/protocol` 的 Transport 实现）；便利分组是它的子集转发 */
  readonly transport: HttpTransport

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
     * 再定义一套 since 过滤就是双源（doc/08 §14.3 已备案）。按 seq 去重是消费方的事
     * （四端各自有 applyEvent 的 lastSeq 吸附，doc/02 §6.4）。
     */
    replay(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto>
  }

  readonly approvals: {
    /** 审批回复（allow-once/always/reject…）；feedback 为拒绝理由（可选） */
    resolve(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  }

  /** 收口 = `Transport.dispose()`：关流 + 清 handler；之后再调用会抛"已释放"错（失败闭合） */
  close(): void
}

/**
 * 装配一个客户端。
 *
 * ```ts
 * const client = createClient('http://127.0.0.1:4318', { token: process.env.SPARK_TOKEN })
 * client.events.subscribe((e) => console.log(e.type))
 * const s = await client.sessions.create()
 * await client.sessions.send(s.id, '你好')
 * client.close()
 * ```
 *
 * baseUrl 缺省空串 = 浏览器同源（与 HttpTransport 一致）；Node 侧请显式给地址。
 */
export function createClient(baseUrl: string, options: SparkClientOptions = {}): SparkClient {
  const transport = new HttpTransport({
    baseUrl,
    ...(options.token !== undefined ? { authToken: options.token } : {}),
    ...(options.eventStream !== undefined ? { eventStream: options.eventStream } : {}),
    ...(options.backoffMs !== undefined ? { backoffMs: options.backoffMs } : {}),
    ...(options.onStatus !== undefined ? { onStatus: options.onStatus } : {}),
    ...(options.onResync !== undefined ? { onResync: options.onResync } : {}),
  })

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
