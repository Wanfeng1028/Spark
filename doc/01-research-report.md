# Agent 产品与技术生态调研报告

> 调研周期：2026-08-21 ~ 2026-08-22
> 调研方式：全部在线进行（GitHub API / npm registry / 官方文档 / 本机安装目录观测），六个核心项目完成**源码级精读**（函数级调用链与真实代码片段，详见各节文件路径引用）。
> 目的：为自研 Agent 产品（本地优先，Web 前端 + 引擎后端，后期 Electron 桌面）确定技术栈与架构参考体系。

---

## 一、六大参考产品源码级调研

### 1.1 OpenAI Codex（openai/codex）

- **定位**：Rust 编写的 CLI coding agent；**Apache-2.0**；codex-rs workspace 100+ crate。
- **开源范围**：Rust 核心、TUI（Ratatui）、TS/Python SDK。桌面 app（Electron）、VS Code 扩展、Web 云端（chatgpt.com/codex）**均闭源**。
- **分层架构**：内部 SQ/EQ 协议（`protocol/src/protocol.rs`）→ 对外 app-server JSON-RPC v2（`app-server-protocol/src/protocol/`）→ 所有客户端（TUI/exec/桌面/IDE/SDK）都是协议客户端，**连官方 TUI 都不直接依赖 core**。
- **SQ/EQ 协议**：客户端发 `Submission{id, op}`，引擎回 `Event{id, msg}`。Op 约 25 个变体；**审批答复本身也是一条 Submission**（同一队列保证因果顺序）；多个 Op 内嵌 `oneshot::Sender` 直接回执。
- **Steering 是协议一等公民**（`protocol/src/turn_input.rs`）：`TurnInputMode::{StartOrSteer, StartIfIdle, Steer{expected_turn_id}}`，结果三态 `Started/Steered/NotSubmitted{reason}`。
- **app-server v2**："不是真 JSON-RPC 2.0"（省略 jsonrpc 字段）；宏集中生成方法表；审批方法 `item/commandExecution/requestApproval`（旧 `execCommandApproval` 已标 DEPRECATED）；`ThreadItem` 约 15 类 + 各类 delta 通知。
- **Turn 调用链**：`CodexThread::start_or_steer_turn()` → `Session::spawn_task::<RegularTask>()` → 外层循环吃排队输入 → `run_turn()`（`core/src/session/turn.rs`）→ 内层"采样⇄工具"循环 → `run_sampling_request()` → 流式处理 → `drain_in_flight()` 工具并发收割；继续条件收敛为 `needs_follow_up` 布尔。每次采样前 **StepContext 快照**（冻结历史+工具表+模型信息）。
- **工具系统三层**：`ToolExecutor` trait（含 `ToolExposure` 位标志：Direct/Deferred/CodeModeOnly…）→ `ToolRegistry` → `ToolRouter`。并行门控 = 一把 `RwLock<()>`（可并行工具读锁共享、串行工具写锁独占）+ `AbortOnDropHandle` 保证取消时上下文永不悬挂。
- **持久化 rollout**（`history/src/lib.rs` + `rollout/src/`）：`RolloutItem` 枚举（连 EventMsg 和每 turn 的 TurnContext 都落盘）；写侧单 writer task + mpsc 命令队列；读侧 `ReverseJsonlScanner` 从 EOF 按 64KB chunk 反向扫描，resume 成本 O(尾部)。
- **审批 = 结构化提案**：`ReviewDecision` 8 变体（含 `ApprovedExecpolicyAmendment`——批准同时固化命令前缀规则）；execpolicy 用 Starlark 规则；guardian 子代理自动复审。
- **沙箱**：`SandboxManager` 统一入口，平台后端 macOS Seatbelt(.sbpl)/Linux Landlock+bwrap/Windows sandbox。

### 1.2 Claude Code（anthropics）

