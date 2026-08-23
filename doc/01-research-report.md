# Agent 产品与技术生态调研报告

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-08-22 | AI 编写：ZCode CLI · **GLM-5.3**（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：六大参考项目源码级调研 + 前后端生态选型结论 |
| v1.1 | 2026-08-22 | 同上 | 扩充至源码细节级（补入真实代码片段与调用链） |
| v1.2 | 2026-08-22 | 同上 | **补全全程调研内容**：新增第 0 章前期会话范式调研（含 20+ 仓库统计与许可证陷阱）；六家各补"产品形态总览（首轮调研）"；前端生态补组件库完整细节（x-card/x-skill 子包、assistant-ui 包矩阵、shadcn chat blocks 等）；后端生态补 AI SDK v7 全量 breaking、SSE/JSONL 库现状、Go eino ADK/genkit 全清单；新增"语言边界与混合架构""逆向的边界"两章；新增本版本记录表 |
| v1.3 | 2026-08-22 | 同上 | 修正版本记录：作者模型信息补全 GLM-5.3（此前仅写会话内部标识 ox-alpha，未写底层模型，属记录不完整） |
| v1.4 | 2026-08-22 | 同上（决策：晚风 Wanfeng1028） | 全文移除"本地优先"定位措辞两处（§0.1 目标、§4.1 表注）——事实不变，不作明面标签 |
| v1.5 | 2026-08-23 | 同上 | 新增 §7.3 候选参考性评估（Gemini CLI/Antigravity/Hermes Agent/OpenClaw/ZCode/Qoder/Trae，含不可参考原因）；§10 参考体系新增 #7 Gemini CLI、#8 OpenClaw、#9 Hermes Agent（+附 trae-agent）。核验：Gemini CLI Apache-2.0 106k★、OpenClaw MIT 387k★、Hermes MIT 234k★、Antigravity 闭源 |

> 调研周期：2026-08-21 ~ 2026-08-22（本会话）+ 前期会话（sess_20abb8d8，GeoWork/Agent 前端架构调研）
> 调研方式：全部在线（GitHub API `gh api` / npm registry / raw 文件直读 / 官方文档 / 本机安装目录观测），未本地克隆。六大项目完成**源码级精读**（3 个并行调研代理 + 3 个精读代理 + 补交续读，共 10 次代理任务；另有主对话直接核查若干）。
> 配套文档：`02-development-plan.md`（完整开发方案，含前端完整规格）。

---

# 0. 调研背景与前期会话结论

## 0.1 目标

自研 Agent 产品（Web 前端 + 引擎后端，后期 Electron 桌面壳）。确定：前后端技术栈、参考哪些开源项目、能复用什么组件。

## 0.2 前期会话（旧会话）已确立的范式结论

**现代 Agent 前端六要素**：从"渲染页面"变为"渲染一个正在自主运行的过程"——①双栏范式（会话流 + 工作区）；②流式渲染；③human-in-the-loop 审批；④会话是一等对象；⑤Generative UI；⑥可观测性。

**20+ 开源仓库统计结论**（两代理核验）：几乎清一色 React；桌面壳 Electron 主流、Tauri 崛起（Jan 已迁移）；新项目主流是 shadcn/Radix+Tailwind 而非 antd（Cherry Studio 是自研 shadcn 风格库，**不是 antd**）；状态管理收敛为 zustand + TanStack Query/SWR；流式用 SSE/WebSocket + 新一代流式 Markdown（streamdown、x-markdown）。

**许可证陷阱表**（重要，选型时避雷）：

| 项目 | 许可 | 陷阱 |
|---|---|---|
| LobeChat / Open WebUI / Dify | 自定义许可 | 已从开源许可改为自定义条款，商用需逐条审 |
| Cherry Studio | AGPL | 传染性 |
| pi / DeepSeek harness / opencode / Codex / Grok Build | MIT / Apache-2.0 | 干净，可复用 |

**编码 Agent 共同范式**（Claude Code/Codex/opencode/DeepSeek harness/pi 精读前总览）：Headless 核心 + 瘦客户端；UI = 一条持久事件流的投影；无传统页面/首页概念；Claude Code = React+Ink TUI + stream-json over stdio；opencode = SolidJS+OpenTUI，client/server（HTTP REST+OpenAPI+SSE）；DeepSeek harness = React18+Vite 本地 SPA（127.0.0.1:3080，MIT）；Codex 有桌面版 `codex app`（2026-02 起，macOS/Windows），桌面/移动端是同一 Rust 核心经 JSON-RPC 2.0 的 remote clients——GUI 有"视图"（侧栏会话+任务列表+主对话区）但无页面体系。

**Codex 式前端五层架构蓝图**（旧会话产出，本方案直接继承）：`protocol → transport → stores → components → mock engine`；`protocol/types.ts` 用可辨识联合定义 Op/AgentEvent 作为全项目合同；`sessionStore.applyEvent()` 是心脏；mockTransport 支持无后端开发。

**旧会话最终建议**（后被本会话深化修正）：先写 Web 再 Electron 打包（前提是 Web 连"本地 Agent 引擎协议"而非网站后端）；引擎选 TypeScript；HTTP+SSE；pnpm monorepo；引擎核心是 runTurn 循环（流式 emit → 工具调用 → 审批挂起 → 会话 JSONL 追加日志）。

# 1. 六大参考产品调研

> 每家分两节：**A 产品形态与技术栈总览**（首轮调研）+ **B 源码精读**（函数级调用链与真实代码片段；路径为仓库内相对路径，行号为精读当日快照）。

## 1.1 OpenAI Codex（openai/codex）

### A. 产品形态总览

- 四种使用形态：CLI（本仓库）、IDE 扩展（VS Code/Cursor/Windsurf，publisher `openai`，扩展 ID `openai.chatgpt`，约 1333 万安装，闭源）、桌面 app（`codex app` 或 DMG/MS Store 分发，Electron+Node.js，闭源）、Codex Web（chatgpt.com/codex，2025-12-31 由 "Codex cloud" 更名；任务在服务端容器执行，开源参考镜像 `ghcr.io/openai/codex-universal`，生产只跑 linux/amd64）。
- 本地 CLI 与云端交互：`codex cloud` 子命令（cloud-tasks crate 含 TUI 浏览云端任务/查看 diff/apply 到本地）；backend API 由 OpenAPI 规范生成（codex-backend-openapi-models）。
- 编程接口：TS SDK `@openai/codex-sdk`（README 原话："wraps the codex CLI … spawns the CLI and exchanges JSONL events over stdin/stdout"；`startThread()/runStreamed()`；`outputSchema` 结构化输出可配 Zod；`resumeThread(id)`；`env` 完全控制——README 专门提到 "sandboxed hosts like Electron apps"；`config` 透传 `--config key=value`；**`baseUrl` 可覆盖**接 OpenAI 兼容端点）+ Python SDK。
- 生态仓库：openai/skills（Skills 目录）、openai/codex-plugin-cc（在 Claude Code 里用 Codex 审查/委派）、openai/tunnel-client（Secure MCP Tunnel）。
- 历史接口演进：早期 `codex proto`（protocol v1 的 SQ/EQ over stdio）→ 已移除，被 `codex app-server`（JSON-RPC）与 `codex mcp-server` 取代。
- 官方理念："everything is controlled by code"（2026-02 Codex app 公告）；Model + Harness + Surfaces 三层心智（Gabriel Chua，二手）；"自 GPT-5.2-Codex 十二月发布以来用量翻倍、月活开发者超百万"。

### B. 源码精读

#### B.1 基本盘

Rust workspace 100+ crate（`codex-rs/`），Apache-2.0，main 日更（当时稳定版 0.149.0）。顶层：`protocol/`（SQ/EQ 内部协议）、`history/`（RolloutItem/RolloutLine 领域类型，**不在 rollout crate**）、`rollout/`（JSONL IO：recorder/reverse_jsonl_scanner/compression/state_db）、`core/`（引擎：codex_thread/thread_manager/tasks/session/tools/unified_exec/exec_policy/safety/client）、`app-server(-protocol)(-client)/`、`sandboxing/`（+ linux-sandbox/windows-sandbox-rs/execpolicy/network-proxy）、`tui/`、`exec/`。

#### B.2 分层架构

```
Rust core（唯一引擎）
  ├─ protocol v1：SQ/EQ 双队列（进程内/任意双向流，newline-delimited JSON 序列化）
  ├─ app-server：JSON-RPC 2.0'（stdio JSONL / UDS / 实验性 WS；省略 jsonrpc 字段）
  └─ mcp-server：把引擎暴露为 MCP server（stdio）
客户端（全是协议客户端）：TUI（Ratatui，经 app-server-client 连接，不直接依赖 core）
  · codex exec（InProcessAppServerClient，stdout 只出最终消息/--json 出 JSONL）
  · 桌面 app · IDE 扩展 · TS/Python SDK（spawn CLI 换 JSONL）· 云端 Web
```

#### B.3 SQ/EQ 协议（protocol/src/protocol.rs）

文件头注释：*"Defines the protocol for a Codex session between a client and an agent. Uses a SQ (Submission Queue) / EQ (Event Queue) pattern."*

```rust
pub struct Submission {
    pub id: String,                       // correlation id
    pub op: Op,
    pub trace: Option<W3cTraceContext>,
    pub parent_turn_id: Option<String>,   // inter-agent 通信
    pub root_turn_id: Option<String>,
}
```

`Op` 约 25 变体（`#[non_exhaustive]`）：`Interrupt`、`TurnInput{request, mode, reply: oneshot::Sender}`、`ExecApproval{id, turn_id, decision: ReviewDecision}`、`PatchApproval`、`UserInputAnswer`、`RequestPermissionsResponse`、`DynamicToolResponse`、`InterAgentCommunication`、`Compact`、`ThreadRollback{num_turns}`、`Review`、`Shutdown`、`RunUserShellCommand`、`RealtimeConversation*`（语音）等。**审批"答复"也是一条 Submission（同一队列保证因果顺序）；多个 Op 内嵌 oneshot 直接回执。**

`EventMsg`（`#[serde(tag="type", rename_all="snake_case")]`，节选）：`TurnStarted`（wire 名兼容 `task_started`，alias 双收）、`TurnComplete`、`TokenCount`、`AgentMessage`/`UserMessage`、`AgentReasoning*`、`SessionConfigured`、`McpToolCallBegin/End`、`WebSearchBegin/End`、`ExecCommandBegin/OutputDelta/End`、`ExecApprovalRequest`、`ApplyPatchApprovalRequest`、`RequestPermissions`、`RequestUserInput`、`ElicitationRequest`、`PatchApplyBegin/Updated/End`、`TurnDiff`、`PlanUpdate`/`PlanDelta`、`TurnAborted`、`ItemStarted`/`ItemCompleted`、`AgentMessageContentDelta`、`ReasoningContentDelta`、`CollabAgentSpawnBegin/End`、`SubAgentActivity` 等。

#### B.4 Steering 一等公民（protocol/src/turn_input.rs）

```rust
pub enum TurnInputMode { StartOrSteer, StartIfIdle, Steer { expected_turn_id: String } }
// 提交三态：TurnInputSubmission::{Started{turn_id}, Steered{turn_id},
//   NotSubmitted{reason: NotIdle|PendingTriggerTurn|PlanMode|NoActiveTurn|
//                          ExpectedTurnMismatch|ActiveTurnNotSteerable}}
```

#### B.5 app-server v2

- 方法表宏集中生成（app-server-protocol/src/protocol/common.rs 三个宏）。Client→Server：`initialize`、`thread/start|resume|fork|archive|delete|list|read|search|rollback|revert|compact/start`、`turn/start|steer|interrupt`、`review/start`、`model/list`、`fs/readFile|writeFile|watch`、`command/exec(+write/terminate/resize)`、`process/spawn(+writeStdin/kill/resizePty)`、`account/login/start...`、`mcpServer/tool/call`、`remoteControl/*`（pairing 配对手机/网页遥控）等。
- Server→Client 审批请求（v2 item 语义；v1 的 `execCommandApproval`/`applyPatchApproval` 已标 DEPRECATED）：

```rust
server_request_definitions! {
    CommandExecutionRequestApproval => "item/commandExecution/requestApproval" { .. },
    FileChangeRequestApproval => "item/fileChange/requestApproval" { .. },
    ToolRequestUserInput => "item/tool/requestUserInput" { .. },
    McpServerElicitationRequest => "mcpServer/elicitation/request" { .. },
    PermissionsRequestApproval => "item/permissions/requestApproval" { .. },
    DynamicToolCall => "item/tool/call" { .. },
}
```

- 通知：`thread/started`、`turn/started|completed`、`item/started|completed`、`item/agentMessage/delta`、`item/reasoning/summaryTextDelta`、`item/commandExecution/outputDelta`、`turn/diff/updated`、`thread/tokenUsage/updated` 等。三原语 Thread/Turn/Item；`ThreadItem` ~15 类 tagged enum。
- 背压：入站饱和 `-32001` Server overloaded；工具 `generate-ts`/`generate-json-schema` 生成客户端绑定。

#### B.6 Turn 调用链（函数名级）

```
CodexThread::start_or_steer_turn() [codex_thread.rs L262] → submit(Op::TurnInput) → SQ
Session::spawn_task::<RegularTask>() [tasks/mod.rs L279]
 └─ RegularTask::run() [tasks/regular.rs]
     ├─ 发 TurnStarted；consume_startup_prewarm_for_regular_turn()（MCP 预热）
     └─ 外层 loop（吃排队输入）
         run_turn() [session/turn.rs L153]
           ├─ drain_async_hook_results(before_user_prompt=true)
           ├─ model_client.new_session()  // turn 级，缓存 WebSocket+sticky routing
           ├─ run_pre_sampling_compact()  // 预压缩
           ├─ capture_step_context_with_required_mcp_servers() → StepContext（冻结 历史+工具表+模型信息）
           ├─ build_skills_and_plugins(); run_hooks(TurnStart)
           └─ 内层 loop（采样⇄工具）
               pending = input_queue.get_pending_input()        // steering 并入
               run_sampling_request() [L1340] → try_run_sampling_request() [L2179]
                 → client_session.stream() 逐条：
                   OutputItemAdded → emit ItemStarted；delta → emit_*_delta
                   FunctionCall/CustomToolCall → ToolRouter::build_tool_call()
                     → ToolCallRuntime::handle_tool_call() → in_flight.push_back(future)
                   drain_in_flight() 并发收割；handle_retryable_response_stream_error()
               needs_follow_up = 新 tool call || pending input
         发 TurnDiff / TokenCount / TurnComplete
```

#### B.7 工具系统

```rust
// codex-rs/tools/src/tool_executor.rs
pub trait ToolExecutor<Invocation>: Send + Sync {
    fn tool_name(&self) -> ToolName;  fn spec(&self) -> ToolSpec;
    fn exposure(&self) -> ToolExposure { ToolExposure::Direct }
    fn supports_parallel_tool_calls(&self) -> bool { false }
    fn handle(&self, invocation: Invocation) -> ToolExecutorFuture<'_>;
}
// ToolExposure: Direct/Deferred/DeferredModelOnly/DirectModelOnly/CodeModeOnly/Hidden
// + bitflags ToolExposures{DIRECT,DEFERRED,CODE_MODE}
```

