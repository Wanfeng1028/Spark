# Spark — Agent 产品完整开发方案（实现级）

> 版本：v1.1（2026-08-22，详细版）
> 依据：`01-research-report.md` 六大项目源码级调研结论
> 原则：**能复用开源就不自己写；协议先行、前端先行；抄设计而不抄框架**
> 本文粒度：协议给完整 TS 类型、API 给请求/响应示例、引擎给伪代码级调用链、前端给状态机表格——可直接照此开工。

---

## 目录

- 1. 产品定位与总体架构
- 2. 技术栈定稿（逐项理由）
- 3. Monorepo 结构（文件级）
- 4. 协议设计（packages/protocol）
- 5. 引擎设计（packages/engine）
- 6. 前端设计（apps/web）
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

## 1.3 五条架构铁律（全部来自六家源码验证）

1. **引擎 headless，UI 是事件流的投影**（Codex/opencode）：任何客户端只通过协议与引擎对话，UI 状态 = `applyEvent(events)` 纯函数归约。
2. **durable 事件落盘，delta 只走内存**（opencode）："Stream fragments are live-only"。
3. **模型可见的必须被记录**（dsh）："Model-visible means logged"——模型上下文只能从 surface 事件投影重建。
4. **失败闭合**（pi）：任何异常路径都补齐事件序列，事件流永不出现悬空的 turn/tool。
5. **审批 fail-closed**（dsh）：答复缺失/超时/异常一律判拒绝，绝不放行。

---

# 2. 技术栈定稿

## 2.1 前端（apps/web）

| 层 | 选型 | 选型理由（一句话） | 备选 |
|---|---|---|---|
| 构建 | Vite 7 + React 19 + TS(strict) | 本地 SPA + Electron 友好，无 SSR 负担 | Next.js（若想走 AI Elements 铺好的路） |
| 样式 | Tailwind CSS v4 + shadcn/ui | copy-in 代码归我们，48 组件生态最大 | Semi（非 Tailwind 线） |
| AI 组件 | **Vercel AI Elements** | confirmation/terminal/file-tree/plan/task/checkpoint 就是 Agent 工作台零件库 | @ant-design/x（ThoughtChain） |
| 对话状态 | assistant-ui 可选 / 自管 zustand | headless primitives 省状态层代码；自管更干净 | — |
| 流式 Markdown | streamdown | 周下载 496 万事实标准，未闭合语法补全 | @ant-design/x-markdown（若换 Semi 线） |
| 长列表 | react-virtuoso | followOutput 是 chat 场景标配 | — |
| 状态 | zustand + TanStack Query | 事件流 store + 服务端状态分离 | — |
| 动效 | react-bits（可选） | 你 fork 过，按需 | — |

组件库链接备查：https://ui.shadcn.com · https://elements.ai-sdk.dev · https://www.assistant-ui.com · https://github.com/vercel/streamdown · 备选线 https://semi.design / https://x.ant.design / https://ui.lobehub.com

## 2.2 后端（packages/engine + apps/server）

| 层 | 选型 | 理由 | 备选 |
|---|---|---|---|
| 运行时 | Node 22+ / TS / ESM | 与前端同语言，协议类型直接共享 | — |
| LLM 抽象 | `@earendil-works/pi-ai` | 30+ provider 含本地 Ollama/vLLM；MIT；dsh 复用验证 | Vercel AI SDK v7（年 2 major） |
| Agent 循环 | `@earendil-works/pi-agent-core` | 有状态 Agent + subscribe 事件流，在其上包协议层 | 全自写（参照 pi 源码） |
| HTTP | Fastify | TS 友好、SSE 简单、生态成熟 | Hono（更轻） |
| 校验 | zod 4（内部）+ zod-to-json-schema（导出给前端/文档） | 单一 schema 双用途 | typebox（直接产 JSON Schema） |
| 持久化 | 自写 append-only JSONL（~50 行） | 六家全是自写；无事实标准库 | node:sqlite（阶段四索引） |
| MCP | @modelcontextprotocol/sdk（阶段五） | 官方 TS SDK | — |

## 2.3 工程组织

pnpm workspaces + turborepo（可选，任务编排）+ changesets（可选，发版）。

---

# 3. Monorepo 结构（文件级）

