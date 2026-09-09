# 五分钟跑通

前提：**Node ≥ 24**、**pnpm ≥ 9**。下面三条路径按"要装多少东西"从少到多排。

## 路径 A：离线演示（不需要模型密钥，也不需要起 server）

`examples/sdk-bot` 的演示模式会在**你的进程里**起一个引擎，用预录网关（ScriptedLlm）跑一个回合——
不出网、不打真实模型、不占端口。这是最快看见"SDK + 事件流"长什么样的方式。

```bash
git clone https://github.com/Wanfeng1028/Spark.git
cd Spark
pnpm install
SPARK_DEMO=1 pnpm --filter @spark/example-bot start "报一下包名"
```

输出形如：

```
[2026-09-10T…] session=ses_01J… finish=stop
演示模式：这是 ScriptedLlm 的预录回答。
```

它做的事只有四步，全部经 SDK：建会话 → 发任务 → 等 `turn.completed` → 写日志。
源码 129 行（[`examples/sdk-bot/bot.ts`](https://github.com/Wanfeng1028/Spark/blob/main/examples/sdk-bot/bot.ts)），
其中业务核心 `runBot(client, opts)` **与通道无关**——把 HTTP 客户端换成进程内客户端，一行都不用改。

## 路径 B：真 server + 只读 web viewer

需要一个模型供应商的密钥（`~/.spark/models.json` + 环境变量或 `~/.spark/secrets.json`；
配置格式见仓库 `doc/02-development-plan.md` §5.1）。

```bash
# 终端 1：起 server（缺省 127.0.0.1:4318）
pnpm --filter server dev

# 终端 2：起 viewer（Vite dev server，已把 /api 与 SSE 代理到 4318）
pnpm --filter @spark/example-viewer dev
```

打开终端 2 给出的地址（缺省 `http://localhost:5173`）。viewer 会列出会话、回放选中会话的事件、
并直播后续事件。**页内没有任何 Spark 业务逻辑**：只有 `createClient` + `applyEvent` + DOM 渲染，
140 行（[`examples/sdk-viewer/main.ts`](https://github.com/Wanfeng1028/Spark/blob/main/examples/sdk-viewer/main.ts)）。

想要终端形态就看 [`examples/sdk-tui`](https://github.com/Wanfeng1028/Spark/blob/main/examples/sdk-tui)
（Ink 四区骨架，192 行，`pnpm --filter @spark/example-tui start`）。

## 路径 C：在你自己的项目里用（npm 发布后）

::: warning 状态
`@spark/sdk` 尚未发布到 npm——首发版本 v1.0.0 的 tag 与 publish 待仓库维护者执行。
在那之前请用路径 A/B（monorepo 内 `workspace:*` 引用）。
:::

发布后的用法就是三行：

```ts
import { createClient } from '@spark/sdk'

const client = createClient('http://127.0.0.1:4318')
client.events.subscribe((e) => console.log(e.type))
```

进程内嵌入（不起 server）用子入口，`@spark/engine` 是**可选 peer 依赖**：

```ts
import { Engine } from '@spark/engine'
import { createInProcessClient } from '@spark/sdk/inprocess'

const engine = new Engine({ root: process.cwd() })
await engine.ready()
const client = createInProcessClient(engine)
```

嵌入的六件事（生命周期、事件订阅、会话与回合、审批接管、配置与密钥、收口与错误码）
见仓库 `doc/02-development-plan.md` §4.8，可跑对照是
[`packages/sdk/examples/embed.ts`](https://github.com/Wanfeng1028/Spark/blob/main/packages/sdk/examples/embed.ts)。

## 下一步

- 想知道该用哪个包、哪一层 → [五层开发者面](./layers)
- 想知道两条通道的差别 → [Transport 双通道](./transports)
- 想查某个事件的字段 → [事件词表参考](./events)
