# Transport 双通道

L2 只有**一个 client 实现、两个 transport**：

|                | HTTP 通道                                     | 进程内通道                                     |
| -------------- | --------------------------------------------- | ---------------------------------------------- |
| 入口           | `@spark/sdk` → `createClient(baseUrl, opts?)`  | `@spark/sdk/inprocess` → `createInProcessClient(engine)` |
| 依赖           | 只 `@spark/protocol`（浏览器可用）             | 另需 `@spark/engine`（**可选 peer 依赖**）      |
| 事件流         | SSE（`since=seq` 续播 + 去重）                 | `engine.subscribe` 直通（不经序列化）           |
| 需要 server    | 是                                             | 否（引擎在你进程里）                            |
| 端口 / 序列化  | 占端口、JSON 往返                              | 零端口、零序列化                                |
| 服务端专有能力 | 全都有                                         | 7 项如实报 `E_UNSUPPORTED`（见下）              |

两条通道实现**同一个 `Transport` 接口**（在 `@spark/protocol`），便利分组
（`sessions` / `events` / `approvals`）只在 SDK 里定义一份、两通道共用——
所以"换通道不改业务代码"是结构保证，不是约定。

## 为什么要有两条通道

- **HTTP**：多端、远程、需要目录列举/附件/配对面时的唯一选择；也是官方四端（web / cli / desktop 壳 / 移动端）在用的那条。
- **进程内**：嵌入场景（批处理、评测、把 agent 放进已有服务）不必为了用引擎而起一个 HTTP 服务；
  `spark -p` 自己就走这条通道。

## 进程内通道不支持的 7 项

它们的实现住在 server 而不在引擎里，进程内通道**不本地重写、不返回空值、不静默成功**，
一律抛 `E_UNSUPPORTED: <方法> 需要 HTTP 通道（<原因>）`：

| 方法                                            | 为什么不支持                                             |
| ----------------------------------------------- | -------------------------------------------------------- |
| `listFs` / `listFsTree`                         | 目录列举与 cwd 硬边界规则由 server 实现（重写就是规则双源） |
| `uploadAttachment`                              | 附件落盘 `~/.spark/attachments` 由 server 实现             |
| `getPairStatus` / `createPairCode` / `redeemPair` / `revokePairDevice` | 配对是 server 的监听面；嵌入场景宿主就是本机，没有配对语义 |

## 错误码跨通道同形

引擎的错误消息本就带原码（`E_NOT_FOUND: 会话 x 不存在`），HTTP 通道把它映射成
`{ code, message }` 再还原成同样形状的 `Error`——所以 **catch 可以写一份**：

```ts
try {
  await client.sessions.get(sid)
} catch (err) {
  if (String(err).startsWith('E_NOT_FOUND')) { /* … */ }
}
```

审批回复的三态（`ok` / 已答复过 / 不存在）两通道映射到同一对码：
`E_ALREADY_RESOLVED` 与 `E_NOT_FOUND`。进程内通道另有两个自己的码：
`E_UNSUPPORTED`（上表）与 `E_DISPOSED`（客户端收口后受理即拒，失败闭合）。

## parity 是怎么被机器守住的

`apps/server/tests/transport-contract.ts` 是一份**参数化契约套件**（会话生命周期、
未知会话错误码、直播与回放一致且 `seq` 升序、退订后不再投递），
HTTP 与进程内两条通道**各实例化一遍**——两份测试文件唯一的不同就是 `makeChannel`。

这套网第一次跑就抓到一个真实缺陷：`HttpTransport` 曾对 2xx 无条件 `res.json()`，
而删除会话的路由返回 204 空 body，于是 web 侧栏的"删除会话"长期报错——
mock 走查与 server 路由测试各自都绿，**合起来才是坏的**。
凡"同一合同的两份实现"，必须有机器对照。

## 已知的两处差异（如实登记）

- `listSessions`：HTTP 通道受路由分页缺省（`limit=50`）约束；进程内通道没有传输上限，返回全量。
- `sendMessage` 的附件：两条通道都不透传（引擎的 send 不收附件）。
