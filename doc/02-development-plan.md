# Spark — Agent 产品完整开发方案（实现级）

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-08-22 | AI 编写：ZCode CLI · 模型 ox-alpha（model id：`57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：技术栈定稿+协议/引擎/前端概要+五阶段路线图 |
| v1.1 | 2026-08-22 | 同上 | 扩至实现级：协议完整 TS 类型、引擎伪代码、会话文件格式、五阶段任务清单 |
| v1.2 | 2026-08-22 | 同上 | **前端章节扩为完整规格**（信息架构/路由/逐屏视图规格/逐组件 props/状态层代码结构/样式系统/Transport 实现/AI Elements 改造清单/性能优化/工程化配置）；阶段二任务清单细化；新增本版本记录表 |

> 依据：`01-research-report.md` 六大项目源码级调研结论。
> 原则：**能复用开源就不自己写；协议先行、前端先行；抄设计而不抄框架**。

---

## 目录

- 1. 产品定位与总体架构
- 2. 技术栈定稿
- 3. Monorepo 结构（文件级）
- 4. 协议设计（packages/protocol）
- 5. 引擎设计（packages/engine）
- 6. **前端设计（apps/web）——完整规格**
- 7. 服务端（apps/server）
- 8. 分阶段路线图（任务清单级）
- 9. 参考速查表
- 10. 风险与对策
- 11. 附录：术语表

---

# 1. 产品定位与总体架构

## 1.1 一句话定位

本地优先的 Agent 工作台：引擎跑在本地（Node 进程），Web 前端消费事件流，后期加 Electron 桌面壳。核心体验 = 流式对话 + 工具调用可视化 + 人工审批。

## 1.2 总体架构

```
┌────────────────────────────── 本机 ──────────────────────────────┐
│                                                                  │
│  apps/web (React SPA)              apps/desktop (Electron, 阶段五) │
│      │ HttpTransport                   │ 复用同一 HttpTransport    │
│      ▼                                  ▼                         │
│  packages/protocol（唯一合同：事件类型 + API 类型 + Transport 接口）   │
│      │                                                           │
│  apps/server (Fastify)                                           │
│    ├─ REST：会话/消息/审批                                          │
│    └─ GET /api/event —— SSE 单端点事件流（15s 心跳）                 │
│      │                                                           │
│  packages/engine                                                  │
│    ├─ 输入队列（now/steer/queue 三通道）                             │
│    ├─ RunLoop（抄 pi 骨架 + Codex steering 语义）                   │
│    ├─ ToolRegistry + 四工具（read/write/edit/bash）                 │
│    ├─ Permission 引擎（wildcard 规则 + fail-closed）                │
│    ├─ SessionManager（JSONL 树 + durable/live 二分）                │
│    └─ LlmGateway → @earendil-works/pi-ai（30+ provider）           │
│                                                                  │
│  ~/.spark/sessions/<cwd-mangled>/<ses_id>.jsonl（durable 事件日志） │
└──────────────────────────────────────────────────────────────────┘
```

## 1.3 五条架构铁律（六家源码验证）

1. **引擎 headless，UI 是事件流的投影**（Codex/opencode）：客户端只通过协议对话；UI 状态 = `applyEvent(events)` 纯函数归约。
2. **durable 事件落盘，delta 只走内存**（opencode）："Stream fragments are live-only"。
3. **模型可见的必须被记录**（dsh）："Model-visible means logged"。
4. **失败闭合**（pi）：任何异常路径补齐事件序列，事件流永不悬空。
5. **审批 fail-closed**（dsh）：答复缺失/超时/异常一律判拒绝。

---

# 2. 技术栈定稿

## 2.1 前端（apps/web）

| 层 | 选型 | 选型理由 | 备选 |
|---|---|---|---|
| 构建 | Vite 7 + React 19 + TS(strict) | 本地 SPA+Electron 友好，无 SSR 负担 | Next.js（AI Elements 铺好的路） |
| 样式 | Tailwind CSS v4 + shadcn/ui | copy-in 代码归我们；默认黑白中性极简（**非**蓝玻璃 AI 风——那是 v0/Lovable 审美，与 Tailwind 无关） | Semi（非 Tailwind 线） |
| AI 组件 | **Vercel AI Elements**（48 组件） | confirmation/terminal/file-tree/plan/task/checkpoint/tool 即 Agent 工作台零件库 | @ant-design/x |
| 对话状态 | assistant-ui 可选 / 自管 zustand | headless 省状态层；自管更干净 | — |
| 流式 Markdown | streamdown | 未闭合语法补全；周下载 496 万事实标准 | @ant-design/x-markdown |
| 长列表 | react-virtuoso | followOutput 是 chat 标配 | — |
| 状态 | zustand + TanStack Query | 事件流 store 与服务端状态分离 | — |
| 动效 | react-bits（可选） | 用户已 fork | — |

链接备查：https://ui.shadcn.com · https://elements.ai-sdk.dev · https://www.assistant-ui.com · https://github.com/vercel/streamdown · 备选线 https://semi.design / https://x.ant.design / https://ui.lobehub.com

## 2.2 后端（packages/engine + apps/server）

| 层 | 选型 | 理由 | 备选 |
|---|---|---|---|
| 运行时 | Node 22+ / TS / ESM | 与前端同语言，协议类型直接共享 | — |
| LLM 抽象 | `@earendil-works/pi-ai` | 30+ provider 含本地 Ollama/vLLM；dsh 复用验证 | Vercel AI SDK v7 |
| Agent 循环 | `@earendil-works/pi-agent-core` + 自写引擎层 | 有状态 Agent+事件流 | 全自写（照 pi 源码） |
| HTTP | Fastify | TS 友好、SSE 简单 | Hono |
| 校验 | zod 4 + zod-to-json-schema | 单一 schema 双用途 | typebox |
| 持久化 | 自写 append-only JSONL（~50 行） | 六家全自写 | node:sqlite（阶段四索引） |
| MCP | @modelcontextprotocol/sdk（阶段五） | 官方 TS SDK | — |

## 2.3 工程组织

pnpm workspaces（+turborepo 可选）；changesets 可选。

---

# 3. Monorepo 结构（文件级）

```
spark/
├── pnpm-workspace.yaml / package.json / tsconfig.base.json / .gitignore
├── doc/
├── packages/
│   ├── protocol/                   # ★ 唯一合同，零运行时依赖（除 zod）
│   │   └── src/{ids,primitives,events,api,transport,schema,index}.ts
│   ├── engine/
│   │   └── src/
│   │       ├── index.ts / engine.ts / bus.ts / input-queue.ts / run-loop.ts / llm-gateway.ts
│   │       ├── tools/{types,registry,pipeline,read,write,edit,bash,output-store}.ts
│   │       ├── permission/{rules,service}.ts
│   │       └── session/{manager,store,tree,projector,compaction}.ts
│   └── shared/                     # （可选）
├── apps/
│   ├── server/src/{index,routes/,sse,static}.ts
│   ├── web/
│   │   ├── vite.config.ts / tailwind 配置 / css/
│   │   ├── components/ui/          # shadcn + AI Elements copy-in 产物
│   │   └── src/
│   │       ├── main.tsx / App.tsx / router.tsx
│   │       ├── transports/{context.tsx,http.ts,mock.ts}
│   │       ├── stores/{session-store,connection-store,settings-store}.ts
│   │       ├── features/
│   │       │   ├── chat/{ChatView,MessageItem,AssistantBlock,ReasoningCollapsible,
│   │       │   │         ToolCard,ApprovalCard,TurnStatusBar}.tsx
│   │       │   ├── composer/{Composer,PromptInput,DeliveryBar}.tsx
│   │       │   ├── sidebar/{SessionSidebar,SessionItem,NewSessionButton}.tsx
│   │       │   └── settings/{SettingsDialog,ModelSelector,PermissionRules}.tsx
│   │       ├── components/         # 通用 UI（Button/Dialog…来自 shadcn）
│   │       ├── lib/{api,format,keys,cn}.ts
│   │       └── styles/{globals.css,tokens.css}
│   └── desktop/                    # （阶段五）
└── examples/mock-sessions/         # MockTransport 素材（*.json）
```

---

# 4. 协议设计（packages/protocol）

## 4.1 品牌化 ID

```ts
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }
export type SessionId = Brand<string, 'SessionId'>   // ses_<uuid>
export type TurnId    = Brand<string, 'TurnId'>      // trn_<ulid>
export type EventId   = Brand<string, 'EventId'>     // evt_<ulid>
export type CallId    = Brand<string, 'CallId'>      // cal_<ulid>
export type RequestId = Brand<string, 'RequestId'>   // req_<ulid>
export type CheckpointId = Brand<string, 'Ckp'>      // ckp_<ulid>
```

## 4.2 基础类型

```ts
/** 不变式（抄 opencode Usage 契约）：nonCachedInput + cacheRead + cacheWrite = inputTokens */
export interface Usage {
  inputTokens: number; outputTokens: number; reasoningTokens?: number
  cacheRead?: number; cacheWrite?: number; costUsd?: number
}
export type ContentItem =
  | { type: 'text';       text: string }
  | { type: 'reasoning';  text: string }
  | { type: 'toolCall';   callId: CallId; name: string; input: unknown }
  | { type: 'toolResult'; callId: CallId; output: unknown; isError: boolean }

