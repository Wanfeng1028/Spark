# Agent 产品与技术生态调研报告（详细版）

> 调研周期：2026-08-21 ~ 2026-08-22
> 调研方式：全部在线进行（GitHub API `gh api` / npm registry / raw 文件直读 / 官方文档 / 本机安装目录观测），**未在本地克隆任何仓库**。六个核心项目完成源码级精读（函数级调用链 + 真实代码片段，文中所有路径为仓库内相对路径、行号为精读当日快照）。
> 目的：为自研 Agent 产品（本地优先，Web 前端 + 引擎后端，后期 Electron 桌面）确定技术栈与架构参考体系。
> 配套文档：`02-development-plan.md`（完整开发方案）。

---

## 目录

- 一、六大参考产品源码级调研
- 二、六家横向对比
- 三、行业语言与架构盘点
- 四、前端生态调研
- 五、后端生态调研
- 六、其他产品调查（ZCode / Qoder / Trae）
- 七、参考资料资产盘点
- 八、参考体系定稿与法律边界

---

# 一、六大参考产品源码级调研

## 1.1 OpenAI Codex（openai/codex）

### 1.1.1 基本盘

- 仓库：https://github.com/openai/codex ，描述 "Lightweight coding agent that runs in your terminal"，**Apache-2.0**，约 11 万 stars，main 分支日更（当时稳定版 0.149.0）。
- 顶层结构：`codex-rs/`（Rust workspace，100+ crate）、`codex-cli/`（npm 壳 `@openai/codex`，bin 脚本下载平台二进制）、`sdk/typescript` + `sdk/python`（官方 SDK）、`third_party/`、Bazel + pnpm 混合构建。
- **开源范围**：Rust 核心、TUI（Ratatui）、TS/Python SDK。**桌面 app（Electron+Node.js，2026-02 起）、VS Code 扩展（openai.chatgpt，约 1333 万安装）、Web 云端（chatgpt.com/codex，服务端容器跑同一 harness，参考镜像 ghcr.io/openai/codex-universal）均闭源**。

### 1.1.2 分层架构

```
Rust core（唯一引擎）
  ├─ 内部协议 protocol v1：SQ/EQ 双队列（进程内/任意双向流，JSONL 序列化）
  ├─ app-server（JSON-RPC 2.0' ：stdio JSONL / Unix socket / 实验性 WebSocket）
  └─ mcp-server（把引擎暴露为 MCP server，MCP over stdio）
客户端（全部是协议客户端，连官方 TUI 都是）：
  TUI（Ratatui，经 app-server-client 连接）· codex exec（InProcessAppServerClient）
  · 桌面 app · IDE 扩展 · TS SDK（spawn CLI 换 JSONL）· 云端 Web
```

关键事实：**TUI 的 Cargo.toml 依赖 `codex-app-server-client`，不直接依赖 core**——`tui/src/app_server_session.rs` 使用 `AppServerClient`（区分 `InProcess(_)` 与 `Remote(client)` 两种传输）。

### 1.1.3 SQ/EQ 协议（`codex-rs/protocol/src/protocol.rs`）

文件头注释：*"Defines the protocol for a Codex session between a client and an agent. Uses a SQ (Submission Queue) / EQ (Event Queue) pattern to asynchronously communicate between user and agent."*

```rust
pub struct Submission {
    pub id: String,                       // 与 Event 关联的 correlation id
    pub op: Op,
    pub trace: Option<W3cTraceContext>,
    pub parent_turn_id: Option<String>,   // inter-agent 通信
    pub root_turn_id: Option<String>,
}

#[serde(tag = "type", rename_all = "snake_case")]
pub enum EventMsg {
    Error(..), Warning(..), GuardianWarning(..), ContextCompacted(..), ThreadRolledBack(..),
    #[serde(rename = "task_started", alias = "turn_started")]       // v1 wire 兼容
    TurnStarted(..),
    #[serde(rename = "task_complete", alias = "turn_complete")]
    TurnComplete(..),
    TokenCount(..), AgentMessage(..), UserMessage(..), AgentReasoning(..),
    SessionConfigured(..), McpToolCallBegin/End(..), WebSearchBegin/End(..),
    ExecCommandBegin(..), ExecCommandOutputDelta(..), ExecCommandEnd(..),
    ExecApprovalRequest(..), ApplyPatchApprovalRequest(..), RequestPermissions(..),
    RequestUserInput(..), ElicitationRequest(..), PatchApplyBegin/Updated/End(..),
    TurnDiff(..), PlanUpdate(..), TurnAborted(..), ShutdownComplete,
    ItemStarted(..), ItemCompleted(..), AgentMessageContentDelta(..), PlanDelta(..),
    ReasoningContentDelta(..), CollabAgentSpawnBegin/End(..), SubAgentActivity(..), ...
}
```

`Op` 变体（`#[non_exhaustive]`，实测枚举）：`Interrupt`、`TurnInput{request, mode, reply: oneshot}`、`ExecApproval{id, turn_id, decision}`、`PatchApproval`、`UserInputAnswer`、`RequestPermissionsResponse`、`DynamicToolResponse`、`InterAgentCommunication`、`Compact`、`ThreadRollback{num_turns}`、`Review`、`Shutdown`、`RunUserShellCommand`、`RealtimeConversation*`（语音）等约 25 个。**两个要点：审批"答复"本身也是一条 Submission（同一队列保证因果顺序）；多个 Op 内嵌 `oneshot::Sender` 直接回执通道。**

### 1.1.4 Steering 一等公民（`protocol/src/turn_input.rs`）

```rust
pub enum TurnInputMode {
    StartOrSteer,                        // 空闲开新 turn，忙则注入活跃 turn
    StartIfIdle,                         // 仅空闲时开 turn
    Steer { expected_turn_id: String },  // 仅当指定 turn 活跃时注入
}
// 提交结果三态：
// TurnInputSubmission::{Started{turn_id}, Steered{turn_id},
//                       NotSubmitted{reason: NotIdle|PendingTriggerTurn|PlanMode|
//                                    NoActiveTurn|ExpectedTurnMismatch|ActiveTurnNotSteerable}}
```

### 1.1.5 app-server v2 协议

- `rpc.rs`：*"We do not do true JSON-RPC 2.0, as we neither send nor expect the 'jsonrpc': '2.0' field."* 四种传输：stdio（JSONL，默认）/ Unix domain socket（`$CODEX_HOME/app-server-control/*.sock`，HTTP Upgrade）/ WebSocket（实验）/ 进程内。
- 方法表宏集中生成（`app-server-protocol/src/protocol/common.rs`），三个宏生成 ClientRequest/ClientResponse、ServerRequest/ServerResponse、ServerNotification。
- Client→Server：`initialize`、`thread/start|resume|fork|archive|delete|list|read|search|rollback|revert|compact/start`、`thread/turns/list`、`thread/items/list`、`turn/start|steer|interrupt`、`review/start`、`model/list`、`fs/readFile|writeFile|watch`、`command/exec(+write/terminate/resize)`、`process/spawn(+writeStdin/kill/resizePty)`、`mcpServer/tool/call`、`remoteControl/pairing/start`（手机配对遥控）等。
- **Server→Client 审批请求**（v2，带 item 语义）：

```rust
server_request_definitions! {
    CommandExecutionRequestApproval => "item/commandExecution/requestApproval" { .. },
    FileChangeRequestApproval => "item/fileChange/requestApproval" { .. },
    ToolRequestUserInput => "item/tool/requestUserInput" { .. },
    McpServerElicitationRequest => "mcpServer/elicitation/request" { .. },
    PermissionsRequestApproval => "item/permissions/requestApproval" { .. },
    DynamicToolCall => "item/tool/call" { .. },        // 客户端动态工具
    /// DEPRECATED（legacy）：ApplyPatchApproval / ExecCommandApproval
}
```

- Server→Client 通知：`thread/started`、`turn/started|completed`、`item/started|completed`、`item/agentMessage/delta`、`item/reasoning/summaryTextDelta`、`item/commandExecution/outputDelta`、`turn/diff/updated`、`thread/tokenUsage/updated` 等。
- 三个原语：**Thread（会话）/ Turn（一次交换）/ Item（单条输入输出）**；`ThreadItem` tagged enum 约 15 类（agentMessage/reasoning/commandExecution/fileChange/mcpToolCall/webSearch/todoList/contextCompaction/dynamicToolCall/collaborationAgentToolCall/subAgentActivity...）。
- 工具：`codex app-server generate-ts / generate-json-schema` 给客户端生成类型绑定。背压：入站饱和返回 `-32001` Server overloaded。

### 1.1.6 Turn 完整调用链（函数名级）

```
CodexThread::start_or_steer_turn()            core/src/codex_thread.rs L262
 └─ submit(Op::TurnInput{request, mode}) → SQ 入队
Session::spawn_task::<RegularTask>()          core/src/tasks/mod.rs L279
 └─ RegularTask::run()                        core/src/tasks/regular.rs
     ├─ 发 EventMsg::TurnStarted
     ├─ consume_startup_prewarm_for_regular_turn()      // MCP 预热
     └─ 外层 loop（吃排队输入）
         run_turn(sess, ctx, input)           core/src/session/turn.rs L153
           ├─ drain_async_hook_results(before_user_prompt=true)
           ├─ model_client.new_session()                 // turn 级对象，缓存 WebSocket+sticky routing
           ├─ run_pre_sampling_compact()                 // 预压缩防上下文爆
           ├─ capture_step_context_with_required_mcp_servers()
           │    → StepContext（一次性冻结：历史+工具表+模型信息）
           ├─ build_skills_and_plugins(); run_hooks(TurnStart)
           └─ 内层 loop（采样⇄工具）
               pending_input = input_queue.get_pending_input()   // steering 在此并入
               sampling_input = sess.clone_history().for_prompt(modalities)
               run_sampling_request()         同文件 L1340
                 └─ try_run_sampling_request() L2179
                     └─ client_session.stream(prompt) → 逐条处理：
                         · OutputItemAdded → emit ItemStarted
                         · AgentMessage/Reasoning delta → emit_*_delta
                         · FunctionCall/CustomToolCall → ToolRouter::build_tool_call()
                           → ToolCallRuntime::handle_tool_call() → in_flight.push_back(future)
                         · drain_in_flight()：并发收割工具 future 回填 history
                         · handle_retryable_response_stream_error(max_retries/backoff)
               needs_follow_up = 有新 tool call || 有 pending input
         发 TurnDiff / TokenCount / TurnComplete
```

