# Spark — Agent 产品完整开发方案

> 版本：v1.0（2026-08-22）
> 依据：`01-research-report.md` 的六大项目源码级调研结论
> 原则：**能复用开源就不自己写；协议先行、前端先行；抄设计而不抄框架**

---

## 1. 产品定位与总体架构

**本地优先的 Agent 工作台**：引擎跑在本地，Web 前端（后期 Electron 桌面壳），流式对话 + 工具调用可视化 + 人工审批。

### 总体架构（六家验证过的共同范式）

```
┌─────────────────────────── 本机 ───────────────────────────┐
│                                                            │
│  apps/web (React SPA)          apps/desktop (Electron,后期) │
│        │ transport (HTTP+SSE)        │                     │
│        ▼                              ▼                     │
│  ┌────────────────── packages/protocol（合同）──────────┐   │
│  └──────────────────────────────────────────────────────┘   │
│        │                                                    │
│  apps/server (Fastify: REST + SSE 单端点)                    │
│        │                                                    │
│  packages/engine（Agent 引擎）                                │
│   ├─ run loop（抄 pi 骨架）                                   │
│   ├─ 工具注册表 / 审批 / 会话持久化（自写，产品差异点）           │
│   └─ LLM 抽象：@earendil-works/pi-ai（30+ provider）          │
│                                                             │
│  会话存储：append-only JSONL 树（~/.spark/sessions/）          │
└─────────────────────────────────────────────────────────────┘
```

核心思想：**引擎 headless、UI 只是事件流的投影**（Codex/opencode 同款）。所有客户端（web/desktop/mock）消费同一份协议。

## 2. 技术栈定稿

### 前端（apps/web）

| 层 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite 7 + React 19 + TypeScript(strict) | |
| 样式 | Tailwind CSS v4 + shadcn/ui | copy-in 模式，代码归我们；默认黑白中性极简风 |
| AI 组件 | **Vercel AI Elements**（48 组件） | confirmation/terminal/file-tree/plan/task/checkpoint/tool 等 |
| 对话状态 | assistant-ui（可选）或自管 | headless primitives 可只用状态层 |
| 流式 Markdown | streamdown | 未闭合语法自动补全 |
| 长列表 | react-virtuoso | |
| 状态 | zustand（事件流 store）+ TanStack Query（服务端状态） | |
| 动效（可选） | react-bits | |

组件库备查：https://ui.shadcn.com · https://elements.ai-sdk.dev · https://www.assistant-ui.com · （非 Tailwind 备选：semi.design / x.ant.design / ui.lobehub.com）

### 后端（packages/engine + apps/server）

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js 22+ / TypeScript / ESM | |
| LLM 抽象 | `@earendil-works/pi-ai` | 30+ provider 含本地 Ollama/vLLM；MIT；dsh 已验证可复用 |
| Agent 循环 | `@earendil-works/pi-agent-core` + 自写引擎层 | 在其上包协议/工具/审批/会话 |
| HTTP | Fastify | REST + SSE |
| 协议校验 | zod 4（内部）+ JSON Schema 导出（跨端合同） | |
| 持久化 | 自写 append-only JSONL（~50 行）+ 后期可选 SQLite 索引 | 六家全是自写 |
| MCP（后期） | @modelcontextprotocol/sdk | |

### 工程组织

pnpm workspaces monorepo：

```
spark/
├── packages/
│   ├── protocol/        # 事件类型 + API 类型 + transport 接口 + mockTransport（前后端共享合同）
│   ├── engine/          # Agent 引擎（pi 构建块 + 自写层）
│   └── shared/          # 前后端共享工具（可选）
├── apps/
│   ├── server/          # Fastify 壳：REST + SSE + 静态托管 web
│   ├── web/             # React SPA
│   └── desktop/         # Electron 壳（阶段五）
├── doc/
└── pnpm-workspace.yaml
```

## 3. 协议设计（packages/protocol）—— 全项目最重要的包

### 3.1 事件模型

融合六家之长：**pi 的简洁 + opencode 的 durable/live 二分 + Codex 的 steering 语义 + dsh 的 surface 纪律**。

初版事件清单（可辨识联合，约 20 种）：