export type Delivery = 'now' | 'steer' | 'queue'   // Codex TurnInputMode + opencode delivery 合并
export type TurnFinish = 'stop' | 'length' | 'aborted' | 'permission-rejected' | 'error'
export type PermissionReply = 'once' | 'always' | 'reject'
```

## 4.3 事件词表（21 种，merge-extensible——dsh 手法，插件 declaration merging 扩展）

```ts
export interface SparkEventMap {
  // 会话
  'session.created':    { title?: string; cwd: string; model: string }
  'session.resumed':    { fromSeq: number }
  'session.title':      { title: string }
  // turn
  'turn.started':       { turnId: TurnId; delivery: Delivery; userEventId: EventId }
  'turn.completed':     { turnId: TurnId; finish: TurnFinish; usage?: Usage }
  // 输入/输出（surface = 进模型历史）
  'user.message':       { text: string; attachments?: string[] }           // durable+surface
  'assistant.delta':    { turnId: TurnId; text: string }                   // live-only
  'assistant.message':  { turnId: TurnId; content: ContentItem[]; usage?: Usage } // durable+surface
  'reasoning.delta':    { turnId: TurnId; text: string }                   // live-only
  'reasoning.ended':    { turnId: TurnId; text: string }                   // durable
  // 工具（状态机 started → [progress] → completed）
  'tool.started':       { turnId: TurnId; callId: CallId; name: string; input: unknown }
  'tool.progress':      { turnId: TurnId; callId: CallId; chunk: string }  // live-only，引擎侧节流
  'tool.completed':     { turnId: TurnId; callId: CallId; output: unknown;
                          isError: boolean; durationMs: number }
  // 审批（log-only，永不进模型历史——dsh 纪律）
  'permission.asked':    { requestId: RequestId; callId: CallId; action: string
                           resource: string; reason: string; detail?: unknown }
  'permission.resolved': { requestId: RequestId; reply: PermissionReply; feedback?: string }
  // 上下文管理
  'compaction.started':   { turnId?: TurnId }
  'compaction.completed': { summary: string; keptFromSeq: number; tokensBefore: number }
  'checkpoint.created':   { checkpointId: CheckpointId; files: string[]; turnId: TurnId }
  // 系统
  'error':              { scope: 'engine'|'llm'|'tool'|'io'; message: string; fatal?: boolean }
}
```

## 4.4 信封与 durable/live

```ts
export type SurfaceEventType = 'user.message' | 'assistant.message'
export type LiveOnlyEventType = 'assistant.delta' | 'reasoning.delta' | 'tool.progress'