### 1.1.7 工具系统三层

```rust
// codex-rs/tools/src/tool_executor.rs（最底层 trait）
pub trait ToolExecutor<Invocation>: Send + Sync {
    fn tool_name(&self) -> ToolName;
    fn spec(&self) -> ToolSpec;
    fn exposure(&self) -> ToolExposure { ToolExposure::Direct }
    fn supports_parallel_tool_calls(&self) -> bool { false }
    fn handle(&self, invocation: Invocation) -> ToolExecutorFuture<'_>;
}
// ToolExposure: Direct / Deferred / DeferredModelOnly / DirectModelOnly / CodeModeOnly / Hidden
// + bitflags ToolExposures{DIRECT, DEFERRED, CODE_MODE}（初始可见/tool_search 可发现/code-mode 可嵌套）
```

- `core/src/tools/registry.rs`：`CoreToolRuntime` trait + `ToolRegistry{entries, register_trusted(), register_external(), remove()}`，分发入口 `dispatch_any_with_terminal_outcome()`（L479）。
- `core/src/tools/router.rs`：`ToolRouter{registry, model_visible_specs}`，`build_tool_call(ResponseItem)` 解析模型的 FunctionCall/CustomToolCall/ToolSearchCall。
- 内置 handler（`handlers/mod.rs` 实测）：`unified_exec`（常驻 shell，`process_manager.rs` 管理会话）、`apply_patch`、`view_image`、`sleep`、`tool_search`、`multi_agents(_v2)`（spawn_agent/send_message/wait/close_agent）、`McpHandler`、`PlanHandler`、`RequestUserInputHandler`、`DynamicToolHandler`、`GetContextRemainingHandler`、`new_context_window`、`send_user_message_async` 等。
- **并行门控**（`core/src/tools/parallel.rs` L49-205）：

```rust
let supports_parallel = router.tool_supports_parallel(&call);
let _guard = if supports_parallel {
    Either::Left(lock.read().await)      // 可并行工具：读锁共享
} else {
    Either::Right(lock.write().await)    // 串行工具：写锁独占
};
router.dispatch_tool_call_with_terminal_outcome(...).await
// 外层 tokio::spawn + AbortOnDropHandle + select!(cancellation)：
// 取消时要么拿到终态、要么合成 aborted 响应回填模型——上下文永不悬挂 tool_call
```

### 1.1.8 持久化 rollout

```rust
// codex-rs/history/src/lib.rs（注意：类型在 history crate，rollout crate 只做 IO）
pub enum RolloutItem {
    SessionMeta(SessionMetaLine),
    ResponseItem(ResponseItemEnvelope),    // Responses API 原始 item + harness 元数据
    InterAgentCommunication(..),
    Compacted(CompactedItem),              // 压缩摘要 + replacement_history + window 链
    TurnContext(TurnContextItem),          // cwd/model/approval/sandbox 快照（每 turn 记录）
    WorldState(WorldStateItem),
    EventMsg(EventMsg),                    // 事件也落盘
    ...
}
pub struct RolloutLine { pub timestamp: String, pub ordinal: Option<u64>,
                         #[serde(flatten)] pub item: RolloutItem }
```

- 写侧：`RolloutRecorder` 经 `mpsc::Sender<RolloutCmd>`（AddItems/Persist/Flush）发给独立 writer task；失败 `terminal_failure()` 缓存错误保留内存缓冲可重试；`persist()` 幂等；`flush()` 带 oneshot ack。
- 读侧：`ReverseJsonlScanner`（`rollout/src/reverse_jsonl_scanner.rs`）从 EOF 按 64KB chunk 回退 seek，字节级反转拼行再解析；`with_max_record_bytes` 超大记录跳过；坏行返回 `ScanOutcome::Rejected` 不中断。**resume 成本 O(尾部) 而非 O(全量)**。
- 配套：`compression.rs`（压缩 rollout + 后台 materialize worker）、`state_db.rs`（SQLite 索引）、`session_index.rs`。

### 1.1.9 审批与沙箱

```rust
pub enum ReviewDecision {                       // protocol.rs L3871
    Approved, ApprovedForSession,
    ApprovedExecpolicyAmendment { proposed_execpolicy_amendment },  // 批准并固化前缀规则
    ApprovedMcpPolicyAmendment, NetworkPolicyAmendment { .. },
    Denied { rejection: String }, TimedOut, Abort,
}   // Default = Denied（fail-safe）
pub enum AskForApproval { UnlessTrusted, OnRequest(default),
                          Granular(GranularApprovalConfig), Never }
```

- 审批请求载荷 `ExecApprovalRequestEvent`（`approvals.rs` L226）：`call_id/approval_id/turn_id/command/cwd/reason/network_approval_context/proposed_execpolicy_amendment/proposed_network_policy_amendments/additional_permissions/available_decisions/parsed_cmd`。
- 策略评估：`core/src/exec_policy.rs` 的 `create_exec_approval_requirement_for_command()` → Starlark 规则（`execpolicy` crate：`prefix_rule(pattern=..., decision="allow|prompt|forbidden")`）→ `ExecApprovalRequirement{Allow|Prompt|Deny}`。
- 编排层 `core/src/tools/approvals.rs`：guardian 自动审批复核（可超时/取消）+ permission hooks + MCP 工具审批 + 会话内审批缓存。
- 沙箱：`sandboxing/` crate 统一导出 `SandboxManager`；平台后端 macOS Seatbelt（3 个 .sbpl 策略文件）/ Linux Landlock+bwrap / Windows `windows-sandbox-rs`；网络隔离 network-proxy。

### 1.1.10 MCP 双向

- 作为 server：`codex mcp-server`（MCP over stdio, JSON-RPC 2.0），复用 app-server-protocol 类型；审批是 server→client 请求（applyPatchApproval/execCommandApproval）。
- 作为 client：`rmcp-client` crate（官方 Rust MCP SDK rmcp）+ config.toml `[mcp_servers]`；core 内 McpManager/mcp_tool_call.rs，MCP 工具调用纳入审批体系。

---

## 1.2 Claude Code（anthropics）

### 1.2.1 基本盘与分发演进

- npm 包 `@anthropic-ai/claude-code`（2.1.238 时点）：**主包仅 172KB 安装器**（`install.cjs` 从 8 个平台 optionalDependencies 复制原生二进制覆盖 bin、`cli-wrapper.cjs` Node 兜底启动器），真实逻辑在 `@anthropic-ai/claude-code-<platform>` 原生二进制（**Bun 编译单文件**，JS bundle 内嵌于 `.bun` 段）。engines 要求 node>=22，npm 安装方式已弃用（推荐 native installer / brew / winget）。
- 逆向规模：sourcemap 学习笔记称 **512K+ 行 TypeScript**、约 1900 文件、40+ 工具。
- **闭源**（Commercial ToS，但条款明确允许用 SDK 做"power products and services that you make available to your own customers"）。

### 1.2.2 可用的参考材料（四层）

1. **官方 SDK 类型**：`@anthropic-ai/claude-agent-sdk` npm 包内 `sdk.d.ts`（388,912 字节，全量类型 + 极详尽 TSDoc）+ `sdk.mjs`（1.37MB 压缩 bundle）+ `sdk-tools.d.ts`（156KB 工具 schema）。GitHub 仓库 `claude-agent-sdk-typescript` 只有 examples（三个 SessionStore 参考实现：Postgres/Redis/S3 + conformance 测试），**无 src**。
2. **泄露源码**：2026-03-31 事件（安全研究者 Chaofan Shou 发现 npm 包未删 source map），1902 文件/513,237 行完整 TS 源码。本地留存 `Wanfeng1028/claude-code-analysis`：`src/` 1332 个 .ts + `src.zip` + 19 章中文静态分析（`analysis/01-architecture-overview.md` ~ `11-hidden-features-and-easter-eggs.md` + components/ 函数级走读 7 篇）。**法律状态不变：只读学思想，不可复制代码。**
3. **官方插件**：anthropics/claude-code 仓库 `plugins/` 16 个真开源插件（见 §7.2）。
4. **行为观测**：minusx 网络抓包分析、HitCC 逆向（v2.1.197）。

### 1.2.3 协议（SDK 视角，全部来自 sdk.d.ts/bundle 实测）

- **基础传输**：SDK spawn CLI 固定附加 `--output-format stream-json --verbose --input-format stream-json`——stdin/stdout 双向 JSON 行流。
- **消息类型**：`SDKMessage` 是 **38 成员大联合**：assistant / user(replay) / result(success|error) / system / stream_event / compact_boundary / status / api_retry / control_request_progress / model_refusal_* / hook_{started,progress,response} / plugin_install / tool_progress / auth_status / task_* / background_tasks_changed / thinking_tokens / session_state_changed / commands_changed / notification / files_persisted / tool_use_summary / memory_recall / rate_limit / elicitation_complete / permission_denied / prompt_suggestion / mirror_error / conversation_reset / active_goal 等。
- 关键成员字段：

```ts
export type SDKAssistantMessage = {
  type: 'assistant'; message: BetaMessage;       // Anthropic Messages API 原生 Message
  parent_tool_use_id: string | null;             // 非 null = 子代理(sidechain)消息
  error?: 'rate_limit'|'overloaded'|'max_output_tokens'|...;
  supersedes?: UUID[];                            // refusal-fallback 取代旧消息（幂等驱逐）
  aborted?: true;                                 // interrupt 截断、可能断在半词
  uuid: UUID; session_id: string; ...
};
export type SDKPartialAssistantMessage = {       // --include-partial-messages 增量流
  type: 'stream_event'; event: BetaRawMessageStreamEvent;   // 原生流事件透传
  parent_tool_use_id: string | null; ttft_ms?: number; ...
};
export type SDKResultMessage = ...;               // 每回合恰好一条 = turn-complete 信号
// Success: duration_ms/duration_api_ms/num_turns/result/structured_output?/
//          total_cost_usd + usage(仅主循环) + modelUsage(含 Task/compaction 全部调用，计费正确口径)
```