- **定位**：TS 单体（社区逆向约 51 万行），React + Ink TUI，**Bun 编译为平台原生二进制**分发（npm 主包只是 172KB 安装器，逻辑在 8 个平台二进制包）。
- **闭源**（Commercial ToS）。可参考材料：① 官方 SDK 的 `sdk.d.ts`（38.9 万字节完整类型 + TSDoc，接口规格书）；② 压缩 bundle（字符串/协议形状可辨）；③ **泄露源码**（2026-03-31 官方 npm 包未删 sourcemap 事故，1902 文件/51.3 万行，本地留存于 `Wanfeng1028/claude-code-analysis`，含 19 章中文静态分析文档）——**只读学思想，不可复制代码**；④ 官方仓库 `plugins/` 16 个插件真开源（学工作流设计）。
- **协议**：headless 与 SDK 共用 stdin/stdout 双向 stream-json；`SDKMessage` 38 成员联合；**单管道多路复用控制协议**（control_request/response/cancel + keep_alive + transcript_mirror 按 request_id 复用同一 stdio）；SDK→CLI 34 个控制子类型；CLI→SDK 反向请求（can_use_tool/hook_callback/mcp_message/elicitation 等）。
- **权限**：`default | acceptEdits | plan | bypassPermissions | dontAsk | auto`；hooks 31 种 HookEvent；macOS Seatbelt 沙箱。
- **会话**：`~/.claude/projects/<project_key>/<session_id>.jsonl` + `subagents/agent-<id>.jsonl`；resume 家族（--continue/--resume/--resume-session-at/--fork-session）。
- **SessionStore 镜像架构**：子进程独占本地 JSONL 写权威，SDK 在写成功后异步镜像到外部后端（官方 Postgres/Redis/S3 参考实现 + conformance 测试），uuid 幂等、失败降级不伤主流程。
- **设计哲学**（Latent Space 访谈）："模型的最薄封装"、Unix 工具、放弃 RAG 用 agentic search、压缩就是让模型自己总结。

### 1.3 Grok Build（xai-org/grok-build）

- **定位**：xAI 官方 Rust coding agent（99.6% Rust，约 90 crate）；**Apache-2.0**；2026-07 开源；源码从内部 monorepo 单向同步、不接受外部 PR；THIRD-PARTY-NOTICES 承认移植了 openai/codex 与 sst/opencode 的部分工具源码。
- **三入口一核心**（`xai-grok-pager-bin/src/main.rs` → `xai-grok-shell/src/agent/app.rs`）：`run_stdio_agent`（ACP over stdio）、`run_headless`（websocket relay 连 grok.com）、`run_leader`（**单机单 leader**：flock+pidfile+socket 抢权，仅"严格更旧"的 leader 可被驱逐，反抖动）。
- **TUI**：上游 ratatui 0.29 + 自研 `xai-ratatui-inline/-textarea`；主循环 `biased tokio::select!`，ACP 臂以"输入队列空"为门 + 有界批量 drain（token 洪流不饿死键盘）；90+ 斜杠命令各占一文件。
- **工具**：`Tool` trait（RPITIT，Args/Output 关联类型 + JsonSchema），`ToolStream` 不变量 "many Progress then exactly one Terminal"；~25 内置工具（bash/read/edit/grep/task/todo/plan_mode/ask_user_question/scheduler/workflow/image_gen/lsp…）；ripgrep `include_bytes!` 内嵌释放。
- **Checkpoint**（`xai-grok-workspace/src/session/checkpoint.rs`）：以 `prompt_index` 为键，FS rewind 点 + hunk 增量 + git HEAD/index **三域捆绑**原子恢复，与 compaction 正交。
- **沙箱**：nono（Linux Landlock / macOS Seatbelt）启动时一次性 apply；子进程网络按个 seccomp 封禁。
- **会话**：chat JSONL（v1 ConversationItem）+ 独立遥测 events.jsonl + SQLite journal（**NFS 上自动降级 TRUNCATE 模式**防 SIGBUS）。
- **子代理**：解析层纯逻辑（explicit > role > persona > parent）+ coordinator actor + attempt_store 持久化管线；**子代理被摘掉 ask_user_question**（不许反问用户）。
- **配套资料**：张汉东《Grok Build 源码分析》（https://zhanghandong.github.io/grok-build/ ，19 章中文专著，论断附 file:line 引用且自动校验）。

### 1.4 DeepSeek Harness（deepseek-ai/deepseek-harness）