```
spark/
├── pnpm-workspace.yaml
├── package.json                    # private, scripts: dev/build/test/lint
├── tsconfig.base.json              # strict, ES2022, moduleResolution bundler
├── .gitignore
├── doc/
│   ├── 01-research-report.md
│   └── 02-development-plan.md
├── packages/
│   ├── protocol/                   # ★ 唯一合同，零运行时依赖（除 zod）
│   │   ├── package.json            # @spark/protocol
│   │   ├── src/
│   │   │   ├── ids.ts              # 品牌化 ID 类型
│   │   │   ├── primitives.ts       # Usage/ContentItem/Delivery 等基础类型
│   │   │   ├── events.ts           # SparkEventMap + SparkEvent 信封 + 扩展机制
│   │   │   ├── api.ts              # 请求/响应 DTO（每个端点的类型）
│   │   │   ├── transport.ts        # Transport 接口
│   │   │   ├── schema.ts           # zod schema（与上面类型同源）+ jsonSchema 导出
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   ├── engine/
│   │   ├── package.json            # @spark/engine, deps: protocol, pi-ai, pi-agent-core
│   │   └── src/
│   │       ├── index.ts            # createEngine(options) → Engine
│   │       ├── engine.ts           # Engine 门面：sessions/事件总线/生命周期
│   │       ├── bus.ts              # 事件总线（durable 广播 + live 直播）
│   │       ├── input-queue.ts      # 三通道输入队列 + 提交三态
│   │       ├── run-loop.ts         # turn 主循环
│   │       ├── llm-gateway.ts      # pi-ai 适配 + 事件映射
│   │       ├── tools/
│   │       │   ├── types.ts        # ToolDefinition 接口
│   │       │   ├── registry.ts     # 注册表 + scope
│   │       │   ├── pipeline.ts     # before→permission→execute→after
│   │       │   ├── read.ts / write.ts / edit.ts / bash.ts
│   │       │   └── output-store.ts # 超大输出截断/溢写
│   │       ├── permission/
│   │       │   ├── rules.ts        # 规则类型 + evaluate + 持久化
│   │       │   └── service.ts      # asked/resolved 流程 + 挂起 Promise 表
│   │       └── session/
│   │           ├── manager.ts      # SessionManager（create/resume/fork/list）
│   │           ├── store.ts        # JSONL 追加写（单写者队列 + fsync 选项）
│   │           ├── tree.ts         # id/parentId 树操作（leaf 指针）
│   │           ├── projector.ts    # surface 事件 → 模型上下文投影
│   │           └── compaction.ts   # 压缩（树上 entry）
│   └── shared/                     # （可选）前后端通用工具
├── apps/
│   ├── server/
│   │   ├── package.json            # @spark/server, deps: engine, fastify
│   │   └── src/
│   │       ├── index.ts            # createServer({engine, staticDir?})
│   │       ├── routes/             # sessions/messages/permissions
│   │       ├── sse.ts              # /api/event SSE writer + 心跳
│   │       └── static.ts           # 托管 web 构建产物
│   ├── web/
│   │   ├── package.json            # @spark/web
│   │   ├── vite.config.ts
│   │   ├── tailwind.config / css/
│   │   ├── components/ui/          # shadcn + AI Elements copy-in 产物
│   │   └── src/
│   │       ├── main.tsx / App.tsx
│   │       ├── transports/
│   │       │   ├── http.ts         # HttpTransport（fetch + EventSource）
│   │       │   └── mock.ts         # MockTransport（回放预录事件）
│   │       ├── stores/
│   │       │   ├── session-store.ts    # zustand + applyEvent reducer
│   │       │   └── connection-store.ts # transport 连接状态
│   │       ├── components/
│   │       │   ├── chat/           # ChatView/MessageItem/ToolCard/ApprovalCard...
│   │       │   ├── sidebar/        # SessionList
│   │       │   └── composer/       # PromptInput（含 steer 提示）
│   │       └── lib/
│   └── desktop/                    # （阶段五）Electron 壳
└── examples/
    └── mock-sessions/              # 预录 JSONL（MockTransport 素材）
```

---

# 4. 协议设计（packages/protocol）

## 4.1 品牌化 ID

```ts
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }
export type SessionId  = Brand<string, 'SessionId'>   // ses_<uuid>
export type TurnId     = Brand<string, 'TurnId'>      // trn_<ulid>
export type EventId    = Brand<string, 'EventId'>     // evt_<ulid>
export type CallId     = Brand<string, 'CallId'>      // cal_<ulid>
export type RequestId  = Brand<string, 'RequestId'>   // req_<ulid>
export type CheckpointId = Brand<string, 'Ckp'>       // ckp_<ulid>
```

## 4.2 基础类型

```ts
/** token 用量。不变式（抄 opencode Usage 契约）：
 *  nonCachedInput + cacheRead + cacheWrite = inputTokens（inclusive totals） */
export interface Usage {
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  cacheRead?: number
  cacheWrite?: number
  costUsd?: number
}

export type ContentItem =
  | { type: 'text';       text: string }
  | { type: 'reasoning';  text: string }
  | { type: 'toolCall';   callId: CallId; name: string; input: unknown }
  | { type: 'toolResult'; callId: CallId; output: unknown; isError: boolean }

/** 消息投递通道（Codex TurnInputMode + opencode delivery 合并语义） */
export type Delivery =
  | 'now'    // 引擎空闲 → 立即开 turn
  | 'steer'  // turn 进行中 → 下一 step 前注入当前 turn
  | 'queue'  // turn 进行中 → 当前 turn 完成后作为下一个 turn 的输入

export type TurnFinish =
  | 'stop'                 // 模型自然结束
  | 'length'               // token 上限
  | 'aborted'              // 用户中断
  | 'permission-rejected'  // 审批被拒导致停止
  | 'error'

export type ToolError = { code: string; message: string }
```