- **单管道多路复用控制协议**（精华）：stdout 每行是 `StdoutMessage = SDKMessage | SDKActiveGoalMessage | SDKControlResponse | SDKControlRequest | SDKControlCancelRequest | SDKKeepAliveMessage`（sdk.d.ts:7872）。SDK demux：`control_response` 按 request_id 匹配 pending 表（早到应答容忍存 `unmatchedControlResponses`）；SDK→CLI 有 **34 个控制子类型**（interrupt/initialize/set_permission_mode/set_model/rename_session/mcp_call/rewind_files/read_file/stop_task/background_tasks/...）；CLI→SDK 反向请求（can_use_tool/hook_callback/mcp_message/elicitation/request_user_dialog/oauth_token_refresh）；initialize 应答可带回 `pending_permission_requests`（中途加入者重新武装在途提示）。abort 时补发 `control_cancel_request`。
- **canUseTool 回调参数**（sdk.d.ts:209）：`signal/suggestions(PermissionUpdate[])/blockedPath/decisionReason/title/displayName/description/toolUseID/agentID/requestId(允许带外应答)/matchedAskRule`——权限提示可识别"ask 规则强制"。
- **进程管理细节**：默认 executable 是 bun（Bun 下）否则 node；`spawnClaudeCodeProcess` 可替换整个进程层；优雅关闭 stdin EOF → `GRACEFUL_EXIT_TIMEOUT_MS`(~2s) 宽限 → abort signal（Windows 避免 TerminateProcess 抢跑）。

### 1.2.4 权限 / hooks / 会话

- `PermissionMode = 'default'|'acceptEdits'|'bypassPermissions'|'plan'|'dontAsk'|'auto'`。
- `HOOK_EVENTS` 31 种（PreToolUse/PostToolUse/PostToolUseFailure/UserPromptSubmit/Stop/SubagentStop/PreCompact/Notification/SubagentStart/PermissionRequest/PostToolBatch/UserPromptExpansion/TaskCreated/TaskCompleted/Elicitation*/ConfigChange/WorktreeCreate/Remove/InstructionsLoaded/CwdChanged/FileChanged/DirectoryAdded/MessageDisplay/Setup...）。hooks 注册在 initialize：只传 matcher+回调 id，命中时 CLI 发 `control_request{subtype:"hook_callback", callback_id, input, tool_use_id}`。
- 会话存储（SDK session_store.py 文档字符串）：主会话 `<projects_dir>/<project_key>/<session_id>.jsonl`；子代理 `<session_id>/subagents/agent-<id>.jsonl`；resume 家族：`--continue`/`--resume=<id>`/`--session-id=`/`--resume-session-at=<uuid>`+`--resume-drops-turn`/`--fork-session`/`--session-mirror`。
- **SessionStore 镜像架构**：`append(key, entries[])` 本地落盘成功后镜像（批次约 100ms，uuid 幂等）、失败重试 3 次后丢批发 `mirror_error` 系统消息**不影响子进程**；store-backed resume = `store.load()` → 写临时 `CLAUDE_CONFIG_DIR`（隔离 credentials/.claude.json）→ 子进程照常 `--resume`。

### 1.2.5 引擎内部（来自泄露源码分析文档）

- 入口链：`entrypoints/cli.tsx → main.tsx → init.ts/setup.ts → commands.ts → replLauncher.tsx/REPL`；六层分层：CLI 引导 → 初始化 → 控制面/TUI → Query/Agent 执行内核 → Tool/Permission → Memory/Persistence → MCP/Remote 扩展。
- 核心文件：`QueryEngine.ts`（agent 主循环）、`Tool.ts`（工具基座）、`Task.ts`（子代理）、`memdir/`（分层 Memory）、`hooks/`、`coordinator/`、`components/`（Ink TUI 组件）。
- 设计哲学（Latent Space 访谈，Boris Cherny）："不是产品而是 Unix 工具"、"模型的最薄包裹"、放弃 RAG 改 agentic search（glob/grep）、压缩=让模型自己总结、代码库每 3-4 周由 Claude 重写一遍。

---

## 1.3 Grok Build（xai-org/grok-build）

### 1.3.1 基本盘

- xAI 官方（仓库自称 SpaceXAI），2026-07-14 开源，**Apache-2.0**，Rust 99.6%，约 90 个 workspace 成员（crates/codegen ~70 + crates/common + crates/build + third_party vendored Mermaid 栈）。
- 治理：根目录 `SOURCE_REV` 记录从内部 monorepo 单向同步的 commit SHA；**不接受外部 PR**；rust-toolchain.toml 固定工具链；release 用 thin-LTO + jemalloc。
- **THIRD-PARTY-NOTICES 列明包含 openai/codex 与 sst/opencode 的 in-tree source ports**。
- 无官方 Web/桌面端（社区壳 rimusz/grok-build-desktop SwiftUI、jason920612/grokbuild_web 存在）。

### 1.3.2 三入口一核心

composition root `crates/codegen/xai-grok-pager-bin/src/main.rs` L40 分派 `xai_grok_shell::agent::app::{run_headless, run_leader, run_stdio_agent}`：

- **run_stdio_agent**（L250）：ACP over stdio。`spawn_stdin_line_reader()` → `simplex()` 内存管道 → `spawn_agent_local()` 驱动 MvpAgent actor；parent-death 绑定；skills 文件 watcher（变更注入 ACP reload 请求）；退出前 `pty_session::close_all()` + 2s 宽限。
- **run_headless**（L325）：无 TUI，经 websocket relay 连 grok.com（`spawn_relay_connection_with_callback`），需登录态；首连打印 URL 可开浏览器。
- **run_leader**（L749）：`LeaderLock::try_acquire()`（flock+pidfile+socket `~/.grok/leader.sock`）；抢锁失败且 socket 就绪则退出让 client 连现有 leader；成功则起 IPC server + MvpAgent，mpsc 桥接 IPC↔agent↔relay。

Leader 协议（`xai-grok-shell/src/leader/protocol.rs`）：4 字节大端长度前缀帧（`MAX_MESSAGE_SIZE = 64MB`）；`ClientMode{Headless, Stdio}`；`LEADER_PROTOCOL_VERSION = 1`；**驱逐策略 `should_evict`：只有"严格更旧"的 leader 才会被新 client evict（anti-thrash）**；zombie 检测 30s。

### 1.3.3 TUI 工程

- 依赖上游 `ratatui 0.29`（features: crossterm/unstable-widget-ref）+ 自研 `xai-ratatui-inline`（inline viewport：emit_to_scrollback/resize_purge_rerender/synchronized output/segment 差分重绘）与 `xai-ratatui-textarea`（composer）。
- `xai-grok-pager/src/`：scrollback/（20 余种内容块：agent/thinking/tool/{edit,execute,read,search,web_fetch}/subagent/workflow/quote_bar）+ views/（60+ 视图）+ input/（key/mouse/bracketed paste/kitty keyboard 归一化）。
- **主循环调度纪律**（`app/event_loop.rs`）：

```rust
tokio::select! {
    biased;                                          // 固定优先级：cancel > quit > writer ack > ACP > input > render > voice
    _ = connection_cancel.cancelled() => break,
    writer_event = writer_event_rx.recv() => presenter.acknowledge(sequence),
    msg = async {...}, if input_rx.is_empty() => {   // ACP 臂以输入队列空为门
        let mut changed = acp_handler::handle(msg, &mut app);
        while drained < ACP_DRAIN_BATCH_MAX && input_rx.is_empty() { ...try_recv... }  // 有界批量 drain
        ...
    }
}
```

### 1.3.4 工具系统

```rust
// crates/common/xai-tool-runtime/src/tool.rs
pub trait Tool: Send + Sync {
    type Args: for<'de> Deserialize<'de> + JsonSchema + Send + 'static;
    type Output: Serialize + ToolOutput + Send + 'static;
    fn id(&self) -> ToolId;                          // Namespace:tool 如 GrokBuild:grep
    fn description(&self, ctx: &ListToolsContext) -> ToolDescription;  // 可按 turn 上下文变化
    fn should_list(&self, ctx: &ListToolsContext) -> bool;             // 每 turn 清单过滤
    fn execute(&self, ctx, args) -> impl Future<Output = ToolStream<Self::Output>> + Send;
}
// 不变量："at most arbitrarily many Progress items, ending in exactly one Terminal"
```

内置工具（`xai-grok-tools/src/implementations/grok_build/mod.rs` register_all）：bash(run_terminal_cmd)/read_file/search_replace/grep(ripgrep)/list_dir/web_search/web_fetch/task(+task_output/wait_tasks/kill_task)/todo/enter|exit_plan_mode/ask_user_question/monitor/scheduler/update_goal/workflow/image_gen/image_edit/video_gen/lsp/deploy_app(stub)；codex 风格 apply_patch 等并存于 implementations/codex/。要点：bash 用"捕获并重放"模拟 cwd/env/alias 持久化；输出流式 delta 上限 16KB/帧；grep 在 release 构建把 ripgrep `include_bytes!` 内嵌、首调释放到 `~/.grok/vendor/`；`xai-grok-tools-api` 是 protobuf/gRPC 面（ExecuteToolRequest/ToolStreamChunk/SpawnSubagentRequest...）供独立 tool server 复用。

### 1.3.5 工作区 / checkpoint / 沙箱

- `xai-grok-workspace`：lib.rs 自述 "Core workspace library: FS, VCS, permissions, tool config, subsystem wiring"；`permission/` 完整子系统（policy/rules/bash_command_splitting/exec_risk/auto_mode 分类器）；`file_system/`（local/mock/acp/git_status/jj_status/file_tree）。
- daemon-client 分工：`-daemon` 只管进程生命周期（Unix double-fork+setsid；daemon 文件 O_NOFOLLOW+0600；preview_supervisor 监管沙箱内代理）；`-client` 是 typed RPC 客户端（wire 类型在 `-types/src/rpc/` 约 17 组）；K8s 友好 two-phase drain（45s SIGTERM 预算 + draining 标记 + prometheus）。
- **checkpoint**（`workspace/src/session/checkpoint.rs`）：