- **定位**：TS 的"Everything is a Plugin"平台化 harness；**MIT**；pnpm monorepo 约 200 包；2026-08-13 创建，一周 17.8 万 star；基于 vendored **Cordis 插件框架**（Context Proxy/Service/DI/五种事件分发模式含 waterfall）。
- **事件日志纪律（最值得抄）**：`SessionEventMap` 是 merge-extensible 接口（插件 declaration merging 加事件）；信封 `{type, seq, time, data}` 上 `surfaceOp` **编译期条件强制**——消息类事件必须声明投影意图才能过类型检查；**"Model-visible means logged"**：append 前 lossless JSON 快照失败当场抛错、入 log 即 deepFreeze、模型历史只从 SurfaceManager 投影派生；读端 fail-closed（`KNOWN_SESSION_EVENT_TYPES` 48 种词表，未知事件无 `ignorable` 标记则拒绝重建会话）。
- **Run loop**（`packages/core/agent-loop/src/agent.ts`）：Inbox 排队 → preStep waterfall → `llm.stream` 逐 chunk 落 `assistant/chunk` → BlockAssembler 收尾成 `assistant/message`（带 `sourceEventSeqs` 钉住来源）→ 工具执行。中止的流把已交付前缀 finalize 成 `interrupted:true` 完整消息。
- **工具三段 waterfall 与调度器分离**：prepare（串行保序，承载审批/guard）/ dispatch（并发滚动池上限 10，exclusive 工具成 barrier，**运行中注销工具可即时形成新 barrier**）/ finalize（按 model order 提交）；abort 二分（体内已启动 vs 启动前），给 skipped call 补合成 call/result 事件对——**重放永远合法**。
- **审批 fail-closed**：三个 log-only 审计事件；词表外返回值/listener 抛错/无 answerer 全部坍缩 `'unavailable'`；`never` 策略在 dispatch 前本地判定。
- **Web 层**：裸 `node:http` 四张路由表；自研 **Typert unary RPC**（`POST /api/<ns>/<method>`）；前端 `__DSH_BOOT__` 全局注入拓扑排序 bundle 图 + 浏览器 lazy CJS 模块表（浏览器也跑 Cordis）；Electron 壳变体用 IPC 替代 HTTP。
- **开源范围**：apps/web（React 18+Vite SPA）+ 引擎 + CLI 全开源——**六大参考里唯一前后端全开源的 TS 项目**。

### 1.5 pi（earendil-works/pi）

- **定位**：Mario Zechner（badlogic）的极简终端 harness；**MIT**；npm workspaces 10 包；刻意做减法（四工具 read/write/edit/bash、无 MCP/子代理/权限弹窗，隔离外包容器）。
- **引擎极简骨架**：`Agent` 类 592 行（状态机壳）+ `agent-loop.ts` 纯函数循环；全生命周期仅 **10 种 AgentEvent**；扩展点是四个普通函数 hook（transformContext/beforeToolCall/shouldStopAfterTurn/prepareNextTurn）。
- **跨 provider 流标准化**（`packages/ai/src/types.ts`）：12 变体 `AssistantMessageEvent`，每个都带 `contentIndex` + `partial` 完整快照；**StreamFunction 契约"错误进流不抛出"**（错误是一条 stopReason:"error" 的完整消息）。
- **循环细节**：steering/followUp 双队列；`stopReason:"length"` 时截断的工具调用全部不执行、逐个合成错误结果；并行 = Promise.all thunk 但结果按 model order 回填；`handleRunFailure` 异常时补齐闭合事件序列。
- **会话 = JSONL 树**（`packages/coding-agent/src/core/session-manager.ts`）：条目带 `id`(8hex)/`parentId`；**分叉 = 只移 leaf 指针**（旧行一字不改）；compaction 是树上的普通 entry（summary + firstKeptEntryId 锚点）；`buildContextEntries()` 十几行完成"leaf→root 回溯 + 最新压缩点 + 锚点后保留"的上下文重建。
- **协议**：rpc mode 手写三类信封（Commands/Responses/Events）~35 命令，stdout 背压直接反压 agent；实验性 server/client 走 **length-prefixed CBOR**（4 字节大端长度前缀帧 + TypeBox 校验）；`Assert<ExactKeys<...>>` 类型断言让编译器强制 wire DTO 与领域类型同步。
- **npm 可复用包**（全 MIT，已被 dsh 源码复用验证——dsh 有 `llm-pi-ai` 包）：`@earendil-works/pi-ai`（30+ provider 含本地 Ollama/vLLM，token/cost 统计）、`pi-agent-core`（有状态 agent + 事件流）、`pi-protocol`、`pi-client`、`pi-tui`、`pi-session-backend-sqlite-node`。注意全部 0.x、团队主导不接受社区 PR。