```ts
// 信封
interface SparkEvent<T extends SparkEventType = SparkEventType> {
  id: string            // evt_ + 自增
  type: T
  sessionId: string     // ses_ + uuid
  seq: number           // durable 事件单调递增（live 事件无 seq）
  time: number          // epoch ms
  durable: boolean      // 落盘标记（opencode 二分法）
  data: SparkEventMap[T]
}

// 事件词表（merge-extensible，插件可扩展——dsh 手法）
interface SparkEventMap {
  // 会话
  'session.created':   { title?: string; cwd: string }
  'session.resumed':   { fromSeq: number }
  // turn（= 一次用户输入引发的完整工作）
  'turn.started':      { turnId: string; delivery: 'now' | 'steer' | 'queue' }
  'turn.completed':    { turnId: string; finish: 'stop' | 'length' | 'aborted' | 'error'; usage?: Usage }
  // 输入
  'user.message':      { text: string }                       // durable + surface
  // 助手（surface = 进模型历史）
  'assistant.delta':   { text: string }                       // live-only（不落盘）
  'assistant.message': { content: ContentItem[]; usage: Usage } // durable + surface
  'reasoning.delta':   { text: string }                       // live-only
  'reasoning.ended':   { text: string }                       // durable
  // 工具
  'tool.started':      { callId: string; name: string; input: unknown }
  'tool.progress':     { callId: string; chunk: string }      // live-only，限流
  'tool.completed':    { callId: string; output: unknown; isError: boolean }
  // 审批（dsh：log-only，永不进模型历史）
  'permission.asked':  { requestId: string; action: string; resource: string; detail?: unknown }
  'permission.resolved': { requestId: string; reply: 'once'|'always'|'reject'; feedback?: string }
  // 上下文管理
  'compaction.completed': { summary: string; keptFromSeq: number }
  'checkpoint.created':   { id: string; files: string[] }
  // 系统
  'error':             { message: string; fatal?: boolean }
}
```

设计纪律（写入 protocol 包 README）：
1. **durable 事件才落盘**；delta 类 live-only（opencode："Stream fragments are live-only"）。
2. **surface 事件必须能重建模型历史**（dsh "Model-visible means logged"）——`user.message`/`assistant.message` 带 `surface: true` 标记，模型上下文只从 surface 事件投影。
3. 读端遇到未知事件类型且无 `ignorable` 标记 → 拒绝重建（fail-closed）。
4. abort 时给未完成工具补合成 started/completed 事件对（dsh/Grok：重放永远合法）。

### 3.2 HTTP API

```
POST   /api/sessions                     创建会话
GET    /api/sessions                     列表
GET    /api/sessions/:id                 详情（含 durable 事件回放）
POST   /api/sessions/:id/messages        发消息 { text, delivery: 'now'|'steer'|'queue' }
POST   /api/sessions/:id/interrupt       中断
POST   /api/permissions/:requestId       审批答复 { reply, feedback? }
GET    /api/event?sessionId=&since=      SSE：单端点推全部事件 + 15s 心跳（opencode 模式）
```

SSE 事件 payload 即 `{id, type, sessionId, seq, time, data}`；客户端断线重连用 `since=<seq>` 从 durable 水位回放。

### 3.3 transport 接口 + mockTransport（前端先行的关键）

```ts
interface Transport {
  onEvent(handler: (e: SparkEvent) => void): () => void
  sendMessage(text: string, delivery?: Delivery): Promise<void>
  interrupt(): Promise<void>
  replyPermission(reqId: string, reply: Reply): Promise<void>
}
// 实现：HttpTransport（真实）+ MockTransport（回放预录 JSONL + 模拟审批弹窗延迟）
```

**前端第一天就对着 MockTransport 开发，后端就绪后换 HttpTransport，UI 零改动。**

## 4. 引擎设计（packages/engine）

### 4.1 Run loop

骨架抄 pi（`agent-loop.ts` 纯函数循环），增强三点：

1. **输入队列三通道**（opencode 思想，内存版起步）：`now`（空闲时直接开 turn）/ `steer`（turn 进行中，下一 step 前注入，pi 的 steeringQueue 同款）/ `queue`（turn 之间依序提升）。提交结果三态 `started | steered | queued`（Codex 语义）。
2. **StepContext 快照**（Codex）：每次采样前冻结 历史+工具表+模型信息 的一致视图。
3. **失败闭合**（pi handleRunFailure）：任何异常都补齐事件序列（turn.completed{finish:'error'}），事件流永远闭合。

