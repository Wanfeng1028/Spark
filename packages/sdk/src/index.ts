/**
 * @spark/sdk —— 薄客户端（L2 层，工单 14.3/14.4；定位见 doc/08 §4.0 五层开发者面）。
 *
 * **本入口 = HTTP 通道**（`createClient`）：依赖只 `@spark/protocol`，浏览器与 Node 都能用。
 * 进程内通道在子入口 `@spark/sdk/inprocess`（工单 14.4 / ADR D30）——它要 `@spark/engine`，
 * 故拆成独立入口并声明为 **optional peerDependency**：只想要 HTTP 客户端的消费者
 * （含浏览器端的 web）永不静态牵连 engine 及其依赖面（pi-ai/playwright-core/MCP SDK）。
 *
 * 两通道都是"装配 + 便利分组"，**零业务逻辑、零状态机、零策略类**（ARCHITECTURE §9）：
 * 连接管理、退避重连、SSE 续播与去重、错误体映射、鉴权双口径住在 `@spark/protocol`
 * 的 transport-node（ADR D22 四端共享核）；便利分组的形状两通道共用一份（`./client.ts`，
 * ADR D31 结论 3——parity 是结构保证，不是两份代码碰巧一样）。
 *
 * 类型单一来源：所有 wire 与 DTO 类型都来自 `@spark/protocol`（AGENTS §2.5 禁私自定义），
 * 本包不 re-export 它们——需要类型就直接 `import type { ... } from '@spark/protocol'`。
 */
import { HttpTransport } from '@spark/protocol'
import type { HttpConnectionStatus, SessionId } from '@spark/protocol'
import { assembleClient } from './client.js'
import type { SparkClient } from './client.js'

/** 客户端形状（transport + sessions/events/approvals/close）——两通道共用，定义在 `./client.ts` */
export type { SparkClient } from './client.js'

/**
 * createClient 的选项 = `HttpTransportOptions` 的**用户视角子集**（同义转发，不新增语义）。
 * 刻意不含 `fetch` 注入：HttpTransport 的两个出网点之一是模块级 `connectSseOnce(ctx)`，
 * 走 session-stream-core 的共享上下文（四端共用），注入 fetch 要改共享核的形状——
 * 收益不抵改动面（doc/02 §4.6.4 已备案）。需要代理出网走 Node 全局 dispatcher 或 12.9 的思路。
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
 * 装配一个 HTTP 通道客户端。
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
 * 进程内直连引擎（不起 server、不占端口）用 `@spark/sdk/inprocess` 的 `createInProcessClient`。
 */
export function createClient(baseUrl: string, options: SparkClientOptions = {}): SparkClient<HttpTransport> {
  return assembleClient(
    new HttpTransport({
      baseUrl,
      ...(options.token !== undefined ? { authToken: options.token } : {}),
      ...(options.eventStream !== undefined ? { eventStream: options.eventStream } : {}),
      ...(options.backoffMs !== undefined ? { backoffMs: options.backoffMs } : {}),
      ...(options.onStatus !== undefined ? { onStatus: options.onStatus } : {}),
      ...(options.onResync !== undefined ? { onResync: options.onResync } : {}),
    }),
  )
}
