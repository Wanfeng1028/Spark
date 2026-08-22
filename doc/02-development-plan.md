# Spark — Agent 产品完整开发方案（实现级）

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-08-22 | AI 编写：ZCode CLI · **GLM-5.3**（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：技术栈定稿+协议/引擎/前端概要+五阶段路线图 |
| v1.1 | 2026-08-22 | 同上 | 扩至实现级：协议完整 TS 类型、引擎伪代码、会话文件格式、五阶段任务清单 |
| v1.2 | 2026-08-22 | 同上 | 前端章节扩为完整规格（信息架构/路由/逐屏视图规格/逐组件 props/状态层代码结构/样式系统/Transport 实现/AI Elements 改造清单/性能优化/工程化配置）；新增版本记录表 |
| v1.3 | 2026-08-22 | 同上 | **后端章节扩为完整规格**：新增引擎模块总览与依赖图、配置体系（目录/文件 schema）、事件总线实现规格（顺序保证/背压/订阅隔离）、输入队列状态机、Run Loop 函数签名级伪代码、工具系统全规格（注册表/materialize/管线算法/四工具 schema 与错误码表/输出溢写）、审批时序图与规则文件格式、会话持久化算法（投影五步/压缩流程/恢复/分叉/坏行策略）、LLM 网关与重试、错误分类与可观测性、服务端完整规格（路由 zod/SSE 实现代码/错误映射表/优雅退出序列）；版本记录模型信息补全 GLM-5.3 |
| v1.4 | 2026-08-22 | 同上 | §2.1.1 新增**前端组件库清单表（库/定位/链接/看点）**——选型时直接点链接预览长相用（此前仅在会话中给出，未写入文档，属遗漏） |

> 依据：`01-research-report.md` 六大项目源码级调研结论。
> 原则：**能复用开源就不自己写；协议先行、前端先行；抄设计而不抄框架**。

---

## 目录

- 1. 产品定位与总体架构
- 2. 技术栈定稿
- 3. Monorepo 结构（文件级）
- 4. 协议设计（packages/protocol）
- 5. **引擎设计（packages/engine）——完整规格**
- 6. 前端设计（apps/web）——完整规格
- 7. **服务端（apps/server）——完整规格**
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

### 2.1.1 前端组件库清单（含链接，预览长相用）

> 完整版本数据/组件枚举/许可细节见 `01-research-report.md` §4.1；本表用于选型时快速对比与点开预览。

| 库 | 定位 | 链接 | 看点 |
|---|---|---|---|
| **shadcn/ui** | 基础组件底座（Tailwind） | https://ui.shadcn.com | 默认黑白中性极简风，不是蓝玻璃那种 AI 味；copy-in 模式代码全归你 |
| **Vercel AI Elements** | Agent 工作台专用组件，48 个 | https://elements.ai-sdk.dev （源码 https://github.com/vercel/ai-elements） | confirmation（审批卡）、terminal、sandbox、file-tree、plan/task、checkpoint、tool——就是 Claude-Code 式界面的零件库 |
| **assistant-ui** | 对话 UI 状态层 + 预制组件 | https://www.assistant-ui.com | headless primitives（Thread/Composer/MessagePart），runtime 抽象可接自研后端 |
| shadcn 官方 chat 五件套 | 轻量聊天组件 | https://ui.shadcn.com/docs/changelog/2026-06-chat-components | MessageScroller/Message/Bubble，可和 AI Elements 混用 |
| **streamdown** | 流式 Markdown 渲染 | https://github.com/vercel/streamdown | 流式不完整语法自动补全，周下载 496 万的事实标准 |
| react-virtuoso | 长列表虚拟化 | https://virtuoso.dev | followOutput 是 chat 场景标配 |
| CopilotKit | 多框架 AI 组件全家桶 | https://www.copilotkit.ai | 组件多但 runtime 偏重，走 AG-UI 协议时再考虑 |
| Semi Design（非 Tailwind 备选） | 字节组件库，AI 三件套 | https://semi.design | AIChatDialogue/AIChatInput，消息模型原生含工具调用/思考链；对比长相用 |
| @ant-design/x（非 Tailwind 备选） | 蚂蚁 AI 组件 | https://x.ant.design | ThoughtChain 工具调用展示是亮点（2.x 需 antd 6） |
| @lobehub/ui（非 Tailwind，antd 系） | LobeChat 同款零件库 | https://ui.lobehub.com | ChatList/Bubble/TokenTag，LobeChat 那种长相（需 antd 6 + React 19） |

## 2.2 后端（packages/engine + apps/server）