## 4.3 事件词表（初版 21 种，merge-extensible）

设计来源标注在每个事件后。

```ts
/** 事件词表。接口可 declaration merging 扩展（dsh 手法）——插件加事件不用 bump 版本。 */
export interface SparkEventMap {
  // ── 会话生命周期 ───────────────────────────────────────────
  'session.created':    { title?: string; cwd: string; model: string }
  'session.resumed':    { fromSeq: number }

  // ── turn ───────────────────────────────────────────────────
  'turn.started':       { turnId: TurnId; delivery: Delivery; userEventId: EventId }
  'turn.completed':     { turnId: TurnId; finish: TurnFinish; usage?: Usage }

  // ── 输入/输出（surface = 进模型历史，dsh 纪律）─────────────
  'user.message':       { text: string; attachments?: string[] }          // durable+surface
  'assistant.delta':    { turnId: TurnId; text: string }                  // live-only
  'assistant.message':  { turnId: TurnId; content: ContentItem[]; usage?: Usage } // durable+surface
  'reasoning.delta':    { turnId: TurnId; text: string }                  // live-only
  'reasoning.ended':    { turnId: TurnId; text: string }                  // durable

  // ── 工具（状态机：started → [progress] → completed）────────
  'tool.started':       { turnId: TurnId; callId: CallId; name: string; input: unknown }
  'tool.progress':      { turnId: TurnId; callId: CallId; chunk: string }  // live-only，引擎侧限流
  'tool.completed':     { turnId: TurnId; callId: CallId;
                          output: unknown; isError: boolean; durationMs: number }

  // ── 审批（log-only，永不进模型历史——dsh 纪律）──────────────
  'permission.asked':    { requestId: RequestId; callId: CallId; action: string;
                           resource: string; reason: string; detail?: unknown }
  'permission.resolved': { requestId: RequestId; reply: PermissionReply; feedback?: string }

  // ── 上下文管理 ─────────────────────────────────────────────
  'compaction.started':   { turnId?: TurnId }
  'compaction.completed': { summary: string; keptFromSeq: number; tokensBefore: number }
  'checkpoint.created':   { checkpointId: CheckpointId; files: string[]; turnId: TurnId }

  // ── 系统 ───────────────────────────────────────────────────
  'error':              { scope: 'engine'|'llm'|'tool'|'io'; message: string; fatal?: boolean }
  'session.title':      { title: string }                                 // 自动起标题
}

export type PermissionReply = 'once' | 'always' | 'reject'
```

## 4.4 事件信封与 durable/live

```ts
export type SurfaceEventType = 'user.message' | 'assistant.message'
export type LiveOnlyEventType = 'assistant.delta' | 'reasoning.delta' | 'tool.progress'

export interface SparkEventEnvelope<T extends SparkEventType = SparkEventType> {
  id: EventId
  type: T
  sessionId: SessionId
  /** durable 事件的单调序号（== 该会话日志行号）。live 事件无 seq。 */
  seq?: number
  time: number                     // epoch ms
  data: SparkEventMap[T]
  /** 编译期条件强制（dsh）：surface 事件必须携带投影元数据 */
} & (T extends SurfaceEventType ? { surface: true } : unknown)

export function isDurable<T extends SparkEventType>(e: SparkEventEnvelope<T>): boolean {
  return !LIVE_ONLY.has(e.type)
}
```

**durable/live 规则表**（写入 protocol README，评审时核对）：

| 事件 | durable（落盘/可回放/计 seq） | surface（进模型历史） |
|---|---|---|
| session.created / resumed / title | ✅ | ❌ |
| turn.started / completed | ✅ | ❌ |
| user.message | ✅ | ✅ |
| assistant.message / reasoning.ended | ✅ | ✅（reasoning 按 provider 配置） |
| assistant.delta / reasoning.delta / tool.progress | ❌（live-only） | — |
| tool.started / completed | ✅ | ❌（结果经 assistant.message 的 toolResult 回填） |
| permission.asked / resolved | ✅（审计） | ❌（永不进模型历史） |
| compaction.* / checkpoint.created | ✅ | compaction 影响 projection |
| error | ✅ | ❌ |

**读端 fail-closed**（dsh）：从磁盘重建会话时，遇到未知 `type` 且事件无 `ignorable: true` 标记 → 拒绝加载该会话并报错（宁可拒绝也不能静默跳过重建出错误状态）。

## 4.5 HTTP API 规格

统一前缀 `/api`，JSON 请求/响应，错误形如 `{ code, message }`。

