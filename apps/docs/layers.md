# 五层开发者面（L0–L4）

"我想在 Spark 上做点东西"——先定位你要的是哪一层。层与层的区别不是功能多少，
而是**你进程里跑着什么**、以及**你对什么有稳定承诺**。

| 层         | 你装什么                        | 你进程里跑什么             | 稳定性承诺                                     |
| ---------- | ------------------------------- | -------------------------- | ---------------------------------------------- |
| **L0 嵌入** | `@spark/engine`                 | 引擎本体（回合循环、工具、审批） | 公共入口随 semver；`@spark/engine/internal` **无承诺** |
| **L1 协议** | `@spark/protocol`               | 只有类型与纯函数           | **semver 稳定**，事件词表与 API 形状只增不破     |
| **L2 客户端** | `@spark/sdk`                    | 一个 transport（HTTP 或进程内） | **semver 稳定**，便利分组只增不破               |
| **L3 脚本** | `@spark/cli`（`spark -p`）      | 什么都不装，命令行调用     | 跟随 minor，与三包同版本发布                    |
| **L4 扩展** | 无（写数据文件）                | 无                         | 声明式接口（skills / commands / hooks / MCP）   |

## L0 嵌入：把引擎放进你的进程

```ts
import { Engine } from '@spark/engine'

const engine = new Engine({ root: process.cwd() })
await engine.ready()
// … 用 engine 的门面方法，或经 @spark/sdk/inprocess 拿 Transport 合同
await engine.shutdown()
```

适合：批处理、评测装置、把 agent 能力嵌进已有服务。
边界：**引擎生命周期是你的**（SDK 从不代你启动或关闭引擎）；内部件（会话存储、run-loop、
工具管线、权限实现、投影、压缩、检查点、网关实现…）一律走 `@spark/engine/internal`，
**生产代码不得引用**——它随实现演进，不遵 semver，仓库里有不变量网断言拦着。

## L1 协议：只做投影，不跑引擎

`@spark/protocol` 是**运行时共享核**，不只是类型包：事件词表与 zod schema、DTO、
`applyEvent` reducer、连接与续播内核（`transport-node`）、会话页 controller、
流投影分组、文案表、键位表、命令描述符。

适合：写自己的前端（web / 移动 / 终端 / 桌面），要与官方四端**行为一致**。
关键收益：你不必自己实现"事件 → 界面状态"的映射，也不必自己处理回放与直播的重叠去重
（reducer 按 `seq` 吸附）。140 行的 [sdk-viewer](./getting-started#路径-b-真-server-只读-web-viewer) 就是全部所需。

## L2 客户端：连一个跑着的 Spark

```ts
import { createClient } from '@spark/sdk'
const client = createClient('http://127.0.0.1:4318', { token })
```

适合：脚本、机器人、自动化、第三方 UI。三组便利方法（`sessions` / `events` / `approvals`）
覆盖常用面，全量能力在 `client.transport`（就是 L1 的 `Transport` 接口）。
细节见 [Transport 双通道](./transports)。

## L3 脚本：一行命令跑一个回合

```bash
spark -p "读 README 并总结" --output-format json
```

进程内起引擎、跑完即出、退出码如实（0 = 正常收尾，1 = error/aborted 或异常）。
适合 CI 里用、shell 管道里用。它自己就是 L0 + L2 的消费者（走 `@spark/sdk/inprocess`）。

## L4 扩展：写数据，不写程序

技能（`~/.spark/skills/*/SKILL.md`）、命令（`~/.spark/commands/*.md`）、
钩子（`spark.json` 的 `hooks`）、MCP 服务器（`~/.spark/mcp.json`）——
四者都是**声明式数据**，不是注入代码的插件点（架构决策 ADR D18：插件是数据不是程序）。
适合：给 agent 加领域知识、加提示词、接外部工具，而不需要 fork 引擎。

## 选层的三个判据

1. **要不要引擎在你进程里**：要 → L0（配 L2 的进程内通道）；不要 → L2 的 HTTP 通道。
2. **要不要自己画界面**：要 → L1 的 `applyEvent`（+ L2 拿事件）；不要 → L3。
3. **只是想让它更懂你的领域** → L4，别动代码。
