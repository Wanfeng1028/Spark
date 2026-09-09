# Spark 开发者文档

Spark 是一个 **Agent 工作台**：Node/TS 引擎（headless）+ React Web 前端 + Electron 桌面壳 + CLI TUI + 移动端三端。
对开发者而言，它是三样东西的组合：

- **一个可嵌入的引擎**（`@spark/engine`）：`new Engine({ root })` 就能在自己进程里跑完整的 agent 回合——工具调用、审批、压缩、检查点、MCP、子代理、技能。
- **一份事件流协议**（`@spark/protocol`）：21 种事件的词表 + DTO + `applyEvent` reducer。四个官方端与你的自定义端**共用同一份投影逻辑**。
- **一个薄客户端 SDK**（`@spark/sdk`）：`createClient(baseUrl)` 连远程 server，`createInProcessClient(engine)` 直连本地引擎——**同一份 Transport 合同，两个通道**。

## 这份文档的五页

| 页                                       | 讲什么                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| [五分钟跑通](./getting-started)          | 从零到看见事件流：离线演示模式、仓库内 viewer、以及发布后的 npm 路径 |
| [五层开发者面（L0–L4）](./layers)        | 你想做的事属于哪一层，该装哪个包、不该碰哪些内部件                   |
| [Transport 双通道](./transports)         | HTTP 与进程内两条通道的同与不同、不支持项如何如实报错              |
| [事件词表参考](./events)                 | 21 种事件的字段表（**由 zod schema 自动生成**，与代码不会漂移）    |
| [常见问题](./faq)                        | 审批语义、安全模型、稳定性承诺                                     |

## 一分钟看懂数据流

```
你的输入 → Engine（回合循环 / 工具 / 审批）
        → 事件（durable 落 JSONL，live 只推流）
        → SSE 或进程内直通
        → applyEvent（四端同款 reducer）
        → 你的 UI
```

**界面状态永远只是事件流的投影**：冷启动、断线重连、回滚、分叉，动作都是"清水位 + 全量重放"，
不做局部乐观修补。想验证这一点，读 [sdk-viewer 示例](https://github.com/Wanfeng1028/Spark/tree/main/examples/sdk-viewer)——
一个 140 行的只读 web 前端，页内没有任何 Spark 业务逻辑。

## 仓库里的其它文档

| 文档                                                                       | 内容                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`ARCHITECTURE.md`](https://github.com/Wanfeng1028/Spark/blob/main/ARCHITECTURE.md) | 架构与 ADR 决策表（每条决策的候选与被否理由）             |
| [`DESIGN.md`](https://github.com/Wanfeng1028/Spark/blob/main/DESIGN.md)     | 视觉与交互规则，含"反 AI 生成味"黑名单（文档站也遵守）    |
| [`doc/02-development-plan.md`](https://github.com/Wanfeng1028/Spark/blob/main/doc/02-development-plan.md) | 实现规格：事件处理表、路由表、错误码表、双通道映射表、嵌入指南 |
| [`examples/README.md`](https://github.com/Wanfeng1028/Spark/blob/main/examples/README.md) | SDK 画廊三例（bot / viewer / tui）与走查记录              |