| 方法 | 路径 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| POST | /api/sessions | `{ title?, model?, cwd? }` | `SessionDto` | 创建 |
| GET | /api/sessions | `?limit&cursor` | `SessionDto[]` | 列表（新→旧） |
| GET | /api/sessions/:id | — | `SessionDto`（含 durable 事件回放 `events: SparkEvent[]`） | 详情+回放 |
| POST | /api/sessions/:id/messages | `{ text, delivery?: 'now'\|'steer'\|'queue' }` | `{ result: 'started'\|'steered'\|'queued', turnId? }` | **提交三态（Codex 语义）** |
| POST | /api/sessions/:id/interrupt | — | `{ ok: true }` | 中断当前 turn |
| POST | /api/permissions/:requestId | `{ reply: 'once'\|'always'\|'reject', feedback? }` | `{ ok: true }` | 审批答复 |
| GET | /api/sessions/:id/tree | — | `TreeNode[]` | 分叉树（阶段四） |
| POST | /api/sessions/:id/fork | `{ fromEventId }` | `SessionDto` | 分叉（阶段四） |
| GET | /api/event | `?sessionId&since` | **SSE 流** | 全局事件流 |

请求示例：

```jsonc
POST /api/sessions/ses_01J.../messages
{ "text": "帮我看下 src/index.ts 报错", "delivery": "steer" }
→ 200 { "result": "steered", "turnId": "trn_01J..." }
```

## 4.6 SSE 帧格式

```
GET /api/event?sessionId=ses_...&since=42        HTTP/1.1
→ Content-Type: text/event-stream
→ Cache-Control: no-cache, no-transform
→ X-Accel-Buffering: no

: heartbeat\n\n                                    ← 每 15s（opencode 同款）
event: message\ndata: {"id":"evt_...","type":"assistant.delta","sessionId":"ses_...","time":1760000000000,"data":{"turnId":"trn_...","text":"你好"}}\n\n
...
```

- `since` = durable seq 水位：连接建立时先按序补发该会话 `seq > since` 的 durable 事件（回放），再进入直播——**断线重连语义**。
- 事件不按 SSE event-name 分型，统一 `event: message`，type 在 payload 里（简化客户端分发）。

## 4.7 Transport 接口与 MockTransport

```ts
export interface Transport {
  /** 订阅事件（含连接建立时的 durable 回放）。返回退订函数 */
  onEvent(handler: (e: SparkEventEnvelope) => void): () => void
  /** 发送消息。返回提交三态 */
  sendMessage(text: string, opts?: { delivery?: Delivery; attachments?: string[] }):
    Promise<{ result: 'started' | 'steered' | 'queued'; turnId?: TurnId }>
  interrupt(): Promise<void>
  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  listSessions(): Promise<SessionDto[]>
  createSession(opts?: { title?: string }): Promise<SessionDto>
  dispose(): void
}
```

**MockTransport 行为规格**（前端先行的关键）：
- 构造入参：预录事件数组（`examples/mock-sessions/*.json`，可用真实会话导出）或脚本模式；
- `sendMessage` 触发脚本化回放：按延迟序列吐 `turn.started → assistant.delta*(30~80ms/次) → tool.started → progress* → completed → assistant.message → turn.completed`；
- 首个需要审批的 mock 会话吐 `permission.asked`，等待 `replyPermission` 后继续（模拟挂起）；
- 支持 `delivery: 'steer'` 演示（回放中插入 delta 后紧跟注入的 user.message）；
- 提供 `speed` 与 `scenario` 开关（正常/超长工具输出/审批拒绝/error finish）。

---

# 5. 引擎设计（packages/engine）

## 5.1 Engine 门面

```ts
export interface Engine {
  createSession(opts): Promise<SessionHandle>
  resumeSession(id: SessionId): Promise<SessionHandle>
  listSessions(): Promise<SessionMeta[]>
  subscribe(handler: (e: SparkEventEnvelope) => void, filter?: { sessionId?: SessionId }): () => void
  shutdown(): Promise<void>      // flush 全部会话日志
}
export interface SessionHandle {
  readonly id: SessionId
  readonly meta: SessionMeta
  send(text: string, delivery?: Delivery): Promise<SubmitResult>   // 三态
  interrupt(): Promise<void>
  replyPermission(reqId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  forkFrom(eventId: EventId): Promise<SessionHandle>               // 阶段四
}
```

## 5.2 事件总线（bus.ts）

- **durable 路径**：`emit(event)` → 校验（zod）→ 赋 seq → SessionStore.append（单写者队列，可选 fsync）→ 广播订阅者。
- **live 路径**：`emitLive(event)` → 校验 → 直接广播（不落盘不计数）。
- 订阅者异常隔离（try/catch 逐个，dsh：观察者异常不伤主流程，记 warn）。

## 5.3 输入队列（input-queue.ts）—— 三通道

```
send(text, delivery='now'):
  delivery=now   → 队列空闲？ → 是：占锁、返回 {result:'started'}
                          → 否：降级策略：steer（若当前 turn 可插话）否则 queue
  delivery=steer → 当前有活跃 turn？ → 是：入 steerQueue（下一 step 前注入），返回 {result:'steered'}
                             → 否：入主队列，返回 {result:'started'}
  delivery=queue → 入 queue，活跃 turn 结束后依序消费，返回 {result:'queued'}
唤醒合并（opencode pendingWake）：runLoop 结束前检查 steer/queue 积压，有则续跑不退出
```