| 层 | 选型 | 理由 | 备选 |
|---|---|---|---|
| 运行时 | Node 22+ / TS / ESM | 与前端同语言，协议类型直接共享 | — |
| LLM 抽象 | `@earendil-works/pi-ai` | 30+ provider 含本地 Ollama/vLLM；dsh 复用验证 | Vercel AI SDK v7 |
| Agent 循环 | `@earendil-works/pi-agent-core` + 自写引擎层 | 有状态 Agent+事件流 | 全自写（照 pi 源码） |
| HTTP | Fastify | TS 友好、SSE 简单 | Hono |
| 校验 | zod 4 + zod-to-json-schema | 单一 schema 双用途 | typebox |
| 持久化 | 自写 append-only JSONL（~50 行） | 六家全自写 | node:sqlite（阶段四索引） |
| 日志 | pino | Fastify 原生搭配 | — |
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
│   │       ├── index.ts            # createEngine()
│   │       ├── engine.ts           # Engine 门面与生命周期
│   │       ├── config.ts           # 配置加载（~/.spark）
│   │       ├── bus.ts              # 事件总线
│   │       ├── input-queue.ts      # 三通道输入队列
│   │       ├── run-loop.ts         # turn 主循环
│   │       ├── llm-gateway.ts      # pi-ai 适配
│   │       ├── errors.ts           # 错误分类
│   │       ├── tools/
│   │       │   ├── types.ts        # ToolDefinition
│   │       │   ├── registry.ts     # 注册表 + materialize
│   │       │   ├── pipeline.ts     # 执行管线
│   │       │   ├── builtin/{read,write,edit,bash}.ts
│   │       │   └── output-store.ts # 超大输出截断/溢写
│   │       ├── permission/
│   │       │   ├── rules.ts        # 规则类型 + evaluate + 文件读写
│   │       │   └── service.ts      # asked/resolved + 挂起表
│   │       └── session/
│   │           ├── manager.ts      # SessionManager
│   │           ├── runtime.ts      # SessionRuntime（队列+循环+中断）
│   │           ├── store.ts        # JSONL 单写者
│   │           ├── tree.ts         # id/parentId 树
│   │           ├── projector.ts    # surface → 模型上下文
│   │           └── compaction.ts
│   │       └── observability/{logger,metrics}.ts
│   └── shared/                     # （可选）
├── apps/
│   ├── server/src/{index,routes/{sessions,messages,permissions},sse.ts,static.ts,errors.ts}
│   ├── web/（结构见 §6）
│   └── desktop/                    # （阶段五）
└── examples/mock-sessions/
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

**durable/live/surface 规则表**：

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

`since` = durable seq 水位：连接先补发 `seq > since` 的 durable 事件（回放）再直播。统一 `event: message`，type 在 payload。

## 4.7 Transport 接口 + MockTransport 规格

```ts
export interface Transport {
  onEvent(handler: (e: SparkEventEnvelope) => void): () => void
  sendMessage(text: string, opts?: { delivery?: Delivery; attachments?: string[] }):
    Promise<{ result: 'started'|'steered'|'queued'; turnId? }>
  interrupt(): Promise<void>
  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  listSessions(): Promise<SessionDto[]>
  createSession(opts?: { title?: string }): Promise<SessionDto>
  dispose(): void
}
```

MockTransport：预录事件或脚本模式；sendMessage 触发延迟回放（delta 30~80ms/次）；审批场景挂起等待 reply；支持 steer 演示；`speed`/`scenario`（normal/long-output/reject/error-finish）开关。

---

# 5. 引擎设计（packages/engine）——完整规格

## 5.0 模块总览与依赖关系

```
createEngine(config)
   ├─ config.ts ──── 加载 ~/.spark/{spark.json, models.json, permissions.json}
   ├─ SessionManager（session/manager.ts）
   │    ├─ SessionStore（store.ts）──── JSONL 单写者追加
   │    ├─ EventTree（tree.ts）──────── id/parentId 树 + leaf 指针
   │    └─ SessionRuntime（runtime.ts）─ 每会话：InputQueue + RunLoop + AbortController
   ├─ EventBus（bus.ts）────────—————— durable/live 双路广播（server SSE 的数据源）
   ├─ ToolRegistry（tools/registry.ts）→ ToolPipeline（pipeline.ts）→ ToolOutputStore
   ├─ PermissionService（permission/）─ 挂起表 + 规则评估
   └─ LlmGateway（llm-gateway.ts）──── pi-ai 封装 + 重试
依赖方向：runtime → {input-queue, run-loop}；run-loop → {projector, registry, permission,
   llm-gateway, bus, store}；全部单向，无环。
```

## 5.1 配置体系

```
~/.spark/
├── spark.json            # 引擎行为配置
├── models.json           # provider 与默认模型
├── permissions.json      # 用户级审批规则
├── sessions/<cwd-munged>/<ses_id>.jsonl
├── tool-outputs/<callId> # 超大工具输出溢写
└── logs/engine.log       # pino 日志（按天滚动）
```

```jsonc
// spark.json
{
  "version": 1,
  "server": { "port": 4318, "host": "127.0.0.1" },     // 仅本地（dsh 姿态）
  "engine": {
    "maxStepsPerTurn": 40,              // 单 turn 采样⇄工具上限
    "maxToolParallel": 8,               // 并行 read 上限
    "toolTimeoutMs": 120000,
    "permissionTimeoutMs": 300000,      // 审批 5min fail-closed
    "progressThrottleMs": 200,          // tool.progress 节流
    "toolOutputLimitKB": 32,            // 超限溢写
    "compactionThreshold": 0.8          // 上下文占用率触发
  }
}
// models.json
{
  "providers": {
    "deepseek": { "apiKeyEnv": "DEEPSEEK_API_KEY" },
    "anthropic": { "apiKeyEnv": "ANTHROPIC_API_KEY" },
    "ollama":   { "baseUrl": "http://127.0.0.1:11434/v1", "apiKeyEnv": null }
  },
  "defaultModel": { "provider": "deepseek", "model": "deepseek-chat" },
  "compactionModel": { "provider": "deepseek", "model": "deepseek-chat" }
}
```

## 5.2 Engine 门面与生命周期

```ts
export interface Engine {
  createSession(opts?: { title?: string; model?: string; cwd?: string }): Promise<SessionHandle>
  resumeSession(id: SessionId): Promise<SessionHandle>
  listSessions(): Promise<SessionMeta[]>
  getSession(id: SessionId): SessionHandle | undefined
  subscribe(handler: (e: SparkEventEnvelope) => void, filter?: { sessionId?: SessionId }): () => void
  shutdown(): Promise<void>
}
export interface SessionHandle {
  readonly id: SessionId; readonly meta: SessionMeta
  send(text: string, delivery?: Delivery): Promise<SubmitResult>
  interrupt(): Promise<void>
  replyPermission(reqId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  forkFrom(eventId: EventId): Promise<SessionHandle>     // 阶段四
}
// shutdown 序列：1) 拒绝新请求 2) 逐会话 interrupt 当前 turn（发 turn.completed{aborted}）
//   3) flush 全部 SessionStore（fsync）4) 关闭日志
```