### 1.6 opencode（sst/opencode）

- **定位**："The open source coding agent"，**MIT**，20 万 stars（六家最高），纯 TS 26.7MB，31 个包；仓库处 V1→V2 迁移，**V2 为当前主引擎**：Effect 框架全面重写的事件溯源（event-sourcing）架构。
- **包结构**（与我们的目标形态 1:1 同构）：`core`（引擎）/ `schema`（约 60 个共享 Effect Schema）/ `protocol`（HTTP 契约 17 组）/ `server` / `client`（**codegen 生成**）/ `sdk-next`（进程内嵌入式 SDK）/ `tui`（**SolidJS + OpenTUI**）/ `desktop`（**Electron 42，开源桌面壳**）/ `llm` / `plugin`。
- **持久化 = SQLite 事件溯源**（非 JSONL）：`event(aggregate_id, seq)` 表 + `session_message` 投影表 + `session_input` 输入队列表；**durable/live 事件二分**——durable 事件带版本落库可回放，`Text.Delta` 等流式碎片 live-only 只走内存（"Stream fragments are live-only; Input.Ended is the replayable boundary"）。
- **steer/queue 双通道持久化输入队列**：消息先落库再唤醒；turn 进行中插话走 `delivery:"steer"`（下一 step 前 promoteSteers）、turn 之间排队走 `delivery:"queue"`；`SessionRunCoordinator`（104 行）做 per-session 串行 + **唤醒合并**（pendingWake）。崩溃不丢消息。
- **Run loop**（`core/src/session/runner/llm.ts`）：`SessionV2.prompt` → admit 落库 → wake → drain → `runTurnAttempt`：选 agent → Context Epoch 基线 → promotion（steer/queue 提升）→ 模型解析 → 历史投影读取 → **工具 materialize（按权限裁剪）/settle 分离** → `LLM.request` + compactIfNeeded → 流式 forEach（**tool-call 事件一到即起 fiber 急切并行**，uninterruptibleMask 保护）→ 每步前后 git snapshot 挂在 `Step.Ended`。compaction/overflow 用 `TurnTransitionError` defect 抛出再捕获递归重试（overflow 只恢复一次防循环）。
- **权限系统**（`core/src/permission.ts`）：wildcard ruleset `findLast` 胜出 + 无规则默认 ask + **agent 未声明权限 = 全 deny**（fail-safe）；审批请求挂起在 durable `permission.v2.asked` 事件 + Deferred 上（任何客户端都能接单）；`always` 自动放行同 session 其余匹配请求并持久化；`reject` 可带 feedback 变成 CorrectedError 回喂模型。
- **单一协议契约驱动五种产物**：Effect HttpApi 定义 → HTTP server + SSE（`GET /api/event` 单端点推全部事件 + 15s 心跳）+ codegen 类型安全 client + 进程内 SDK（伪 fetch 循环复用同一 client）+ openapi.json。TUI/桌面/Web/SDK 全是同一协议的客户端。
- **LLM 层**：自研 `@opencode-ai/llm`（anthropic-messages/openai-chat/openai-compatible/openai-responses/gemini/bedrock 六协议原生实现，Route 可组合）；**Vercel `ai` 包已退化为 models.dev catalog 的描述格式**（V2 runner 只映射三种 aisdk 类型到原生 route，其余 UnsupportedApiError）；`generateObject` 用强制合成 tool call 而非厂商 JSON mode（保证全协议一致）。Usage 契约极好：inclusive totals + non-overlapping breakdown 不变式。
- **教训参考**：全盘 Effect 化是双刃剑——设计思想值得抄，框架本身学习曲线陡峭。

### 1.7 六家横向对比