## 5.4 Run Loop（run-loop.ts）

```
runLoop(session):                       // 每会话一个 async 执行体（per-key 串行）
  while (queue 有积压 || pendingWake):
    input = queue.shift()
    emit turn.started {turnId, delivery, userEventId}
    step = 0
    loop:                                             // 采样⇄工具内循环
      step += 1
      // ① 注入 steer（pi：steering 在 assistant 响应前生效）
      while (steerQueue.length) 处理为 user.message（surface）
      // ② 组装上下文（StepContext 快照语义，Codex）
      messages = Projector.modelContext(session.tree.leaf)   // surface 投影 + 最新 compaction 截断
      tools = ToolRegistry.materialize(agent)               // spec 清单（zod→json schema）
      // ③ 流式请求（pi-ai）
      stream = LlmGateway.stream(model, messages, tools)
      content: ContentItem[] = []
      for await (ev of stream):
        text_delta    → emitLive assistant.delta；累积
        thinking_delta→ emitLive reasoning.delta；累积
        toolcall_end  → content.push({type:'toolCall',...})
        done/error    → break
      emit assistant.message {content, usage}               // durable+surface
      // ④ 截断保护（pi）：stopReason==='length' 时截断的 toolCall 全部不执行，
      //    逐个补 tool.started/completed{isError:true, output:'truncated'} —— 上下文永不悬挂
      // ⑤ 执行工具
      toolCalls = content.filter(toolCall)
      if (toolCalls.length === 0 && steerQueue 空) break
      results = await ToolPipeline.runAll(toolCalls, {turnId})    // 见 5.5
      content.push(...results.map(r => ({type:'toolResult', ...r})))
      // 注意：toolResult 并入下一次采样的 messages（经 projector 从事件重建，非内存拼接）
      emit assistant.message {content: results 的 toolResult}     // durable（单独成条，便于投影）
    emit turn.completed {turnId, finish, usage 累计}
  // 失败闭合（pi handleRunFailure）：任何 throw 都被最外层 catch，
  // 补 emit turn.completed{finish:'error'} 后继续消费队列
```

## 5.5 工具系统（tools/）

```ts
export interface ToolDefinition<I = unknown> {
  name: string                                  // 'read' | 'write' | 'edit' | 'bash'
  description: string
  inputSchema: z.ZodType<I>                     // zod → jsonSchema 给模型
  /** 权限动作（默认= name）；resource 由调用现场计算 */
  permission?: { action: string; resourceOf: (input: I) => string }
  /** 并行性：同批多个调用是否可并发（Codex supports_parallel_tool_calls） */
  parallelizable: boolean                       // read=true, bash=false
  execute(ctx: ToolContext, input: I): Promise<ToolOutput>
}
export interface ToolContext {
  sessionId: SessionId; turnId: TurnId; callId: CallId
  signal: AbortSignal                           // interrupt 级联
  onProgress: (chunk: string) => void           // → tool.progress（引擎侧 200ms 节流）
  cwd: string
}
export interface ToolOutput { output: unknown; isError: boolean; display?: string }
```

**执行管线（pipeline.ts）**：

```
runAll(calls):
  分组：serial 工具（bash/edit/write）逐个独占；parallel 工具（read）Promise.all
  每个调用：
    emit tool.started {callId, name, input}
    ① beforeToolCall hook（插件点）
    ② permission.assert(action, resource):
         allow → 继续
         ask   → emit permission.asked → 挂起 Promise（5min 超时 fail-closed 判 reject）
         deny  → 直接 completed{isError:true, output:'permission denied'}
    ③ execute（AbortSignal 级联 interrupt）
    ④ afterToolCall hook（可改写 output）
    ⑤ OutputStore.bound(output)：>32KB 截断 + 溢写 ~/.spark/tool-outputs/<callId>，
       消息里留路径（opencode ToolOutputStore）
    emit tool.completed {callId, output, isError, durationMs}
  中断时（dsh）：已启动的跑到静默；未启动的补 started+completed{isError, output:'aborted'} 事件对
```

**四工具 schema（初版）**：

| 工具 | input | 说明 |
|---|---|---|
| read | `{ path, offset?, limit? }` | 读文件（默认 2000 行/次） |
| write | `{ path, content }` | 整文件写 |
| edit | `{ path, oldString, newString, replaceAll? }` | 精确替换（oldString 唯一性校验，Claude Code 同款语义） |
| bash | `{ command, timeoutMs?, cwd? }` | 每次独立 shell（v1 不做常驻会话），输出 16KB/帧截断（Grok） |

## 5.6 审批（permission/）

```ts
export interface PermissionRule { action: string; resource: string; effect: 'allow'|'deny'|'ask' }
// wildcard 匹配（* 与 **），findLast 胜出，无命中默认 'ask'（opencode evaluate 原样）
export function evaluate(action: string, resource: string, ...rulesets: PermissionRule[][]): Effect
```