- `core/src/tools/registry.rs`：CoreToolRuntime + ToolRegistry{register_trusted/external/remove}，分发 `dispatch_any_with_terminal_outcome()`（L479）。`router.rs`：ToolRouter{registry, model_visible_specs}，build_tool_call 解析 FunctionCall/CustomToolCall/ToolSearchCall。
- 内置 handler（handlers/mod.rs）：unified_exec（常驻 shell，process_manager 复用进程）、apply_patch、view_image、sleep、tool_search、multi_agents(_v2)（spawn_agent/send_message/wait/close_agent）、McpHandler、PlanHandler、RequestUserInputHandler、DynamicToolHandler、GetContextRemaining、new_context_window、send_user_message_async 等。
- **并行门控**（tools/parallel.rs L49-205）：一把 `RwLock<()>`——可并行工具读锁共享、串行工具写锁独占；`tokio::spawn + AbortOnDropHandle + select!(cancellation)`：取消时要么终态要么合成 aborted 回填——**上下文永不悬挂 tool_call**。

#### B.8 持久化 rollout

```rust
// history/src/lib.rs
pub enum RolloutItem { SessionMeta(..), ResponseItem(ResponseItemEnvelope),
    InterAgentCommunication(..), Compacted(CompactedItem),     // 摘要+replacement_history+window 链
    TurnContext(TurnContextItem),                              // cwd/model/approval/sandbox 每 turn 快照
    WorldState(..), SecurityRiskScore(..), EventMsg(EventMsg)  // 事件也落盘
}
pub struct RolloutLine { timestamp: String, ordinal: Option<u64>, #[serde(flatten)] item }
```

- 写：RolloutRecorder 经 mpsc（AddItems/Persist/Flush）→ 单 writer task；失败 terminal_failure 缓冲可重试；persist 幂等；flush oneshot ack。
- 读：`ReverseJsonlScanner`（rollout/src/reverse_jsonl_scanner.rs）从 EOF 按 64KB chunk 反向 seek，字节反转拼行，`with_max_record_bytes` 跳超大记录，坏行 `ScanOutcome::Rejected` 不中断——**resume O(尾部)**。配套 compression.rs（后台 materialize）、state_db.rs（SQLite 索引）、session_index.rs。
- `decode_rollout_line()` 手工拆 envelope 绕 serde arbitrary_precision+flatten bug（serde-rs/json#721）。

#### B.9 审批与沙箱

```rust
pub enum ReviewDecision {                       // protocol.rs L3871（Default = Denied，fail-safe）
    Approved, ApprovedForSession,
    ApprovedExecpolicyAmendment { proposed_execpolicy_amendment },  // 批准并固化前缀规则
    ApprovedMcpPolicyAmendment, NetworkPolicyAmendment { .. },
    Denied { rejection: String }, TimedOut, Abort }
pub enum AskForApproval { UnlessTrusted, OnRequest(default),
                          Granular(GranularApprovalConfig), Never }
```

- 请求载荷 ExecApprovalRequestEvent（approvals.rs L226）：call_id/approval_id/turn_id/command/cwd/reason/network_approval_context/proposed_execpolicy_amendment/proposed_network_policy_amendments/additional_permissions/available_decisions/parsed_cmd。
- 策略：exec_policy.rs `create_exec_approval_requirement_for_command()` → Starlark `prefix_rule(pattern, decision="allow|prompt|forbidden")` → Allow/Prompt/Deny；编排 tools/approvals.rs：guardian 自动审（可超时）+ permission hooks + MCP 审批 + 会话缓存。
- 沙箱：sandboxing crate 统一 `SandboxManager`；macOS Seatbelt（3 个 .sbpl）/ Linux Landlock+bwrap / Windows windows-sandbox-rs；network-proxy 隔离。
- MCP 双向：`codex mcp-server`（MCP over stdio，审批 server→client 请求；可用 `npx @modelcontextprotocol/inspector` 调试）；作为 client 用 rmcp + config.toml `[mcp_servers]`。

## 1.2 Claude Code（anthropics）

### A. 产品形态总览

- README 自述 "an agentic coding tool that lives in your terminal"，用于 terminal/IDE/`@claude` on GitHub（anthropics/claude-code-action，TS，8.7k★）。
- 安装转型：npm 安装已 deprecated → native installer（curl claude.ai/install.sh）/ brew cask / winget。npm 包 2.1.238：bin 为 cli.js，Node>=18，ESM，解包 ~31-35MB。
- 分发形态（HitCC 对 v2.1.197 逆向）：wrapper 包 + 平台原生二进制包 + 从原生可执行文件 `.bun` 段提取的 JS bundle——**Bun 编译原生二进制**。
- IDE：VS Code 扩展（CHANGELOG 多条 `[VSCode]`，如 2.1.236 transcript 读屏支持）；JetBrains 在官方文档列出（网络不可达未直接核实）。
- Web/Desktop/iOS：CHANGELOG 2.1.238 提及 "Remote Control messages sent from the web or Desktop…"——存在 web/Desktop 入口与 Remote Control 机制；另有 macOS 桌面 agent 产品 Claude Cowork（support 文档 + `anthropics/knowledge-work-plugins`，插件"主要面向知识工作者在 Cowork 使用"）。
- 引擎观察（minusx 网络拦截，2025-08 时点）：单一主循环 + 平铺消息历史；Task 工具生成的子代理"不能再生子代"（最多一级分支）；系统提示 ~2800 tokens + 工具定义 ~9400 tokens；周期性 side-prompt 压缩历史；Haiku 处理读文件/摘要等辅助调用。
- 社区逆向（sourcemap 笔记）：512K+ 行 TS、~1900 文件、50+ 依赖、40+ 工具；`buildTool()` 工厂、Zod schema 兼 prompt、18+ feature flags 门控、三层 AbortController 取消级联、子代理星型拓扑。
- 工具清单（minusx 观测）：Task/Bash/Glob/Grep/LS/ExitPlanMode/Read/Edit/MultiEdit/Write/NotebookEdit/WebFetch/TodoWrite/WebSearch + IDE 注入 `mcp__ide__getDiagnostics`/`mcp__ide__executeCode`。
- AgentDefinition 字段（官方 Python SDK types.py）：description/prompt/tools(deprecated→skills)/disallowedTools/model/skills/memory(user|project|local)/mcpServers/initialPrompt/maxTurns/background/effort/permissionMode。
- Checkpoint：SDK 连接设 `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true`；CHANGELOG 有 `/rewind`。

### B. 源码级材料与协议（SDK 视角实测）

#### B.1 可用参考材料四层

1. **官方 SDK 类型**：`@anthropic-ai/claude-agent-sdk`（0.3.238，日更）npm 包：`sdk.d.ts`（388,912 B 全量类型+TSDoc）、`sdk.mjs`（1.37MB 压缩 bundle）、`sdk-tools.d.ts`（156KB）、`bridge.mjs`（远程 bridge ~1.33MB）、`browser-sdk.js`、`extractFromBunfs.js`；peerDeps：@anthropic-ai/sdk>=0.93、@modelcontextprotocol/sdk ^1.29、zod ^4；optionalDependencies 8 个平台二进制包（claude-agent-sdk-{linux,darwin,win32}-{x64,arm64}[-musl]）；claudeCodeVersion 2.1.238 严格对版。GitHub 仓库 claude-agent-sdk-typescript **只含 examples**（Postgres/Redis/S3 SessionStore + conformance），无 src。
2. **泄露源码**：2026-03-31 事件（npm 包未删 sourcemap，Chaofan Shou 发现）：1902 文件 / 513,237 行。本地留存 `Wanfeng1028/claude-code-analysis`：`src/`（1332 个 .ts，含 QueryEngine.ts/Task.ts/Tool.ts/assistant/bootstrap/bridge/buddy/cli/commands/components/constants/context/coordinator/cost-tracker/hooks/ink/keybindings/main.tsx/memdir/migrations/native-ts…）+ `src.zip` + 19 章中文分析（01-architecture…11-hidden-features + components/ 函数级走读 7 篇）。**法律状态不变：只读学思想，一行不抄。**
3. **官方插件**：anthropics/claude-code 仓库 plugins/ 16 个（见 §9.2）。
4. **行为观测**：minusx / HitCC。

#### B.2 协议

- 基础：spawn 固定 `--output-format stream-json --verbose --input-format stream-json`；另有 ~40 个 flag（--system-prompt/-file、--append-system-prompt、--tools、--allowedTools/--disallowedTools、--permission-mode、--permission-prompt-tool、--continue、--resume=、--session-id=、--resume-session-at=、--resume-drops-turn、--fork-session、--max-turns、--max-budget-usd、--task-budget、--model/--fallback-model、--effort、--thinking adaptive|disabled、--settings、--add-dir、--setting-sources=、--plugin-dir、--json-schema、--include-hook-events、--strict-mcp-config、--mcp-config、--session-mirror、--no-session-persistence…）；env 注入 CLAUDE_CODE_ENTRYPOINT="sdk-ts"、删除 NODE_OPTIONS。
- `SDKMessage` **38 成员联合**：assistant / user(replay) / result(success|error) / system / stream_event / compact_boundary / status / api_retry / control_request_progress / model_refusal_(fallback|no_fallback) / local_command_output / hook_{started,progress,response} / plugin_install / tool_progress / auth_status / task_{notification,started,updated,progress} / background_tasks_changed / thinking_tokens / session_state_changed / worker_shutting_down / commands_changed / notification / files_persisted / tool_use_summary / memory_recall / rate_limit / elicitation_complete / permission_denied / prompt_suggestion / mirror_error / informational / conversation_reset / active_goal。
- 关键成员：

```ts
export type SDKAssistantMessage = {
  type: 'assistant'; message: BetaMessage;       // 原生 Messages API Message
  parent_tool_use_id: string | null;             // 非 null = 子代理(sidechain)
  error?: 'rate_limit'|'overloaded'|'max_output_tokens'|...;
  supersedes?: UUID[];                            // refusal-fallback 幂等驱逐
  aborted?: true;                                 // interrupt 截断、可能断在半词
  uuid; session_id; request_id?; subagent_type?; context_usage? };
export type SDKPartialAssistantMessage = {       // --include-partial-messages
  type: 'stream_event'; event: BetaRawMessageStreamEvent;  // 原生流事件透传
  parent_tool_use_id; uuid; session_id; ttft_ms? };
export type SDKResultMessage = SDKResultSuccess | SDKResultError;  // 每回合恰好一条
// Success: duration_ms/duration_api_ms/ttft_ms/num_turns/result/structured_output?/
//   total_cost_usd + usage(仅主循环) + modelUsage(含 Task/compaction 全部，计费正确口径)/
//   permission_denials[]/deferred_tool_use?/terminal_reason?(16 种)/fast_mode_state?
// Error subtype: error_during_execution|error_max_turns|error_max_budget_usd|
//   error_max_structured_output_retries
```

- **单管道多路复用控制协议**：stdout 每行 `StdoutMessage = SDKMessage | SDKActiveGoalMessage | SDKControlResponse | SDKControlRequest | SDKControlCancelRequest | SDKKeepAliveMessage`（sdk.d.ts:7872）。demux：control_response 按 request_id 匹配 pending 表（早到容忍 unmatchedControlResponses）；SDK→CLI **34 个控制子类型**（interrupt/initialize/set_permission_mode/set_model/set_max_thinking_tokens/rename_session/set_color/mcp_status/get_context_usage/get_session_cost/list_models/mcp_call/file_suggestions/mcp_set_servers/register_repo_root/reload_plugins/reload_skills/mcp_reconnect/mcp_toggle/stop_task/background_tasks/apply_flag_settings/get_settings/elicitation/request_user_dialog/rewind_files/cancel_async_message/read_file/seed_read_state/mcp_message/hook_callback…）；CLI→SDK 反向（can_use_tool/hook_callback/mcp_message/elicitation/request_user_dialog/oauth_token_refresh/host_auth_token_refresh）；initialize 请求携带 hooks(matcher+回调 id)/sdkMcpServers/jsonSchema/agents/skills/toolAliases/title/supportedDialogKinds；initialize 应答回带 pending_permission_requests（中途加入重新武装）。abort 补 control_cancel_request。
- **canUseTool 参数**（sdk.d.ts:209）：signal/suggestions(PermissionUpdate[])/blockedPath/decisionReason/title/displayName/description/toolUseID/agentID/requestId（带外应答）/matchedAskRule。`PermissionUpdateDestination = userSettings|projectSettings|localSettings|session|cliArg`。
- 进程细节：默认 executable bun（Bun 下）否则 node；pathToClaudeCodeExecutable 原生二进制直 exec；spawnClaudeCodeProcess 可替换进程层（容器/VM）；优雅关闭 stdin EOF → GRACEFUL_EXIT_TIMEOUT_MS(~2s) → abort（Windows 避免 TerminateProcess 抢跑 gracefulShutdown）；stderr tail ring buffer。

#### B.3 权限 / hooks / 会话 / SessionStore

- PermissionMode 六值：default/acceptEdits/plan/bypassPermissions/dontAsk/auto；五层防御（社区逆向）：permission rules → mode → tool checks → path safety → macOS Seatbelt；bypass 仍保护 .git/.claude。
- HOOK_EVENTS **31 种**（比 Grok 多 PostToolBatch/UserPromptExpansion/TeammateIdle/TaskCreated/TaskCompleted/Elicitation*/ConfigChange/WorktreeCreate/Remove/InstructionsLoaded/CwdChanged/FileChanged/DirectoryAdded/MessageDisplay/Setup 等）。hooks wire 只传 matcher+id；命中发 hook_callback 带 input/tool_use_id。
- 会话：主 `<projects_dir>/<project_key>/<session_id>.jsonl`；子代理 `<session_id>/subagents/agent-<id>.jsonl`；project_key 跨盘符告警、`/` 连接保证可移植。
- **SessionStore 镜像架构**：`append(key, entries[])` 本地成功后镜像（~100ms 批，uuid 幂等）；`load/listSessions/(可选 listSessionSummaries+纯函数 foldSessionSummary)/delete(可选,WORM 可省)/listSubkeys`；Flush='batched'|'eager'；失败重试 3 次丢批发 mirror_error 不伤子进程；store resume = 物化到临时 CLAUDE_CONFIG_DIR（拷 credentials/.claude.json/settings.json）+ listSubkeys 物化子代理 transcript + .meta.json（防路径穿越）。模块级高阶 API：forkSession/getSessionInfo/getSessionMessages/getSubagentMessages/listSessions/renameSession/importSessionToStore/deleteSession/startup(WarmQuery 预热)；InMemorySessionStore 参考实现。
- CLI 包结构（@anthropic-ai/claude-code@2.1.238 tarball）：主包 172KB（bin/claude.exe 500B 占位 + install.cjs + cli-wrapper.cjs("—ignore-scripts 兜底 Node 启动器") + sdk-tools.d.ts）；真实逻辑在 8 个平台二进制包；engines node>=22。**Claude Code CLI 已完成 Bun/native 单文件化，npm 包只是安装器。**