export interface SparkEventEnvelope<T extends SparkEventType = SparkEventType> {
  id: EventId; type: T; sessionId: SessionId
  seq?: number            // durable 单调序号（== 会话日志行号）；live 无 seq
  time: number            // epoch ms
  data: SparkEventMap[T]
} & (T extends SurfaceEventType ? { surface: true } : unknown)   // 编译期强制（dsh）
```

**durable/live/surface 规则表**（评审核对）：

| 事件 | durable | surface |
|---|---|---|
| session.created / resumed / title | ✅ | ❌ |
| turn.started / completed | ✅ | ❌ |
| user.message | ✅ | ✅ |
| assistant.message / reasoning.ended | ✅ | ✅（reasoning 按 provider 配置） |
| assistant.delta / reasoning.delta / tool.progress | ❌ live-only | — |
| tool.started / completed | ✅ | ❌（结果经 assistant.message 的 toolResult 回填模型） |
| permission.asked / resolved | ✅（审计） | ❌ 永不进模型历史 |
| compaction.* / checkpoint.created | ✅ | compaction 影响 projection |
| error | ✅ | ❌ |

**读端 fail-closed**（dsh）：磁盘重建遇未知 type 且无 `ignorable: true` → 拒绝加载并报错。

## 4.5 HTTP API

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| POST | /api/sessions | `{ title?, model?, cwd? }` | SessionDto |
| GET | /api/sessions | `?limit&cursor` | SessionDto[] |
| GET | /api/sessions/:id | — | SessionDto（含 `events: SparkEvent[]` durable 回放） |
| POST | /api/sessions/:id/messages | `{ text, delivery? }` | `{ result:'started'\|'steered'\|'queued', turnId? }` |
| POST | /api/sessions/:id/interrupt | — | `{ ok:true }` |
| POST | /api/permissions/:requestId | `{ reply, feedback? }` | `{ ok:true }` |
| GET | /api/sessions/:id/tree | — | TreeNode[]（阶段四） |
| POST | /api/sessions/:id/fork | `{ fromEventId }` | SessionDto（阶段四） |
| GET | /api/event | `?sessionId&since` | SSE 流 |

## 4.6 SSE 帧格式

```
GET /api/event?sessionId=ses_...&since=42
→ Content-Type: text/event-stream; Cache-Control: no-cache, no-transform; X-Accel-Buffering: no
: heartbeat\n\n                                   ← 每 15s（opencode 同款）
event: message\ndata: {"id":"evt_...","type":"assistant.delta","sessionId":"ses_...","time":...,"data":{...}}\n\n
```

`since` = durable seq 水位：连接先补发 `seq > since` 的 durable 事件（回放）再直播——断线重连语义。统一 `event: message`，type 在 payload。

## 4.7 Transport 接口 + MockTransport 规格

```ts
export interface Transport {
  onEvent(handler: (e: SparkEventEnvelope) => void): () => void
  sendMessage(text: string, opts?: { delivery?: Delivery; attachments?: string[] }):
    Promise<{ result: 'started'|'steered'|'queued'; turnId?: TurnId }>
  interrupt(): Promise<void>
  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  listSessions(): Promise<SessionDto[]>
  createSession(opts?: { title?: string }): Promise<SessionDto>
  dispose(): void
}
```

**MockTransport 行为规格**：预录事件数组（examples/mock-sessions/*.json）或脚本模式；sendMessage 触发延迟回放（delta 30~80ms/次）；审批场景吐 permission.asked 并等待 replyPermission；支持 steer 演示；`speed`/`scenario` 开关（normal/long-output/reject/error-finish）。

---

# 5. 引擎设计（packages/engine）

## 5.1 Engine 门面

```ts
export interface Engine {
  createSession(opts): Promise<SessionHandle>
  resumeSession(id: SessionId): Promise<SessionHandle>
  listSessions(): Promise<SessionMeta[]>
  subscribe(handler, filter?: { sessionId?: SessionId }): () => void
  shutdown(): Promise<void>
}
export interface SessionHandle {
  readonly id: SessionId; readonly meta: SessionMeta
  send(text, delivery?): Promise<{ result; turnId? }>
  interrupt(): Promise<void>
  replyPermission(reqId, reply, feedback?): Promise<void>
  forkFrom(eventId: EventId): Promise<SessionHandle>     // 阶段四
}
```

## 5.2 事件总线（bus.ts）

durable：`emit(event)` → zod 校验 → 赋 seq → SessionStore.append（单写者队列，可选 fsync）→ 广播。live：`emitLive(event)` → 校验 → 直接广播。订阅者异常隔离（try/catch 逐个记 warn——dsh）。

## 5.3 输入队列（input-queue.ts）三通道

```
send(text, delivery='now'):
  now   → 空闲？占锁返回 started；忙→降级 steer（可插话）否则 queue
  steer → 有活跃 turn？入 steerQueue 返回 steered；否则入主队列返回 started
  queue → 入 queue 返回 queued（turn 结束后依序消费）