- 规则来源优先级：会话内临时 > 项目级（`.spark/permissions.json`）> 用户级（`~/.spark/permissions.json`）。
- `always` → 持久化到对应层级 + **自动放行同批同 action/resource 的 pending 请求**（opencode）。
- `reject + feedback` → feedback 注入为 user.message（surface）回喂模型（opencode CorrectedError 思想）。
- **fail-closed**（dsh）：超时（默认 5min）/答非所问/内部异常 → 一律按 reject 处理并发 `permission.resolved{reply:'reject'}`。
- v2 演进预留：asked 事件携带 `proposedRule`（建议规则），批准 always 时顺带落库（Codex ApprovedExecpolicyAmendment）。

## 5.7 会话持久化（session/）

**文件格式**（`~/.spark/sessions/--<cwd munged>--/<ses_id>.jsonl`）：

```jsonc
{"kind":"header","version":1,"id":"ses_01J8...","createdAt":1760000000000,"cwd":"E:\\code\\...","parentSession":null,"model":"deepseek-chat"}
{"id":"evt_01...","type":"session.created","sessionId":"ses_...","seq":0,"time":1760000000001,"data":{...}}
{"id":"evt_02...","type":"user.message","sessionId":"ses_...","seq":1,"time":...,"data":{"text":"..."},"surface":true,"parentId":"evt_01..."}
{"id":"evt_03...","type":"assistant.message",...,"seq":2,...,"surface":true,"parentId":"evt_02..."}
{"id":"evt_04...","type":"compaction.completed","sessionId":"ses_...","seq":9,"data":{"summary":"...","keptFromSeq":1,"tokensBefore":98000},"parentId":"evt_08..."}
```

- 每行 = durable 事件 + `parentId`（**树结构，pi**：分叉只移 leaf 指针，旧行不改）。
- 单写者：SessionStore 内部 mpsc 队列串行 append；`flush()` 带 fsync（会话切换/退出时）。
- **Projector（projector.ts）**：`modelContext(leafId)` = leaf→root 回溯 → 取路径上最新 `compaction.completed` → `[compaction 摘要转 system 注入] + keptFromSeq 之后的 surface 事件投影为 messages`（pi buildContextEntries + dsh deriveMessages 合体）。
- resume：全量读文件（v1 文件小；v2 若需要加尾部索引/反向扫描——Codex ReverseJsonlScanner 思路）。
- fork（阶段四）：新文件 header 记 `parentSession` + 复制到 `fromEventId` 的事件（或引用+seed 标记，dsh end-seed）。

## 5.8 LLM 适配（llm-gateway.ts）

pi-agent-core 事件 → Spark 事件映射表：

| pi AgentEvent / AssistantMessageEvent | Spark 事件 | 备注 |
|---|---|---|
| message_update(text_delta) | assistant.delta (live) | |
| message_update(thinking_delta) | reasoning.delta (live) | |
| message_end(assistant) | assistant.message (durable+surface) | content 映射：text/toolCall |
| tool_execution_start | tool.started | |
| tool_execution_update | tool.progress (live, 节流) | |
| tool_execution_end | tool.completed | |
| turn_end | （由 runLoop 发）turn.completed | usage 汇总 |
| stopReason: 'error'/'aborted' | turn.completed{finish:'error'/'aborted'} | **不抛异常，错误进流（pi 契约）** |

- 模型解析：pi-ai `createModels()` + 配置文件 `~/.spark/models.json`（provider apiKey/env/默认模型）。
- 重试：provider 可重试错误（429/5xx）指数退避 3 次（pi-ai 内置 normal 档直接用）。

---

# 6. 前端设计（apps/web）

## 6.1 组件树

```
<App>
├── <Sidebar>                                   # 会话列表（新建/搜索/切换）
│   └── <SessionList> → <SessionItem>（标题/时间/状态点）
├── <main>：<ChatView sessionId>                 # 虚拟化列表（react-virtuoso）
│   ├── <MessageItem kind=user>                 #   用户消息（右对齐气泡）
│   ├── <AssistantBlock>                        #   assistant.message 展开的序列
│   │   ├── <ReasoningCollapsible>              #   reasoning.ended（折叠，流式时展开）
│   │   ├── <Markdown>{streamdown}</Markdown>   #   text 部分流式渲染
│   │   └── <ToolCard>                          #   每个 toolCall 一张卡
│   │       ├── 状态徽标（pending→running→completed/error）
│   │       ├── bash → <Terminal>（tool.progress 追加，自动滚底）
│   │       ├── edit/write → <DiffViewer>（output 里的 diff）
│   │       └── read → <CodeBlock>（行数/路径）
│   ├── <ApprovalCard>                          #   permission.asked → AI Elements confirmation
│   │   └── [允许一次] [总是允许] [拒绝(+反馈输入)]
│   └── <Composer>                              # 输入区
│       ├── <PromptInput>（多行/附件/Enter 发送）
│       └── turn 进行中 → 显示 [插话(steer)] [排队(queue)] [停止(interrupt)] 三按钮
└── <StatusBar>（模型/连接状态/seq 水位）
```