## 5.3 事件总线（bus.ts）实现规格

```ts
interface EventBus {
  /** durable：校验 → 赋 seq → store.append → 广播（await 落盘后才广播，保证订阅者
      看到 durable 事件时它已持久化——崩溃后 UI 与磁盘一致） */
  emit<T extends DurableEventType>(sid: SessionId, type: T, data: SparkEventMap[T]): Promise<void>
  /** live：校验 → 直接广播（不落盘不计数） */
  emitLive<T extends LiveOnlyEventType>(sid: SessionId, type: T, data: SparkEventMap[T]): void
  subscribe(handler: (e: SparkEventEnvelope) => void, filter?): () => void
}
```

- **顺序保证**：per-session 串行——seq 分配与 store.append 在同一互斥队列；live 事件在产生它的 durable 事件之前广播（delta 先于 message 定稿），RunLoop 内天然满足。
- **订阅者隔离**：每个 handler 独立 try/catch，异常记 warn 不影响其他订阅者与其他事件（dsh）。
- **背压接口**：`subscribe` 的 handler 返回 `false | Promise<false>` 时暂停该订阅者（server SSE 用 `raw.write()===false` 触发），恢复由订阅者调用返回的 `resume()`。环形缓冲不丢 durable（可由 since 回放补），live 可丢。
- emit 的 zod 校验失败 = 编程错误，直接 throw（fail-fast 在写入点——dsh"append site"思想）。

## 5.4 输入队列（input-queue.ts）状态机

```
SessionRuntime 状态：idle ──submit(now)──▶ running ──turn 结束且无积压──▶ idle
                        ▲                     │  │
                        └──wake(有积压)────────┘  │ interrupt → running(收尾) → idle
提交路由 send(text, delivery)：
  now   : idle → 占用 runner，入队并启动 → {result:'started'}
          running → 可 steer？入 steerQueue → 'steered'；否则入 queue → 'queued'
  steer : running → 入 steerQueue（下一 step 前注入）→ 'steered'
          idle → 入主队列启动 → 'started'
  queue : 入 queue（当前 turn 完成后依序作为后续 turn 输入）→ 'queued'
唤醒合并（opencode pendingWake）：runLoop 在 turn 结束前检查 steer/queue 积压，
  有则不清除 running 标志直接续跑（避免 空转一轮 + 竞态）
```

数据结构：`queue: InputItem[]`（FIFO）、`steerQueue: InputItem[]`、`InputItem = {id, text, attachments?, delivery, admittedAt}`。

## 5.5 Run Loop（run-loop.ts）——函数签名级

```ts
// 每会话一个常驻 async 循环体（per-key 串行，跨会话并发——opencode RunCoordinator 思想）
async function runSessionLoop(rt: SessionRuntime): Promise<void>
async function runTurn(rt: SessionRuntime, input: InputItem): Promise<void>
async function runStep(rt: SessionRuntime, turn: TurnCtx): Promise<{ continue_: boolean }>

interface TurnCtx {
  turnId: TurnId; delivery: Delivery
  abort: AbortController          // interrupt 入口；级联到 LLM 流与工具 signal
  step: number; usage: Usage      // 累计
  toolCalls: ToolCallPending[]    // 本 step 的工具调用
}
```

```
runSessionLoop:
  while (true):
    input = await rt.queue.take()                 // 阻塞等待
    try await runTurn(rt, input)
    catch e → emit error{scope:'engine'}          // 失败闭合兜底（runTurn 内部已保证补事件）
    检查 pendingWake（steer/queue 积压）→ 继续循环；无 → idle

runTurn(rt, input):
  turnId = newTurnId()
  userEvent = emit user.message{text}(durable+surface)
  emit turn.started{turnId, delivery, userEventId}
  turn = {turnId, abort: new AbortController(), step: 0, usage: empty}
  try:
    while true:
      turn.step += 1
      // ① steering 注入（pi：在 assistant 响应前生效）
      while (item = rt.steerQueue.shift())
        emit user.message{item.text}(durable+surface)   // delivery:'steer'
      // ② 上下文组装（StepContext 快照语义，Codex）
      messages = Projector.modelContext(rt.tree.leaf)   // 见 5.8
      if (messages.tokens > threshold) → await compact(rt) // 可能 emit compaction.* 并重投影
      tools = ToolRegistry.materialize(turn)            // spec 清单（见 5.6）
      // ③ 流式采样
      result = await LlmGateway.stream({
        model: resolveModel(rt), messages, tools,
        signal: turn.abort.signal,
        onDelta: t => bus.emitLive assistant.delta,
        onThinking: t => bus.emitLive reasoning.delta,
      })
      if (result.stopReason === 'error') → finish='error'; break
      emit assistant.message{content: [reasoning?, text, ...toolCalls], usage}(durable+surface)
      // ④ 截断保护（pi）：stopReason 'length' 时截断的 toolCall 全部不执行，
      //    逐个补 tool.started + tool.completed{isError, output:{code:'E_TRUNCATED'}} 事件对
      // ⑤ 工具执行
      calls = result.toolCalls
      if (calls.length === 0 && rt.steerQueue.isEmpty()) → finish='stop'; break
      if (turn.step >= config.maxStepsPerTurn) →
        注入 MAX_STEPS 提示词后强制最后一轮无工具（opencode max-steps 模式）或 finish='length'; break
      toolResults = await ToolPipeline.runAll(rt, turn, calls)
      emit assistant.message{content: toolResults.map(→toolResult)}(durable+surface)
      // continue_ = calls.length>0 || !steerQueue.isEmpty()
    // ⑥ 收尾
  finally:
    emit turn.completed{turnId, finish, usage: turn.usage}(durable)

interrupt():
  turn.abort.abort() → LLM 流抛 AbortError（已交付前缀 finalize 为截断的 assistant.message，
  标注 interrupted——dsh）；工具 signal 级联（见 5.6 管线第 ③ 步）；finish='aborted'
```