| 维度 | Codex | Claude Code | Grok Build | dsh | pi | opencode |
|---|---|---|---|---|---|---|
| 语言 | Rust | TS | Rust | TS | TS | TS |
| 许可 | Apache-2.0 | 专有 | Apache-2.0 | MIT | MIT | MIT |
| 前后端开源 | 核心开源/客户端闭源 | 全闭源 | 核心+TUI 开源 | **全开源** | 引擎+TUI 开源 | **全开源** |
| 会话存储 | rollout JSONL+SQLite 索引 | JSONL | JSONL+SQLite journal | SessionEvent JSONL(+zstd/SQLite) | **JSONL 树** | **SQLite 事件溯源** |
| 协议 | SQ/EQ→JSON-RPC | stream-json+控制多路复用 | leader IPC 复用 ACP | Typert RPC+SSE | JSONL 信封/CBOR 帧 | Effect HttpApi+SSE 单端点 |
| steering | 协议三态 | priority now/next/later | Interjected | Inbox.splice | 双队列 | **durable steer/queue** |
| 审批 | 结构化提案 | 富参数回调+6模式 | permission-mode+sandbox | fail-closed 决策槽 | 无（项目信任） | wildcard ruleset+事件化 |
| 独门绝活 | 反向扫描 resume | 控制协议多路复用 | leader 单实例+三域 checkpoint | 编译期 surface 强制 | JSONL 树分叉 | durable/live 二分 |

---

## 二、行业语言与架构盘点

| 产品 | 核心语言 | 形态 |
|---|---|---|
| Codex / Grok Build | Rust | CLI/桌面/IDE/云 |
| Claude Code / dsh / pi / opencode / Cline / Roo / Continue / LobeChat / LibreChat / AnythingLLM / Cherry Studio / Bolt.new | TypeScript | CLI/TUI/Web/桌面/插件 |
| Aider / OpenHands SDK / Dify / Open WebUI / trae-agent | Python | CLI/Web/SDK |
| Jan | TS 前端 + Rust 引擎（Tauri） | 桌面 |

**规律**：①"agent 即核心资产"的新一代工具只用 Rust 或 TS——Rust 用于性能/OS 层重的，TS 用于产品一致性与分发优先的；②Python 是 Web 平台型/研究系的领地，本地个人工具无一选 Python；③IDE 插件清一色 TS；④client/server 拆分只在需要沙箱或多用户时出现。**我们的定位（本地优先+React 前端+Electron）与 Claude Code/dsh/pi/opencode 同型，TS 是被最多同类验证的路线**。

## 三、前端生态调研（2026-08-21/22 实测）

### 3.1 AI/chat 组件库全景

| 库 | 版本/状态 | 许可 | 样式 | 备注 |
|---|---|---|---|---|
| **Vercel AI Elements** | 活跃，48 组件 | Apache-2.0 | shadcn/Tailwind（copy-in） | `confirmation`(审批)/`terminal`/`sandbox`/`file-tree`/`plan`/`task`/`checkpoint`/`tool`——Agent 工作台零件库，https://elements.ai-sdk.dev |
| **assistant-ui** | 0.15.16，极活跃 | MIT | headless primitives + Tailwind 预设 | runtime 抽象可接自研后端，https://www.assistant-ui.com |
| **@ant-design/x** | 2.9.0（需 antd ^6.1） | MIT | cssinjs | 18 组件，ThoughtChain；useXChat 移至 @ant-design/x-sdk，https://x.ant.design |
| **Semi Design** | 2.102.0，当天发版 | MIT | 自研 scss 主题 | AIChatDialogue/AIChatInput/Chat/MarkdownRender；**Message.ContentItem 原生含 ToolCall/MCPToolCall/Reasoning**，https://semi.design |
| **@lobehub/ui** | 5.32.4，当天发版 | MIT | antd6+React19 | LobeChat 同款零件（Bubble/ChatList/TokenTag…），https://ui.lobehub.com |
| shadcn 官方 chat 五件套 | 2026-06 发布 | MIT | Tailwind | MessageScroller/Message/Bubble/Attachment/Marker |
| CopilotKit | 36.9k stars | MIT | Tailwind | 多框架+AG-UI，runtime 偏重 |
| streamdown | 2.5.0，周下载 496 万 | Apache-2.0 | 需 Tailwind token | 流式 Markdown 事实标准（remend 未闭合语法补全） |
| chatscope / NLUX / llm-ui / pro-editor | 停滞 15 个月~2 年 | — | — | 不建议新项目 |
| MUI / Mantine / PrimeReact / Fluent / Chakra | 活跃 | — | — | **均无 AI/chat 组件**（逐一核实） |
| react-virtuoso | 4.18.12 | MIT | 无样式 | 长列表虚拟化一等选择 |