## 6.2 sessionStore（zustand）—— UI 是事件流的投影

```ts
interface UiItemBase { eventId: EventId; parentId?: EventId }
type UiItem =
  | { kind: 'user';      text: string } & UiItemBase
  | { kind: 'assistant'; content: ContentItem[]; streaming?: { textBuf: string } } & UiItemBase
  | { kind: 'reasoning'; text: string; streaming?: boolean } & UiItemBase
  | { kind: 'tool';      callId; name; input; status: 'running'|'completed'|'error';
                         progressBuf: string; output?: unknown } & UiItemBase
  | { kind: 'approval';  requestId; action; resource; status: 'pending'|'resolved' } & UiItemBase

interface SessionState {
  meta: SessionMeta
  items: UiItem[]
  activeTurn: { turnId: TurnId; status: 'running' } | null
}
```

**applyEvent 处理表**（reducer 纯函数，事件→状态变更的唯一路径）：

| 事件 | 处理 |
|---|---|
| session.created | 初始化 state |
| turn.started | activeTurn = running；composer 切"进行中"模式 |
| user.message | push {kind:'user'} |
| assistant.delta | 最后一个 assistant item 的 streaming.textBuf += text；触发流式 MD 重渲 |
| assistant.message | 定稿：content 落地，清 streaming；按 content 顺序生成子 UiItem（text/reasoning/toolCall） |
| reasoning.delta / reasoning.ended | 同 assistant 模式 |
| tool.started | push {kind:'tool', status:'running'} |
| tool.progress | progressBuf += chunk（Terminal 组件消费，超长自动截头） |
| tool.completed | status 定稿 + output |
| permission.asked | push {kind:'approval', status:'pending'} |
| permission.resolved | 对应 approval 置 resolved（显示结果 2s 后收起） |
| turn.completed | activeTurn = null；finish==='error' 时顶部条提示 |
| error | toast；fatal → 全屏错误态 |

## 6.3 样式规范

- Tailwind v4 + shadcn 默认 token；自定义品牌色只动 CSS variables（`--primary` 等），**不做蓝紫渐变玻璃**（默认黑白中性极简即目标风格）。
- AI Elements copy-in 组件落在 `components/ui/`，按需改造：删除 `"use client"`、把 `useChat` 依赖换成 `useSparkSession()`（我们的 store hook）。
- 深色模式：`next-themes` 的 Vite 等价物（自写 20 行 ThemeProvider，localStorage + class 切换）。

## 6.4 HttpTransport 实现要点

- SSE：原生 `EventSource('/api/event?sessionId=...&since=...')`；断线自动重连时用当前 seq 水位作 `since`（EventSource 原生重连不带参数 → 用 fetch + ReadableStream 手写解析更可控，`eventsource-parser` 4.1.0 可选）。
- 其余 REST 用 fetch；`sendMessage` 三态结果驱动 composer 提示（steered → "已注入当前轮"）。

---

# 7. 服务端（apps/server）

```ts
// 生命周期
const engine = await createEngine({ root: '~/.spark' })
const app = Fastify({ logger: true })
app.register(routes, { engine })        // REST 薄壳：参数校验(zod)→ engine 调用
app.register(sse, { engine })           // GET /api/event
if (staticDir) app.register(fastifyStatic, { root: staticDir })  // 生产模式托管 web
await app.listen({ port: 4318, host: '127.0.0.1' })              // 仅本地（dsh 姿态）
```

- SSE writer：`reply.raw.writeHead(200, {...})` 后 `reply.raw.write(\`data: ...\n\n\`)`；15s 心跳 interval；连接关闭时退订 engine；背压：`raw.write() === false` 时暂停订阅（pi：stdout 背压反压到 agent 的同款思想）。
- 优雅退出：SIGINT → engine.shutdown()（flush 所有会话日志）→ close。

---

# 8. 分阶段路线图（任务清单级）

## 阶段一：骨架（协议先行）

- [ ] pnpm workspace + tsconfig.base + eslint/prettier
- [ ] packages/protocol：§4 全部类型 + zod schema + jsonSchema 导出 + Transport 接口
- [ ] examples/mock-sessions：3 个预录场景（普通对话/带工具/带审批）
- [ ] apps/web 空壳（Vite+React+Tailwind+shadcn init）+ MockTransport
- [ ] apps/server 空壳（Fastify hello + 静态托管）
- **验收**：web 用 MockTransport 跑通"发送→流式回复"假对话

## 阶段二：前端全量（对 Mock 开发）

- [ ] ChatView 虚拟化列表 + MessageItem/AssistantBlock/ReasoningCollapsible
- [ ] streamdown 流式渲染 + Markdown/代码高亮
- [ ] ToolCard 三态 + Terminal/DiffViewer/CodeBlock
- [ ] ApprovalCard（confirmation 组件改造）+ 三键交互
- [ ] Composer：三按钮（steer/queue/stop）+ 三态反馈
- [ ] Sidebar 会话列表 + sessionStore + applyEvent 全表实现
- [ ] 深色模式 + 空态/错误态
- **验收**：全部 UI 交互在 mock 下无死角（含审批挂起/拒绝/error finish 场景）