## 5.6 工具系统（tools/）——完整规格

### 5.6.1 定义与注册表

```ts
export interface ToolDefinition<I = unknown> {
  name: string                                    // 'read'|'write'|'edit'|'bash'
  description: string                             // 给模型的说明（含使用纪律）
  inputSchema: z.ZodType<I>                       // zod → jsonSchema 给模型
  permission: { action: string                    // 默认 = name
                resourceOf: (input: I, ctx: {cwd: string}) => string }  // 如 'file:E:\...\src\index.ts'
  parallelizable: boolean                         // read=true；bash/edit/write=false
  execute(ctx: ToolContext, input: I): Promise<ToolOutput>
}
export interface ToolContext {
  sessionId: SessionId; turnId: TurnId; callId: CallId
  signal: AbortSignal                             // interrupt 级联
  onProgress: (chunk: string) => void             // 引擎 200ms 节流后 emitLive tool.progress
  cwd: string
}
export interface ToolOutput { output: unknown; isError: boolean; display?: string }

export interface ToolRegistry {
  register(def: ToolDefinition): void             // 重复名抛错
  materialize(turn: TurnCtx): { name, description, jsonSchema }[]   // 广告给模型的清单
  resolve(name: string): ToolDefinition | undefined
}
```

### 5.6.2 执行管线（pipeline.ts）

```
runAll(rt, turn, calls):
  分组：扫描 calls，把连续的 parallelizable 段归为一组（Promise.all），
       遇 serial 工具（bash/edit/write）单独成 barrier（dsh exclusive 语义）
  for 每组:
    if 组是 serial → 逐个 await runOne()
    else → Promise.all(calls.map(runOne))          // 并发上限 config.maxToolParallel
  收集结果按 model order 返回（pi：结果顺序与完成顺序无关）

runOne(call):
  emit tool.started{callId, name, input}(durable)
  t0 = now
  try:
    ① beforeToolCall hook（v1 预留插件点）
    ② verdict = PermissionService.assert(call)     // 见 5.7；ask → 挂起等待，超时 fail-closed
       verdict denied → return {output:{code:'E_PERMISSION'}, isError:true}
    ③ def.execute(ctx, input)——ctx.signal 级联 turn.abort：
       已启动的工具"跑到静默"（等待自然结束或工具自身响应 abort）；
       未启动的（分组排队中）→ 补 emit tool.started+tool.completed{isError, output:{code:'E_ABORTED'}}
       （dsh 重放合法原则：每个 started 必有 completed）
    ④ afterToolCall hook（可改写 output）
    ⑤ bounded = ToolOutputStore.bound(output, callId)   // >32KB 截断+溢写文件，消息留路径
    emit tool.completed{callId, output: bounded, isError, durationMs}(durable)
  catch e:
    emit tool.completed{callId, output:{code:mapError(e)}, isError:true, durationMs}
```

### 5.6.3 内置四工具规格

| 工具 | input（zod） | permission | 行为细则 | 错误码 |
|---|---|---|---|---|
| read | `{path, offset?≥0, limit?≤2000 默认2000}` | action='fs.read'，resource='file:<abs>' | 相对路径基于 cwd 解析；二进制检测（NUL 采样）→ 拒读；行号前缀输出；超大返回尾部+头部提示 | E_PATH_OUTSIDE（越出允许根）、E_NOT_FOUND、E_BINARY、E_TOO_LARGE |
| write | `{path, content}` | action='fs.write'，resource='file:<abs>' | 自动建父目录；返回写入字节数 | E_PATH_OUTSIDE、E_WRITE_DENIED（只读挂载/权限） |
| edit | `{path, oldString, newString, replaceAll?=false}` | action='fs.write'，resource='file:<abs>' | **oldString 唯一性校验**（0 命中→E_NOT_FOUND；>1 且未 replaceAll→E_AMBIGUOUS）；返回 unified diff（供前端 DiffViewer） | E_NOT_FOUND、E_AMBIGUOUS、E_PATH_OUTSIDE |
| bash | `{command, timeoutMs?≤120000, cwd?}` | action='shell.exec'，resource='cmd:<前 80 字符>' | 每次独立 shell（v1 不做常驻）；stdout+stderr 合流 progress 流式（16KB/帧截断，Grok）；退出码非 0 → isError 但 output 保留；超时 SIGTERM→5s→SIGKILL | E_TIMEOUT、E_EXIT_CODE（附 code）、E_SPAWN |

路径安全：v1 允许根 = cwd + 用户显式 addDir（v2）；越界直接 E_PATH_OUTSIDE（不需要审批兜底——硬边界优先于审批）。

### 5.6.4 输出限界（output-store.ts）

`bound(output, callId)`：序列化后 ≤32KB 原样返回；超限 → 截断至 32KB + 尾注 `"…truncated, full output: ~/.spark/tool-outputs/<callId>"`，全文写该文件（异步写、会话关闭前 flush）。

## 5.7 审批（permission/）——完整规格

### 5.7.1 规则与评估

```ts
export interface PermissionRule { action: string; resource: string; effect: 'allow'|'deny'|'ask' }
// 匹配：wildcard（* 单段、** 跨段）；多条命中 findLast 胜出；无命中默认 'ask'（opencode）
export function evaluate(action: string, resource: string, ...rulesets: PermissionRule[][]): Effect
```

规则文件（用户级 `~/.spark/permissions.json`，项目级 `<cwd>/.spark/permissions.json`）：