#### B.4 引擎内部（泄露源码分析文档摘要）

- 入口链：entrypoints/cli.tsx → main.tsx → init.ts/setup.ts → commands.ts → replLauncher.tsx/REPL.tsx；六层：CLI 引导 → 初始化 → 控制面/TUI → Query/Agent 内核 → Tool/Permission → Memory/Persistence → MCP/Remote 扩展。
- 核心文件：QueryEngine.ts（主循环）/Tool.ts（工具基座）/Task.ts（子代理）/memdir/（分层 Memory）/hooks//coordinator//components/（Ink TUI 组件）。
- 设计哲学（Latent Space 访谈）："Claude Code is not a product as much as it's a Unix utility"；"thinnest possible wrapper over the model"；"do the simple thing first"；放弃 RAG（曾试 Voyage 索引）改 agentic search；80-90% 代码由 Claude 自己写、人类重度 review；每 3-4 周 from-scratch 重写。

## 1.3 Grok Build（xai-org/grok-build）

### A. 产品形态总览

- 时间线：2026-05 早期 Beta → 2026-07-14 Apache-2.0 开源，9 天 2.1 万 star。官方仓库描述 "SpaceXAI's coding agent harness and TUI. Fullscreen, mouse interactive, extensible."；产品页 x.ai/cli，文档 docs.x.ai/build/overview。
- 配套仓库：xai-org/grok-build-plugin-cc（"Claude Code plugin that delegates reviews, rescue tasks, and session transfer to the Grok Build CLI"——shell 出真实 grok CLI，无 broker，"Run status, results, and stop are owned by the plugin (PID + log files)"）；xai-org/plugin-marketplace（官方插件市场）。
- 身份甄别：`grokbuild.cloud`（"Cloud AI Coding Agents Powered by Grok"）是**第三方**（自述 "Access Pending Partnership Approval"、署名 Tyler's AI Company，页脚 "Built by XAI" 属夸大）；GitHub 大量 `*grokbuild*` 仓库均为第三方生态。背景：2026-05 有报道称 Musk 宣布 xAI 解散、算力租予 Anthropic，之后 Grok 产品线继续更新（解释 "SpaceXAI" 命名；未获官方证实）。
- 三种运行模式：interactive（全屏 TUI）/ headless（脚本/CI，`grok -p "..." --output-format streaming-json`；官方插件用法 `--agent explore --permission-mode plan --sandbox read-only --cwd <ws> --output-format plain`，长任务 `--background` 记 bridgePid+agentPid，可选 `--model` 与 `--effort low|medium|high`）/ 编辑器嵌入（**ACP**，Agent Client Protocol——类比 LSP 的编辑器↔agent 标准协议，本地 JSON-RPC over stdio，远程 HTTP/WS WIP）。
- 模型接入：浏览器 OAuth（需 SuperGrok 或 X Premium Plus）；无头/CI 用 `XAI_API_KEY`；默认 grok-4.5；`~/.grok/config.toml` 可自定义 model/base_url/env_key 接任意 OpenAI 兼容端点。
- 会话跨工具迁移：`grok import --source <path>/session.jsonl`（可导入 Claude transcript 继续）；恢复 `grok -r <id>`。
- 权限：`--permission-mode plan`、`--sandbox read-only`、`--write`（默认只读，显式给写）、`/yolo` 自动批准。
- 云端/web：官方暂无（第三方见上）。社区壳：rimusz/grok-build-desktop（SwiftUI）、jason920612/grokbuild_web。

### B. 源码精读

#### B.1 基本盘

Rust 99.6%（62.36MB/62.60MB），约 90 workspace 成员（根 Cargo.toml 自动生成标注 read-only）：crates/codegen 主体 ~70（xai-grok-pager-bin 组合根→二进制安装名 grok；xai-grok-pager TUI；-render；xai-grok-shell 运行时；-tools(-api)；-workspace{,-client,-daemon,-types}；-sandbox；-session-events；xai-sqlite-journal；xai-acp-lib；-subagent-resolution；-hooks；-mcp；-plugin-marketplace；xai-ratatui-inline/-textarea；另有 bundle/voice/foreign-sessions/fast-worktree/hunk-tracker/token-estimation 等）、crates/common（xai-tool-protocol/-runtime/-types）、crates/build（xai-proto-build）、third_party（vendored Mermaid 栈）。SOURCE_REV 单向同步；不接受外部 PR；THIRD-PARTY-NOTICES 含 **openai/codex 与 sst/opencode 的 in-tree source ports**。

#### B.2 三入口一核心

- `run_stdio_agent`（app.rs L250）：ACP over stdio；stdin 行读取 → simplex 管道 → spawn_agent_local 驱动 MvpAgent actor；parent-death 绑定；skills watcher；退出 close_all+2s 宽限。
- `run_headless`（L325）：websocket relay 连 grok.com；首连打印 URL 可开浏览器。
- `run_leader`（L749）：LeaderLock::try_acquire()（flock+pidfile+socket `~/.grok/leader.sock`，socket path 由 ws_url 后缀派生）；失败且 socket 就绪 → 退出连现有 leader；成功起 IPC server+MvpAgent，mpsc 桥接。Leader 协议：4 字节大端长度前缀（MAX_MESSAGE_SIZE 64MB）；ClientMode{Headless(经 relay), Stdio(直接 IPC 透传 ACP)}；LEADER_PROTOCOL_VERSION=1；**should_evict：只有严格更旧的 leader 才可被驱逐（anti-thrash）**；zombie 30s。
- 主循环位置：会话级 acp_session_impl/run_loop.rs；MvpAgent 是 LocalRef actor（agent/mvp_agent/mod.rs）；leader IPC server 做 request-id 命名空间化与 session 归属路由。

#### B.3 TUI

- 依赖上游 ratatui 0.29 + 自研 xai-ratatui-inline（inline viewport/emit_to_scrollback/resize_purge_rerender/synchronized output/segment 差分）与 xai-ratatui-textarea（composer：wrap/editor_keys/planning）。
- pager/src/：scrollback/（blocks 20 余种：agent/thinking/tool{edit,execute,read,search,web_fetch}/subagent/workflow/quote_bar + state/ + sticky 吸顶 + render scratch buffer + search）、views/ 60+（modals/dashboard/permission_view/question_view/welcome/settings_modal/todo_pane/subagent_catalog_pane…）、input/（key/mouse/bracketed paste/macOS modifiers/kitty keyboard 归一化）、slash/registry.rs 90+ 命令各一文件。
- **主循环**（app/event_loop.rs）：

```rust
tokio::select! {
    biased;                                            // cancel > quit > writer ack > ACP > input > render > voice
    _ = connection_cancel.cancelled() => break,
    writer_event = writer_event_rx.recv() => presenter.acknowledge(sequence),
    msg = async {...}, if input_rx.is_empty() => {     // ACP 臂以输入队列空为门
        let mut changed = acp_handler::handle(msg, &mut app);
        while drained < ACP_DRAIN_BATCH_MAX && input_rx.is_empty() { ...try_recv... }  // 有界 drain
        ... }
}
```

#### B.4 工具系统

```rust
// crates/common/xai-tool-runtime/src/tool.rs
pub trait Tool: Send + Sync {
    type Args: for<'de> Deserialize<'de> + JsonSchema + Send + 'static;
    type Output: Serialize + ToolOutput + Send + 'static;
    fn id(&self) -> ToolId;                            // Namespace:tool 如 GrokBuild:grep
    fn description(&self, _ctx: &ListToolsContext) -> ToolDescription;
    fn capabilities(&self) -> ToolCapabilities;         // StreamingSpec{subkind:"bash_output_chunk"} 等
    fn should_list(&self, _ctx: &ListToolsContext) -> bool;
    fn execute(&self, ctx, args) -> impl Future<Output = ToolStream<Self::Output>> + Send;
}
// 不变量："at most arbitrarily many Progress items, ending in exactly one Terminal"
```

内置（implementations/grok_build/mod.rs register_all）：bash(run_terminal_cmd)/read_file/search_replace/grep(ripgrep)/list_dir/web_search/web_fetch/task(+task_output/wait_tasks/kill_task)/todo(TodoWrite)/enter|exit_plan_mode/ask_user_question/monitor/scheduler(create/list/delete)/update_goal/workflow/image_gen/image_edit/video_gen/lsp/deploy_app(stub)；codex 风格 apply_patch/grep_files/read_file/list_dir 并存于 implementations/codex/。要点：bash 本地后端"捕获并重放"模拟 cwd/env/alias 持久化；前台/后台（返回 task_id）；输出 delta 上限 16KB/帧；可选 find→bfs、grep→ugrep shadow；grep release 把 ripgrep include_bytes! 释放到 ~/.grok/vendor/rg-<ver>-<target>；**xai-grok-tools-api 是 protobuf 面**（ExecuteToolRequest/ListToolsResponse/ToolStreamChunk/SpawnSubagentRequest…include!(OUT_DIR)），进程内走 xai-tool-protocol。

#### B.5 工作区 / checkpoint / 沙箱

- workspace：FS/VCS/permissions/tool config/subsystem wiring；permission/ 完整子系统（policy/rules/bash_command_splitting/exec_risk/auto_mode 分类器/manager/grants）；file_system/（local/mock/acp/git_status/jj_status/file_tree/walk）；bin/workspace_server.rs 独立 server。
- daemon-client：-daemon 只管进程生命周期（Unix double-fork+setsid/Windows stdio 重定向+单实例 pidfile；daemon 文件 O_NOFOLLOW+0600；preview_supervisor 监管沙箱 preview-proxy），刻意不依赖 workspace 库；-client 是 hub-proxied typed RPC（wire 在 -types/src/rpc/ 约 17 组：fs/git/hunks/search/session/skills/worktree/hooks/export_github…）；旧 WorkspaceChannel trait 已删（local=WorkspaceHandle，proxy=ToolHarness RPC）；K8s two-phase drain（45s SIGTERM 预算、/tmp/workspace-server.draining、prometheus 全套）。
- **checkpoint**（workspace/src/session/checkpoint.rs）：以 prompt_index 为键，FS RewindPoint + hunk delta + git HEAD/index 三域捆绑原子恢复；TurnBoundary{Start,End} 与 turn hook 共用 on_turn_boundary 入口；与 compaction 正交（有 cross-compaction rewind 测试）。
- 沙箱（-sandbox/src/lib.rs）：基于 nono（Landlock/Seatbelt）启动一次性 apply，覆盖 in-process tokio::fs 与子进程；网络进程层放开、**子进程网络按个 seccomp 封禁**（child_net.rs；bwrap 检测 __GROK_INSIDE_BWRAP）；profiles（Workspace/Devbox/Custom extends）；非 devbox enforcing 要求 hook-write-deny 且 fail-closed；network_policy 版本化快照。

#### B.6 会话 / 子代理 / 扩展

- 会话：①chat JSONL（CHAT_FORMAT_VERSION=1；v0 legacy ChatRequestMessage→v1 ConversationItem/openAI responses 风格；标题清洗 C0/C1+bidi 黑名单+100 scalar 上限（persist/display 共用谓词防 drift）；disk-full 通知；RewindPoint 进 session 文件；fork）②events.jsonl 遥测（TurnStarted{yolo_mode,redirect_kind}/PhaseChanged/FirstToken/LoopStarted/ToolStarted|Completed{outcome,source(shell|workspace),duration_ms}/PermissionRequested|Resolved/TurnEnded{outcome,cancellation_category}/Interjected/YoloToggled/goal/laziness/TodoGate）③SQLite journal（NFS statfs 检测→TRUNCATE+每主机独立 DB；本机 WAL；GROK_SQLITE_JOURNAL_MODE kill-switch；BUSY_TIMEOUT 5s/RETRY_BUDGET 10s）。
- 子代理三层：resolution（纯逻辑：explicit>role>persona>parent；发现 project/builtin/user/plugin→session CLI 兜底；生成子 system prompt/初始 user message；resume identity 校验 type/persona 必须匹配、model 软忽略；零依赖可复用于 remote spawn）；coordinator actor（Task 工具共享）；ShellChildRunner：**ctx.parent_mcp_pool=handle.snapshot_mcp_pool()（继承父 MCP 池）、client_hooks= snapshot（继承钩子）、definitions 去掉 ask_user_question（子代理不许反问）**；attempt_store 七模块（intent/codec/accounting/completion/recovery/rewind/decoder）；SubagentResult{success,subagent_id,child_session_id,snapshot_ref}；父端 usage 折叠。
- hooks：宏单表 HookEventName（session_start/user_prompt_submit/pre|post_tool_use/post_tool_use_failure/permission_denied/stop/stop_failure/notification/subagent_start/subagent_stop|end(双别名)/pre|post_compact/session_end）；(gate,matcher,hub) 三元 dispatch；command 与 http 两种 runner；payload ≤128KB；trust 门；client hooks（编辑器注入）。
- MCP：官方 rmcp（StreamableHttpClientTransport+stdio BufReader）；OAuth/oauth_config；liveness 探活；credentials 存储；acp_transport 变体。
- plugin-marketplace：catalog/scanner/index/installer/install_resolve/matcher；官方源硬编码 xai-org/plugin-marketplace.git 首启注册；settings 注入额外 sources（可 pinned sha：env_require_sha）。
- ACP（xai-acp-lib）：官方 agent-client-protocol 0.10.4(unstable) + x.ai/* 扩展 meta（yoloMode/autoMode/runningPromptId）；AcpSide marker trait（InMessage/OutMessage/OtherSide/NAME）；AcpRequest{type Request, type Response} 成对绑定；AcpArgsGeneric 每请求挂 oneshot；line_reader/stdin_reader 分帧 → message → gateway → channel；normalize.rs 跨版本字段归一、version_mismatch.rs 版本处理。

## 1.4 DeepSeek Harness（deepseek-ai/deepseek-harness）

### A. 产品形态总览

- `dsh`（npm @anthropic… 即 @deepseek-ai/dsh），描述 "dsh CLI: profile boot, plugin management, and the browser UI alias"——CLI 是启动器/profile 管理器和 Web UI 入口，而非终端 REPL 式 agent UI。README：`npx @deepseek-ai/dsh web` 启动 Web UI（默认 http://127.0.0.1:3080）。
- **三种 profile**："A running dsh is a plugin tree composed at boot from ordered layers"——dsh-base 必选（model adapters/tools/persistence/sandbox and approval policy/settings/credentials/telemetry）+ dsh-web-app（浏览器应用）/ dsh-headless（**无服务器的一次性 runner**）。
- 桌面端：web-server 文档 "Electron loads the built files over file:// and sends fetch requests through an IPC bridge instead of this server"——存在 Electron 壳变体（不在仓库）。
- Cordis 插件框架（vendored）：五概念（Plugin=Service 实现/Context=服务仓库（稳定 key 如 ctx.tools、ctx.llm、ctx.sessions）/inject 声明依赖/四种分发模式类型化事件（emit/waterfall/parallel/serial）/可逆注册 disposer）；来自 cordiverse 开源组织。
- LLM：provider 中立——LlmRuntime（ctx.llm）= "adapter registry plus a single streaming call API, interceptable via a waterfall"；按 provider 注册 adapter、可配置 provider 目录、模型发现、重试策略（normal 五次/always）。
- 沙箱：sandbox 包进程隔离 seam，后端 bwrap/Landlock/Seatbelt；另有 E2B 云沙箱 POC 包。
- 持久化细节：SESSION_FORMAT_VERSION=0（预发布不承诺兼容）；JSONL "checksummed concatenated Zstandard frames by default"（可配原始行）；SQLite "opt-in node:sqlite backend using schema 17"（拒绝旧 schema 不迁移）；fork/replay 用 'session/end-seed' 种子边界（取最后一个）；血缘记 SessionHeader（parentSession/seedLength/delegationDepth/origin:'subagent'）。storage 子系统（非会话）：storage-json（每 unit 原子整文件）/storage-sqlite（一行一文档），zod DomainSpec。
- 官方论文：《A Programming Paradigm for Spatiotemporal Composability》（README 提及）。社区：GitHub Discussions+Discord；插件生态约定 dsh-plugin topic。双语文档（README.zh/BRAND_GUIDELINES.zh）。

### B. 源码精读

#### B.1 基本盘

pnpm monorepo 约 200 包（core/session/interaction/host/api/client/typert/llm/fs/shell/web/lsp/mcp/skill/subagent/jobs/goal/plan/compaction/sandbox/spill/workflow…），apps/{cli,web}，vendor/{cordis,cosmokit,schemastery,loader,hmr,logger-console,timer}，.agents/notes 架构决策笔记（中英双语，CI 强制文档同步）。2026-08-13 创建。

#### B.2 事件模型与"Model-visible means logged"

```ts
// packages/core/session/src/types.ts（merge-extensible）
export interface SessionEventMap {
  'turn/start': { turn: number }; 'turn/end': { turn: number; reason: TurnEndReason }
  'step/start': { turn: number; step: number }; 'step/end': { turn: number; step: number }
  'user/message': UserMessage
  'assistant/chunk': { turn: number; step: number; chunk: StreamChunk }
  'assistant/message': { turn; step; message: AssistantMessage; usage?; interrupted?: true }
  'tool/call': { turn; step; callId: CallId; name: string; arguments: string }
  'tool/result': { turn; step; message: ToolResultMessage; error?; meta? }
  'todo/write': { todos: TodoItem[] }
  'request/header': { header: EpochHeader; reason: 'initial'|'resume'|'change' }
  'request/context': RequestContext; 'session/end-seed': Record<string, never>
}
export type SessionEvent<T> = { [K in SessionEventType]: {
    type: K; seq: number /* 恒等于 log.length */; time: number; data: SessionEventMap[K];
    ignorable?: true;
} & (K extends SurfaceEventType /* user/message|assistant/message|tool/result */ ?
    { sourceEventSeqs?: number[]; surfaceOp?: 'append' | {op:'replace';start;end} } : object) }[T]