唤醒合并（opencode pendingWake）：runLoop 结束前查积压，有则续跑不退出
```

## 5.4 Run Loop（run-loop.ts）

```
runLoop(session):                       // 每会话一个 async 执行体（per-key 串行）
  while (queue 有积压 || pendingWake):
    input = queue.shift()
    emit turn.started {turnId, delivery, userEventId}
    loop:                                             // 采样⇄工具内循环
      step += 1
      while (steerQueue.length) 注入为 user.message(surface)   // steering 在 assistant 前生效
      messages = Projector.modelContext(tree.leaf)   // surface 投影+最新 compaction 截断
      tools = ToolRegistry.materialize(agent)         // zod→json schema
      stream = LlmGateway.stream(model, messages, tools)
      for await (ev of stream):
        text_delta→emitLive assistant.delta 累积；thinking_delta→reasoning.delta
        toolcall_end→content.push(toolCall)；done/error→break
      emit assistant.message {content, usage}         // durable+surface
      // 截断保护（pi）：stopReason==='length' 时截断 toolCall 全部不执行，
      // 逐个补 tool.started/completed{isError, output:'truncated'} —— 上下文永不悬挂
      toolCalls = content.filter(toolCall)
      if (!toolCalls.length && steerQueue 空) break
      results = await ToolPipeline.runAll(toolCalls, {turnId})
      emit assistant.message {content: toolResults}   // durable（单独成条便于投影）
    emit turn.completed {turnId, finish, usage 累计}
  // 失败闭合（pi handleRunFailure）：最外层 catch 补 turn.completed{finish:'error'} 后继续消费
```

## 5.5 工具系统（tools/）

```ts
export interface ToolDefinition<I = unknown> {
  name: string; description: string
  inputSchema: z.ZodType<I>
  permission?: { action: string; resourceOf: (input: I) => string }
  parallelizable: boolean               // read=true, bash/edit/write=false
  execute(ctx: ToolContext, input: I): Promise<ToolOutput>
}
export interface ToolContext {
  sessionId; turnId; callId; signal: AbortSignal
  onProgress: (chunk: string) => void   // → tool.progress（引擎 200ms 节流）
  cwd: string
}
export interface ToolOutput { output: unknown; isError: boolean; display?: string }
```

管线：`tool.started → beforeToolCall hook → permission.assert(allow/ask/deny) → execute(AbortSignal 级联) → afterToolCall → OutputStore.bound(>32KB 截断+溢写 ~/.spark/tool-outputs/<callId>) → tool.completed`。分组：serial 工具独占逐个、parallel 工具 Promise.all（Codex RwLock 思想的简化）。中断时（dsh）：已启动跑到静默、未启动补 started+completed{output:'aborted'} 事件对。

四工具 schema：

| 工具 | input | 说明 |
|---|---|---|
| read | `{ path, offset?, limit? }` | 默认 2000 行/次 |
| write | `{ path, content }` | 整文件写 |
| edit | `{ path, oldString, newString, replaceAll? }` | oldString 唯一性校验（Claude Code 同款） |
| bash | `{ command, timeoutMs?, cwd? }` | 独立 shell（v1 不做常驻），输出 16KB/帧截断（Grok） |

## 5.6 审批（permission/）

```ts
export interface PermissionRule { action: string; resource: string; effect: 'allow'|'deny'|'ask' }
// wildcard（* 与 **）findLast 胜出，无命中默认 'ask'（opencode evaluate 原样）
```

- 规则优先级：会话临时 > 项目 `.spark/permissions.json` > 用户 `~/.spark/permissions.json`。
- `always` → 持久化+**自动放行同批匹配 pending**（opencode）；`reject+feedback` → feedback 注入为 user.message 回喂模型；**fail-closed**：超时 5min/答非所问/异常 → reject（dsh）。
- v2 预留：asked 携带 `proposedRule`（Codex 审批即学习）。

## 5.7 会话持久化（session/）

文件：`~/.spark/sessions/--<cwd munged>--/<ses_id>.jsonl`，首行 header + 每行 durable 事件（带 `parentId` 树链，pi）：

```jsonc
{"kind":"header","version":1,"id":"ses_01J8...","createdAt":...,"cwd":"E:\\code\\...","parentSession":null,"model":"deepseek-chat"}
{"id":"evt_01...","type":"session.created","sessionId":"ses_...","seq":0,"time":...,"data":{...},"parentId":null}
{"id":"evt_02...","type":"user.message","sessionId":"ses_...","seq":1,"time":...,"data":{"text":"..."},"surface":true,"parentId":"evt_01..."}
{"id":"evt_0a...","type":"compaction.completed","sessionId":"ses_...","seq":9,"data":{"summary":"...","keptFromSeq":1,"tokensBefore":98000},"parentId":"evt_08..."}
```

- 单写者 mpsc 串行 append；flush 带 fsync（切换/退出）。
- **Projector**：`modelContext(leafId)` = leaf→root 回溯 → 最新 compaction → 摘要注入 + keptFromSeq 后 surface 投影（pi buildContextEntries + dsh deriveMessages 合体）。
- resume 全量读（v1）；fork 复制到 fromEventId（阶段四）。

## 5.8 LLM 适配（llm-gateway.ts）：pi 事件 → Spark 事件映射

| pi 事件 | Spark 事件 |
|---|---|
| message_update(text_delta) | assistant.delta (live) |
| message_update(thinking_delta) | reasoning.delta (live) |
| message_end(assistant) | assistant.message (durable+surface) |
| tool_execution_start/update/end | tool.started / tool.progress(live 节流) / tool.completed |
| turn_end | turn.completed（usage 汇总） |
| stopReason error/aborted | turn.completed{finish:'error'/'aborted'}——**错误进流不抛**（pi 契约） |

模型配置 `~/.spark/models.json`（provider/apiKey/env/默认模型）；provider 可重试错误指数退避 3 次（pi-ai normal 档）。

---

# 6. 前端设计（apps/web）——完整规格

## 6.1 信息架构与路由

```
/                       → 重定向到最近会话或 /welcome
/welcome                → 欢迎页（无会话时）：新建/选择会话/快捷提示词
/session/:sessionId     → 工作台主视图（ChatView + Sidebar 常驻）
/settings               → 设置弹窗（路由态 ?settings=1 或独立路由，v1 用 Dialog 不换路由）
```

- 路由：React Router v7（library 模式）。
- 布局层级：`<App>` → `<TransportProvider>` → `<AppShell>{Sidebar}{<Outlet/>}{StatusBar}</AppShell>`。

## 6.2 逐屏视图规格

### 6.2.1 欢迎页 `/welcome`

- **空态**：居中大 Logo + "新建会话" 主按钮 + 最近会话卡片（≤6 个）+ 3 条快捷提示词 chip（点击即建会话并发送）。
- **加载态**： skeletons。
- **错误态**：transport 连接失败 → 重试按钮 + 错误信息。

### 6.2.2 工作台 `/session/:id`

布局（左 260px 可折叠侧栏 + 主区 + 底部状态条）：

```
┌────────────┬──────────────────────────────────────────────┐
│ SessionSidebar │ ChatView（虚拟化滚动区）                     │
│  新建按钮    │  …消息流…                                     │
│  搜索框     │  [ApprovalCard 悬浮在对应位置]                 │
│  会话列表    │  [TurnStatusBar 进行中指示]                   │
│  （分组:今天/ │───────────────────────────────────────────│
│   更早）     │ Composer（输入区 + DeliveryBar）              │
├────────────┴──────────────────────────────────────────────┤
│ StatusBar：连接状态● │ 模型名 │ seq 水位 │ token 累计         │
└───────────────────────────────────────────────────────────┘
```

**ChatView 状态矩阵**：

| 状态 | 表现 |
|---|---|
| 空（新会话） | 居中欢迎语 + 提示词 chips |
| 流式中 | assistant 气泡底部闪烁光标；TurnStatusBar 显示 step 数/工具运行中徽标；自动跟随底部（用户上滚则暂停跟随并出现 BackBottom 悬浮按钮——lobehub 同款交互） |
| 审批挂起 | 对应 ToolCard 位置展开 ApprovalCard；TurnStatusBar 黄色"等待审批" |
| turn 完成 | 光标消失；usage 徽标（tokens/cost）淡显在 assistant 消息尾 |
| error finish | 顶部黄条提示 + 重试按钮（重发最后一条 user.message） |
| 断线 | StatusBar 红点 + 顶部条"已断线，重连中…"（自动重连，重连后 since 回放无缝续播） |

**Composer 交互规格**：

| 状态 | 可用操作 |
|---|---|
| 空闲 | Enter 发送（Shift+Enter 换行）；附件按钮（v1 只收路径文本） |
| turn 进行中 | 三个按钮：**[停止]**（interrupt）/ **[排队]**（queue）/ **[插话]**（steer，高亮为本次默认）；输入文字后 Enter = steer（提示"将注入当前轮"） |
| 审批挂起 | 输入区禁用（焦点引导到 ApprovalCard） |

## 6.3 组件规格（props 与行为）

```tsx
// features/chat/ChatView.tsx —— 虚拟化容器
interface ChatViewProps { sessionId: string }
// react-virtuoso：<Virtuoso followOutput={'smooth'} firstItemIndex={...}
//   itemSizeCache 估算高度；items 来自 sessionStore 选择器（UiItem[] 扁平化）