```jsonc
{ "version": 1, "rules": [
  { "action": "fs.read",  "resource": "file:**",        "effect": "allow" },
  { "action": "fs.write", "resource": "file:**/src/**", "effect": "allow" },
  { "action": "shell.exec", "resource": "cmd:git *",    "effect": "allow" },
  { "action": "shell.exec", "resource": "cmd:**",       "effect": "ask" }
] }
```

优先级合并：会话临时（always 写入）> 项目级 > 用户级 > 默认 ask。

### 5.7.2 流程时序

```
ToolPipeline ──assert(action,resource)──▶ PermissionService
  evaluate → allow ──▶ 直接放行
  evaluate → deny  ──▶ 返回 denied（不发事件）
  evaluate → ask   ──▶ requestId=req_<ulid>
       emit permission.asked{requestId, callId, action, resource, reason, detail}(durable)
       new Promise 挂入 pending 表（key=requestId；5min 定时器）
                            │
UI 收到 asked → ApprovalCard → POST /api/permissions/:requestId
                            ▼
       reply(requestId, reply, feedback?):
         once   → resolve(allow)   → emit permission.resolved{once}
         always → 规则写入对应层文件 + resolve(allow)
                   + 扫描 pending 表：同 action/resource 现在 evaluate=allow 的其他挂起项
                     一并 resolve（opencode 自动放行）
         reject → resolve(deny) → emit permission.resolved{reject, feedback?}
                   feedback 非空 → 注入 user.message（surface）回喂模型（opencode CorrectedError 思想）
       超时/引擎异常/turn 中断 → 一律 resolve(deny) + permission.resolved{reject}
                   （fail-closed，dsh："宁可错杀"）
```

挂起期间工具的 AbortSignal 仍有效：interrupt → 级联取消挂起（判 rejected）。

## 5.8 会话持久化（session/）——完整规格

### 5.8.1 Store（单写者 JSONL）

```ts
class SessionStore {
  private queue: Promise<void> = Promise.resolve()      // 串行链（单写者）
  append(line: string): Promise<void>                   // queue = queue.then(() => fs.appendFile)
  flush(): Promise<void>                                // fsync（会话切换/引擎退出）
  static read(path): { header; events }                 // 全量读（v1；坏行策略见 5.8.4）
}
```

文件：`~/.spark/sessions/--<cwd munged>--/<ses_id>.jsonl`；首行 header + 每行 durable 事件（带 `parentId`）。

### 5.8.2 EventTree（树操作）

```ts
class EventTree {
  append(event, parentId = this.leafId): EventId        // 落 leaf；v1 线性追加
  branch(fromEventId: EventId): void                    // 只移 leafId 指针（pi：分叉零拷贝）
  pathToRoot(eventId?): SparkEventEnvelope[]            // leaf→root 回溯反转
  latestOf(type, path?): EventEnvelope | undefined      // 路径上最新某类事件（compaction 用）
}
```

### 5.8.3 Projector（surface → 模型上下文）算法

```
modelContext(leafId):
  1. path = tree.pathToRoot(leafId)                      // 全部 durable 事件
  2. c = path 上最新 compaction.completed（无则跳到 4）
  3. 上下文 = [system: c.summary] + path 中 seq ≥ c.keptFromSeq 的 surface 事件
  4. （无 compaction）上下文 = path 全部 surface 事件
  5. 投影：user.message→user 消息；assistant.message→assistant 消息
     （content 内 toolCall/toolResult 转为 provider 对应的消息结构）；
     reasoning.ended 按 provider 配置决定是否包含（Anthropic thinking 块 / 其他丢弃）
  6. 估算 tokens（字符近似）返回 {messages, tokens}
```

### 5.8.4 坏行与恢复策略

- 读取时行 JSON 解析失败：**尾行**（EOF 前最后一行）→ 视为崩溃半写，丢弃并 warn（JSONL 追加写崩溃的典型形态）；**非尾行**坏行 → 拒绝加载该会话（fail-closed，dsh 读端纪律）。
- 未知事件 type 且无 `ignorable:true` → 拒绝加载（协议演进保护）。
- resume：全量读 → 重建 EventTree → 若历史显示 turn.started 无对应 turn.completed → 合成 `turn.completed{finish:'aborted'}` 补闭合（Codex 崩溃恢复的 interrupted 语义）。

### 5.8.5 压缩（compaction.ts）

```
compact(rt):
  emit compaction.started
  summary = await LlmGateway.generateOnce(compactionModel,
      prompt=压缩提示词 + 旧上下文（Projector 输出）, maxTokens=2000)
  keptFromSeq = 当前上下文中"最近 N 条 surface 事件"的首 seq（N 由 token 预算反推）
  emit compaction.completed{summary, keptFromSeq, tokensBefore}(durable)
  （此后 Projector 自动按 5.8.3 生效；旧事件不删——append-only）
触发：runStep ② 中 tokens/contextWindow > compactionThreshold；手动 /compact
（压缩调用本身的 usage 不计入会话 usage——与 Claude Code modelUsage 口径一致的做法，v1 简化为不计）
```

### 5.8.6 fork（阶段四）

`forkFrom(eventId)`：新文件 header（parentSession=原 id）+ 复制原文件到该事件的行（或引用+seed 标记——采用复制，简单优先）。

## 5.9 LLM 网关（llm-gateway.ts）

```ts
// pi-ai 集成（唯一 import 点——pi 依赖被隔离在此文件与 run-loop 对 pi 类型的引用）
import { createModels } from '@earendil-works/pi-ai'

export interface LlmGateway {
  stream(req: StreamRequest): Promise<StreamResult>
    // StreamRequest = { model: ResolvedModel; messages: LlmMessage[]; tools: ToolSpec[]
    //                   signal: AbortSignal
    //                   onDelta(t: string): void; onThinking(t: string): void }
    // StreamResult = { content: ContentItem[]; stopReason: 'stop'|'length'|'error'|'aborted'
    //                  usage: Usage }                    // 错误进结果不抛（pi 契约）
  generateOnce(req): Promise<string>                      // 压缩/起标题用
}
// 模型解析优先级：turn 显式指定 > session.meta.model > config.defaultModel
// 重试：provider 429/5xx/网络错误 → 指数退避 1s/2s/4s（±20% jitter）重试 3 次；
//       重试期间 emitLive 不需要（无输出），失败结果记 stopReason:'error' + error 事件
// 事件映射：pi message_update(text_delta/thinking_delta)→assistant.delta/reasoning.delta；
//           message_end(assistant)→由 run-loop emit assistant.message（网关只回调不落协议）
```