```

三道强制：①append 签名要求 surface 事件传 SurfaceIntent（编译错误）；②deriveMessages() 只遍历 SurfaceManager 有序节点投影（无 surfaceOp 天然不进模型历史；缓存增量、replaceGeneration 才重建）；③append 前 snapshotJsonValue（拒 BigInt/function/undefined/循环引用）当场抛错（"fails at the append site rather than later during a backend flush"），入 log 即 deepFreeze。
读端 fail-closed：KNOWN_SESSION_EVENT_TYPES 生成词表（48 种，含 approval/*、hook/*、team/*、tool-workflow/*）——表外且无 ignorable **拒绝解释日志**。

#### B.3 Run loop 与工具管线

- ReactLoopAgent（core/agent-loop/src/agent.ts）：send/steer/followUp/inject → Inbox.splice（next-turn/next-step）→ wakeDriver → while(turn())：turn/start → preStep（inbox.claim→systemPrompt.assemble→RuntimeContextProjection.project→waterfall 'agent/pre-step' 可改写/拒绝）→ step/start → 逐条 user/message(surface) → buildRequest（waterfall 'agent/request' + canonicalHeader 对比 baseline，首/变更时 request/header|context）→ llm.stream 逐 chunk append assistant/chunk（记 chunkSeqs）→ BlockAssembler → assistant/message(surface, sourceEventSeqs=chunkSeqs) → finish error/aborted 走 waterfall 'agent/request-error' 决定 retry/throw → 有 tool-call 则 executeToolCalls → finally step/end → serial 'agent/turn-stopping' → finally turn/end（max-tokens sticky）。**中止流 finalize 已交付前缀为 interrupted:true 完整消息。**
- 工具三段（tool-calls.ts + core/tools/index.ts）：调度器按 executionMode 分组——exclusive 单个成 barrier、parallel 滚动池 DEFAULT_MAX_PARALLEL_TOOL_CALLS=10；三阶段拆成 scheduler 视图（symbol 键 TOOL_RUNTIME_SCHEDULER）保 pre/post 保序而 body 并发：
  - prepare（串行）：createExecution（lossless 快照+冻结；mode:'code' 直呼 native 工具在策略管线**之前**确定性拒绝并给正确路由文案）→ caller-cancelled 检查 → waterfall 'tools/pre-execute'（allow/deny/ask）→ ask 交 ApprovalService → monotonic guards（guardReason 全局层+agent scope 链，"no guard can force-allow a call another guard denied"）；
  - dispatch（并发）：waterfall 'tools/execute' around-wrappers（可替换 signal，fuseToolSignals）→ dispatchToolBody → tool.execute → render/presentationMeta；bodyInvoked 区分 ABORTED/ABORTED_BEFORE_DISPATCH；
  - finalize（model order）：commitReady 只沿连续 slot 前进；fillPool 每次重新分类下一 call（运行中注销工具即时新 barrier）；调度器失败 drain 已启动不伪造结果；abort 时未启动 appendSkippedToolCall 补合成 call/result 对。
- 注册表 ToolRuntime extends Service（tools/index.ts L787）：scope-chain（global+各 agent 层近者 shadow 远者）；restriction 只过滤继承面、scope 自注册免疫（delegation 曾被误伤的 bug 注释）；presentCall/presentResult 纯函数投影（live 流与 replay 共用）；Code Mode run_code 子派发记 tool/code-dispatch-start/-dispatch（log-only，deriveMessages 忽略）。

#### B.4 审批（fail-closed）

```ts
// packages/interaction/user-approval/src/index.ts
'approval/asked':  { id; toolName; callId?; reason? }
'approval/decided':{ id; outcome: 'allowed-once'|'rejected'|'cancelled'|'unavailable' }
'approval/policy': { policy: 'ask'|'never'; source?: 'delegation' }
request(req) {
  if (!hasOpenTurn(session.events)) throw new Error('approval.request() outside an open turn: '
    + 'the approval/asked + approval/decided audit pair must be turn-enclosed …')
  session.append('approval/asked', {...})
  const outcome = await this.decide(req, session)   // ↓ 全路径 fail-closed
  session.append('approval/decided', { id, outcome })
}
// decide()：signal abort→'cancelled'；policy 'never' 在 dispatch 之前本地判 'rejected'（防后注册 listener 破坏
// 确定性）；waterfall('approval/request', req, ()=>'unavailable')——fallback 即 fail-closed；词表外→'unavailable'；
// answerer 抛错（同步/异步）→'unavailable'（"fail the QUESTION closed, not the caller's tool call open"）
```

#### B.5 Web 层

- webserver（host/webserver）：裸 node:http 四张表 exact/prefixes/upgrades/fallback（fallback 唯一席位二次注册抛错）；host 只接受 127.0.0.1（默认）/0.0.0.0（显式）；**无 TLS/auth/origin policy**；registerUpgrade 每 path 唯一协议所有者；IndexInjection 收集（global|script|script-src|style|html），global 渲染 `<script>globalThis["__DSH_BOOT__"]={...}</script>`（`<` 转义 \u003c 防 breakout）。
- api-gateway（api/gateway）：TypertGatewayService（static inject=['typert']）——connection.rpc.intercept('/api', claimsEndpoint, dispatchRpc, {authority:'trusted-host'})；endpoint `<ns>/<method>`；resolveDescriptor：strict ctx.typert.local.get 优先（曾见过但撤回→definition-unavailable 禁 SRC 兜底）→ 反射 typertRemote 宽松 descriptor → assertExactArguments → 逐参 resolve（context provider 注入+末尾 AbortSignal）→ Reflect.apply → strict 模式 decode(schema)；envelope 恰含一个 args；响应 {ok:true,value}（void 省 value）。
- client/connection：API_PATH='/api'；MUX_EVENTS_PATH='/api/events.mux'、HOST_EVENTS_PATH='/api/events.host'（WS mux 下行）；http-bridge：node:http↔WHATWG fetch 桥，断连检测挂 **response** 的 close（Node16 起 request close 在 body 读完即触发会误杀 SSE），背压 write()===false→await drain，请求体上限 300MB。
- 前端 boot：client/modules 扫描 Loader entries 中 package.json **dsh.client** 字段（parseDshClient 校验 platform(必填)/inject/external/immediately；clientExportOf 解析 exports["./client"]）→ sha1 前 12 位 rev → WebBootGraph（orderByModuleGraph 拓扑+环检测）→ __DSH_BOOT__ 注入；浏览器 lazy CJS 表：bundle 只 register factory（window.__ModuleLoader__.load({id,factory})），首次 require 才 materialize；引导两级 dsh-client-modules→dsh-client-runtime 先于 Vite shell。

## 1.5 pi（earendil-works/pi）

### A. 产品形态总览

- 作者 Mario Zechner（badlogic，libGDX 作者；X @badlogicgames），现属 Earendil Inc.；MIT；10.3 万 star 量级仓库（94.8k★ 时点）；官网 pi.dev；自我定义 "Pi is a minimal terminal coding harness"。
- **四种运行形态 + SDK**：interactive TUI（默认）/ print 模式 `-p`（"Print response and exit"，可管道 stdin）/ `--mode json`（全部事件 JSON lines）/ `--mode rpc`（stdin/stdout JSONL 协议）/ "embed pi in Node.js applications" SDK。
- 实验性 remote：pi-server 是 transport 无关 session server（PiServer，自带 Unix domain socket listener /tmp/pi/server.sock，"Experimental…may change"；不做 HTTP、不服务 web UI，认证委托传输层）；pi-client transport-neutral（ByteTransport 交换 length-prefixed CBOR，WebSocket/Unix socket 皆可）。
- **无官方图形 Web/桌面端**；pi-chat 不是 web UI，是"pi extension that bridges Discord and Telegram channels to a sandboxed pi session"（每频道一个 Gondolin QEMU micro-VM 沙箱）。
- 扩展系统："Extensions are TypeScript modules that extend pi with custom tools, commands, keyboard shortcuts, event handlers, and UI components" + Skills（Agent Skills）+ prompt templates（slash 展开）+ themes + 可分发 "Pi packages"（npm/git）。
- 供应链硬化："We treat npm dependency changes as reviewed code changes"——精确 pin、lockfile 为准、transitive shrinkwrap、安装命令自带 --ignore-scripts。
- 安全哲学："pi runs in full YOLO mode"；推荐外置隔离：Gondolin（Linux micro-VM）/ Docker / OpenShell 策略沙箱；project trust 一级（/trust 写 ~/.pi/agent/trust.json；-a/--approve、-na 覆盖）。
- 作者博客：《What I learned building an opinionated and minimal coding agent》（保留模式组件树+差分渲染+同步输出转义、写原生 scrollback）、《What if you don't need MCP at all?》（"MCP servers are overkill…significant context overhead"→替代 "build CLI tools with README files"）、《Prompts are code, .json/.md files are state》。
- 分享：pi-share-hf 把 session 发布到 Hugging Face（"sessions capture real-world tasks…instead of toy benchmarks"）。

### B. 源码精读

#### B.1 包与核心类型

npm workspaces 10 包（agent/ai/client/coding-agent/evals/protocol/server/session-backends/telemetry/tui）。npm 包矩阵（全 MIT、0.84.2 周更）：pi-ai（30+ provider + 任意 OpenAI 兼容 + token/cost + 跨模型 handoff + context serialization + browser usage + faux 测试 provider；依赖=各 provider 官方 SDK + typebox）、pi-agent-core、pi-coding-agent（bin: pi）、pi-protocol、pi-client、pi-tui、pi-session-backend-sqlite-node；旧 @mariozechner/* 已 deprecated（0.73.1，2026-05-07，消息指向新 scope）。第三方生态直接建其上（@shiit/coding-agent、@hyperspaceng/neural-web-ui、@justram/pie）。

```ts
// packages/agent/src/types.ts L428 —— 全生命周期 10 种事件
export type AgentEvent =
  | { type:"agent_start" } | { type:"agent_end"; messages: AgentMessage[] }
  | { type:"turn_start" } | { type:"turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type:"message_start"; message } | { type:"message_update"; message; assistantMessageEvent }
  | { type:"message_end"; message }
  | { type:"tool_execution_start"; toolCallId; toolName; args }
  | { type:"tool_execution_update"; toolCallId; toolName; args; partialResult }
  | { type:"tool_execution_end"; toolCallId; toolName; result; isError }
// packages/ai/src/types.ts L528 —— 12 变体流事件（每个带 partial 快照 + contentIndex）
AssistantMessageEvent = start | text_start|delta|end | thinking_start|delta|end
                      | toolcall_start|delta | toolcall_end{toolCall} | done{reason: stop|length|
                        toolUse|deferred} | error{reason: aborted|error, error: AssistantMessage}
// StreamFunction 契约（L327 注释）："request/model/runtime failures should be encoded in
// the returned stream, not thrown"；Provider 接口 ProviderStreams{stream,streamSimple,
// fetchDeferred?,cancelDeferred?}；OpenAICompat 布尔开关矩阵 + thinkingFormat 12 枚举
```

#### B.2 Run loop

```
Agent.prompt [agent.ts L350] → runWithLifecycle → runAgentLoop [agent-loop.ts L95-118]
runAgentLoop: agent_start → turn_start → prompts message_start/end → runLoop [L155-275]
runLoop（外层 followUp / 内层 steering+工具）:
  pending = await getSteeringMessages?.()
  while(true):
    while (hasMoreToolCalls || pending.length):
      注入 pending（message_start/end+push）           // steering 在 assistant 响应前生效
      message = await streamAssistantResponse [L281-372]:
        messages = await transformContext(messages)      // 裁剪/压缩
        llmMessages = await convertToLlm(messages)       // 默认 filter(user|assistant|toolResult)
        resolvedApiKey = await getApiKey(provider)       // 每轮刷新（OAuth 过期）
        for await (ev of streamFunction(model, llmContext, options)):
          start→push partial+message_start；增量→替换末尾 partial+message_update
          done/error→final 替换+message_end
      stopReason error/aborted → turn_end + agent_end → return
      toolCalls = content.filter(toolCall)
      stopReason 'length' → failToolCallsFromTruncatedMessage [L381-406]
        // 截断参数不可执行：全部不发执行，逐个 start/end+合成错误结果
      否则 executeToolCalls [L411-426]:
        sequential（或任一工具 sequential）→ 逐个
        parallel [L489-554]: 第一遍 model order：start+prepare（找不到工具→错误；
          validateToolArguments；beforeToolCall block→错误结果(可带 terminate)）→thunk
          await Promise.all(thunks)；第二遍按原顺序 end+toolResult   // 结果= model order
      prepareNextTurn?.({message,toolResults,context,newMessages})   // compaction 挂点
      shouldStopAfterTurn?.()===true → agent_end → return
      pending = await getSteeringMessages?.()
    followUps = await getFollowUpMessages?.(); 无 → break
  agent_end{messages}
// 失败闭合 handleRunFailure [agent.ts L511-527]：异常合成 stopReason error/aborted 空消息，
// 补发 message_start/end/turn_end/agent_end —— 事件序列永远闭合
// processEvents [L544-591]：先 reduce 状态（streamingMessage/messages/pendingToolCalls/
// errorMessage）再按订阅顺序 await listener
```

#### B.3 会话 JSONL 树

```ts
// coding-agent/src/core/session-manager.ts（1715 行）
SessionHeader{type:"session";version?;id/*uuidv7*/;timestamp;cwd;parentSession?}
SessionEntryBase{type;id/*8hex*/;parentId;timestamp}
// entry：message/thinking_level_change/model_change/compaction{summary,firstKeptEntryId,
// tokensBefore,details?,usage?}/branch_summary{fromId,summary}/custom(不进上下文)/
// custom_message(进上下文)/label{targetId,label}/session_info{name}
getBranch(fromId?) [L1260-1274]      // leaf→root 回溯反转
branch(branchFromId) [L1390-1396]    // 分叉=只移 leafId 指针，旧行不改
buildContextEntries [L415-456]       // 最新 compaction 开头 + firstKeptEntryId 锚点后保留 + 之后全部
buildSessionContext = 路径设置折叠（最近 thinking_level_change/model_change）
  + buildContextEntries().flatMap(sessionEntryToContextMessages)   // message 直出、
  // custom_message→user、branch_summary/compaction→合成消息、其余忽略
// 磁盘 ~/.pi/agent/sessions/--<cwd munged>--/<id>.jsonl；迁移 v1线性→v2树→v3 hookMessage→custom
// harness/session/jsonl 已现 v4（JsonlV4Header{kind:"header",version:4,parentSessionId?}）——
// 正被抽成可换后端 repo/storage 抽象
```

#### B.4 RPC / CBOR / 类型桥

- rpc mode：rpc-types.ts（289 行）stdin RpcCommand ~35 变体（prompt/steer/follow_up/abort/new_session/get_state/get_messages/set_model/set_thinking_level/set_steering_mode/compact/bash/fork/clone/switch_session/get_entries(since)/get_tree/get_commands…）；stdout RpcResponse{id?,command,success,data?|error} + 事件 + extension_ui_request/response（select/confirm/input/editor/notify/setStatus/setWidget/setTitle）；runRpcMode 薄 switch；**stdout 背压反压 agent**；LF 唯一分隔（U+2028/U+2029 问题）。
- CBOR：ByteTransport{send/close}（18 行）默认 Unix socket；framing.ts 4 字节大端 u32 前缀，增量 FrameDecoder（64KB block、maxFrameLength 16MiB、截断检测）；PiServer 握手 ServerHello/ClientHello（PROTOCOL_VERSION=1，5s）；LiveSessionManager（openingSessions 去重；LiveSession 多连接共享 runtime 扇出）；ServerSnapshotPublisher；**WriterLease**（session-backends/sqlite-node/writer-leases.ts：`INSERT…ON CONFLICT DO UPDATE SET fence=writer_leases.fence+1 WHERE expires_at_ms<=now RETURNING`——fenced 租约防脑裂；注：main 分支无 "SessionLease" 同名物）。
- 类型桥：protocol/schemas.ts（450 行 TypeBox StrictObject）+ codec（Check→encodeCbor→encodeFrame）；server/protocol.ts 编译期断言 Assert<ExactKeys<AiUsage,…>>（字段全枚举，加字段不同步 wire DTO 即编译失败）。
- TUI：pi-tui 自研（Component{render(width)=>string[];handleInput?;invalidate()} + Container）；TuiMainScreen.doRender 整屏→overlay→与 previousLines 逐行比较求 [firstChanged,lastChanged]→五种 fullRender 特例否则增量（\x1b[?2026h 同步输出、\r\x1b[2K 清行重写区间）；无虚拟 DOM。

## 1.6 opencode（sst/opencode）

### A. 产品形态总览

- "The open source coding agent"，MIT，~20 万 stars（六家最高），纯 TS 26.7MB，默认分支 dev，日更；homepage opencode.ai；npm 包 opencode-ai（bin: opencode，bun 运行时，#db import 按 bun/node 条件映射）。
- 形态：TUI + **桌面应用（Electron 42，releases/opencode.ai/download）** + Web 文档站 + SDK（旧 openapi json SDK 与新进程内 sdk-next）+ 企业/Slack 等外围包。
- 首轮总览（旧会话+首轮调研）：SolidJS+OpenTUI、client/server（HTTP REST+OpenAPI+SSE）。

### B. 源码精读

#### B.1 包结构（31 包）

core（Effect 全面重写：agent.ts/session//tool//permission.ts/event.ts/database//aisdk.ts/catalog.ts/snapshot.ts/pty//credential//integration//skill//command.ts/config/）、llm（@opencode-ai/llm 自研）、schema（@opencode-ai/schema，~60 个共享 Effect Schema）、protocol（HttpApi 契约 17 组）、server（routes+17 handlers+auth+pty-environment）、client（codegen：generated/+generated-effect/+contract.ts）、sdk-next（进程内嵌入式）、sdk（旧 JS SDK：openapi.json+js/）、httpapi-codegen、tui（@opentui/core+@opentui/solid+@opentui/keymap+opentui-spinner+solid-js，bun）、desktop（Electron 42：electron-vite+electron-builder；main：electron-updater/store/window-state+drizzle-orm+native/ 自编 @lydell/node-pty；renderer：SolidJS+@opencode-ai/app+@sentry/solid+@solidjs/router）、app+ui+session-ui（共享 SolidJS UI）、web（Astro/Starlight 文档站）、opencode（CLI）、effect-sqlite-node（node:sqlite DatabaseSync→Effect SqlClient：loadExtension/WAL/Semaphore 串行）、effect-drizzle-sqlite、plugin、containers/enterprise/slack/stats/function/identity/codemode/console。**V1（core/src/v1/ legacy）→ V2（event-sourced）迁移中，当前主引擎 V2。**

#### B.2 核心类型

```ts
// schema/src/session.ts
Info = { id; parentID?(fork/subagent 父); projectID; agent?; model?; cost; tokens{input,output,
        reasoning,cache{read,write}}; time{created,updated,archived}; title; location(目录+workspaceID);
        subpath?; revert?(Revert.State) }
// schema/src/session-message.ts
Message = Union([AgentSwitched, ModelSwitched, User{text,files,agents}, Synthetic, System, Shell,
                 Assistant, Compaction]).toTaggedUnion("type")
// Assistant.content: AssistantText|AssistantReasoning|AssistantTool（tagged）
ToolState = Union([Pending{status:"pending",input}, Running{status:"running",input,structured,content},
  Completed{status:"completed",input,attachments,content,outputPaths,structured,result},
  Error{status:"error",input,content,structured,error}]).toTaggedUnion("status")
// outputPaths 配合 core/tool-output-store.ts：超大输出溢写文件、消息留路径
// Compaction{reason:"auto"|"manual",summary,recent} —— 压缩结果本身是消息进历史
// ID branded：ses_+64hex（runner /^ses_[0-9a-f]{64}$/ 提取 promptCacheKey）、msg_/evt_ + ascending()
```

#### B.3 事件 durable/live 二分

```ts
// schema/src/event.ts
define({ type, durable?: { version: number; aggregate: string }, schema })
// Payload = { id, type, data, durable?: { aggregateID, seq, version }, location?, metadata? }
```

session.next.* 全词表：Prompted/PromptAdmitted/ContextUpdated/Shell.Started|Ended/Step.Started|Ended|Failed/Text.Started|Delta|Ended/Reasoning.*/Tool.Input.Started|Delta|Ended/Tool.Called/Tool.Progress/Tool.Success/Tool.Failed/Retried/Compaction.*/RevertEvent.Staged|Cleared|Committed。**28 个 DurableDefinitions（带版本落库）与 4 个 live-only delta（Text.Delta/Reasoning.Delta/Tool.Input.Delta/Compaction.Delta）分开导出**；注释："Stream fragments are live-only; Input.Ended is the replayable raw-input boundary"；Tool.Progress "checkpoint semantic transitions or at a bounded cadence, not persist every stdout chunk"。

#### B.4 权限

```ts
// core/src/permission.ts（310 行）
evaluate(action, resource, ...rulesets) = rulesets.flat().findLast(rule =>
  Wildcard.match(action,rule.action) && Wildcard.match(resource,rule.resource))
  ?? { action, resource:"*", effect:"ask" }
missingAgentPermissions = [{action:"*",resource:"*",effect:"deny"}]   // 未声明=全禁
```

- 顺序：agent permissions → PermissionSaved（always 持久化 SQLite）→ findLast。assert：deny→BlockedError；allow→过；ask→create(request)+**publish durable permission.v2.asked → Deferred.await 挂起工具 fiber**。reply：once→Deferred 成功；**always→PermissionSaved.add 且自动放行同 session 其他此刻 pending 且新规则全 allow 的请求**；reject→DeclinedError（或 CorrectedError 带 feedback **注入回模型**）并**级联 reject 全部 pending**。loop 耦合：isUserDeclied→failUnsettledTools+interrupt（"declining a user prompt halts the loop instead of becoming model-facing tool output"）。工具裁剪：materialize(permissions) 把 `*` 全 deny 的工具从 definitions 剔除。

#### B.5 Run loop（core/src/session/runner/llm.ts，439 行）

```
SessionV2.prompt [session.ts L360] → SessionInput.admit [input.ts L41]（落 session_input+PromptAdmitted）
 → execution.wake → SessionRunCoordinator [run-coordinator.ts 104 行]
   （per-key 串行跨 key 并发；run 无活跃则启动；wake 设 pendingWake 合并；settle+pendingWake→
     successor fiber；interrupt 中断 owner）→ drain → SessionRunner.run:
 1. hasPending(steer|queue) 无且非 force → return
 2. failInterruptedTools（上轮遗留全 Tool.Failed）
 3. 外层 while(shouldRun) queue 逐条；内层 while(needsContinuation) step：
    runTurnAttempt(sessionID, promotion, step, recoverOverflow?):
      a. agents.select
      b. SessionContextEpoch.initialize/prepare(loadSystemContext=SystemContextRegistry
         +SkillGuidance+ReferenceGuidance 三路并发合并)
      c. promoteSteers / promoteNextQueued+promoteSteers（promoted>0 → step 重置 1）
      d. models.resolve [runner/model.ts] catalog+variant+credential→原生 route
      e. SessionHistory.entriesForRunner(db,id,system.baselineSeq)
      f. isLastStep：不广告工具+toolChoice:"none"+尾部合成 assistant(MAX_STEPS_PROMPT)
      g. LLM.request+compactIfNeeded→die(ContinueAfterCompaction)
      h. snapshots.capture()+createLLMEventPublisher
      i. llm.stream.forEach：普通→publish（Semaphore(1) 串行保序）；providerError 且
         isContextOverflow 且 assistant 未开始→暂存；tool-call→needsContinuation=true
         toolMaterialization.settle→publish(toolResult)（uninterruptibleMask+FiberSet）
         ★ "Start each recorded local call eagerly" 事件一到即 fiber——天然并行
      j. 收尾：overflow 恢复 compactAfterOverflow→die（只一次防循环）；awaitToolFibers=
         raceFirst(join,awaitEmpty)；isUserDeclied→failUnsettledTools+interrupt；
         snapshots.capture()+files→Step.Ended{finish,tokens,snapshot,files}
// compaction/overflow 过渡：Effect.die(TurnTransitionError{_tag:ContinueAfterCompaction|
// ContinueAfterOverflowCompaction,step})，runTurn catchDefect 递归重试
```

#### B.6 协议 / server / 持久化

- protocol：`HttpApi.make("server")` unstable httpapi DSL；17 组（health/location/agent/session/message/model/provider/integration/credential/permission/fs/command/skill/event/pty/question/reference/project-copy）；groups/event.ts：`HttpApiEndpoint.get("event.subscribe","/api/event",{success:HttpApiSchema.StreamSse({data:EventSchema})})`——**SSE 进类型系统**；session 组 base64url branded cursor（anchor{id,time,direction}），limit≤100；errors.ts 集中 tagged error。
- server SSE（handlers/event.ts 52 行）：`EventV2.allBounded(events,256)`（先装监听再宣布就绪）→ `Stream.make(connected).pipe(concat(live),map(eventData),pipeThroughChannel(Sse.encode()))`；心跳 `Stream.tick("15 seconds").map(()=>": heartbeat\n\n")` merge（haltStrategy left）；headers Cache-Control:no-cache,no-transform / X-Accel-Buffering:no / X-Content-Type-Options:nosniff。**单一 GET /api/event 推全部事件**。
- auth：Basic（用户名 opencode，密码 OPENCODE_SERVER_PASSWORD；未设无鉴权；嵌入式 createEmbeddedRoutes 密码 none）。
- PTY：handlers/pty.ts list/create/update/remove/connectToken/connect；connectToken 自定义 header（强制 CORS preflight 防浏览器偷铸）+origin 校验签 PtyTicket；connect=handleRaw+request.upgrade WebSocket（query 带 ticket+cursor 回放游标）；出站单一 unbounded Queue 单 writer 排空（replay/live/close 全局有序）；帧协议 core/pty/protocol.ts（metaFrame(cursor)）；pty-environment.ts 空壳注入点；真实现 pty.bun.ts/pty.node.ts（@lydell/node-pty）。
- client：`export * from "./generated/index"` 全 codegen；sdk-next OpenCode.create()：进程内 AppNodeBuilder.build→createEmbeddedRoutes→HttpRouter.toWebHandler→伪 fetch(http://opencode.local)→标准生成 client，返回 {...client, tools:{register}}。**同一契约驱动独立 server 与进程内 SDK**。
- routes.ts：HttpApiBuilder.layer(Api,{openapiPath:"/openapi.json"}) 逐层 provide handlers（Layer.mergeAll 17 个）+中间件+auth+core services（AppNodeBuilder.build(LayerNode.group([Database.node,EventV2.node,SessionV2.node…]))）；webHandler() 转 Web 标准 handler（嵌入式挂点）。
- 持久化 SQLite（drizzle）：`event{id,aggregate_id,seq,type,data}` uniqueIndex(aggregate_id,seq)+`EventSequence{aggregate_id PK,seq,owner_id}` 水位+`SessionTable`+`SessionMessageTable{id,session_id,type,seq,data}` uniqueIndex(session_id,seq) 投影+`SessionInputTable{id,session_id,prompt,delivery,admitted_seq,promoted_seq}`+`SessionContextEpoch{session_id PK,baseline,snapshot,baseline_seq}`+V1 兼容 message/part/todo 投影。写：EventV2.publish（durable 校验落库+进程内广播）→SessionProjector（455 行）物化；读：SessionHistory.load=baseline_seq+最新 compaction seq 起按序读。**崩溃恢复=重跑 runner 从投影重建**（tool 断点续跑明确未做：failInterruptedTools 兜底）。

#### B.7 LLM 层

- 自研 @opencode-ai/llm（deps 无 ai/@ai-sdk/*，仅 @smithy/eventstream-codec/aws4fetch/effect/@opencode-ai/schema）：protocols（anthropic-messages/openai-chat/openai-compatible-chat/openai-responses/gemini/bedrock-converse/bedrock-event-stream）+providers（anthropic/openai/openai-compatible/google/amazon-bedrock/azure/cloudflare/github-copilot/openrouter/xai）+route/（auth/endpoint/client/executor/framing/transport 可组合）。DESIGN.md："Preserve one provider turn as an explicit primitive for durable runtimes"。
- 流事件与 AI SDK v5 同构；**Usage 契约**：inclusive totals（inputTokens 含 cache）+non-overlapping breakdown（nonCachedInput+cacheRead+cacheWrite=inputTokens 不变式）逐协议注释谁原生谁推算；visibleOutputTokens 唯一做减法且带 clamp。generateObject=强制合成 tool call（名 generate_object）不用厂商 JSON mode。
- 与 Vercel ai 关系：web 的 `ai` 属 Astro 文档站；core 的 @ai-sdk/* 是 V1 长尾（aisdk.ts 包装 LanguageModelV3+sdk/language hooks+custom fetch SSE chunkTimeout 看门狗+openai/azure/bedrock body 修补）；**V2 runner fromCatalogModel 只映射三种 aisdk 类型（openai→OpenAIResponses.route/Auth.bearer、anthropic→AnthropicMessages.route/x-api-key、openai-compatible→OpenAICompatibleChat.route），其余 UnsupportedApiError——ai-sdk 退化为 models.dev catalog 描述格式**。

#### B.8 TUI / 桌面 / 插件

- TUI：OpenTUI+SolidJS（keymap.tsx/theme/routes/component/prompt/feature-plugins），经 @opencode-ai/sdk 连 server。
- Desktop：Electron 42（electron-vite+electron-builder；main 进程 electron-updater/store/window-state、drizzle-orm、native 自编 node-pty；renderer SolidJS+共享 app 包+@solidjs/router）——"Electron 侧边栏+内嵌终端（PTY WebSocket）+共享 Web UI"。
- 插件：`Plugin.define({id, effect:(ctx:PluginContext)=>Effect<void>})` 长驻 Effect；PluginContext 六类 hooks（agent/aisdk/catalog/command/integration/reference 各带 Reload）+plugin 域；KeyedMutex+scope 生命周期、加载环检测、热替换 Scope.close。

# 2. 六家横向对比

| 维度 | Codex | Claude Code | Grok Build | dsh | pi | opencode |
|---|---|---|---|---|---|---|
| 语言 | Rust | TS | Rust | TS | TS | TS |
| 许可 | Apache-2.0 | 专有 | Apache-2.0 | MIT | MIT | MIT |
| 开源范围 | 核心+TUI+SDK | 仅 SDK 接口+plugins | 核心+TUI | **全（含 Web UI）** | 引擎+TUI | **全（含桌面）** |
| 进程模型 | 库+多前端 | 单进程 CLI | leader 单实例 | 插件树进程 | 单进程 | **严格 client/server** |
| 会话存储 | rollout JSONL+SQLite | JSONL | JSONL+SQLite journal | SessionEvent JSONL(+zstd/SQLite) | **JSONL 树** | **SQLite 事件溯源** |
| 内部协议 | SQ/EQ | stream-json | leader IPC 复用 ACP | Typert RPC | 手写 JSONL 信封 | Effect HttpApi |
| steering | 三态协议 | priority now/next/later | Interjected | Inbox.splice | 双队列 | **durable steer/queue** |
| 工具并行 | RwLock 门控 | 受限并行 | eager+Terminal 收口 | 三段 waterfall 滚动池 | Promise.all thunk | eager FiberSet+awaitEmpty |
| 审批 | 结构化提案+guardian | 富回调 6 模式 | permission-mode+sandbox | **fail-closed 决策槽** | 无 | wildcard+事件化 Deferred |
| 压缩 | pre-sampling+auto | 总结式+PreCompact hook | compaction-transcript | compaction replace surface | 树上 entry 检查点 | Compaction 消息进历史 |
| 沙箱 | Seatbelt/Landlock/bwrap/Win | Seatbelt | nono+seccomp 子网封禁 | bwrap/Landlock/Seatbelt+E2B POC | 无（外包容器） | —（未见专项） |
| 独门绝活 | 反向扫描 resume | 控制协议多路复用 | 三域 checkpoint | 编译期 surface 强制 | JSONL 树分叉 | durable/live 二分 |

# 3. 行业语言与架构盘点

| 产品 | 核心语言（GitHub languages 实测） | 形态 | 架构要点 |
|---|---|---|---|
| Codex / Grok Build | Rust | CLI/桌面/IDE/云 | Rust 核心多客户端 |
| Claude Code / dsh / pi / opencode | TypeScript | CLI/Web/桌面 | 单进程或 client/server |
| Cline / Roo Code | ~100% TS（Roo 是 Cline fork） | VS Code 插件 | 循环跑扩展宿主内，无独立引擎；云端服务闭源 |
| Continue.dev | TS 8.9M+Kotlin 壳 407K+Python 遗留 | 插件+CLI | 共享 TS core；JetBrains JCEF 复用；补全本地 ONNX/tree-sitter |
| Aider | Python 1.33M | CLI | 单进程；tree-sitter repo-map；git 深度集成 |
| OpenHands | 主仓 TS 8.6M+agent-sdk Python 12.3M | Web/桌面(Electron)/SDK | client/server；Docker 沙箱执行；REST+WebSocket |
| Dify | 前端 TS 38.2M+后端 Python 35.7M(Flask) | Web | Next.js+Flask+Celery+多容器 |
| LobeChat | ~100% TS 69MB（Next.js 全栈） | Web/桌面 | DB 模式 API Routes+Prisma 兼任后端 |
| Open WebUI | 后端 Python 4.1M(FastAPI)+前端 Svelte 3.6M | Web | 单进程 FastAPI 服务 API+静态资源；直连 Ollama |
| LibreChat | TS 29M+JS 6.7M+少量 Go | Web | Node(Express)+React+MongoDB；RAG 可选 Python API |
| AnythingLLM | JS 9.2M(Node)+TS 166K | 桌面+Docker | 一套 Node 后端双形态；内嵌 LanceDB；BYOK |
| Cherry Studio | TS 50M | Electron | 纯客户端 BYOK 无自有后端 |
| Jan | TS 4.5M+Rust 1.25M(src-tauri)+Swift/MLX | 桌面(Tauri 2) | 2025-07 cortex.cpp(C++)归档→Rust(llama.cpp)+macOS MLX server |
| Bolt.new | 官方仓 TS 233K（主体闭源） | Web | WebContainers（TS 写的浏览器内 Node 运行时）；社区版 bolt.diy |
| GitHub Copilot | VS Code agent mode=TS（microsoft/vscode 内）；云端未公开；**开源 copilot-sdk 多语言：Java 5.1M/Rust 4.3M/TS 2.7M/C# 1.7M/Go 1.6M/Python 1.5M** | 插件+云 | agent host 核心或为 Java（仅推测） |
| Cursor | 客户端 Code-OSS fork(TS，据报道) | IDE | 后端未公开 |
| Windsurf | VS Code fork(TS，据报道)；2025-07 被 Cognition 收购 | IDE | 后端无可靠公开信息 |
| 字节 Trae | Code-OSS fork（据报道）+插件形态 | IDE | SOLO 模式；月活超百万（2025-06）；服务端未公开 |
| 通义灵码 | 全 IDE 插件+Lingma IDE | 插件+IDE | 阿里后端据报道以 Java 为主（未证实） |
| trae-agent（字节开源） | Python | CLI | MIT 12k★；与 Trae IDE 无直接关系（issue #273 争议） |

**规律**：①"agent 即核心资产"的新一代工具只用 Rust 或 TS——Rust 用于性能/OS 层重的（Codex/Grok/Jan 推理层），TS 用于产品一致性与分发优先的；②Python 是 Web 平台/研究系领地，本地个人工具无一选它；③IDE 插件清一色 TS（宿主 API 即 TS）；④client/server 拆分只在沙箱/多用户时出现；⑤本地优先桌面倾向"TS UI+系统语言引擎"。

# 4. 前端生态调研（2026-08-21/22 npm/GitHub 实测）

## 4.1 AI/chat 组件库全景（16 家）

| 库 | 版本/活跃度 | 许可 | 样式 | 组件清单（实测源码/官方索引） |
|---|---|---|---|---|
| **Vercel AI Elements** | vercel/ai-elements 日更；CLI ai-elements 1.9.0；repo 2.3k★ | Apache-2.0 | shadcn+Tailwind（CSS Variables；纯 copy-in：`npx ai-elements@latest` 或 `npx shadcn add https://elements.ai-sdk.dev/api/registry/all.json`；文档前置 Next.js+AI SDK+shadcn+Tailwind） | **48 个**：agent/artifact/attachments/audio-player/canvas/chain-of-thought/**checkpoint**/code-block/commit/**confirmation**/connection/context/controls/conversation/edge/environment-variables/**file-tree**/image/inline-citation/jsx-preview/message/mic-selector/model-selector/node/open-in-chat/package-info/panel/persona/**plan**/prompt-input/queue/reasoning/sandbox/schema-display/shimmer/snippet/sources/speech-input/stack-trace/suggestion/**task**/**terminal**/test-results/**tool**/toolbar/transcription/voice-selector/web-preview；message 由 streamdown 驱动 |
| **assistant-ui** | 0.15.16（前日发版），11.8k★，周下载 137 万 | MIT | headless primitives + Tailwind 预设（CLI create/init；registry 提供 **Radix 与 Base UI 两种风味、每种 shadcn 主题**） | 三层：**headless primitives 16**（Thread/Composer/Message/MessagePart/ActionBar/ActionBarMore/AssistantModal/Attachment/BranchPicker/ChainOfThought/Error/SelectionToolbar/Suggestion/ThreadList/ThreadListItem/QueueItem/AuiIf）+**预制 UI 26**（Thread/ThreadList/AssistantModal/AssistantSidebar/Attachment/ComposerTriggerPopover/ContextDisplay/DirectiveText/File/FollowUpSuggestions/Image/Markdown/MCPConfigDialog/Mermaid/MessageTiming/ModelSelector/PartGrouping/Quote/Reasoning/Scrollbar/Sources/Streamdown/SyntaxHighlighting/ToolFallback/ToolGroup/Voice）+**独立组件 7**（Accordion/Badge/**DiffViewer**/DotMatrix/NumberRoll/Select/Tabs）；**runtimes**：AI SDK/LangGraph(LangChain)/AG-UI/A2A/Google ADK/Cloudflare Agents/Mastra/Assistant Cloud/LocalRuntime/ExternalStoreRuntime/DataStream；包矩阵：react/react-native/**react-ink（终端）**/react-ai-sdk/react-data-stream/react-mcp + tool-ui 子仓（772★）；YC 背书 |
| **@ant-design/x** | 2.9.0（2026-07-28），4.7k★，周下载 83.7k | MIT | cssinjs（**2.x 需 antd ^6.1.1**；1.6.1 需 antd ^5.20.3，1.x 已终更） | 主包 18：Actions/Attachments/Bubble(+BubbleList)/CodeHighlighter/Conversations/FileCard/Folder/Mermaid/notification/Prompts/Sender/SenderSwitch/Sources/Suggestion/Think/ThoughtChain/Welcome/XProvider；monorepo 子包：**@ant-design/x-markdown**（流式 MD）、**@ant-design/x-sdk**（useXChat/useXConversations/XRequest/XStream/chat-providers/**x-mcp-client**）、**@ant-design/x-card**（AI 动态卡片/A2UI，useCardLoader）、**@ant-design/x-skill**；1.x 的 useXAgent 已移除 |
| **Semi Design** | @douyinfe/semi-ui 2.102.0（2026-07-31），10.3k★，625 版，日更 | MIT | 自研 scss 主题（DSM 平台/本地 scss 变量/插件 variables 三级；Vite 插件社区版 vite-plugin-semi-theme 0.6.0）；固定 .semi-* 类名与 CSS Modules 共存 | **AIChatDialogue**（props 实测：align 左右/左对齐、mode bubble/noBubble/userBubble、roleConfig、hints、showReference 引用、onAnnotationClick 标注、消息操作 onMessageCopy/Edit/Delete/Reset/Share/GoodFeedback/BadFeedback、dialogueRenderConfig{renderFullDialogue/Content/Action/Avatar/Title}、renderDialogueContentItem、markdownRenderProps、escapeHtml、selecting 多选）+**AIChatInput**（richTextInput/skillItem/suggestionItem/extensions/configure/horizontalScroller）+**Chat**（chatBox/chatContent/inputBox/attachment/hint）+MarkdownRender/CodeHighlight/Highlight/JsonViewer；**数据适配器**：chatCompletionToMessage/streamingChatCompletionToMessage/streamingResponseToMessage/responseToMessage/chatInputToMessage/chatInputToChatCompletion；**Message.ContentItem 原生含 ToolCall（FileSearch/WebSearch/Function/Custom/ImageGeneration/CustomObject）+MCPToolCall+Reasoning+Refusal，输入侧 text/image/file/audio**；react19-adapter.ts；无独立 @douyinfe/semi-ai 包（404 已验证） |
| **@lobehub/ui** | 5.32.4（当日发版），2.2k★，920 版 | MIT | antd ^6.1.1+**react ^19.0.0 严格**+motion+@lobehub/icons | chat/：BackBottom/Bubble/ChatHeader/ChatInputArea/ChatItem/ChatList/EditableMessage/EditableMessageList/LoadingDots/MessageInput/MessageModal/TokenTag；外围：Markdown/Highlighter(Shiki)/Mermaid/CodeDiff/CodeEditor/DraggablePanel/DraggableSideNav/NeuralNetworkLoading/SearchBar/Toc/Snippet/EmojiPicker 等 |
| shadcn 官方 chat | 2026-06 发布 | MIT | Tailwind | **MessageScroller/Message/Bubble/Attachment/Marker 五件套**+scroll-fade/shimmer CSS utilities；MessageScroller 另有 headless 版 **@shadcn/react/message-scroller（Radix 与 Base UI 双支持）**；安装 npx shadcn add …；demo 用 useChat；官方明确"不替代 AI Elements"可混用；2026-08 "Human in the Loop" 更新（@shadcn/helpers/ai-sdk 的 createChat） |
| CopilotKit | 1.68.3，36.9k★ | MIT | Tailwind | react-ui v1：Chat/Sidebar/Popup/Window/Header/Input/Textarea/Messages/Markdown/CodeBlock/Suggestions/AttachmentQueue/Button/Icons/PoweredByTag+dev-console/help-modal；v2：CopilotThreadsDrawer/useComponent（generative UI）；框架包最广（react/vue/angular/web-components/rn+channels Slack/Teams/TG/Discord/WhatsApp+a2ui-renderer+web-inspector）；AG-UI 协议（可接 LangGraph/Mastra/CrewAI/Claude Agent SDK/Google ADK/AWS Strands）；不绑自家云（OSS 核心+可选企业版） |
| streamdown | 2.5.0，5.5k★，周下载 496 万 | Apache-2.0 | **需 Tailwind+shadcn token（globals.css @source）** | react-markdown drop-in；**remend 未闭合块补全**；GFM/KaTeX/Mermaid/**Shiki**/rehype-harden 加固/memoized；插件 @streamdown/{code,cjk,math,mermaid} |
| @ant-design/x-markdown | 2.9.0，周下载 28.8k | MIT | **自包含 css（light/dark.css），无 Tailwind** | marked+DOMPurify+html-react-parser（默认安全无 dangerouslySetInnerHTML）；插件 Latex/KaTeX；100% CommonMark+GFM；**"x-markdown" 独立仓库（ondas/ant-hq）确认不存在** |
| markstream-react | 2.0.1（当日），2.9k★（monorepo） | MIT | 自带 | 多框架（Vue/Nuxt/React/Next/Svelte）；不完整 MD；Mermaid/KaTeX；**stream-diffs 流式 diff 代码块** |
| deep-chat | 2.5.0，3.7k★ | MIT | 内置 | **Web Component** 一行嵌入；直连 20+ API（OpenAI/Claude/liteLLM/Dify/Requesty）；文件/摄像头/麦克风/STS；intro panel/focus mode/hiddenMessages；独立 @deep-chat/react 不存在（以自定义元素用于 React） |
| chatscope | 2.1.1（2025-05-15 后停更 15 月），1.8k★ | MIT | @chatscope/chat-ui-kit-styles SCSS | 经典 IM：MainContainer/ChatContainer/MessageList/Message/MessageInput/MessageSeparator/Sidebar/ConversationList/Conversation/ConversationHeader/Avatar/TypingIndicator… —— **不推荐** |
| NLUX | 2.17.1（2024-08 后停更 2 年），1.4k★ | **MPL-2.0（npm）** | 自有（Nova/Jupiter 主题） | 单 AiChat 组件+@nlux/core+adapters —— **不推荐（React peer 仅 ^18）** |
| llm-ui | 0.13.3（2024-06 起休眠） | MIT | — | — **不推荐** |
| Stream Chat React（GetStream） | 商业 SaaS | SDK 开源但绑 Stream 云 | — | 绑定云服务，不适合自托管 |
| botframework-webchat（微软） | 活跃 | MIT | — | 绑 Azure Bot Service/Direct Line —— 不适用 |
| MUI / Mantine / PrimeReact / Fluent UI / Chakra UI | 活跃 | — | — | **五家均无 AI/chat 组件**（官方 all-components 页/源码 components 目录逐一核实；微软聊天 UI 在独立包 @azure/communication-react） |
| react-virtuoso | 4.18.12（2026-08-17），6.4k★，周下载 279 万 | MIT | 无样式 | followOutput/firstItemIndex 反向无限加载 —— 长会话一等选择 |

**结论**：Tailwind 线 = shadcn/ui + AI Elements + streamdown（+assistant-ui 状态层可选）；非 Tailwind 备选 Semi（消息模型最 AI 原生）或 antdx（ThoughtChain）。**"蓝色渐变玻璃 AI 风"与 Tailwind 无关**——那是 v0/Lovable 默认审美；shadcn 默认黑白中性极简。

## 4.2 CSS 方案盘点

- **CSS Modules**：Vite 原生支持 `*.module.css/.scss/.less`（装 sass/sass-embedded 或 less 即用，零插件）；`css.modules.localsConvention` 可配 camelCase。纯构建期，与 React 19 无耦合。
- **Sass/SCSS**（1.103.1）：全局变量层/reset/组件库覆写；与 CSS Modules 组合（.module.scss 局部+BEM 全局）最稳。
- **Less**：antd 6 已全面 cssinjs（@ant-design/cssinjs ^2.1.2，无 less 依赖）——**不再需要 less 定制主题**；less 仅可选旁路（getDesignToken 导出经 less-loader 注入静态样式）。antd 6.6.1：默认开启 cssVar、放弃 IE、零运行时模式（import antd/dist/antd.css）；React 19 免 @ant-design/v5-patch；已知坑：#55889（UMD 构建仅 React19 可用——Vite ESM 不受影响）、#54310（StyleProvider layer 与 icons 冲突已修）；v6 DOM 结构有调整需回归内部选择器覆写。
- **antdx 样式**：2.9.0 自带（cssinjs ^2.0.1+cssinjs-utils），无 less/tailwind/sass；**官方 @layer antd, antdx 降权机制**（业务选择器恒高于 antdx；与 Tailwind v3/v4 layer 官方共存配置）；layer 模式下子元素必须包 XProvider。
- **Semi 主题**：编译期 scss 变量注入（官方 webpack/rspack 插件 2.102.0；Vite 社区版）；官方 FAQ："不使用 CSS Module 是因为我们希望有固定的 className，为业务方保留修改/覆盖 Semi 样式的能力"——与业务 CSS Modules 互不干扰，官网自身用 .module.scss。
- **vanilla-extract**（1.21.2）：零运行时 TS 类型安全 CSS-in-TS；主题 themes API 与组件库 token 重叠——锦上添花。
- **panda-css**（1.12.0）：零运行时 utility/recipe 引擎；codegen 步骤+心智负担；组件库自带样式时收益有限。
- **emotion**（11.14.0）/ **styled-components**（6.5.3）：运行时 CSS-in-JS；与 antd cssinjs/Semi scss 叠加=两套运行时，冗余——不推荐默认。

# 5. 后端生态调研

## 5.1 TypeScript 构建块

| 包 | 版本/状态（实测） | 许可 | 结论 |
|---|---|---|---|
| **@earendil-works/pi-ai** | 0.84.2 周更（2026-05-07 首发 41 版） | MIT | 30+ provider+本地模型；dsh 源码 llm-pi-ai 复用验证；**选它** |
| **@earendil-works/pi-agent-core** | 同上 | MIT | 有状态 agent+事件流+工具执行；**选它** |
| Vercel AI SDK（ai） | **v7**：latest 7.0.73（2026-08-21）；v5.0.0=2025-07-31、v6.0.0=2025-12-22、v7.0.0=2026-06-25（约 5 月一个 major）；v6/v5 独立维护线（6.0.261/5.0.242）；1456 版、2026 年 1292 release | Apache-2.0 | Core：generateText/streamText/generateObject 统一 20+ provider；**内置 agent 循环**：Agent.generate()/stream()/ToolLoopAgent/WorkflowAgent，stopWhen=isStepCount；UIMessage 流保留但 toUIMessageStreamResponse 弃用→顶层 toUIMessageStream+createUIMessageStreamResponse；v7 breaking：**ESM-only、Node 22+**、system→instructions、onFinish→onEnd、fullStream→stream、telemetry→@ai-sdk/otel；**新增 HarnessAgent 统一驱动 Claude Code/Codex/Pi**；子代理/tool approvals/memory 文档齐 —— 备选 |
| @mastra/core | 1.61.0 日更（1503 版）；@mastra/memory 1.27/rag 2.6/mcp 1.17；27.4k★ | Apache-2.0+**ee/ 目录商业许可**（开发测试免费生产付费） | server-first 全家桶（agent+workflow+memory+RAG+MCP server+evals+observability+deployers+A2A）；model 层 alias 依赖 @ai-sdk/provider-v5/v6/v7 三版本（建于 AI SDK provider 抽象）；standard-schema（zod/TypeBox 均可）—— 重型框架接管架构，不选 |
| @anthropic-ai/claude-agent-sdk | 0.3.238 日更（271 版） | **专有（Commercial ToS）**——明确允许用于面向自己客户的产品 | 零依赖包 spawn 平台原生二进制（8 平台包）；pathToClaudeCodeExecutable/bun extractFromBunfs/spawnClaudeCodeProcess 可替换进程层；**锁 Claude**（可 Bedrock/Vertex 但模型仍 Claude） |
| @openai/codex-sdk | 0.149.0 日更（821 版） | Apache-2.0 | spawn codex CLI 换 JSONL；startThread/resumeThread/outputSchema(Zod)/env（Electron sandboxed hosts）/config 透传/**baseUrl 可覆盖**；模型默认 OpenAI（OSS 模式/config.toml model_providers 文档未能一手核实） |
| llamaindex | 0.12.1（2025-12-02 后零发布） | MIT | 实质停更 —— 不选 |
| @langchain/langgraph | 1.4.12（1.0=2025-10-18） | MIT | 图编排，重型 —— 不作主干 |
| zod | **4.4.3**（v4 stable=2025-07-09，v3.25 起同包分发） | MIT | 内部校验默认；v3→v4 有迁移成本 |
| typebox | **1.3.16（新包名无 scope；1.0=2025-09-09；repo sinclairzx81/typebox）**；旧 @sinclair/typebox 0.34.52 双线并存 | MIT | 直接产标准 JSON Schema、零运行时、pi 全家用 —— wire schema 值得 |
| **SSE 库现状** | eventsource 5.1.1（MIT，2026-08-20，WHATWG 合规免 flag）；eventsource-parser 4.1.0（纯解析器）；@microsoft/fetch-event-source 已死（2.0.1，2021 后无更新） | — | 服务端生成：手写 ~50 行（text/event-stream+ReadableStream）；Node 原生 EventSource 到 v26 仍 experimental 需 flag |
| **JSONL 库现状** | 无事实标准：@alcalzone/jsonl-db 4.0.2（KV 型）/jsonl-stream 2.0.0（流 parser）/@discoveryjs/json-ext | — | **自写 ~50 行**（fs appendFile+单写者）；dsh 自己发了 @deepseek-ai/dsh-session-persistence-jsonl（0.0.1-rc.1，BSD-3）——大家都自写 |

## 5.2 Go 生态（曾深入评估，最终未选）

- **cloudwego/eino**：稳定线 v0.9.15（2026-08-18）+ v0.10.0-alpha.19（2026-08-21，几乎日更）；12,790★；Apache-2.0。components/{model,tool,prompt,retriever,indexer,embedding,document}；compose/{Chain,Graph,Workflow}；flow/ 预置模板；**adk/**：ChatModelAgent（内置 ReAct 工具循环）、**Runner（iter.Next() 逐个吐 AgentEvent 的事件迭代器）**、Plan-Execute、DeepAgent（子 agent 委派）、multi-agent transfer（deterministic_transfer）、**interrupt/resume（HITL）**、failover ChatModel、filesystem middleware；Callback 五切面（OnStart/OnEnd/OnError/OnStartWithStreamInput/OnEndWithStreamOutput）；部分 Agentic* 标 [Beta]。生产：字节内部实践（未点名产品）。
- **eino-ext**（803★，Apache-2.0，日更）：model 16 家（openai/claude/deepseek/gemini/ollama/qwen(DashScope)/ark(火山/Doubao)/arkbot/openrouter/qianfan + agentic 系列 Beta）；tools（bingsearch/browseruse/commandline/duckduckgo/googlesearch/httprequest/**mcp**/searxng/sequentialthinking/wikipedia）；callbacks/{langfuse,langsmith,apmplus,cozeloop}；libs/acl/{openai,langfuse,opentelemetry}；devops 可视化调试；skills/acp。
- **Firebase Genkit Go**（genkit-ai/genkit，6,352★，Apache-2.0）：go/v1.12.0（2026-08-17，月更+）；provider 覆盖最广（Google AI/Vertex、Anthropic、OpenAI、xAI、DeepSeek、DashScope、Moonshot、**Z.ai(GLM)**、Vertex Model Garden、Ollama、任意 OpenAI 兼容）；Flows（可部署单元）/tool calling/structured output/agentic workflows+interrupts/multi-agent/durable streaming/chat session/evals/本地 observability/部署 Cloud Run 等；文档语言选择器 Go 未标 Preview（推断按 GA 对待）；Flows 运行时偏 GCP。
- **tmc/langchaingo**：9,630★，MIT；**2026-01-11 后停滞 ~7 个月**，v0.1.14（2025-10-20），168 open PR 无人合 —— 不作主干。
- 官方 SDK：**openai/openai-go v3.52.0**（Stainless 生成，日更，官方优先）；**anthropics/anthropic-sdk-go v1.66.0**（一周数版；NewStreaming 返回 ssestream.Stream[MessageStreamEventUnion] 完整事件族；examples 含 agents/mcp-tool-runner/managed-agents/multimodal；Bedrock/Vertex 认证变体）；**googleapis/go-genai v1.69.0**（周更；GenerateContentStream；**v2.0 将对 GenerateVideos breaking，pin <2.0.0**）；sashabaranov/go-openai v1.42.0（事实标准第三方；chat_stream/response_stream 均有——已跟进 Responses API）；DeepSeek 无官方 Go SDK（走 OpenAI 兼容或 eino-ext；社区 cohesion-org/deepseek-go 343★ 2026-05 后不活跃）。
- **modelcontextprotocol/go-sdk**：**v1.7.0（2026-07-28），v1 稳定 semver，production-ready 无悬念**；5,004★；MIT→Apache-2.0 过渡声明；包 mcp/jsonrpc/auth/oauthex；支持最新 spec 2026-07-28 及历史四版。
- trpc-group/trpc-a2a-go：242★；v2.0.0-alpha.3（2026-07-22）——A2A 最完整 Go 实现，体量小，"以后再接"。
- 其他：swarmgo（362★，2025-04 后停更）不推荐；lingoose（834★，v0.3.0，2026-03）设计干净但规模小。
- 基础设施：SSE 用标准库（http.Flusher + http.NewResponseController，~50 行自写；r3labs/sse 2024-06 停更、tmaxmax/go-sse 2025-05 后无 push 均不强势）；JSONL 标准库（O_APPEND+encoding/json+bufio.Scanner，自保单写者与 fsync）；WebSocket：**coder/websocket**（5,420★，ISC，2026-06 活跃；nhooyr 迁移）> gorilla/websocket（24,848★ 但 2025-03 后 17 个月无提交）；golang.org/x/net/websocket 老旧勿用。

# 6. 语言边界与混合架构

**语言只是语言，边界在进程而不在语言。** Go 后端完全可以驱动 TS 开源引擎——spawn 子进程+stdio/HTTP 桥接。业界先例：Claude Agent SDK（TS 包驱动原生二进制）、Codex TS SDK（TS spawn Rust 二进制）、Grok leader/follower（IPC 复用 ACP）、ACP（跨语言标准）。我方"不能用"的准确含义仅是：Go 进程内不能直接 import TS 库、不能共享类型（协议需 JSON Schema/OpenAPI 双侧生成）。代价：进程管理/两跳延迟/打包双运行时/上游协议版本对齐。

三条可行路线对比：

| 路线 | 复用度 | 可控性 | 主要成本 |
|---|---|---|---|
| a) 纯 TS 一体 | ★★★★★（pi 包直接 import+类型共享） | ★★★ | 无 |
| b) Go 网关+pi 引擎 sidecar | ★★★★（引擎白拿） | ★★★ | 双运行时+桥接层+协议同步 |
| c) 纯 Go 自写（eino/官方 SDK） | ★★ | ★★★★★ | provider 适配层 2-4 人周+失去 pi/dsh 直抄 |