```rust
/// A rewind checkpoint is keyed by `prompt_index` and bundles per-domain state
/// (filesystem RewindPoint, optional hunk delta, optional git HEAD/index);
/// restore reverts all enabled domains together.
pub(crate) enum TurnBoundary { Start{prompt_index, turn_number},
                               End{..., outcome, written: Vec<String>} }
```

- 沙箱（`xai-grok-sandbox/src/lib.rs`）：基于 nono（Linux Landlock / macOS Seatbelt）启动时一次性 apply，覆盖 in-process tokio::fs 与子进程；网络进程层放开（要调 LLM）、**子进程网络按个 seccomp 封禁**（child_net.rs）；profiles（Workspace/Devbox/Custom extends）；非 devbox enforcing 要求 hook-write-deny 且 fail-closed。

### 1.3.6 会话 / 子代理 / 扩展

- 会话三套互补：①chat JSONL（`xai-grok-shell/src/session/persistence.rs`，CHAT_FORMAT_VERSION v1 ConversationItem；标题清洗 C0/C1+bidi 黑名单；disk-full 通知；RewindPoint 进 session 文件；fork 支持）②遥测 events.jsonl（`xai-grok-session-events/src/types.rs`：TurnStarted/PhaseChanged/FirstToken/ToolStarted|Completed{outcome,duration_ms}/PermissionRequested|Resolved/TurnEnded{cancellation_category}/Interjected/YoloToggled...）③SQLite journal（`xai-sqlite-journal`：**NFS 上 WAL 的 -shm mmap 会被对端 rebuild 打爆（SIGBUS），故 statfs 判网络文件系统 → TRUNCATE + 每主机独立 DB；本机 WAL；BUSY_TIMEOUT 5s**）。
- 子代理三层：解析层 `xai-grok-subagent-resolution`（纯逻辑：explicit override > role > persona > parent；定义发现 project/builtin/user/plugin → session CLI 兜底；resume identity 校验）；协调层 coordinator actor（Task 工具共享）；shell 侧 ShellChildRunner：**继承父 MCP 池与 client hooks，但子代理工具集去掉 ask_user_question（不许反问用户）**；attempt_store 七模块持久化管线；父端 usage 折叠。
- hooks：`xai-grok-hooks` 宏单表生成 HookEventName（session_start...subagent_stop/pre_compact/post_compact/session_end，SubagentStop/SubagentEnd 双别名兼容）；runner 支持 command 与 http；payload 上限 128KB；trust 门。
- MCP：官方 rmcp SDK（StreamableHttpClientTransport + stdio BufReader）；OAuth；ACP transport 变体供编辑器场景。
- plugin-marketplace：官方源硬编码 `https://github.com/xai-org/plugin-marketplace.git` 首启自动注册；支持 pinned sha。
- ACP 集成（`xai-acp-lib`）：官方 `agent-client-protocol 0.10.4` crate + x.ai/* 扩展（yoloMode/autoMode/runningPromptId）；`AcpSide` marker trait 让 Client/Agent 两侧类型成对绑定；TUI 场景 pager 作为 client 经 Unix socket 连 leader。

---

## 1.4 DeepSeek Harness（deepseek-ai/deepseek-harness）

### 1.4.1 基本盘

- `deepseek-ai/deepseek-harness`，**MIT**，pnpm monorepo 约 200 包；2026-08-13 创建，一周 17.8k stars（当时）；developer preview，README 警告 "THERE WILL BE COMPATIBILITY-BREAKING CHANGES"。
- CLI 名 `dsh`（npm `@deepseek-ai/dsh`）；README：`npx @deepseek-ai/dsh web` 启动 Web UI（http://127.0.0.1:3080 默认）。
- 形态：profile 组合插件树——dsh-base 必选（model adapters/tools/persistence/sandbox/approval/settings/credentials/telemetry）+ dsh-web-app（浏览器）或 dsh-headless（一次性无服务器）；docs 提及 Electron 变体（IPC 替代 HTTP）。
- 插件框架：vendored **Cordis**——Context 是 Proxy（属性读取走服务解析器）、Service 基类构造即 provide、`inject` 声明依赖、五种事件分发（emit/parallel/serial/bail/waterfall）、注册可逆（fiber 卸载自动注销）。

### 1.4.2 事件模型与"Model-visible means logged"

```ts
// packages/core/session/src/types.ts —— merge-extensible 词表
export interface SessionEventMap {
  'turn/start': { turn: number }
  'turn/end':   { turn: number; reason: TurnEndReason }
  'step/start': { turn: number; step: number }
  'user/message': UserMessage
  'assistant/chunk': { turn: number; step: number; chunk: StreamChunk }
  'assistant/message': { turn: number; step: number; message: AssistantMessage;
                         usage?: TokenUsage; interrupted?: true }
  'tool/call':  { turn: number; step: number; callId: CallId; name: string; arguments: string }
  'tool/result': { turn: number; step: number; message: ToolResultMessage; error?; meta? }
  'todo/write': { todos: TodoItem[] }
  'request/header': { header: EpochHeader; reason: 'initial'|'resume'|'change' }
  ...
}
// 信封（mapped type，编译期条件强制）
export type SessionEvent<T> = { [K in SessionEventType]: {
    type: K; seq: number /* 单调，恒等于 log.length */; time: number; data: SessionEventMap[K];
    ignorable?: true;
} & (K extends SurfaceEventType /* user/message | assistant/message | tool/result */ ?
    { sourceEventSeqs?: number[]; surfaceOp?: 'append' | { op:'replace'; start; end } } : object) }[T]
```

三道强制机制：① `Session.append` 签名要求 surface 事件必须传 `SurfaceIntent`（编译错误）；② 模型历史只从 `deriveMessages()`（SurfaceManager 投影）派生，无 surfaceOp 的事件天然不在模型历史；③ append 前 `snapshotJsonValue`（lossless JSON：拒绝 BigInt/function/undefined/循环引用）失败**当场抛错**（"a bad event fails at the append site rather than later during a backend flush"），入 log 即 deepFreeze。
读端 fail-closed：脚本生成的 `KNOWN_SESSION_EVENT_TYPES`（48 种，含 approval/*、hook/*、team/*）——持久化读路径遇表外类型且无 ignorable 标记**拒绝解释该日志**（"silently skipping a required event would reconstruct a wrong session"）。

### 1.4.3 Run loop 与工具管线

- `ReactLoopAgent`（`packages/core/agent-loop/src/agent.ts`）：send/steer/followUp/inject → Inbox.splice（目标 next-turn/next-step）→ while(turn())：turn/start → preStep waterfall（systemPrompt.assemble + RuntimeContextProjection + 'agent/pre-step' 可改写/拒绝）→ step/start → user/message(surface append) → buildRequest（'agent/request' waterfall + canonicalHeader 变化时 request/header）→ llm.stream 逐 chunk append assistant/chunk → BlockAssembler → assistant/message(surface, sourceEventSeqs=chunkSeqs) → executeToolCalls → step/end → 'agent/turn-stopping' → turn/end。**中止的流把已交付前缀 finalize 成 interrupted:true 的完整消息**。
- 工具三段（`tool-calls.ts` + `core/tools/index.ts`）：按 executionMode 分组，exclusive 单个成 barrier、parallel 滚动池上限 10；
  - **prepare（串行保序）**：createExecution（参数 lossless 快照+冻结；code-mode 直呼路由判定在策略管线前确定性拒绝）→ 'tools/pre-execute'（allow/deny/ask）→ ask 交 ApprovalService → **monotonic guards**（"no guard can force-allow a call another guard denied"）；
  - **dispatch（并发）**：'tools/execute' around-wrappers（可替换 signal）→ dispatchToolBody → render/presentationMeta 投影；`bodyInvoked` 区分 ABORTED / ABORTED_BEFORE_DISPATCH；
  - **finalize（按 model order 提交）**：commitReady 只沿连续 slot 前进；fillPool 每次重新分类下一个 call（运行中注销工具即时形成新 barrier）；abort 时未启动的 `appendSkippedToolCall` 补合成 call/result 对（**重放永远合法**）。

### 1.4.4 审批（fail-closed 教科书）

```ts
// packages/interaction/user-approval/src/index.ts
'approval/asked':   { id, toolName, callId?, reason? }   // log-only，永不进模型 transcript
'approval/decided': { id, outcome: 'allowed-once'|'rejected'|'cancelled'|'unavailable' }
'approval/policy':  { policy: 'ask'|'never', source? }