## 5.10 错误分类与可观测性

```
错误码前缀（output/事件共用）：
  E_ENGINE_*   循环/状态错误        E_LLM_*     provider/网络
  E_TOOL_*     工具执行             E_PERM_*    审批
  E_IO_*       磁盘/日志

日志（pino → ~/.spark/logs/engine.log，按天滚动，级别 info）：
  固定脱敏：messages.json 中的 apiKey 字段、环境变量值；工具 input 中的密钥样式串（启发式）

metrics（进程内计数器，阶段四经 /api/metrics 暴露）：
  spark_turns_total{finish} / spark_tool_calls_total{name,is_error}
  spark_llm_tokens_total{direction} / spark_permission_decisions{reply}
  spark_sessions_active / spark_events_durable_total
```

---

# 6. 前端设计（apps/web）——完整规格

## 6.1 信息架构与路由

```
/                       → 重定向到最近会话或 /welcome
/welcome                → 欢迎页（无会话时）：新建/选择会话/快捷提示词
/session/:sessionId     → 工作台主视图（ChatView + Sidebar 常驻）
/settings               → 设置弹窗（v1 用 Dialog 不换路由）
```

路由：React Router v7（library 模式）。布局：`<App>` → `<TransportProvider>` → `<AppShell>{Sidebar}{<Outlet/>}{StatusBar}</AppShell>`。

## 6.2 逐屏视图规格

### 6.2.1 欢迎页 `/welcome`

空态：居中 Logo + "新建会话"主按钮 + 最近会话卡片（≤6）+ 3 条快捷提示词 chip。加载态：skeletons。错误态：连接失败重试。

### 6.2.2 工作台 `/session/:id`

```
┌────────────┬──────────────────────────────────────────────┐
│ SessionSidebar │ ChatView（虚拟化滚动区）                     │
│  新建按钮    │  …消息流…                                     │
│  搜索框     │  [ApprovalCard 悬浮在对应位置]                 │
│  会话列表    │  [TurnStatusBar 进行中指示]                   │
│ （今天/更早） │───────────────────────────────────────────│
│             │ Composer（输入区 + DeliveryBar）              │
├────────────┴──────────────────────────────────────────────┤
│ StatusBar：连接状态● │ 模型名 │ seq 水位 │ token 累计         │
└───────────────────────────────────────────────────────────┘
```

**ChatView 状态矩阵**：

| 状态 | 表现 |
|---|---|
| 空（新会话） | 居中欢迎语 + 提示词 chips |
| 流式中 | assistant 气泡底部闪烁光标；TurnStatusBar 显示 step 数/工具运行徽标；自动跟随底部（用户上滚则暂停跟随 + BackBottom 悬浮按钮） |
| 审批挂起 | 对应 ToolCard 位置展开 ApprovalCard；TurnStatusBar 黄色"等待审批" |
| turn 完成 | 光标消失；usage 徽标淡显在 assistant 消息尾 |
| error finish | 顶部黄条 + 重试按钮（重发最后一条 user.message） |
| 断线 | StatusBar 红点 + "已断线，重连中…"（自动重连，since 回放无缝续播） |

**Composer 交互规格**：

| 状态 | 可用操作 |
|---|---|
| 空闲 | Enter 发送（Shift+Enter 换行）；附件按钮（v1 只收路径文本） |
| turn 进行中 | [停止]（interrupt）/ [排队]（queue）/ [插话]（steer，默认高亮）；输入后 Enter = steer（提示"将注入当前轮"） |
| 审批挂起 | 输入区禁用（焦点引导 ApprovalCard） |

## 6.3 组件规格（props 与行为）

```tsx
interface ChatViewProps { sessionId: string }
// react-virtuoso：<Virtuoso followOutput={'smooth'} firstItemIndex={...} />

interface MessageItemProps { item: UiItem }        // 按 kind 分发

interface AssistantBlockProps {
  content: ContentItem[]; streaming?: { textBuf: string }; usage?: Usage
}
interface ReasoningCollapsibleProps { text: string; streaming?: boolean; durationMs?: number }
// 流式自动展开、结束自动折叠（可手动）

interface ToolCardProps {
  name: string; input: unknown
  status: 'running' | 'completed' | 'error'
  progressBuf?: string; output?: unknown; isError: boolean; durationMs?: number
}
// 分发：bash→Terminal（自动滚底、>2000 行截头）；edit/write→DiffViewer（output.diff）；
//       read→CodeBlock（path+行数）；其他→JSON 折叠

interface ApprovalCardProps {
  action: string; resource: string; reason: string; detail?: unknown
  status: 'pending' | 'resolved'
  onReply: (reply: PermissionReply, feedback?: string) => void
}
// pending：[允许一次][总是允许][拒绝]；拒绝展开 feedback 文本框；resolved：结果徽标 2s 后折叠

interface TurnStatusBarProps { turn: { turnId; stepCount; runningTools: string[] } | null }
interface ComposerProps { busy: boolean; onSend(text, delivery): void; onInterrupt(): void }
// SessionSidebar / SessionItem（标题/相对时间/状态点 idle|running|waiting-approval）
// SettingsDialog：模型选择/默认 delivery/主题/权限规则表（v2）
```

## 6.4 状态层（stores/）