**最终选择 a**：与 Claude Code/dsh/pi/opencode 同路线；协议零成本共享；参照源码同语言可直译。

# 7. 其他产品调查

## 7.1 ZCode（Z.ai/智谱，闭源）

- 身份：GLM-5.3 官方 Harness，"Agentic Development Environment"；https://zcode.z.ai（中英）；桌面应用（Linux x64/Win/macOS）；DevOps.com 报道定位与 Copilot/Cursor/Anthropic 竞争；**无官方开源仓库**（社区只有 obra/superpowers 中文适配等把 ZCode 列为支持目标；Paseo #1670/RTK #2898 均在推动支持）。
- **本机实测**（~/.zcode）：cli/{agents,bundled-agents,cache,config.json,db,exec,image-cache,log,plugins,rollout}；v2/{bot-config,bot-state.v2,bots-model-cache,bots-runtime-locks,certs,checkpoints,coding-plan-cache,config,crash,credentials}；export-log-stage/feedback/plugin-workspace/projects/tmp/workspace。
  - **rollout/**：model-io-sess_<会话id>.jsonl + model-io-sess_subagent_agent_<id>.jsonl——**目录名与 Codex 同源**；首行实测 `{"completedAt","durationMs","requestId","attempt","model":{modelId,providerId,role,source},"request":{body:{model,max_...`——模型 I/O 日志。
  - **插件**：plugins/cache/<org>/<name>/<version>/{package.json,dist,docs,scripts,skills}；清单：android-emulator/browser-use/document-skills/ios-simulator/restore-legacy-sessions/skill-creator/superpowers/zcode-guide；实测 @zcode/browser-use-plugin deps=**@modelcontextprotocol/server、@zcode/contracts、@zcode/core、@zcode/shared、zod**——插件层纯 TS+zod+MCP SDK。
  - config.json 含 mcp.servers（http 型，headers X-Goog-Api…）。
- 结论：Codex 架构范式追随者（rollout/插件/skills），不可作源码参考，可观察行为设计。

## 7.2 Qoder / TraeWork / trae-agent

- Qoder（阿里 agentic 编程平台，qoder.com/zh）：多智能体协同/长时委派/记忆知识引擎；前身关联通义灵码（VS Code Marketplace Alibaba-Cloud.tongyi-lingma）；**闭源**（阿里 GitHub 539 仓无本体；周边 alibaba/open-code-review）。
- TraeWork（trae.cn，"复杂工作就用 TraeWork"）：AI 办公平台，Work/Code/Design 三模式，飞书/微信/钉钉插件；**闭源**；无 trae-work 官方开源仓（GitHub trae-suite/trae-ide 相关多为第三方）。
- **bytedance/trae-agent**：MIT，12,048★，Python 0.5MB；"基于 LLM 的通用软件工程任务智能体 CLI"；与 Trae IDE 关系社区争议（issue #273）；2026-02-05 最后 push。

# 8. 逆向的边界（三层）

1. **官方接口定义（甚至不算逆向）**：Claude Code 的 sdk.d.ts（38.9 万字节类型+TSDoc：38 成员消息联合/34 控制子类型/31 hooks/每字段语义）是官方主动发布的接口规格——本次调研大量结论直接来自它，零成本。
2. **压缩产物可"推断"什么**：bundle 保留字符串与结构（类型名/子类型名/flag 名无法混淆），丢失变量名/注释/组织——可精确定位协议形状与执行流程，读不出优雅源码；专有许可下**不可复制代码**。
3. **运行时行为观测**：minusx 网络抓包（主循环/提示词规模/子代理行为）；我方对 ZCode 的磁盘观测（rollout 格式/插件依赖）——观察行为非还原代码。

一句话：**接口可逆向、源码不可逆向、思路随便学**——接口规格与思想不受版权保护，代码受。

## 7.3 新一轮候选参考性评估（2026-08-23 补充：Gemini/Antigravity/Hermes/OpenClaw/ZCode/Qoder/Trae）

| 产品 | 开源/许可 | 核验事实 | 前端可参考 | 后端可参考 | 结论与原因 |
|---|---|---|---|---|---|
| **Gemini CLI**（google-gemini/gemini-cli） | ✅ Apache-2.0 | 106,619★，TS 20.4MB，日更；packages：a2a-server/cli/core/devtools/sdk/vscode-ide-companion；core/src 含 agent/confirmation-bus/policy/safety/sandbox/scheduler/skills/mcp/voice 等模块；CLI=React+Ink | ✅ TUI（Ink）分层与 vscode-ide-companion | ✅ **core/cli 分包是 TS 同语言"引擎与 UI 分离"的最佳范本；confirmation-bus 审批总线；policy/safety/sandbox；a2a-server（A2A 协议）** | **✅ 纳入参考（Tier 2）**。⚠️ 治理风险：Google 正把用户从开源 Gemini CLI 迁往**闭源** Antigravity CLI（2026-08 社区争议）——代码 Apache-2.0 仍可用，但应视为快照参考并 pin 版本，不追新 |
| **Google Antigravity（反重力）** | ❌ 闭源 | agent-first IDE：VS Code fork（MIT 底座）+ Google 专有 agent 层（企业许可头）；不支持自托管；即 Antigravity CLI 本身也闭源 | ❌ 仅可观察 UX（浏览器界面/任务面板设计） | ❌ | **❌ 不可参考源码**。原因：闭源专有；与 ZCode 同归"行为观察"类 |
| **Hermes Agent**（NousResearch/hermes-agent） | ✅ MIT | 234,494★，Python 72.3MB + TS 20.1MB，日更；v0.20.5；多渠道（TG/Discord/Slack/WhatsApp/Signal/Email/CLI）+ 持久记忆 + 技能自动生成 + cron + 子代理（Python RPC）+ 五种沙箱后端（local/Docker/SSH/Singularity/Modal）；桌面端+CLI | 部分（apps 为多渠道客户端） | ✅ **多渠道接入模型（"one agent, one memory, every surface"）、子代理隔离与 RPC、沙箱后端抽象、acp_adapter** | **✅ 纳入参考（Tier 2，Python 为主）**。抄思路不抄代码（Python→TS 需重写）；TS 部分可直接读 |
| **OpenClaw**（openclaw/openclaw，原 Clawdbot） | ✅ MIT（OpenClaw Foundation） | 387,185★（本表最高），TS 277.7MB + Swift 14.8 + Kotlin 5.6；apps 全平台原生（android/ios/macos/linux/shared）；packages 23 个：**acp-core/agent-core/gateway-client/gateway-protocol**/llm-core/markdown-core/memory-host-sdk/model-catalog-core/net-policy/**plugin-package-contract/plugin-sdk**/session-url-contract/terminal-core/tool-call-repair 等 | ✅ **多端客户端组织（原生 apps + shared）、ACP 集成** | ✅ **gateway-protocol 独立协议包（与我们的 protocol 包同思路）、插件合同双包（plugin-sdk + plugin-package-contract）、net-policy、terminal-core** | **✅ 纳入参考（Tier 2）**。定位是个人助理非 coding agent，但网关/插件/多端架构层完全同构；MIT 可复用 |
| **ZCode**（Z.ai） | ❌ 闭源 | 详见 §7.1 | ❌（仅行为观察） | ❌ | **❌ 不可参考源码**。原因：闭源无官方仓库；本机只能观察 rollout/插件行为 |
| **Qoder**（阿里） | ❌ 闭源 | 详见 §7.2 | ❌ | ❌ | **❌ 不可参考源码**。原因：闭源，阿里 GitHub 无本体 |
| **Trae IDE / TraeWork（字节）** | ❌ 闭源（IDE/平台）；✅ trae-agent MIT | 详见 §7.2 | ❌ | 部分（trae-agent，Python，工作流/工具组织思路） | **❌ IDE 本体不可参考；✅ trae-agent 轻参考**（与 Trae IDE 无直接关系） |