if (!hasOpenTurn(session.events)) throw new Error('approval.request() outside an open turn: ...crash-tail garbage...')
session.append('approval/asked', {...})
const outcome = await this.decide(req, session)     // ↓ 全路径 fail-closed：
// signal abort → 'cancelled'；policy 'never' 在 dispatch 前本地判 'rejected'（防后注册 listener 破坏确定性）；
// waterfall('approval/request', req, () => 'unavailable')——无 answerer 即 fail-closed；
// 词表外返回值归一化 'unavailable'；answerer 抛错（同步/异步）→ 'unavailable'
session.append('approval/decided', { id, outcome })
```

### 1.4.5 Web 层与前端

- `packages/host/webserver`：裸 node:http，四张表 exact/prefixes/upgrades/fallback（fallback 唯一席位二次注册抛错）；SSE=handler 持住响应；WSS=registerUpgrade；index.html 注入经 emit 事件收集 IndexInjection（global 行渲染为 `<script>globalThis["__DSH_BOOT__"]={...}</script>`，`<` 转义防 breakout）。
- `packages/api/gateway`：TypertGatewayService，`connection.rpc.intercept('/api', ...)`；分发 `POST /api/<ns>/<method>`，payload 恰含一个 args 对象；strict 生成定义优先（撤回后禁 SRC 兜底）；响应 `{ok:true,value}`。
- 前端：apps/web React 18+Vite SPA（main.ts 10 行）；`packages/client/modules` 扫描 package.json `dsh.client` 字段 → WebBootGraph（sha1 前 12 位 rev，拓扑排序，环检测）→ `__DSH_BOOT__`；浏览器 lazy CJS 模块表（`window.__ModuleLoader__.load({id,factory})` 注册 factory，首次 require 才物化）。
- 持久化：SessionHeader（format version/id/createdAt/cwd/parentSession/seedLength/delegationDepth）+ SessionEvent[]（seq===index 逐条断言）；订阅 session/event 的观察者 fire-and-forget；session/flush 是 awaited-parallel checkpoint；后端 JSONL（默认 zstd 校验帧）或 node:sqlite（schema 17）；fork/resume 用 'session/end-seed' 标记种子边界。

---

## 1.5 pi（earendil-works/pi）

### 1.5.1 基本盘与包矩阵

- 作者 Mario Zechner（badlogic，libGDX 作者），现属 Earendil Inc.；MIT；npm workspaces 10 包：`agent`/`ai`/`client`/`coding-agent`/`evals`/`protocol`/`server`/`session-backends`/`telemetry`/`tui`。
- npm（全部 0.84.x 同步发版，MIT）：`@earendil-works/pi-ai`（30+ provider：OpenAI/Anthropic/Google/Vertex/Bedrock/Azure/DeepSeek/Groq/Cerebras/OpenRouter/ZAI/MiniMax/Moonshot/Kimi/Qwen/GitHub Copilot OAuth/Fireworks/NVIDIA NIM/HF + 任意 OpenAI-compatible：Ollama/vLLM/LM Studio；token/cost 统计；跨模型 handoff；browser usage；faux 测试 provider）、`pi-agent-core`（"Stateful agent with tool execution and event streaming"）、`pi-coding-agent`（CLI bin: pi）、`pi-protocol`（CBOR）、`pi-client`（ByteTransport）、`pi-tui`、`pi-session-backend-sqlite-node`。旧 scope `@mariozechner/*` 已 deprecated 迁移。
- 设计哲学（作者博客）：四工具 <1000 tokens system prompt；"权限即安全剧场"（隔离外包 Docker/micro-VM）；反 MCP（context 开销，替代=CLI 工具+README）；反子代理；透明性（JSONL+HTML 导出+headless）。

### 1.5.2 事件模型（全部 10 种）

```ts
// packages/agent/src/types.ts L428
export type AgentEvent =
  | { type: "agent_start" } | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" } | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }  // 流式
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId; toolName; args }
  | { type: "tool_execution_update"; toolCallId; toolName; args; partialResult }
  | { type: "tool_execution_end"; toolCallId; toolName; result; isError };

// packages/ai/src/types.ts L528 —— 12 变体流事件，每个都带 partial 快照 + contentIndex
export type AssistantMessageEvent =
  | { type: "start"; partial } | { type: "text_start"|"text_delta"|"text_end"; contentIndex; delta?; partial }
  | { type: "thinking_start"|"thinking_delta"|"thinking_end"; ... }
  | { type: "toolcall_start"|"toolcall_delta"; ... } | { type: "toolcall_end"; toolCall; partial }
  | { type: "done"; reason: "stop"|"length"|"toolUse"|"deferred"; message }
  | { type: "error"; reason: "aborted"|"error"; error: AssistantMessage };
// StreamFunction 契约（types.ts L327 注释）："Once invoked, request/model/runtime failures
// should be encoded in the returned stream, not thrown" —— 错误进流不抛出
```

### 1.5.3 Run loop（两级结构）

```
Agent.prompt(input) [agent.ts L350] → runWithLifecycle → runAgentLoop(prompts, ctx, config, emit, signal, streamFn)
runAgentLoop [agent-loop.ts L95]: emit agent_start → turn_start → prompts 各发 message_start/end → runLoop
runLoop [L155-275]（外层 followUp / 内层 steering+工具）:
  pendingMessages = await getSteeringMessages?.()          // 开局先取
  while(true):
    while (hasMoreToolCalls || pending.length):
      注入 pending（message_start/end + push context）      // steering 在 assistant 响应前生效
      message = await streamAssistantResponse(context, config, signal, emit, streamFn) [L281-372]
        messages = await config.transformContext(messages)  // AgentMessage[] → AgentMessage[]
        llmMessages = await config.convertToLlm(messages)   // 默认 filter(user|assistant|toolResult)
        resolvedApiKey = await config.getApiKey(provider)   // 每轮刷新（OAuth 过期）
        for await (event of streamFunction(model, llmContext, options)):
          start → push partial; emit message_start
          text_*/thinking_*/toolcall_* → 替换末尾 partial; emit message_update
          done/error → final 替换末尾; emit message_end; return
      stopReason error/aborted → emit turn_end + agent_end → return
      toolCalls = content.filter(toolCall)
      stopReason "length" → failToolCallsFromTruncatedMessage [L381-406]
                          // 截断参数不可执行：全部不发执行，逐个 start/end + 合成错误结果
      否则 executeToolCalls [L411-426]:
        sequential（或任一工具 sequential）→ 逐个执行
        parallel [L489-554] → 第一遍 model order：start + prepareToolCall（找不到工具→错误；
          validateToolArguments；beforeToolCall block→错误结果）推入 thunk；
          await Promise.all(thunks)；第二遍按原顺序 end + toolResult —— 结果顺序= model order
      prepareNextTurn?.({message, toolResults, context})     // compaction 挂点，可整体替换 context
      shouldStopAfterTurn?.() === true → agent_end → return
      pendingMessages = await getSteeringMessages?.()
    followUps = await getFollowUpMessages?.(); 无 → break
  emit agent_end{messages}
// 失败闭合（Agent.handleRunFailure, agent.ts L511-527）：异常时合成 stopReason error/aborted 空消息，
// 补发 message_start/end/turn_end/agent_end —— 事件序列永远闭合
```

### 1.5.4 会话：JSONL 树

```ts
// packages/coding-agent/src/core/session-manager.ts（1715 行）
export interface SessionHeader { type:"session"; version?; id:string /*uuidv7*/; timestamp;
                                  cwd:string; parentSession?:string }
export interface SessionEntryBase { type:string; id:string /*8hex*/; parentId:string|null; timestamp }
// entry 类型：message / thinking_level_change / model_change / compaction{summary, firstKeptEntryId,
//   tokensBefore, usage?} / branch_summary{fromId,summary} / custom(不进上下文) / custom_message(进上下文)
//   / label{targetId,label} / session_info{name}
getBranch(fromId?) {              // leaf → root 回溯后反转 [L1260-1274]
  const current = this.byId.get(fromId ?? this.leafId);
  while (current) { path.push(current); current = byId.get(current.parentId) ?? undefined; }
  path.reverse(); return path;
}
branch(branchFromId) { this.leafId = branchFromId; }   // 分叉=只移指针 [L1390-1396]
buildContextEntries(entries, leafId, byId) {           // [L415-456] compaction 感知重建
  const path = buildSessionPath(entries, leafId, byId);
  let compaction = null; for (const e of path) if (e.type==="compaction") compaction = e; // 取最新
  if (!compaction) return path;
  const ctx = [compaction];                              // 压缩摘要开头
  let found=false; for (i<compactionIdx) { if (path[i].id===compaction.firstKeptEntryId) found=true;
                                           if (found) ctx.push(path[i]); }   // 锚点后保留
  ctx.push(...path.slice(compactionIdx+1)); return ctx;
}
// 磁盘：~/.pi/agent/sessions/--<cwd munged>--/<id>.jsonl；版本迁移 v1线性→v2树→v3 hookMessage→custom
```

### 1.5.5 RPC / CBOR / 类型桥

- rpc mode（`coding-agent/src/modes/rpc/`）：`rpc-types.ts`（289 行）stdin 上行 RpcCommand 约 35 变体（prompt/steer/follow_up/abort/new_session/get_state/set_model/set_thinking_level/compact/bash/fork/clone/switch_session/get_entries(since)/get_tree/get_messages...）；stdout 下行 `RpcResponse{id?,command,success,data?}` + 事件流 + extension_ui_request/response 双向 UI 通道（select/confirm/input/editor/notify/setWidget）；`runRpcMode` 薄 switch；**stdout 背压反压到 agent 订阅回调**。LF 为唯一记录分隔符（连 readline 都不合规：U+2028/U+2029）。
- CBOR（server/client）：`ByteTransport{send(chunk):Promise<void>; close()}`（18 行接口，默认 Unix socket）；`framing.ts` 4 字节大端 u32 长度前缀，增量 FrameDecoder（64KB block 累积，maxFrameLength 16MiB，截断检测）；PiServer 握手 ServerHello/ClientHello（PROTOCOL_VERSION=1，5s 超时）；LiveSession 多连接共享 runtime；`WriterLease`（sqlite 后端 fenced 租约：owner_id+fence 双匹配、单调递增防脑裂）。
- 类型桥：`protocol/src/schemas.ts`（450 行 TypeBox StrictObject DTO）+ codec（Check → encodeCbor → encodeFrame）；`server/src/protocol.ts` 的编译期断言：

```ts
type Assert<T extends true> = T;
type ExactKeys<T, Keys extends keyof T> = keyof T extends Keys ? true : false;
type _AiUsageFieldsAccountedFor = Assert<ExactKeys<AiUsage,
  "input"|"output"|"cacheRead"|"cacheWrite"|"cacheWrite1h"|"reasoning"|"totalTokens"|"cost">>;
