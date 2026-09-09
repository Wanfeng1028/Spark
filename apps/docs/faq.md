# 常见问题

## 审批语义

**引擎从不自己决定危险操作。** 工具调用命中权限规则的 `ask` 档时，引擎 emit
`permission.asked` 并**挂起**该回合，等宿主应答：

```ts
client.events.subscribe((e) => {
  if (e.type !== 'permission.asked') return
  const requestId = ids.request((e.data as { requestId: string }).requestId)
  void client.approvals.resolve(requestId, 'once')   // 'once' | 'always' | 'reject'
})
```

- `once` = 只放行这一次；`always` = 放行并固化成规则（写 `~/.spark/permissions.json`）；
  `reject` = 拒绝，可带 `feedback` 作为拒绝理由进模型上下文。
- **fail-closed**：不应答到 `permissionTimeoutMs`（缺省 5 分钟）一律判 deny；
  异常、进程收尾（`engine.shutdown()`）时挂起的审批也全部判 deny。**绝不默认放行。**
- 非交互宿主（CI 脚本、MCP server 模式、批处理）**不要指望交互审批**：
  预置权限规则或会话档位（`client.transport.setPermissionPreset(sid, preset)`），
  否则每个危险操作都会等满超时。
- 越界优先于审批：路径硬边界（cwd 之外拒读）与 I/O 护栏先于权限判定生效。

## 安全模型

- **默认只听本机**：server 缺省绑 `127.0.0.1`，没有多用户、没有登录、不暴露公网——这是刻意的设计，不是缺功能。
- **远程/移动端接入走配对**：`~/.spark/devices.json` + 6 位短码兑换长效 token（REST 带 `Bearer`，SSE 带 `?token=`）；
  非环回地址且未启用鉴权时，server 启动即拒（fail-closed）。
- **密钥只进不出**：`models.json` 的 apiKey 只从环境变量读；`GET /api/secrets` 只回来源（store/env/none），
  **永不回值**；日志与审计流固定脱敏。
- **文件访问有硬边界**：一切工具与路由的文件访问都经 `resolveInRoot` 收敛到会话 cwd，
  越界直接拒绝（优先于审批兜底）。
- **bash 默认全审批**：shell 工具没有"免审"缺省档。
- **单写者纪律**：会话 JSONL 只经 SessionStore 追加写，回滚/fork 走"停 run-loop → flush+close → 覆写 → 重载"。

## 稳定性承诺

四个发布包同版本起步（首发 v1.0.0），承诺分级如下：

| 包                | 承诺                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `@spark/protocol` | **semver 稳定**：事件词表与 API 形状只增不破；演进走 `ignorable` 机制      |
| `@spark/engine`   | **分级**：公共入口随 semver；`@spark/engine/internal` **无任何承诺**       |
| `@spark/sdk`      | **semver 稳定**：两个工厂函数签名与 `SparkClient` 形状；便利分组只增不破    |
| `@spark/cli`      | 跟随 minor，不做独立版本矩阵                                              |

未版本化的东西（内部件、`~/.spark` 下的文件布局细节、事件字段的内部命名）**不要依赖**。
判断某个符号属不属于公共面，看仓库 `doc/02-development-plan.md` §4.6 的裁决表——
它有不变量网（`public-surface.test.ts`）守着，多一个少一个都会红。

## 其它常问

**事件为什么分 durable 与 live？**
`assistant.delta` / `reasoning.delta` / `tool.progress` 三类是**打字机效果的中间态**，
落盘会让会话文件膨胀且没有回放价值；其余 18 种一律 durable（落 JSONL、可回放、可审计）。
所以重连后你**不会**看到过去的 delta——界面靠定稿事件（`assistant.message` 等）重建，效果一致。

**为什么我的 UI 不该自己攒事件？**
因为回放与直播会重叠（重连、冷启动、回滚、分叉）。`applyEvent` 按 `seq` 吸附去重、
处理 21 种事件的投影规则、维护回合与工具状态——四端同款。自己攒就是第二套实现，会漂移。

**能不能不用 server？**
能：进程内通道（`@spark/sdk/inprocess`）直连引擎，零端口。代价是拿不到 7 项服务端专有能力
（目录列举、附件、配对），它们会如实抛 `E_UNSUPPORTED`。见 [Transport 双通道](./transports)。

**成本会失控吗？**
`models.json` 的 `costLimitUsd` 是硬熔断：累计成本越界后新回合直接拒绝，
`client.transport.resetUsage()` 解除。用量按"本地日 × 供应商 × 模型"分桶记在 `~/.spark/usage.json`。

**模型出网走代理怎么办？**
按供应商配 `ProxyAgent`（`undici`），见仓库 ADR D28（LLM 出网代理）。SDK 的 HTTP 通道
刻意不提供 `fetch` 注入——那是四端共享内核的形状，改它代价大于收益。