```
runTurn(session, input):
  emit turn.started
  loop:
    注入 steer 队列积压（若空且非首轮）
    assistant = await llm.stream(context)        // pi-ai
      逐 chunk → assistant.delta (live)
      完成 → assistant.message (durable)
    toolCalls = content.filter(toolCall)
    无 toolCalls 且无积压 → break
    executeTools(toolCalls):
      逐个 emit tool.started
      beforeToolCall hook → permission.asked（挂起等待 reply）
      可并行工具 Promise.all；串行工具独占（Codex RwLock 思想用简单 mutex）
      emit tool.completed（按 model order 回填）
  emit turn.completed { finish, usage }
```

### 4.2 工具系统

- 定义：zod schema-first（`{name, description, inputSchema(zod), execute(ctx, input)}`，zod-to-json-schema 自动生成给模型）。
- 初版四工具（pi 验证过"四工具足够"）：`read` / `write` / `edit` / `bash`。
- 注册表 + scope（全局/会话级，近者 shadow 远者——dsh）。
- `beforeToolCall` hook 返回 `{allow|deny|ask}` 触发审批。
- 超大输出截断 + 溢写文件（opencode ToolOutputStore 思想）。

### 4.3 审批（人机协同的核心体验）

综合 opencode 规则引擎 + dsh fail-closed + Codex 结构化提案：

- 规则：`{action, resource, effect: allow|deny|ask}` wildcard 匹配，`findLast` 胜出，**无规则默认 ask**。
- 流程：`permission.asked` durable 事件 → 工具执行 Promise 挂起 → 客户端答复 → `permission.resolved` → `always` 时持久化规则并**自动放行同批匹配请求**（opencode）。
- fail-closed：答复超时/异常 → 判 `reject`（dsh：宁可错杀）。
- v2 演进：请求携带"建议规则"（Codex ApprovedExecpolicyAmendment——批准即学习）。

### 4.4 会话持久化

**JSONL 树（pi 模式）+ durable/live 二分（opencode）**：

- 路径：`~/.spark/sessions/<cwd-mangled>/<ses_id>.jsonl`。
- 首行 header（version/id/cwd/parentSession），其后每行一个 durable 事件。
- 条目带 `id`/`parentId` → 分叉只移 leaf 指针（pi：撤销/分支零拷贝）。
- compaction = 树上的普通 entry（`{summary, keptFromSeq}`），上下文重建 = leaf→root 回溯取最新压缩点（pi buildContextEntries）。
- 单写者串行追加（进程内队列），flush 带 fsync 选项。

## 5. 前端设计（apps/web）

### 5.1 页面结构

```
AppShell
├── 左栏：会话列表（Semi Conversations 同类物 → 用 shadcn + 自组）
├── 主区：对话流（虚拟化长列表）
│   ├── user.message → Message 组件
│   ├── assistant.delta → streamdown 流式渲染
│   ├── reasoning → Reasoning 折叠组件
│   ├── tool.* → Tool 组件（终端输出/文件 diff/进度）
│   └── permission.asked → Confirmation 审批卡片（allow once/always/reject + feedback）
└── 底部：输入框（prompt-input）+ steer 提示（turn 进行中显示"将插入下一轮"）
```

### 5.2 组件映射（AI Elements → 用途）

| AI Elements 组件 | 用途 |
|---|---|
| conversation / message / prompt-input | 对话流骨架 |
| tool | 通用工具调用卡片 |
| confirmation | **审批卡片**（核心交互） |
| terminal | bash 工具输出 |
| file-tree / code-block / diff | 文件工具展示 |
| plan / task | 计划与任务列表 |
| reasoning | 思考链折叠 |
| checkpoint | 后期 checkpoint/回滚 UI |

### 5.3 状态管理

```ts
// sessionStore（zustand）
interface SessionState { sessions: Session[]; active: Session | null }
interface Session { meta: SessionMeta; items: UiItem[] }  // UiItem = 从事件投影的 UI 条目

// 核心：applyEvent 纯函数 reducer —— UI 是事件流的投影
applyEvent(state: UiItem[], e: SparkEvent): UiItem[]
// assistant.delta 追加到最后一条 assistant item 的缓冲
// tool.completed 把对应 tool item 置为完成态
// permission.asked 生成审批卡片 item...
```