```ts
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
  lastSeq: number; usageTotal: Usage
}
// zustand：{ byId: Record<SessionId, SessionSlice>, activeId }
// 唯一写入口 applyEvent(e) 与 reset()；选择器 selectItems/selectActiveTurn/selectLastSeq
```

**applyEvent 处理表（21 种全覆盖）**：

| 事件 | 状态变更 |
|---|---|
| session.created | 初始化 slice；activeId 空则激活 |
| session.resumed | 回放模式批量 apply |
| session.title | meta.title（Sidebar 联动） |
| turn.started | activeTurn={…}；composer 切 busy |
| turn.completed | activeTurn=null；finish==='error' 设 topBanner；usage 累计 |
| user.message | push {kind:'user'} |
| assistant.delta | 末尾 assistant（无则建）streaming.textBuf += text |
| assistant.message | 定稿 content 清 streaming；按 content 展开（text 定稿；toolCall→push tool running） |
| reasoning.delta / ended | 同 assistant 模式 |
| tool.started | push tool running；runningTools.add |
| tool.progress | progressBuf += chunk（>2000 行截头） |
| tool.completed | status 定稿 + output；runningTools.delete |
| permission.asked | push approval pending；activeTurn 标 waiting |
| permission.resolved | approval→resolved |
| compaction.started/completed | 顶部细条轻提示 |
| checkpoint.created | StatusBar 短暂徽标 |
| error | toast；fatal→全屏错误态 |

```ts
// connection-store：{ status:'connecting'|'open'|'reconnecting'|'closed', lastSeq, retryCount }
// settings-store：{ theme, defaultDelivery, model }（localStorage）
```

## 6.5 样式系统

- Token 层（styles/tokens.css）：shadcn 标准 token + `--spark-accent/--spark-warn/--spark-ok`。
- 主题：light/dark 二态（class 策略）；ThemeProvider 20 行；**基调黑白中性极简，禁止蓝紫渐变玻璃**。
- Tailwind v4：`@source` 引 streamdown token；content 覆盖 components/ui。
- 字体：UI 系统栈；代码 IBM Plex Mono（@fontsource 本地打包）。
- 覆写：copy-in 组件直接改源码，不写全局覆写。

## 6.6 Transport 层实现

```tsx
// transports/context.tsx
export function TransportProvider({ mock, children }) {
  const t = useMemo(() => mock ? createMockTransport(scenario) : createHttpTransport(), [])
  // onEvent → sessionStore.applyEvent（rAF 批量对齐）
}

// transports/http.ts 要点
// 1) SSE：fetch('/api/event?...&since='+lastSeq, {signal}) + ReadableStream 手解析
//    （不用原生 EventSource：无法自定义重连参数；可引 eventsource-parser）
// 2) 断线指数退避（1/2/5/10s 封顶），重连带最新 lastSeq → 回放+直播
// 3) REST fetch；sendMessage 三态原样返回；4) dispose：abort+退订

// transports/mock.ts 要点
// sendMessage → setTimeout 序列吐事件；审批挂起等 reply；speed 倍率；scenario 分支
```

## 6.7 AI Elements 组件改造清单

| 取用组件 | 改造点 |
|---|---|
| conversation / message / prompt-input | 删 "use client"；数据源换 useSessionItems()；回调改派发 store |
| confirmation → ApprovalCard | 三按钮语义重映射（once/always/reject+feedback）；resolved 态自绘 |
| terminal | 接 progressBuf；自动滚底；截头 |
| file-tree / code-block / diff | diff 来自 edit/write 工具 output |
| plan / task | 阶段四接 todo 事件扩展（declaration merging 加 'todo/write'） |
| reasoning | 接 reasoning.delta/ended |
| checkpoint | 阶段四 |
| 不取用 | sandbox/web-preview/canvas/audio 等（按需后补） |

## 6.8 性能与体验优化

1. 流式 rAF 批量 flush（避免每 token 全量重渲染）；2. react-virtuoso followOutput+firstItemIndex；3. UiItem memo+浅比较选择器（仅流式项重渲染）；4. Shiki 懒加载+按需语法；5. 图片 lazy；6. 重连回放进度细条；7. 键盘：Enter/Shift+Enter/Esc/Ctrl+K。

## 6.9 工程化配置

```ts
// vite.config.ts 要点
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src', '@spark/protocol': '../../packages/protocol/src' } },
  server: { proxy: { '/api': 'http://127.0.0.1:4318' } },
  build: { target: 'es2022', sourcemap: true },
})
```

规范：ESLint(flat+typescript-eslint strict)+Prettier；CI=typecheck+lint+build+test(vitest)。测试重点：protocol 类型级 + **applyEvent 21 事件单测全覆盖** + 审批卡交互。环境变量：`VITE_SPARK_MOCK=1` / `VITE_SPARK_API`。

---

# 7. 服务端（apps/server）——完整规格

## 7.1 组装与生命周期

```ts
export interface ServerOptions { engine: Engine; staticDir?: string; port?: number; host?: string }

const engine = await createEngine({ root: '~/.spark' })
const app = Fastify({ logger: pino({ level: 'info' }) })
await app.register(routes, { engine })      // REST
await app.register(ssePlugin, { engine })   // GET /api/event
if (opts.staticDir) await app.register(fastifyStatic, { root: opts.staticDir })
await app.listen({ port: 4318, host: '127.0.0.1' })   // 仅本地（无 TLS/auth 刻意，dsh 姿态）

// 优雅退出序列：
// SIGINT/SIGTERM → 1) server.close()（停止接新连接，SSE 连接发 bye 帧后断）
//   2) engine.shutdown()（interrupt 收尾 + flush 全部会话 fsync）3) 进程退出
```

## 7.2 路由实现规格（routes/）