// 给领域类型加字段不同步 wire DTO → 编译失败
```

- TUI：自研 `pi-tui`（`Component{render(width)=>string[]; handleInput?; invalidate()}` + Container 递归拼行）；`TuiMainScreen.doRender` 整屏渲染 → overlay 合成 → 与 previousLines 逐行全等比较求 [firstChanged,lastChanged] → 五种 fullRender 特例否则增量写（synchronized output `\x1b[?2026h` 包裹）。

---

## 1.6 opencode（sst/opencode）

### 1.6.1 基本盘

- "The open source coding agent"，**MIT**，约 20 万 stars（六家最高），纯 TS 26.7MB，默认分支 **dev**，日更。
- 31 包：引擎层 `core`/`llm`/`schema`（约 60 个共享 Effect Schema）/`protocol`；服务层 `server`/`client`（codegen）/`sdk-next`（进程内 SDK）/`sdk`（旧）/`httpapi-codegen`；终端层 `tui`（**SolidJS + @opentui/core + @opentui/solid**，bun 运行时）/`desktop`（**Electron 42 + electron-vite，main 进程 drizzle+自编 @lydell/node-pty，renderer SolidJS + 共享 app 包**）/`app`+`ui`+`session-ui`/`web`（Astro 文档站）；辅助 `effect-sqlite-node`（node:sqlite DatabaseSync 包装成 Effect SqlClient，WAL+Semaphore 串行）/`effect-drizzle-sqlite`/`plugin`/`containers`/`enterprise`/`slack` 等。
- **V1（legacy，core/src/v1/）→ V2（event-sourced 重写）迁移中，当前主引擎 V2**，Effect 框架全面深入（Layer/Service/Fiber/Stream/Schema）。

### 1.6.2 核心类型

```ts
// schema/src/session.ts
export const Info = Schema.Struct({
  id: ID, parentID: ID.pipe(optional),           // fork/subagent 父会话
  projectID: Project.ID, agent: Agent.ID.pipe(optional), model: Model.Ref.pipe(optional),
  cost: Schema.Finite,
  tokens: Schema.Struct({ input, output, reasoning, cache:{read,write} }),
  time: { created, updated, archived }, title: Schema.String,
  location: Location.Ref,                        // directory + workspaceID
  revert: Revert.State.pipe(optional), ...
})
// schema/src/session-message.ts
export const Message = Schema.Union([AgentSwitched, ModelSwitched, User, Synthetic, System,
  Shell, Assistant, Compaction]).pipe(Schema.toTaggedUnion("type"))
// Assistant.content: AssistantText | AssistantReasoning | AssistantTool（tagged by type）
// AssistantTool 的状态机：
export const ToolState = Schema.Union([
  ToolStatePending,    // { status:"pending", input }               输入还在流式生成
  ToolStateRunning,    // { status:"running", input, structured, content }
  ToolStateCompleted,  // { status:"completed", input, attachments, content, outputPaths, structured, result }
  ToolStateError,      // { status:"error", input, content, structured, error }
]).pipe(Schema.toTaggedUnion("status"))
// outputPaths 配合 core/src/tool-output-store.ts：超大工具输出溢写文件、消息里只留路径
// Compaction: { reason:"auto"|"manual", summary, recent } —— 压缩结果本身是一条消息进历史
```

ID 均 branded：session `ses_`+64hex（runner 用其提取 promptCacheKey）、message `msg_`+ascending、event `evt_`+ascending。

### 1.6.3 事件：durable/live 二分（整个设计的支点）

```ts
// schema/src/event.ts
export function define(input: { readonly type: Type
  readonly durable?: { readonly version: number; readonly aggregate: string }
  readonly schema: Fields }) { ... }
// Payload = { id, type, data, durable?: { aggregateID, seq, version }, location?, metadata? }
```

- session-event.ts 全部前缀 `session.next.*`：Prompted/PromptAdmitted/ContextUpdated/Shell.Started|Ended/Step.Started|Ended|Failed/Text.Started|Delta|Ended/Reasoning.*/Tool.Input.Started|Delta|Ended/Tool.Called/Tool.Progress/Tool.Success/Tool.Failed/Retried/Compaction.*/RevertEvent.Staged|Cleared|Committed。
- **28 个 DurableDefinitions（带版本落库可回放）与 4 个 live-only delta（Text.Delta/Reasoning.Delta/Tool.Input.Delta/Compaction.Delta）分开导出**。注释原话："Stream fragments are live-only; Input.Ended is the replayable raw-input boundary"；Tool.Progress 要求"checkpoint semantic transitions or at a bounded cadence, not persist every stdout chunk"。

### 1.6.4 权限系统（`core/src/permission.ts`，310 行）

```ts
export function evaluate(action, resource, ...rulesets): Permission.Rule {
  return rulesets.flat().findLast((rule) =>
    Wildcard.match(action, rule.action) && Wildcard.match(resource, rule.resource))
    ?? { action, resource: "*", effect: "ask" }              // 无规则命中 → 默认 ask
}
const missingAgentPermissions = [{ action: "*", resource: "*", effect: "deny" }]  // 未声明=全禁
```

- 决策顺序：agent permissions ruleset → PermissionSaved（用户点过 always 持久化到 SQLite）→ findLast 胜出（数组顺序即优先级）。
- `assert(input)`：deny → BlockedError；allow → 通过；ask → create(request) + **publish durable `permission.v2.asked` 事件 → Deferred.await 挂起工具 fiber**。
- `reply`：once → Deferred 成功；**always → PermissionSaved.add 且自动放行同 session 其他此刻 pending 且新规则下全 allow 的请求**；reject → DeclinedError（或带 feedback 的 CorrectedError，**反馈文本注入回模型**），并**级联 reject 同 session 全部 pending**。
- 与 loop 耦合：DeclinedError 以 Effect defect 冒泡，runner isUserDeclied 捕获后 failUnsettledTools + interrupt（"declining a user prompt halts the loop instead of becoming model-facing tool output"）。
- 工具级裁剪：`ToolRegistry.materialize(permissions)` 把被 `*` 全量 deny 的工具从 definitions 整个剔除（模型看不到）。

### 1.6.5 Run loop（`core/src/session/runner/llm.ts`，439 行）

```
SessionV2.prompt(input) [core/src/session.ts L360]
 → SessionInput.admit(...) [session/input.ts L41]        // 落 session_input 表 + PromptAdmitted
 → execution.wake(sessionID)
SessionExecution.Service [session/execution/local.ts]     // "Future remote placement belongs here"
 → SessionRunCoordinator.make({ drain }) [session/run-coordinator.ts, 104 行]
    // per-key 串行、跨 key 并发；run(key) 无活跃则启动；wake 设 pendingWake（合并重复唤醒）；
    // settle 且 pendingWake → successor fiber；interrupt 中断 owner
 → drain → SessionRunner.run({ sessionID, force })
    1. hasPending(db, id, "steer"|"queue") 无积压且非 force → return
    2. failInterruptedTools(sessionID)                    // 上轮中断遗留工具全部 Tool.Failed
    3. 外层 while(shouldRun) queue 逐条；内层 while(needsContinuation) step 逐步：
       runTurn → runTurnAttempt(sessionID, promotion, step, recoverOverflow?):
         a. agents.select(session.agent)
         b. SessionContextEpoch.initialize/prepare(db, loadSystemContext(agent), ...)
            // system context = SystemContextRegistry + SkillGuidance + ReferenceGuidance 三路并发合并
         c. promotion：promoteSteers / promoteNextQueued+promoteSteers（promoted>0 则 step 重置 1）
         d. models.resolve(session) [runner/model.ts] catalog+variant+credential → 原生 route
         e. SessionHistory.entriesForRunner(db, id, system.baselineSeq)
         f. isLastStep = step >= agent.info.steps：最后步不广告工具 + toolChoice:"none"
            + 尾部追加合成 assistant(MAX_STEPS_PROMPT)
         g. LLM.request + compaction.compactIfNeeded → 命中则 die(ContinueAfterCompaction)
         h. snapshots.capture()（git 快照）+ createLLMEventPublisher
         i. llm.stream(request).pipe(Stream.runForEach(event => ...)):
              普通事件 → publisher.publish（Semaphore(1) 串行化，保证顺序）
              providerError 且 isContextOverflowFailure 且 assistant 未开始 → 暂存 overflowFailure
              tool-call 且 !providerExecuted → needsContinuation=true
                toolMaterialization.settle(...) → publish(toolResult)   // Effect.uninterruptibleMask
                ★ "Start each recorded local call eagerly"：事件一到即 FiberSet.run —— 天然并行
         j. 收尾：overflow 恢复（compactAfterOverflow → die(ContinueAfterOverflowCompaction) 只恢复一次）
              awaitToolFibers = raceFirst(FiberSet.join, FiberSet.awaitEmpty)
              isUserDeclied → failUnsettledTools + interrupt
              snapshots.capture() + files({from,to}) → publish(Step.Ended{finish, tokens, snapshot, files})
// Turn 过渡特殊手法：compaction/overflow 用 Effect.die(TurnTransitionError) 抛 defect，
// 由 runTurn 的 catchDefect 捕获递归重试
```

### 1.6.6 协议 / server / 持久化

- protocol：`api.ts` 用 Effect unstable httpapi DSL，`HttpApi.make("server").add(HealthGroup).add(LocationGroup.middleware(...))...` 共 17 组（health/location/agent/session/message/model/provider/integration/credential/permission/fs/command/skill/event/pty/question/reference/project-copy）；`groups/event.ts`：`HttpApiEndpoint.get("event.subscribe", "/api/event", { success: HttpApiSchema.StreamSse({ data: EventSchema }) })`——**SSE 纳入类型系统**；分页 base64url cursor。
- server SSE（`handlers/event.ts`，52 行）：`EventV2.allBounded(events, 256)` 有界订阅 → `Stream.make(connected).pipe(concat(live), map(eventData), pipeThroughChannel(Sse.encode()))` + 15s 心跳 merge；响应头 Cache-Control:no-cache / X-Accel-Buffering:no。**单一 GET /api/event 推全部事件**（session/permission/question/pty...）。
- PTY：`pty.connectToken` 自定义 header（强制 CORS preflight 防浏览器偷铸 ticket）+ origin 校验签发 PtyTicket；`pty.connect` WebSocket 升级，query 带 ticket+cursor 回放游标；出站帧单一 unbounded Queue 单 writer 排空（replay chunk/live output/close 全局有序）。
- client：`export * from "./generated/index"` 完全 codegen；sdk-next `OpenCode.create()`：进程内 AppNodeBuilder 起 core → createEmbeddedRoutes → HttpRouter.toWebHandler → 伪 fetch（http://opencode.local）→ 标准生成 client。**同一契约驱动独立 server 与进程内 SDK**。
- 持久化 SQLite（drizzle）：`event{id, aggregate_id, seq, type, data}` uniqueIndex(aggregate_id,seq) + `EventSequence{aggregate_id PK, seq, owner_id}` 水位 + `SessionTable` + `SessionMessageTable{id, session_id, type, seq, data}` 投影 + `SessionInputTable{id, session_id, prompt, delivery, admitted_seq, promoted_seq}` + `SessionContextEpoch{baseline, snapshot, baseline_seq}`。写路径 EventV2.publish（durable 校验落库+进程内广播）→ SessionProjector（455 行）物化；读路径 SessionHistory.load = baseline_seq + 最新 compaction seq 起按序读。**崩溃恢复=重跑 runner 从投影重建**（tool 中途断点续跑明确标注未做）。

### 1.6.7 LLM 层

- 自研 `@opencode-ai/llm`（依赖无任何 ai/@ai-sdk/*）：protocols（anthropic-messages/openai-chat/openai-compatible-chat/openai-responses/gemini/bedrock-converse/bedrock-event-stream）+ providers（anthropic/openai/openai-compatible/google/amazon-bedrock/azure/cloudflare/github-copilot/openrouter/xai）+ route 可组合（protocol+endpoint+auth+headers+limits）。
- 流式事件模型与 AI SDK v5 同构；**Usage 契约**：inclusive totals（inputTokens 含 cache）+ non-overlapping breakdown（nonCachedInput+cacheRead+cacheWrite=inputTokens 不变式），逐协议注释谁原生谁推算，visibleOutputTokens 带 clamp。
- `generateObject` = 强制合成 tool call（名 generate_object），不用厂商 JSON mode。
- 与 Vercel ai 关系（核实）：web 包的 `ai` 属 Astro 文档站；core 的 @ai-sdk/* 是 V1 长尾路径（aisdk.ts 包装 LanguageModelV3 + SSE chunkTimeout 看门狗）；**V2 runner 只映射三种 aisdk 类型到原生 route，其余 UnsupportedApiError——ai-sdk 退化为 models.dev catalog 描述格式**。

### 1.6.8 插件

`plugin/src/v2/effect/plugin.ts`：`Plugin.define({ id, effect: (ctx: PluginContext) => Effect<void> })` 长驻 Effect；PluginContext 提供 agent/aisdk/catalog/command/integration/reference/skill 六类 hooks（各带 Reload）+ plugin 域；KeyedMutex+scope 生命周期、加载环检测、热替换 Scope.close 旧实例。

---

# 二、六家横向对比

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
| 压缩 | pre-sampling+auto | 总结式+PreCompact hook | compaction-transcript crate | compaction replace surface | 树上 entry 检查点 | Compaction 消息进历史 |
| 独门绝活 | 反向扫描 resume | 控制协议多路复用 | 三域 checkpoint | 编译期 surface 强制 | JSONL 树分叉 | durable/live 二分 |

---

# 三、行业语言与架构盘点

| 产品 | 核心语言（GitHub languages 实测） | 形态 | 架构要点 |
|---|---|---|---|
| Codex / Grok Build | Rust | CLI/桌面/IDE/云 | Rust 核心多客户端 |
| Claude Code / dsh / pi / opencode | TypeScript | CLI/Web/桌面 | 单进程或 client/server |
| Cline / Roo Code | ~100% TS（Roo 是 Cline fork） | VS Code 插件 | 循环跑扩展宿主内，无独立引擎 |
| Continue.dev | TS 8.9M + Kotlin 壳 + Python 遗留 | IDE 插件/CLI | 共享 TS core，JetBrains 端 JCEF 复用 |
| Aider | Python | CLI | 单进程，tree-sitter repo-map |
| OpenHands | 主仓 TS + agent-sdk Python | Web/桌面/SDK | client/server，Docker 沙箱执行，REST+WS |
| Dify | 前端 TS + 后端 Python(Flask) | Web | 前后端分离+Celery+多容器 |
| LobeChat / LibreChat / AnythingLLM | Node 全栈 TS/JS | Web/桌面 | 一套 TS 通吃 |
| Cherry Studio | TS | Electron | 纯客户端 BYOK 无后端 |
| Jan | TS + Rust(Tauri+llama.cpp) | 桌面 | 2025 弃 C++ cortex.cpp 转 Rust |
| Bolt.new | TS（WebContainers） | Web | 浏览器内 Node 运行时 |
| trae-agent（字节） | Python | CLI | MIT 12k stars，与 Trae IDE 无直接关系 |
| Cursor / Windsurf / Trae / 灵码 / Qoder | 客户端 VS Code fork(TS)；后端未公开 | IDE | — |

**规律**：①"agent 即核心资产"的新一代工具只用 Rust 或 TS；②Python 是 Web 平台/研究系领地，本地个人工具无一选它；③IDE 插件清一色 TS；④client/server 拆分只在沙箱/多用户时出现。**我们的定位与 Claude Code/dsh/pi/opencode 同型 → TS 是被最多同类验证的路线**。

---

# 四、前端生态调研（2026-08-21/22 npm/GitHub 实测）

## 4.1 AI/chat 组件库全景

| 库 | 版本/活跃度 | 许可 | 样式 | 组件清单（实测源码/官方索引） |
|---|---|---|---|---|
| **Vercel AI Elements** | 仓库日更；CLI ai-elements 1.9.0 | Apache-2.0 | shadcn+Tailwind（CSS Variables 模式，纯 copy-in） | **48 个**：agent/artifact/attachments/audio-player/canvas/chain-of-thought/**checkpoint**/code-block/commit/**confirmation**/connection/context/controls/conversation/edge/environment-variables/**file-tree**/image/inline-citation/jsx-preview/message/mic-selector/model-selector/node/open-in-chat/package-info/panel/persona/**plan**/prompt-input/queue/reasoning/sandbox/schema-display/shimmer/snippet/sources/speech-input/stack-trace/suggestion/**task**/**terminal**/test-results/**tool**/toolbar/transcription/voice-selector/web-preview |
| **assistant-ui** | 0.15.16（前日发版），11.8k★，周下载 137 万 | MIT | headless + Tailwind 预设（Radix/Base UI 双风味 shadcn copy-in） | primitives 16（Thread/Composer/Message/MessagePart/ActionBar/AssistantModal/Attachment/BranchPicker/ChainOfThought/SelectionToolbar/Suggestion/ThreadList...）+ 预制 26（Markdown/Mermaid/Reasoning/Streamdown/Sources/ToolFallback/DiffViewer...）+ runtimes（AI SDK/LangGraph/AG-UI/LocalRuntime/ExternalStoreRuntime/DataStream）+ react-ink 终端版 |
| **@ant-design/x** | 2.9.0（2026-07-28），4.7k★ | MIT | cssinjs（**2.x 需 antd ^6.1.1**） | 18 个：Actions/Attachments/Bubble(+BubbleList)/CodeHighlighter/Conversations/FileCard/Folder/Mermaid/notification/Prompts/Sender/SenderSwitch/Sources/Suggestion/Think/ThoughtChain/Welcome/XProvider；useXChat/XStream/XRequest/x-mcp-client 移至 @ant-design/x-sdk 2.9.0 |
| **Semi Design** | 2.102.0（2026-07-31），10.3k★，日更 | MIT | 自研 scss 主题 + DSM 平台 | **AIChatDialogue**（roleConfig/三种气泡模式/消息操作 copy-edit-delete-reset-share-good-bad/hints/引用标注/dialogueRenderConfig 全套插槽）/ **AIChatInput**（richTextInput/skillItem/suggestionItem/extensions）/ **Chat**/MarkdownRender/CodeHighlight/JsonViewer；**Message.ContentItem 原生含 ToolCallContentItem（FileSearch/WebSearch/Function/Custom/ImageGeneration）+ MCPToolCall + Reasoning + Refusal**；适配器 chatCompletionToMessage/streamingResponseToMessage 等；react19-adapter.ts |
| **@lobehub/ui** | 5.32.4（当日发版），2.2k★，920 版 | MIT | antd ^6.1.1 + React ^19 | chat 零件：BackBottom/Bubble/ChatHeader/ChatInputArea/ChatItem/ChatList/EditableMessage/EditableMessageList/LoadingDots/MessageInput/MessageModal/TokenTag + Markdown/Highlighter(Shiki)/Mermaid/CodeDiff/DraggablePanel/NeuralNetworkLoading |
| shadcn 官方 chat | 2026-06 发布 | MIT | Tailwind | MessageScroller（另有 headless @shadcn/react 双 Radix/Base UI）/Message/Bubble/Attachment/Marker + createChat helpers |
| CopilotKit | 1.68.3，36.9k★ | MIT | Tailwind | ~20 chat 组件 + 框架包最广（react/vue/angular/web-components/rn + channels Slack/Teams/TG/Discord/WhatsApp）；AG-UI 协议 |
| streamdown | 2.5.0，周下载 496 万 | Apache-2.0 | **需 Tailwind+shadcn token** | react-markdown drop-in；remend 未闭合块补全；GFM/KaTeX/Mermaid/Shiki/rehype-harden |
| @ant-design/x-markdown | 2.9.0 | MIT | **自包含 css（无 Tailwind）** | marked+DOMPurify 路线；插件 Latex/KaTeX |
| markstream-react | 2.0.1（当日） | MIT | 自带 | 流式 diff 代码块 |
| chatscope | 2.1.1（2025-05 后停更 15 月） | MIT | 自有 SCSS | 经典 IM 14 组件 —— 不推荐 |
| NLUX | 2.17.1（2024-08 后停更 2 年） | MPL-2.0 | 自有 | 单 AiChat 封装 —— 不推荐 |
| llm-ui | 0.13.3（2024-06 起休眠） | MIT | — | — 不推荐 |
| deep-chat | 2.5.0 活跃 | MIT | 内置 | Web Component 嵌入式 chatbot，非工作台零件 |
| MUI/Mantine/PrimeReact/Fluent UI/Chakra | 活跃 | — | — | **均无 AI/chat 组件**（逐一核实组件清单/源码目录） |
| react-virtuoso | 4.18.12（2026-08-17） | MIT | 无样式 | followOutput/firstItemIndex 反向加载，长会话一等选择 |

**结论**：Tailwind 线 = shadcn/ui + AI Elements + streamdown（+assistant-ui 状态层可选）；非 Tailwind 备选 Semi（消息模型最 AI 原生）或 antdx（ThoughtChain）。**"蓝色渐变玻璃 AI 风"与 Tailwind 无关**——那是 v0/Lovable 默认审美；shadcn 默认黑白中性极简。

## 4.2 CSS 方案

- CSS Modules：Vite 原生支持 `*.module.css/.scss/.less`（装 sass/less 即用），`css.modules.localsConvention` 可配。
- antd 6.6.1：全面 cssinjs（@ant-design/cssinjs ^2），**无需 less**；默认开启 CSS variables；ConfigProvider Seed/Map/Alias 三层 token；零运行时模式可选。React 19 免补丁（UMD 构建仅 React19 可用，Vite ESM 不受影响）。
- Semi：主题=编译期 scss 变量注入（DSM 平台/本地 scss/插件 variables 三级）；**Vite 无官方插件**（社区 vite-plugin-semi-theme 0.6.0）；固定 .semi-* 类名与 CSS Modules 共存无冲突（官方 FAQ）。
- 运行时 CSS-in-JS（emotion 11.14/styled-components 6.5）与零运行时（vanilla-extract 1.21/panda 1.12）在组件库自带样式前提下收益有限。

---

# 五、后端生态调研

## 5.1 TypeScript 构建块（最终选择）

| 包 | 版本/状态 | 许可 | 结论 |
|---|---|---|---|
| **@earendil-works/pi-ai** | 0.84.2 周更（2026-05 首发 41 版） | MIT | 30+ provider + 本地模型；dsh 源码 llm-pi-ai 复用验证；**选它** |
| **@earendil-works/pi-agent-core** | 同上 | MIT | 有状态 agent + subscribe 事件流 + 工具执行；**选它** |
| Vercel AI SDK（ai） | v7（2026-06-25，约 5 月一个大版本） | Apache-2.0 | Agent/ToolLoopAgent/HarnessAgent；ESM-only/Node22+；备选 |
| @mastra/core | 1.61.0 日更 | Apache-2.0 + ee 商业 | 重型全家桶，接管架构，不选 |
| @anthropic-ai/claude-agent-sdk | 0.3.238 日更 | 专有（Commercial ToS） | 锁 Claude；条款允许做产品但可单方变更 |
| @openai/codex-sdk | 0.149.0 | Apache-2.0 | spawn CLI；行为由 Codex harness 定义 |
| llamaindex | 0.12.1（2025-12 后零发布） | MIT | 实质停更，不选 |
| zod / typebox | 4.4.3 / 1.3.16（新包名，sinclairzx81/typebox） | MIT | 协议校验；typebox 直接产 JSON Schema、pi 全家用它 |

## 5.2 Go 生态（曾深入评估，最终未选）

- **eino**（cloudwego）：v0.9.15 稳定线 + v0.10.0-alpha 日更，12.8k★，Apache-2.0；ADK（ChatModelAgent ReAct 循环/Runner `iter.Next()` 事件迭代器/Plan-Execute/DeepAgent/interrupt-resume/failover）+ eino-ext（16 个 model provider：openai/claude/deepseek/gemini/qwen/ark/ollama/openrouter/qianfan + tools：mcp/commandline/bingsearch... + callbacks：langfuse/langsmith）。
- Genkit Go（firebase/genkit go/v1.12.0 月更）：providers 覆盖比 eino 广（含 DeepSeek/Qwen/Moonshot/Z.ai/Ollama）；Flows 偏 GCP。
- langchaingo：v0.1.14（2025-10），**2026-01 后停滞 7 个月**，168 PR 无人合——不作主干。
- 官方 SDK 均健康：openai/openai-go v3.52、anthropics/anthropic-sdk-go v1.66（ssestream.MessageStreamEventUnion 完整）、googleapis/go-genai v1.69（pin <2.0）、sashabaranov/go-openai v1.42（万能 OpenAI 兼容客户端）；**MCP 官方 go-sdk v1.7 production-ready**（modelcontextprotocol/go-sdk，Google 合作维护）；DeepSeek 无官方 Go SDK（走 OpenAI 兼容或 eino-ext）。
- 基础设施：SSE 用标准库 http.Flusher/NewResponseController 自写 ~50 行；JSONL 标准库；WebSocket 选 coder/websocket（gorilla 17 个月无提交）。
- **结论**：Go 可行但失去协议类型共享与 TS 构建块直接复用；语言边界在进程而非语言——Go 网关+TS 引擎 sidecar 也是合法架构（业界先例：Claude Agent SDK 驱动二进制、Codex TS SDK spawn Rust、ACP 跨语言标准）。

---

# 六、其他产品调查

## 6.1 ZCode（Z.ai/智谱，闭源）

- 身份：GLM-5.3 官方 Harness，"Agentic Development Environment"，桌面应用（Win/macOS/Linux）；https://zcode.z.ai ；无官方开源仓库。
- **本机安装目录实测**（行为观测，非源码）：
  - `~/.zcode/cli/rollout/`：`model-io-sess_<会话id>.jsonl` + 子代理分文件 `model-io-sess_subagent_agent_<id>.jsonl`——**目录名 rollout 与 Codex 同源**；内容为模型 I/O 日志（completedAt/durationMs/requestId/attempt/model{modelId,providerId}/request.body…）。
  - 插件体系：`plugins/cache/<org>/<name>/<version>/{package.json,dist,skills,scripts,docs}` npm 风格；实测 `@zcode/browser-use-plugin` 依赖 `@modelcontextprotocol/server`、`@zcode/contracts`、`@zcode/core`、`@zcode/shared`、`zod`——**插件层纯 TS + zod + MCP SDK**。
  - 能力面（目录反推）：skills/commands/hooks、MCP（http 型 server）、子代理（bundled-agents）、cron、checkpoints、crash 恢复、credentials；v2 目录有 bot-config/bot-state/bots-runtime-locks。
- 结论：Codex 架构范式追随者；不可作源码参考，可观察其行为设计。

## 6.2 Qoder / TraeWork / trae-agent

- Qoder（阿里 agentic IDE，qoder.com）：**闭源**（阿里 GitHub 仅 open-code-review 等周边）。
- TraeWork（字节 AI 办公平台）：**闭源**。
- **bytedance/trae-agent**：MIT，12k★，纯 Python，通用软件工程任务 agent CLI；与 Trae IDE 关系有社区争议（issue #273）；最后推送 2026-02。可作 Python 侧对照参考。

---

# 七、参考资料资产盘点

## 7.1 用户 GitHub（Wanfeng1028）fork 资产

| 仓库 | 性质 | 用途 |
|---|---|---|
| codex / deepseek-harness / pi / grok-build | 真源码 fork | 四大 Tier1 参考的本地阅读副本 |
| claude-code | 官方仓库 fork | plugins/ 16 官方插件 + CHANGELOG + examples（hooks/settings）；**无 CLI 源码** |
| claude-code-analysis | 泄露源码 + 19 章中文分析 | **只读学思想，不可复制代码**；1332 个 .ts + src.zip |
| chrome-devtools-mcp / react-bits / better-harness / ui-ux-pro-max-skill / awesome-human-distillation / skillhub-desktop / CodexPlusPlus / PaiSwitch | 生态 | 前端动效/agent 评测/skills 生态参考 |

## 7.2 claude-code 官方插件清单（真开源，学工作流设计）

code-review（代码审查工作流）/ commit-commands / feature-dev（特性开发流程）/ pr-review-toolkit / frontend-design / security-guidance / hookify / plugin-dev / agent-sdk-dev / explanatory-output-style / learning-output-style / ralph-wiggum / claude-opus-4-5-migration 等 16 个——每个是"系统提示词+斜杠命令+hooks+脚本"组合。

## 7.3 张汉东《Grok Build 源码分析》

https://zhanghandong.github.io/grok-build/ ——19 章中文专著（全景/75 crate 工程哲学/Actor 会话引擎/agentic 循环/上下文压缩/持久化/leader-follower/两层工具抽象/文件编辑/checkpoint/沙箱/拿来主义归一层/TUI 事件循环/增量渲染/流式 Markdown/终端工程学/MCP-Hooks-插件/治理与记忆/韧性工程）；**论断附 file:line 引用且自动校验**，以 Codex 和 opencode 为对照系。

---

# 八、参考体系定稿与法律边界

| # | 项目 | 抄什么 | 关键文件 |
|---|---|---|---|
| 1 | pi | 引擎最简骨架、JSONL 树会话、可直接 import 的包 | agent/src/agent-loop.ts、coding-agent/src/core/session-manager.ts |
| 2 | dsh | 事件日志纪律（编译期 surface 强制）、fail-closed 审批、Web UI 组织 | core/session/src/types.ts、interaction/user-approval/src/index.ts、apps/web |
| 3 | opencode | durable/live 二分、steer/queue 队列、权限规则引擎、单契约多客户端 | schema/src/event.ts、core/src/session/input.ts、core/src/permission.ts、server/src/handlers/event.ts |
| 4 | Codex | 协议形状、审批结构化提案、反向扫描 resume、并行门控 | protocol/src/turn_input.rs、app-server-protocol、rollout/src/reverse_jsonl_scanner.rs、core/src/tools/parallel.rs |
| 5 | Grok Build | leader 单实例、多域 checkpoint、TUI 调度纪律 | xai-grok-shell/src/leader/、xai-grok-workspace/src/session/checkpoint.rs |
| 6 | Claude Code | 实现细节答案之书（只读）+ 官方 plugins 学工作流 | claude-code-analysis/src + analysis/、官方 plugins/ |

**法律边界**：Apache-2.0/MIT 可复用代码（保留版权声明）；Rust→TS 必须重写（抄设计）；Claude Code 专有——接口规格（sdk.d.ts 官方发布）与思想可学，泄露源码**一行不抄**（接口与思想不受版权保护，代码受）。

---

*报告完。实施细节见 `02-development-plan.md`。*