## 阶段三：引擎跑通

- [ ] engine 骨架：EventBus/SessionStore(JSONL)/SessionManager
- [ ] LlmGateway 接 pi-ai + 事件映射表 + 模型配置文件
- [ ] RunLoop（§5.4 全逻辑，含失败闭合与截断保护）
- [ ] ToolRegistry + pipeline + 四工具
- [ ] Permission 引擎 + 挂起表 + 规则文件读写
- [ ] server REST+SSE 全端点 + HttpTransport（前端切换）
- [ ] Projector（surface → modelContext）
- **验收**：真实模型完成"读文件→改文件→跑命令→汇报"全闭环；断线重连回放正确

## 阶段四：深度体验

- [ ] steer/queue 完整语义 + 唤醒合并
- [ ] compaction（自动阈值 + 手动 /compact）
- [ ] 会话恢复/列表/自动标题；fork 与树视图
- [ ] checkpoint（turn 边界 git 快照，Grok 三域简化为 git+FS 两域）
- [ ] permission always 持久化 + 同批放行；规则管理 UI
- [ ] node:sqlite 会话索引（列表/搜索加速，不动 JSONL 权威）
- **验收**：长会话（>100 turn）稳定；压缩后上下文正确；审批规则跨会话生效

## 阶段五：产品化

- [ ] Electron 壳（复用 HttpTransport；engine 以 sidecar/主进程嵌入两种模式评估）
- [ ] 沙箱：bash 审批默认开；Windows AppContainer / macOS Seatbelt / Linux bwrap 评估
- [ ] MCP client 接入（@modelcontextprotocol/sdk）
- [ ] 子代理（Task 工具 + 子会话 parentSession）
- [ ] skills/插件（skills 目录扫描 + 插件 declaration merging 扩展事件）
- **验收**：桌面安装包 + 首个外部 MCP 工具可用

---

# 9. 参考速查表（遇到问题查哪家）

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
| 前端事件投影 | dsh | apps/web（唯一开源 Agent Web UI） |
| Agent Web UI 组织 | dsh | apps/web + packages/client |
| Claude Code 具体实现 | 泄露源码 | Wanfeng1028/claude-code-analysis（**只读不抄**） |
| 工作流/提示词设计 | claude-code | 官方仓库 plugins/ 16 个官方插件 |
| Grok 深度中文讲解 | 书 | https://zhanghandong.github.io/grok-build/ |

---

# 10. 风险与对策

| 风险 | 概率 | 对策 |
|---|---|---|
| pi 包 0.x breaking（团队主导无社区 PR） | 中 | 锁版本 + engine 层隔离依赖点（只 LlmGateway/RunLoop 两处 import）；必要时 vendor（包小） |
| AI Elements 面向 Next.js | 中 | copy-in 源码删 "use client"、换数据源 hook；一次性适配 |
| assistant-ui 0.x API 变动 | 低 | 仅在需要其状态层时引入；核心不依赖 |
| pi-agent-core 循环与我们事件模型不完全匹配 | 中 | 只用其 stream/工具执行原语，RunLoop 自写（方案已按自写设计） |
| 本地安全（bash 工具） | 高（产品层面） | 阶段三默认全审批；阶段五沙箱；never 策略在 dispatch 前判定（dsh） |
| 事件协议演进 | 中 | durable 事件带 version 字段预留；未知类型 fail-closed；ignorable 标记逃生 |
| 范围蔓延 | 高 | MVP 边界=四工具+对话+审批；MCP/子代理/技能全在阶段五后 |
| 长会话性能 | 中 | live delta 不落盘；列表虚拟化；阶段四 SQLite 索引 |

---

# 11. 附录：术语表

| 术语 | 定义 | 来源 |
|---|---|---|
| turn | 一次用户输入引发的完整工作（可含多轮模型采样+工具） | Codex |
| step | turn 内一次"采样⇄工具"迭代 | dsh/opencode |
| steering | turn 进行中插入用户输入，下一 step 前生效 | Codex/pi/opencode |
| durable/live 事件 | 落盘可回放 / 仅内存直播的事件二分 | opencode |
| surface 事件 | 进模型历史的事件（Model-visible means logged） | dsh |
| rollout / 会话日志 | append-only 事件日志文件 | Codex |
| projection（投影） | 从事件流派生的读取模型（模型上下文/UI 状态） | opencode/dsh |
| compaction | 上下文压缩：摘要 + 保留锚点 | pi/opencode |
| checkpoint | 可回滚的多域状态快照 | Grok |
| fail-closed | 异常/缺失一律拒绝而非放行 | dsh |
| headless 引擎 | 无 UI 的核心进程，客户端经协议连接 | Codex/opencode |

---

*方案完。开工顺序：阶段一任务清单自上而下。*