// MessageItem：按 UiItem.kind 分发
interface MessageItemProps { item: UiItem }

// AssistantBlock：一条 assistant.message 的渲染序列
interface AssistantBlockProps {
  content: ContentItem[]
  streaming?: { textBuf: string }      // 流式追加缓冲（streamdown 直接吃）
  usage?: Usage                        // 尾部徽标
}

// ReasoningCollapsible
interface ReasoningCollapsibleProps {
  text: string; streaming?: boolean    // 流式时自动展开、结束自动折叠（可手动）
  durationMs?: number
}

// ToolCard：工具统一卡片（状态机视觉）
interface ToolCardProps {
  name: string; input: unknown
  status: 'running' | 'completed' | 'error'
  progressBuf?: string                 // running 时 Terminal/进度区
  output?: unknown; isError: boolean; durationMs?: number
}
// 分发：bash→Terminal（自动滚底、超长截头 500 行）；edit/write→DiffViewer
//（读 output.diff）；read→CodeBlock（path+行数）；其他→JSON 折叠

// ApprovalCard：审批交互（AI Elements confirmation 改造）
interface ApprovalCardProps {
  action: string; resource: string; reason: string; detail?: unknown
  status: 'pending' | 'resolved'
  onReply: (reply: PermissionReply, feedback?: string) => void
}
// pending：三按钮 [允许一次][总是允许][拒绝]；拒绝展开 feedback 文本框（可选填）
// resolved：显示结果徽标 2s 后折叠为一行

// TurnStatusBar：turn 进行中指示
interface TurnStatusBarProps { turn: { turnId: string; stepCount: number; runningTools: string[] } | null }

// Composer
interface ComposerProps {
  busy: boolean                        // turn 进行中
  onSend: (text: string, delivery: Delivery) => void
  onInterrupt: () => void
}