```ts
// 通用模式：zod 解析 body/params → engine 调用 → DTO 序列化；错误经 errors.ts 映射
// POST /api/sessions/:id/messages
const Body = z.object({ text: z.string().min(1), delivery: z.enum(['now','steer','queue']).default('now') })
app.post('/api/sessions/:id/messages', async (req, reply) => {
  const { id } = z.object({ id: SessionIdSchema }).parse(req.params)
  const body = Body.parse(req.body)
  const handle = engine.getSession(id) ?? throw new SessionNotFound()
  return handle.send(body.text, body.delivery)    // { result, turnId } 三态直通
})
```

- `GET /api/sessions/:id`：`events` 字段 = 该会话全部 durable 事件（按 seq）——前端冷启动回放。
- 校验失败 400（zod flatten）；未知会话 404；turn 不存在时 interrupt 幂等成功（200）。

## 7.3 SSE 实现（sse.ts）

```ts
app.get('/api/event', async (req, reply) => {
  const { sessionId, since } = req.query as { sessionId?: string; since?: string }
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
  })
  const write = (chunk: string) => reply.raw.write(chunk)
  // 1) 回放：sessionId+since 时，先按序 write 该会话 seq>since 的 durable 事件（opencode 语义）
  // 2) 直播：engine.subscribe(e => write(`event: message\ndata: ${JSON.stringify(e)}\n\n`), { sessionId })
  //    背压：write 返回 false → 暂停订阅（bus 的 resume 机制），'drain' 事件恢复
  // 3) 心跳：setInterval(15s) write(': heartbeat\n\n')（合并进同一 chunk 定时器）
  // 4) 清理：req.raw.on('close') → clearInterval + 退订
  // 注：不设请求超时（Fastify 默认 connectionTimeout 需调大或 0）
})
```

## 7.4 错误映射表（errors.ts）

| 引擎/校验错误 | HTTP |
|---|---|
| zod 校验失败 | 400 `{code:'E_VALIDATION', message, issues}` |
| 会话/请求不存在 | 404 `E_NOT_FOUND` |
| 审批请求已答复过 | 409 `E_ALREADY_RESOLVED` |
| 引擎已 shutdown | 503 `E_SHUTTING_DOWN` |
| 内部异常 | 500 `E_INTERNAL`（详情只进日志，不透出） |

## 7.5 静态托管

生产模式 `fastifyStatic` 托管 apps/web 构建产物；SPA fallback（`setNotFoundHandler` → 回 index.html，排除 `/api` 前缀）。开发模式前端走 Vite dev server + `/api` 代理（见 §6.9）。

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
- [ ] session-store + applyEvent 21 种事件单测全覆盖
- [ ] ChatView 虚拟化 + MessageItem/AssistantBlock/ReasoningCollapsible
- [ ] streamdown 流式渲染 + rAF 批量 flush
- [ ] ToolCard 三态 + Terminal/DiffViewer/CodeBlock 分发
- [ ] ApprovalCard（confirmation 改造）+ feedback + resolved 动效
- [ ] Composer 三模式 + 三态反馈
- [ ] SessionSidebar 列表/分组/状态点 + 新建/切换
- [ ] 深色模式 + 空态/加载态/错误态/断线重连条 + BackBottom
- [ ] SettingsDialog（主题/默认 delivery）
- **验收**：全部 UI 交互在 mock 下无死角（含审批挂起/拒绝/error/long-output 场景）

## 阶段三：引擎跑通

- [ ] config 体系（spark.json/models.json 加载校验）
- [ ] EventBus（durable 落盘后广播 + live 直播 + 订阅隔离 + 背压接口）
- [ ] SessionStore（单写者 append/flush/fsync）+ EventTree + 坏行策略
- [ ] SessionRuntime + InputQueue（三通道 + 唤醒合并 + interrupt 级联）
- [ ] RunLoop（§5.5 全逻辑：steering 注入/StepContext/截断保护/maxSteps/失败闭合）
- [ ] ToolRegistry + Pipeline（分组并行/权限门/进度节流/溢写）+ 四工具
- [ ] PermissionService（evaluate/挂起表/超时/always 级联/规则文件）
- [ ] LlmGateway（pi-ai 集成 + 事件回调 + 重试）
- [ ] Projector（投影六步）+ compaction
- [ ] server REST+SSE 全端点（§7 规格）+ HttpTransport 切换（前端零改动）
- [ ] pino 日志 + 脱敏
- **验收**：真实模型完成"读文件→改文件→跑命令→汇报"全闭环；断线重连回放正确；中断无悬挂事件

## 阶段四：深度体验

- [ ] steer/queue 完整语义验证（turn 中插话/排队消费）
- [ ] compaction（自动阈值+手动 /compact）+ 前端轻提示
- [ ] 会话恢复/列表/自动标题；fork 与树视图
- [ ] checkpoint（turn 边界 git 快照，两域简化）+ UI
- [ ] permission always 持久化 + 同批放行 + 规则管理 UI
- [ ] node:sqlite 会话索引（列表/搜索，不动 JSONL 权威）+ metrics 端点
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
| pi 包 0.x breaking（团队主导无社区 PR） | 中 | 锁版本 + pi 依赖隔离在 LlmGateway 单点（§5.9）；必要时 vendor |
| AI Elements 面向 Next.js | 中 | copy-in 删 "use client"+换数据源（§6.7 清单） |
| assistant-ui 0.x | 低 | 仅按需引入状态层，核心不依赖 |
| pi-agent-core 循环与事件模型不完全匹配 | 中 | 只用其 stream/工具原语，RunLoop 自写 |
| 本地安全（bash） | 高（产品层） | 阶段三默认全审批；路径硬边界优先于审批；阶段五沙箱；never 策略 dispatch 前判定 |
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

*方案完（v1.3）。前后端均为完整规格；开工顺序：阶段一任务清单自上而下；每次完成按版本记录表追加记录并 push。*