**结论**：Tailwind 线选 shadcn/ui + AI Elements + streamdown；非 Tailwind 备选 Semi 或 antdx。**"蓝色渐变玻璃 AI 风"与 Tailwind 无关**——那是 v0/Lovable 类默认审美；shadcn 默认为黑白中性极简。

### 3.2 CSS 方案

- CSS Modules：Vite 原生支持 `*.module.css/.scss/.less`，零插件。
- antd 6 已全面 cssinjs，无需 less；Semi 主题靠 scss 变量/DSM（Vite 插件仅社区版）。
- 运行时 CSS-in-JS（emotion/styled-components）与零运行时方案（vanilla-extract/panda）在组件库自带样式体系前提下收益有限。

## 四、后端生态调研

- **TS 构建块（最终选择）**：`@earendil-works/pi-ai`（30+ provider，MIT，dsh 源码复用验证）+ `pi-agent-core`；备选 Vercel AI SDK v7（约 5 个月一个大版本，ESM-only/Node22+）。
- **Go 生态（曾评估）**：eino（cloudwego，ADK+Runner 事件迭代器，v0.x alpha 日更）、Genkit Go、langchaingo（停滞 7 个月）、MCP go-sdk v1.7（production-ready）。结论：Go 可行但失去协议类型共享与 TS 构建块复用。
- **许可红线**：claude-agent-sdk 锁 Claude 模型 + 商业条款；codex-sdk Apache-2.0 但行为由 Codex harness 定义；Mastra 双许可（ee 商业）。
- **基础设施**：SSE 服务端手写 ~50 行（Fastify/http.Flusher）；JSONL 追加写自写（无事实标准库，六家全是自写）；zod 4.4.3 / typebox 1.3.16 做协议校验。

## 五、其他产品调查

- **ZCode**（Z.ai GLM-5.3 官方 Harness，闭源）：本机安装目录实测——`~/.zcode/cli/rollout/` 的 `model-io-sess_*.jsonl`（目录名与 Codex 同源，含子代理分文件）；插件体系纯 TS（`@zcode/contracts`/`@zcode/core` + zod + MCP SDK，npm 风格 org/name/version 目录）；skills/hooks/cron/checkpoints 能力面。**Codex 架构范式的追随者，不可作源码参考**。
- **Qoder**（阿里）：闭源。**TraeWork**（字节）：闭源。开源的是 **bytedance/trae-agent**（MIT，Python，12k stars，与 Trae IDE 无直接关系）。
- **用户 fork 资产**：codex / deepseek-harness / pi / grok-build 四大真源码 fork 齐；claude-code fork（官方 plugins 16 个 + CHANGELOG）；claude-code-analysis（泄露源码 1332 文件 + 19 章中文分析）。

## 六、参考体系定稿（六家分工）

| # | 项目 | 抄什么 |
|---|---|---|
| 1 | pi | 引擎最简骨架、JSONL 树会话、可直接 import 的包 |
| 2 | DeepSeek harness | 事件日志纪律（编译期 surface 强制）、fail-closed 审批、Web UI 组织 |
| 3 | opencode | durable/live 二分、steer/queue 输入队列、权限规则引擎、单契约多客户端 |
| 4 | Codex | 协议形状（thread/turn/item）、审批结构化提案、反向扫描 resume |
| 5 | Grok Build | leader 单实例、多域 checkpoint、TUI 工程纪律（+张汉东中文书） |
| 6 | Claude Code | 实现细节答案之书（泄露源码**只读不抄**）+ 官方 plugins 学工作流 |

**法律边界**：Apache-2.0/MIT 可复用代码（保留版权声明）；Rust→TS 需重写（抄设计）；Claude Code 专有——接口规格与思想可学，代码一行不抄。

---

*报告完。开发方案见 `02-development-plan.md`。*