// SessionSidebar / SessionItem（标题/相对时间/状态点：idle|running|waiting-approval）
// SettingsDialog：模型选择（transport.listModels 扩展点）、默认 delivery、主题切换、
//   权限规则表（v2：增删查 PermissionRule）
```

## 6.4 状态层（stores/）

```ts
// session-store.ts —— 核心模式：UI 是事件流的投影
interface UiItemBase { eventId: EventId; parentId?: EventId }
type UiItem =
  | { kind: 'user'; text: string } & UiItemBase
  | { kind: 'assistant'; content: ContentItem[]; streaming?: { textBuf: string } } & UiItemBase
  | { kind: 'reasoning'; text: string; streaming?: boolean } & UiItemBase
  | { kind: 'tool'; callId: CallId; name: string; input: unknown
      status: 'running'|'completed'|'error'; progressBuf: string; output?: unknown } & UiItemBase
  | { kind: 'approval'; requestId: RequestId; action: string; resource: string
      status: 'pending'|'resolved' } & UiItemBase

interface SessionSlice {
  meta: SessionMeta; items: UiItem[]
  activeTurn: { turnId; stepCount; runningTools: Set<CallId> } | null
  lastSeq: number          // durable 水位（重连 since）
  usageTotal: Usage        // 累计
}
// zustand store：{ byId: Record<SessionId, SessionSlice>, activeId: SessionId | null }
// 动作只有两个入口：applyEvent(e)（唯一写路径）与 reset()
// 选择器：selectItems(activeId)、selectActiveTurn(activeId)、selectLastSeq(activeId)
```

**applyEvent 处理表（21 种全覆盖）**：

| 事件 | 状态变更 |
|---|---|
| session.created | 初始化 slice，若 activeId 空则激活 |
| session.resumed | 重放模式下批量 apply |
| session.title | meta.title 更新（Sidebar 联动） |
| turn.started | activeTurn={…}；composer 切 busy |
| turn.completed | activeTurn=null；finish==='error' 设 topBanner；usage 累计 |
| user.message | push {kind:'user'} |
| assistant.delta | 末尾 assistant item（无则建）streaming.textBuf += text |
| assistant.message | 定稿 content，清 streaming；按 content 展开子 item（text→流式 MD 定稿；toolCall→push tool item running） |
| reasoning.delta / ended | 同 assistant 模式（ended 定稿 text） |
| tool.started | push {kind:'tool',status:'running'}；activeTurn.runningTools.add |
| tool.progress | progressBuf += chunk（>2000 行截头） |
| tool.completed | status 定稿 + output；runningTools.delete |
| permission.asked | push {kind:'approval',status:'pending'}；activeTurn 标 waiting-approval |
| permission.resolved | 对应 approval→resolved |
| compaction.started/completed | 顶部细条"上下文已压缩"（轻提示） |
| checkpoint.created | StatusBar 短暂徽标（v1 仅记录） |
| error | toast；fatal→全屏错误态 |

```ts
// connection-store.ts：{ status:'connecting'|'open'|'reconnecting'|'closed', lastSeq, retryCount }
// settings-store.ts：{ theme:'light'|'dark'|'system', defaultDelivery, model }（localStorage 持久化）
```

## 6.5 样式系统

- **Token 层**（styles/tokens.css，CSS variables）：`--background/--foreground/--primary/--muted/--border/--radius` 等 shadcn 标准 token + 扩展 `--spark-accent`（运行中）/`--spark-warn`（审批）/`--spark-ok`（完成）。
- **主题**：`light/dark` 二态（class 策略）；ThemeProvider 20 行（localStorage+`document.documentElement.classList`+`prefers-color-scheme` 监听）；**视觉基调：黑白中性极简（shadcn 默认），禁止蓝紫渐变玻璃**。
- **Tailwind v4 配置**：`@source` 引 streamdown 所需 token；`content` 覆盖 components/ui（copy-in 组件）。
- 字体：UI 用系统栈；代码/终端 `IBM Plex Mono`（@fontsource 本地打包，不请求 CDN）。
- 组件库样式覆写：copy-in 组件直接改源码（不写全局覆写）。

## 6.6 Transport 层实现

```tsx
// transports/context.tsx
const TransportContext = createContext<Transport>()
export function TransportProvider({ mock, children }) {
  const t = useMemo(() => mock ? createMockTransport(scenario) : createHttpTransport(), [])
  // onEvent → sessionStore.applyEvent（批量：50ms 合并帧或 rAF 对齐，见 6.8）
  useEffect(() => () => t.dispose(), [t])
}

// transports/http.ts —— 实现要点
export function createHttpTransport(): Transport {
  // 1) SSE：fetch('/api/event?...&since='+lastSeq, {signal}) + ReadableStream 手解析
  //    （不用原生 EventSource：无法自定义重连参数与 header；解析器可引 eventsource-parser 4.1.0）
  // 2) 断线：指数退避重连（1s/2s/5s/10s 封顶），重连带最新 lastSeq → 服务端先回放再直播
  // 3) REST：fetch POST；sendMessage 三态结果原样返回
  // 4) dispose：AbortController.abort + 退订
}