## 6. 服务端（apps/server）

Fastify + @fastify/static（托管 web 构建产物）：
- REST 路由薄壳，全部业务在 engine；
- SSE：`GET /api/event`（reply.raw 写 `text/event-stream`，15s 心跳，订阅 engine 的事件总线）；
- 仅绑定 127.0.0.1（dsh 安全姿态：无 TLS/auth 是刻意的本地默认）；
- 静态托管使 `pnpm --filter server dev` 一条命令起全栈。

## 7. 分阶段路线图

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **一·骨架** | monorepo + protocol 包（事件类型/API/MockTransport）+ web/server 空壳 | Mock 驱动的对话页能跑 |
| **二·前端全量** | 对话流/流式 MD/工具卡片/审批卡片/steer 提示（全对 Mock） | 不接引擎完成全部 UI 交互 |
| **三·引擎跑通** | pi-ai + pi-agent-core 接入；四工具；JSONL 会话；SSE 直播；HttpTransport 切换 | 真实模型完成"读改文件+跑命令"闭环 |
| **四·深度体验** | steer/queue、审批规则持久化、compaction、会话恢复/分叉、checkpoint | 断线重连回放正确；审批 always 生效 |
| **五·产品化** | Electron 壳、沙箱（Windows 先降级为确认制）、MCP、子代理、技能系统 | 桌面安装包 |

## 8. 参考速查表（遇到问题查哪家）

| 问题 | 去哪查 |
|---|---|
| run loop 怎么写干净 | pi `packages/agent/src/agent-loop.ts`（10 事件纯函数循环） |
| steering/排队语义 | opencode `core/src/session/input.ts` + `run-coordinator.ts`；Codex `protocol/src/turn_input.rs` |
| 事件要不要落盘 | opencode `schema/src/event.ts`（durable 定义） |
| 模型历史怎么投影 | dsh `packages/core/session/src/surface.ts` |
| 工具并行/串行门控 | Codex `core/src/tools/parallel.rs`（RwLock 读共享写独占） |
| 审批规则引擎 | opencode `core/src/permission.ts`（wildcard + findLast + Deferred） |
| 审批 fail-closed | dsh `packages/interaction/user-approval/src/index.ts` 的 decide() |
| JSONL 会话树/分叉 | pi `packages/coding-agent/src/core/session-manager.ts` |
| resume 反向扫描 | Codex `rollout/src/reverse_jsonl_scanner.rs` |
| SSE 端点实现 | opencode `server/src/handlers/event.ts`（单端点+心跳） |
| checkpoint 多域捆绑 | Grok `xai-grok-workspace/src/session/checkpoint.rs` |
| compaction 设计 | pi（树上 entry）/ opencode（消息进历史）/ Claude Code（泄露源码 analysis/04f） |
| 工具输出限界溢写 | opencode `core/src/tool-output-store.ts` |
| 前端事件投影 | dsh `apps/web`（唯一开源 Agent Web UI）+ 本方案 §5.3 |
| Claude Code 具体实现 | `Wanfeng1028/claude-code-analysis`（泄露源码，**只读不抄**） |
| 工作流/提示词设计 | claude-code 官方仓库 `plugins/`（16 个官方插件，真开源） |

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| pi 包 0.x breaking（团队主导不接受 PR） | 锁版本；包小可整体 vendor 进 engine；架构上 engine 层隔离 pi 依赖点 |
| AI Elements 面向 Next.js 文档 | copy-in 源码删 "use client"、换自管 transport（一次性适配成本） |
| assistant-ui 0.x | 仅在需要其状态层时引入；核心交互不依赖 |
| 本地安全（bash 工具） | 阶段三默认全审批；阶段五接沙箱（Windows AppContainer / macOS Seatbelt / Linux bwrap） |
| 事件协议演进 | durable 事件带 version（opencode）；未知事件 fail-closed（dsh） |
| 范围蔓延 | 严守"四工具+对话+审批"为 MVP 边界；MCP/子代理/技能全部排到阶段五后 |

---

*方案定稿。开工顺序：阶段一（monorepo + protocol + MockTransport + 空壳）。*