**本轮要点**：①Gemini CLI 与 OpenClaw 是新增的高价值 TS 参考（前者补"TS 引擎/UI 分包+审批总线"，后者补"网关协议+插件合同+多端"）；②Hermes 补"多渠道+子代理+沙箱后端"思想；③Antigravity/ZCode/Qoder/Trae IDE 全部因闭源出局，只留 UX 观察；④Gemini CLI→Antigravity 迁移争议再次验证"参考开源快照要 pin 版本"的纪律。

# 9. 参考资料资产盘点

## 9.1 用户 GitHub（Wanfeng1028）fork 资产

| 仓库 | 性质 | 用途 |
|---|---|---|
| codex / deepseek-harness / pi / grok-build | 真源码 fork | 四大 Tier1 参考 |
| claude-code | 官方仓 fork（2026-03-30 后未同步） | plugins/ 16 官方插件 + CHANGELOG + examples/{hooks,settings} + scripts（issue 自动化，参考价值低）；**无 CLI 源码**；建议 Sync fork |
| claude-code-analysis | 泄露源码+19 章中文分析 | **只读学思想** |
| chrome-devtools-mcp / react-bits / better-harness / ui-ux-pro-max-skill / awesome-human-distillation / skillhub-desktop / CodexPlusPlus / PaiSwitch / twenty / neko-master / hello-agents 等 | 生态 | 前端动效/评测/技能生态 |
| 自有项目：GeoWork（TS，GIS 桌面工作台）/ SpaceLab / PlanningGo / ParrotSound / aichat_export_tools | — | 背景 |