// transports/mock.ts —— 实现要点
export function createMockTransport(scenario: 'normal'|'long-output'|'reject'|'error-finish'): Transport
// sendMessage → setTimeout 序列吐事件（复用 protocol 的工厂函数构造合法事件）
// permission.asked 后挂起，等 replyPermission 继续；speed 倍率；scenario 分支决定 finish 与工具形态
```

## 6.7 AI Elements 组件改造清单（copy-in 与适配）

| 取用组件 | 改造点 |
|---|---|
| conversation / message / prompt-input | 删 `"use client"`；数据源从 useChat 换 `useSessionItems()`（我们的 selector hook）；事件回调改派发 store 动作 |
| confirmation → ApprovalCard | 三按钮语义重映射（once/always/reject+feedback）；resolved 态自绘 |
| terminal | 接 progressBuf；自动滚底；16KB 行截头 |
| file-tree / code-block / diff | diff 数据来自 edit/write 工具 output（引擎侧生成 unified diff 字符串） |
| plan / task | 阶段四接 todo 事件扩展（预留：事件词表 declaration merging 加 'todo/write'——dsh 手法） |
| reasoning | 接 reasoning.delta/ended 折叠逻辑 |
| checkpoint | 阶段四接 checkpoint.created |
| 不取用 | sandbox/web-preview/canvas/audio 等重前端组件（按需后补） |

## 6.8 性能与体验优化

1. **流式渲染节流**：assistant.delta 高频到达 → 存入缓冲，`requestAnimationFrame` 对齐批量 flush 到 streamdown（避免每 token 全量重渲染）。
2. **虚拟化**：react-virtuoso followOutput + firstItemIndex 反向加载（历史回滚）；item 高度估算缓存。
3. **消息组件 memo**：UiItem 定稿后引用不再变 → React.memo + zustand 浅比较选择器；只有流式中的 item 重渲染。
4. **代码高亮**：Shiki 懒加载（动态 import）+ 语法按需注册；长输出截断渲染。
5. **图片/附件**：懒加载（loading="lazy"）。
6. **重连体验**：durable 回放期间顶部细进度条（"同步历史中 x/y"）。
7. **键盘**：Enter 发送/Shift+Enter 换行/Esc 关闭弹窗/Ctrl+K 会话搜索（阶段二后补）。

## 6.9 工程化配置

```ts
// vite.config.ts 要点
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src', '@spark/protocol': '../../packages/protocol/src' } },
  server: { proxy: { '/api': 'http://127.0.0.1:4318' } },   // dev 联调
  build: { target: 'es2022', sourcemap: true },
})
```

- 代码规范：ESLint(flat config, typescript-eslint strict) + Prettier + oxlint 可选；CI：typecheck+lint+build+test（vitest）。
- 测试：protocol 包类型级测试（expectTypeOf）+ applyEvent reducer 单测（21 种事件全覆盖——**这是前端最重要的测试资产**）；组件测试 vitest+testing-library（审批卡交互/流式缓冲）。
- 环境变量：`VITE_SPARK_MOCK=1`（Mock 模式）/`VITE_SPARK_API`（默认 127.0.0.1:4318）。

---

# 7. 服务端（apps/server）

```ts
const engine = await createEngine({ root: '~/.spark' })
const app = Fastify({ logger: true })
app.register(routes, { engine })        // REST 薄壳：zod 校验 → engine
app.register(sse, { engine })           // GET /api/event
if (staticDir) app.register(fastifyStatic, { root: staticDir })
await app.listen({ port: 4318, host: '127.0.0.1' })   // 仅本地（dsh 姿态：无 TLS/auth 刻意）
```

- SSE writer：`reply.raw.writeHead(200,…)` 后逐 `data: …\n\n`；15s 心跳 interval；连接关闭退订；**背压：raw.write()===false 时暂停订阅**（pi 思想）。
- 优雅退出：SIGINT → engine.shutdown()（flush 会话日志）→ close。

---

# 8. 分阶段路线图（任务清单级）

## 阶段一：骨架（协议先行）

- [ ] pnpm workspace + tsconfig.base + eslint/prettier
- [ ] protocol：§4 全部类型 + zod schema + jsonSchema 导出 + Transport 接口
- [ ] examples/mock-sessions：3 个预录场景
- [ ] web 空壳（Vite+React+Tailwind+shadcn init）+ MockTransport + TransportProvider
- [ ] server 空壳（Fastify hello + 静态托管）
- **验收**：web 用 Mock 跑通"发送→流式回复"假对话

## 阶段二：前端全量（对 Mock 开发）

- [ ] 路由与 AppShell（/welcome、/session/:id、Sidebar/StatusBar 布局）
- [ ] session-store + **applyEvent 21 种事件单测全覆盖**
- [ ] ChatView 虚拟化 + MessageItem/AssistantBlock/ReasoningCollapsible
- [ ] streamdown 流式渲染 + rAF 批量 flush
- [ ] ToolCard 三态 + Terminal/DiffViewer/CodeBlock 分发
- [ ] ApprovalCard（confirmation 改造）+ feedback 输入 + resolved 动效
- [ ] Composer 三模式（空闲/进行中三按钮/审批禁用）+ 三态反馈
- [ ] SessionSidebar 列表/分组/状态点 + 新建/切换
- [ ] 深色模式 + 空态/加载态/错误态/断线重连条 + BackBottom
- [ ] SettingsDialog（主题/默认 delivery）
- **验收**：全部 UI 交互在 mock 下无死角（含审批挂起/拒绝/error/long-output 场景）

## 阶段三：引擎跑通

- [ ] engine 骨架：EventBus/SessionStore(JSONL)/SessionManager
- [ ] LlmGateway 接 pi-ai + 事件映射 + models.json
- [ ] RunLoop（§5.4 全逻辑，含失败闭合与截断保护）
- [ ] ToolRegistry + pipeline + 四工具
- [ ] Permission 引擎 + 挂起表 + 规则文件
- [ ] server REST+SSE 全端点 + HttpTransport 切换（前端零改动）
- [ ] Projector（surface → modelContext）
- **验收**：真实模型完成"读文件→改文件→跑命令→汇报"全闭环；断线重连回放正确

## 阶段四：深度体验

- [ ] steer/queue 完整语义 + 唤醒合并
- [ ] compaction（自动阈值 + 手动 /compact）+ 轻提示 UI
- [ ] 会话恢复/列表/自动标题；fork 与树视图
- [ ] checkpoint（turn 边界 git 快照，Grok 三域简化两域）+ UI
- [ ] permission always 持久化 + 同批放行 + 规则管理 UI
- [ ] node:sqlite 会话索引（列表/搜索，不动 JSONL 权威）
- **验收**：长会话（>100 turn）稳定；压缩后上下文正确；规则跨会话生效

## 阶段五：产品化

- [ ] Electron 壳（sidecar vs 主进程嵌入评估；复用 HttpTransport）
- [ ] 沙箱：bash 默认审批；Windows AppContainer / macOS Seatbelt / Linux bwrap 评估
- [ ] MCP client（@modelcontextprotocol/sdk）
- [ ] 子代理（Task 工具 + parentSession 子会话）
- [ ] skills/插件（目录扫描 + declaration merging 扩展事件）
- **验收**：桌面安装包 + 首个外部 MCP 工具可用

---

# 9. 参考速查表（23 条）

| 问题 | 项目 | 文件 |
|---|---|---|
| run loop 写干净 | pi | packages/agent/src/agent-loop.ts |
| steering/排队语义 | opencode / Codex | core/src/session/input.ts + run-coordinator.ts / protocol/src/turn_input.rs |
| 事件要不要落盘 | opencode | schema/src/event.ts（durable 定义） |
| 模型历史投影 | dsh | packages/core/session/src/surface.ts + index.ts deriveMessages |
| 工具并行/串行门控 | Codex | core/src/tools/parallel.rs |
| 工具 schema-first 定义 | opencode | core/src/tool/tool.ts |
| 审批规则引擎 | opencode | core/src/permission.ts（evaluate/Deferred/always 级联） |
| 审批 fail-closed | dsh | packages/interaction/user-approval/src/index.ts decide() |
| 审批=学习机会 | Codex | protocol.rs ReviewDecision（ExecpolicyAmendment） |
| JSONL 会话树/分叉 | pi | coding-agent/src/core/session-manager.ts |
| compaction 设计 | pi / opencode | session-manager.ts / schema session-message.ts Compaction |
| resume 反向扫描 | Codex | rollout/src/reverse_jsonl_scanner.rs |
| SSE 端点实现 | opencode | server/src/handlers/event.ts |
| 背压处理 | pi / Grok | rpc-mode stdout 反压 / event_loop.rs biased select |
| checkpoint 多域捆绑 | Grok | xai-grok-workspace/src/session/checkpoint.rs |
| 工具输出限界溢写 | opencode | core/src/tool-output-store.ts |
| 中断语义（工具/流） | pi / Codex | handleRunFailure / parallel.rs AbortOnDrop |
| 前端事件投影/Agent Web UI | dsh | apps/web + packages/client |
| 单契约多客户端/进程内 SDK | opencode | protocol + sdk-next（伪 fetch 复用 client） |
| Claude Code 具体实现 | 泄露源码 | Wanfeng1028/claude-code-analysis（**只读不抄**） |
| 工作流/提示词设计 | claude-code | 官方仓库 plugins/ 16 个官方插件 |
| Grok 深度中文讲解 | 书 | https://zhanghandong.github.io/grok-build/ |
| 前端范式与许可证陷阱 | 前期会话 | 01-research-report.md §0 |

---

# 10. 风险与对策

| 风险 | 概率 | 对策 |
|---|---|---|
| pi 包 0.x breaking（团队主导无社区 PR） | 中 | 锁版本 + engine 只在 LlmGateway/RunLoop 两处 import；必要时 vendor |
| AI Elements 面向 Next.js | 中 | copy-in 删 "use client"+换数据源（§6.7 清单） |
| assistant-ui 0.x | 低 | 仅按需引入状态层，核心不依赖 |
| pi-agent-core 循环与事件模型不完全匹配 | 中 | 只用其 stream/工具原语，RunLoop 自写 |
| 本地安全（bash） | 高（产品层） | 阶段三默认全审批；阶段五沙箱；never 策略 dispatch 前判定 |
| 事件协议演进 | 中 | durable 带 version 预留；未知类型 fail-closed；ignorable 逃生 |
| 范围蔓延 | 高 | MVP=四工具+对话+审批；MCP/子代理/技能在阶段五后 |
| 长会话性能 | 中 | live delta 不落盘；虚拟化；rAF 节流；阶段四 SQLite 索引 |

---

# 11. 附录：术语表

| 术语 | 定义 | 来源 |
|---|---|---|
| turn | 一次用户输入引发的完整工作（可含多轮采样+工具） | Codex |
| step | turn 内一次"采样⇄工具"迭代 | dsh/opencode |
| steering | turn 进行中插入输入，下一 step 前生效 | Codex/pi/opencode |
| durable/live 事件 | 落盘可回放 / 仅内存直播的事件二分 | opencode |
| surface 事件 | 进模型历史的事件（Model-visible means logged） | dsh |
| rollout / 会话日志 | append-only 事件日志文件 | Codex |
| projection（投影） | 从事件流派生的读取模型（模型上下文/UI 状态） | opencode/dsh |
| compaction | 上下文压缩：摘要+保留锚点 | pi/opencode |
| checkpoint | 可回滚的多域状态快照 | Grok |
| fail-closed | 异常/缺失一律拒绝而非放行 | dsh |
| headless 引擎 | 无 UI 的核心进程，客户端经协议连接 | Codex/opencode |
| copy-in | 组件源码拷入自有仓库的分发模式（shadcn/AI Elements） | shadcn |

---

*方案完（v1.2）。开工顺序：阶段一任务清单自上而下；每次完成按版本记录表追加记录并 push。*