## 9.2 claude-code 官方插件清单（16 个，真开源）

agent-sdk-dev / claude-opus-4-5-migration / code-review / commit-commands / explanatory-output-style / feature-dev / frontend-design / hookify / learning-output-style / plugin-dev / pr-review-toolkit / ralph-wiggum / security-guidance（README 列表实测）——每个 = 系统提示词+斜杠命令+hooks+脚本的组合，学工作流设计的一手材料。

## 9.3 张汉东《Grok Build 源码分析》

https://zhanghandong.github.io/grok-build/ ——19 章六部（全景[时代/75-crate 工程哲学]、代理运行时[Actor 会话引擎/agentic 循环/上下文压缩/持久化/leader-follower]、工具系统[两层抽象/文件编辑/checkpoint-worktree/沙箱/拿来主义归一层]、TUI[事件循环/增量渲染/流式 Markdown/终端工程学]、扩展与治理[MCP-Hooks-插件/治理与记忆]、工程纪律[韧性工程]）；**论断附 file:line 引用+自动化校验**+版本基准（SOURCE_REV）+与 Codex 实现对比小节；以 openai/codex 与 sst/opencode 为对照系；四条阅读路径。

# 10. 参考体系定稿与法律边界

| # | 项目 | 抄什么 | 关键文件 |
|---|---|---|---|
| 1 | pi | 引擎最简骨架、JSONL 树会话、可直接 import 的包 | agent/src/agent-loop.ts、coding-agent/src/core/session-manager.ts |
| 2 | dsh | 事件日志纪律（编译期 surface 强制+读端 fail-closed）、fail-closed 审批、Web UI 组织、插件化 | core/session/src/types.ts、interaction/user-approval/src/index.ts、apps/web |
| 3 | opencode | durable/live 二分、steer/queue 队列、权限规则引擎、单契约多客户端、SSE 单端点 | schema/src/event.ts、core/src/session/input.ts、core/src/permission.ts、server/src/handlers/event.ts |
| 4 | Codex | 协议形状（thread/turn/item）、审批结构化提案、反向扫描 resume、并行门控、steering 三态 | protocol/src/turn_input.rs、app-server-protocol、rollout/src/reverse_jsonl_scanner.rs、core/src/tools/parallel.rs |
| 5 | Grok Build | leader 单实例、多域 checkpoint、TUI 调度纪律、NFS SQLite 教训 | xai-grok-shell/src/leader/、workspace/src/session/checkpoint.rs |
| 6 | Claude Code | 实现细节答案之书（**只读不抄**）+官方 plugins 学工作流+SDK 类型学接口 | claude-code-analysis/src+analysis/、官方 plugins/、sdk.d.ts |
| 7 | **Gemini CLI**（2026-08-23 增） | TS 同语言的 core/UI 分包范本、**confirmation-bus 审批总线**、policy/safety/sandbox、a2a-server；⚠️ pin 版本（Google 迁移闭源 Antigravity 风险） | packages/core/src/confirmation-bus、packages/core、packages/a2a-server |
| 8 | **OpenClaw**（2026-08-23 增） | gateway-protocol 独立协议包、插件合同（plugin-sdk + plugin-package-contract）、net-policy、多端原生 apps 组织 | packages/gateway-protocol、packages/plugin-sdk、apps/ |
| 9 | **Hermes Agent**（2026-08-23 增，Python 为主） | 多渠道接入（one agent one memory every surface）、子代理 RPC 隔离、沙箱后端抽象（五种）、acp_adapter——抄思路不抄代码 | repo: NousResearch/hermes-agent（agent/、acp_adapter/） |
| 附 | trae-agent（Python，MIT） | 工作流/工具组织轻参考（与 Trae IDE 无关） | repo: bytedance/trae-agent |

**法律边界**：Apache-2.0/MIT 可复用代码（保留版权声明，Rust→TS 仍需重写）；Claude Code 专有——sdk.d.ts 接口规格与思想可学，泄露源码**一行不抄**；"grokbuild.cloud"等第三方与官方无关。

---

*报告完（v1.2）。实施细节见 `02-development-plan.md`。*
