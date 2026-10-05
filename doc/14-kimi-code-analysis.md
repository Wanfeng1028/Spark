# Kimi Code 开源源码调研报告（工单 CK-18）

> 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| ---- | ---------- | -------- | --------------------------------------------------------------------------------- |
| v1.0 | 2026-10-05 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，工单 CK-18"分析它开源代码的可借鉴与可复用部分，交给我来决定"指令，卡在 doc/08-v2-roadmap-2 §CK-18） | 初稿：对 MoonshotAI/kimi-code 做源码级在线调研（全树 4436 文件列目录 + 精读 35 个关键文件，全部经 `gh api` raw 直读，未克隆未下载）。产出：仓库总览、架构面（循环/上下文/工具/子代理/权限/hooks 逐项带文件路径证据）、**可借鉴 12 条**（设计思想级）、**可复用 9 条**（代码级，MIT 带估价）、不可取 9 条、与 Spark 机制对照 20 行、裁决建议汇总表。**全部条目仅交晚风逐条裁决，不自动采纳，本批不改任何代码** |

## 0. 取证口径

**对象**：`MoonshotAI/kimi-code` @ `main`（2026-10-05 查询；默认分支 main，无其他分支核实）。Kimi Code CLI——Moonshot AI 的终端 coding agent，7773★，MIT。

**方式**：`gh api repos/MoonshotAI/kimi-code/...`（元数据/git trees/contents + `Accept: application/vnd.github.raw` 取原文）+ `git/trees/main?recursive=1` 全树列目录（4436 个 blob）。**未克隆、未下载任何 tarball、未用浏览器拉取**（AGENTS §2.12/§2.3a 合规）。网络偶发 EOF 均重试成功。

**精读文件清单（35 个，均有本地缓存对照）**：

| # | 文件 | 行数 | # | 文件 | 行数 |
| --- | --- | --- | --- | --- | --- |
| 1 | `README.md` | 126 | 19 | `agent/tools/os/write/writeTool.ts` | 140 |
| 2 | `AGENTS.md` | 120 | 20 | `agent/tools/agent/agentTool.ts`（前 260 行） | 812 |
| 3 | `LICENSE` | 21 | 21 | `agent/contextMemory/contextMemory.ts` | 48 |
| 4 | `packages/agent-core-v2/package.json` | 106 | 22 | `agent/fullCompaction/strategy.ts` | 266 |
| 5 | `agent-core-v2/src/index.ts` | 761 | 23 | `session/subagent/spawn.ts` | 75 |
| 6 | `src/hooks.ts` | 112 | 24 | `agent/task/taskService.ts`（前 150 行） | 1634 |
| 7 | `src/events.ts` | 87 | 25 | `agent/undo/undo.ts` | 16 |
| 8 | `agent/loop/loop.ts` | 242 | 26 | `wire/record.ts` | 52 |
| 9 | `agent/loop/machine/engine.ts` | 626 | 27 | `features/externalHooks/configSection.ts` + `internal/types.ts` | 36+54 |
| 10 | `human/agent/machine.ts`（前 300 行） | 949 | 28 | `features/tower/tower.ts` | 67 |
| 11 | `agent/permissionPolicy/permissionPolicy.ts` + `types.ts` | 22+66 | 29 | `features/goal/goal.ts` | 9 |
| 12 | `agent/permissionRules/matchesRule.ts` | 83 | 30 | `agent/toolDedupe/toolDedupe.ts` | 25 |
| 13 | `policies/dangerous-command-ask.ts` | 377 | 31 | `klient/src/contract/agent/events.ts` | 291 |
| 14 | `policies/session-approval-history.ts` | 40 | 32 | `packages/minidb/AGENTS.md` | 27 |
| 15 | `agent/toolExecutor/toolHooks.ts` + `toolExecutor.ts` | 59+68 | 33 | `docs/config-manifest.toml` | 508 |
| 16 | `tool/toolContract.ts` | 241 | 34 | `human/xstate2.ts` | 49 |
| 17 | `tool/path-access.ts` | 319 | 35 | `agent/tools/os/read/readTool.ts` | 626 |
| 18 | `agent/tools/edit/editTool.ts` + `os/bash/bashTool.ts` | 119+480 | | 另：`app/edit/fileEdit.ts`、`tools/fileReadSource.ts`、`features/reminder/systemReminder.ts` | |

### 0.1 可信度三级

| 级 | 含义 | 本报告用法 |
| --- | --- | --- |
| **A 实读取证** | 本会话逐行读过源文件，行号可复核 | §2/§3/§4 的主体结论 |
| **B 结构自述** | 来自仓内 AGENTS.md / package.json / 全树文件名 / 生成物清单，未逐行读实现 | 包定位（§1.2）、minidb 内部机制（§2.7）、tower/goal 工具面 |
| **C 待核** | 未读或只有间接证据 | 显式标"待核"，不给结论 |

---

## 1. 仓库总览

### 1.1 基本面

| 项 | 值 | 证据 |
| --- | --- | --- |
| 仓库 | `MoonshotAI/kimi-code`，"Kimi Code CLI — The Starting Point for Next-Gen Agents" | GitHub API repo 元数据（2026-10-05） |
| 语言 | TypeScript（monorepo，pnpm workspace） | 同上 `language: "TypeScript"` |
| License | **MIT**（第一方，`Copyright (c) 2026 Moonshot AI`，全文 21 行无附加条款） | `LICENSE:1-3` |
| 星数 / 创建 / 最近推送 | 7773 / 2026-05-22 / 2026-10-02 | GitHub API 元数据 |
| Node / pnpm | `>=24.15.0` / `10.33.0`，`.npmrc` 设 `engine-strict=true` | `AGENTS.md:34-38` |
| 质量工具 | oxlint（`.oxlintrc.json`）+ oxfmt、vitest、changesets、husky pre-commit、Nix（`flake.nix`） | 全树文件 + `AGENTS.md` |
| TUI 底座 | **pi-tui**（earendil-works/pi-mono 派生，自维护为 `packages/pi-tui` 118 文件） | `README.md:120-122` 致谢 + 全树 |

### 1.2 目录结构（真实源码面，B 级——全树文件名 + 仓根 AGENTS.md:15-32 项目图）

```
packages/agent-core-v2  (1571 文件)  核心：DI × Scope agent 引擎（四层 LifecycleScope：App/Workspace/Session/Agent）
apps/kimi-code          ( 647)      CLI/TUI 应用；经 @moonshot-ai/kimi-code-sdk 消费核心，禁直引引擎包（apps/kimi-code/AGENTS.md）
packages/kap-server     ( 253)      服务端：REST + WebSocket（/api/v1 + /api/v1/ws）+ /api/v1/debug 反射 RPC
apps/vscode             ( 182)      VS Code 扩展
packages/minidb         ( 141)      嵌入式 JSON 文档库（快照 + WAL + 全文索引）
packages/migration-legacy(128)      旧版会话迁移
apps/vis                ( 120)      会话/回放可视化调试工具
packages/pi-tui         ( 118)      pi 派生的终端 UI 框架（自维护分叉）
packages/klient         (  95)      客户端 SDK：契约驱动门面（global.* / session(id).* / agent(id).*，zod 校验）
packages/node-sdk       (  91)      公共 TypeScript SDK 与 harness
packages/kosong         (  91)      LLM/Provider 抽象层
packages/oauth          (  54)      Kimi OAuth 与托管鉴权
packages/acp-server     (  49)      Agent Client Protocol（Zed/JetBrains 等 IDE 接入）
packages/kaos           (  39)      执行环境与文件/进程抽象（local/ssh 双实现）
packages/tree-sitter-bash( 36)      纯 TS bash 解析器（无运行时依赖、无 wasm）
packages/transcript     (  32)      同构会话转录渲染数据层（纯 TS，浏览器可用）
packages/telemetry      (  17)      遥测基础设施
packages/remote-control (   9)      远程控制隧道客户端
apps/kimi-code/dist-web (大量)      Web UI 预构建包（源码在闭源 code-app 仓，构建物 force-add 入库；AGENTS.md:18）
```

注意三点：① web UI **源码不在本仓**（闭源 code-app 开发、dist-web 产物入库随包分发，`AGENTS.md:18`）——参考代码时 dist-web 资产不可读源码；② `apps/kimi-code/scripts/native/`（01-bundle→05-verify）是 **Node SEA 单二进制**打包链（README:55 "Single-binary distribution"）；③ `apps/vis`/`apps/kimi-inspect` 是引擎状态的可视化调试器——工程文化上"可观测"被当作一等公民。

### 1.3 工程与构建（A 级，读自 AGENTS.md 与配置文件）

- **comment-free zone**：`agent-core-v2`/`kap-server`/`transcript` 三包**禁止一切注释**（含 JSDoc），由 `scripts/check-no-comments.mjs` 进 `pnpm lint` 强制（`AGENTS.md:51`）。与 Spark"文档与注释用中文"的规范相反，属团队风格选择，不是可迁移的"优点"。
- **审查纪律**（`AGENTS.md:94-120`，四条硬规则值得整段读）："Enumerate changed behavior, not just bugs"（行为枚举式审查）/ "A flipped default or removed behavior needs a named loss and an escape hatch" / "**Prompt text is behavior**"（改 `src/**/*.md` 提示词 = 改行为，PR 必须指明受众）/ "**Silent failure outranks a crash**"（静默失败是最严重 finding）。
- **契约文件即绊线**（`AGENTS.md:112`）：`docs/config-manifest.toml`、`wire-manifest.d.ts`、`state-manifest.d.ts`、API 快照、`features/externalHooks/` 等被仓外消费，变更必须点名消费者。
- **配置清单生成器**：`docs/config-manifest.toml` 由 `scripts/gen-config-manifest.mts` 生成、标注 "do not edit by hand"（`config-manifest.toml:1-4`）——与 Spark 的 gen:contract/gen:events 生成物 + CI diff 校验是同一思路，kimi 多做了一层：**值解析链显式写进清单**（"default → config.toml → env overlay → memory"，`config-manifest.toml:9`）。

### 1.4 活跃度（B 级）

最近 commit `2026-09-30`（查询日 2026-10-05）；近 8 条 commit 跨 3 天（2026-09-28~09-30），conventional commits 规范，agent-core-v2 为绝对主体。仓库 2026-05-22 创建，五个月做到 7.7k★——Moonshot 内部主力项目外溢，不是一次性开源。

---

## 2. 架构面

### 2.1 核心循环（A 级）

循环分三层：**actor 状态机（语义）→ MachineEngine（事件投影）→ AgentLoopService（服务门面）**。

1. **actor 状态机**：`packages/agent-core-v2/src/human/agent/machine.ts` 的 `createAgentMachine`（949 行）用 xstate 5（经 `human/xstate2.ts` 薄包装：注入 inspection collector + 吞根 actor 的 AbortError）实现。上下文四缓冲（`machine.ts:134-157`）：`queue`（排队 prompt）/ `notifications`（异步完成通知）/ `reminders`（系统提醒）/ `background`（后台工具 actor）。输入事件族：`input.submit / input.steer / input.notify / input.remind / input.cancel / input.abort / input.pause / input.continue`（`machine.ts:82-103`）——**steer 是状态机一等公民**，不是外挂。
2. **MachineEngine**：`agent/loop/machine/engine.ts` 把 actor 事件投影成 25 种 `MachineEngineEvent`（`engine.ts:55-115`）：turnStarted / stepStarted / delta（assistant|thinking|toolCall 三类，`engine.ts:36-51` 的 delta splitter 按 `_streamIndex` 重组流式 tool call）/ retrying（重试快照含 failedAttempt/maxAttempts/delayMs）/ recovering / toolStarted|Update|Async|Done|Failed|Aborted / remindersConsumed / promptBlocked|Steered / turnSettled（done|failed|aborted）。
3. **服务门面**：`agent/loop/loop.ts` 的 `IAgentLoopService`（`loop.ts:205-240`）——`submit/steer/cancel/snapshot/settled/tryAcquireQuiescence/notify`，外加三个内部 hook 挂点 `onWillBeginStep / onDidFinishStep / onBeforeSubmitPrompt`（`loop.ts:235-239`）与 `registerLoopErrorHandler`（可插拔错误处理器链，`loop.ts:90-94`）。

护栏：`loop_control.max_steps_per_turn / max_attempts_per_step / max_ralph_iterations / reserved_context_size / compaction_trigger_ratio`（`docs/config-manifest.toml:217-224`）；超限抛 `LOOP_MAX_STEPS_EXCEEDED`，错误文案直接指引改 config 再 `/reload`（`loop.ts:55-62`）。重复打断器：`toolDedupe` 的 `REPEAT_BREAKER_STOP_REASON = 'repeat_breaker'`（`toolDedupe.ts:18`，实现文件未逐行读，C 级）。

**后台工具完成回注**：后台 tool actor 结束时合成一条 user 消息 `[async tool completed] <Tool> (tool_call_id=...)` + 结果内容塞进 notifications 缓冲（`machine.ts:159-206` 的 `completionNotification`/`completionPatch`）——**与 Spark CK-1 的 task.completed 合成回注 user.message 是同一设计**，可互为佐证。

### 2.2 会话与上下文管理（A 级）

- **事件落盘**：会话即 wire JSONL（`AGENT_WIRE_RECORD_KEY = 'wire.jsonl'`，`wire/record.ts:3`），首行固定 `metadata` 记录带 `protocol_version`（`wire/record.ts:23-44`），配套迁移框架（`wire/migration/`，未逐行读，B 级）。引擎事件词表 `AgentEvent` 约 50 种（`src/events.ts:30-87`：turn.* / assistant.delta / thinking.delta / tool.call.* / shell.* / tool.result / subagent.* / compaction.* / task.* / prompt.* / goal.updated / hook.result 等）。
- **客户端事件面**：`packages/klient/src/contract/agent/events.ts` 用 zod 逐一定义 19 个公开事件（turn.started/ended、assistant/thinking.delta、tool.call.started/delta、tool.progress、tool.result（带 `synthetic` 标志）、prompt.completed/aborted、compaction.started/blocked/cancelled/completed、permission.approval.requested/resolved、error/warning、agent.status.updated），引擎里 loose 的在契约层收紧或显式 `z.looseObject` 并注明"not in the protocol union"（`events.ts:173-180`）——**引擎宽、契约严、注释讲清楚谁没进公开面**，这个分层纪律与 Spark protocol（四端共享核）高度同构。
- **压缩策略**：`agent/fullCompaction/strategy.ts`（266 行）是本仓最值得读的单文件之一：
  - 双比率触发：`triggerRatio: 0.85`（触发压缩）与 `blockRatio: 0.85`（阻塞新 turn），外加 `reservedContextSize: 50_000` 预留水位——任何一条命中即压缩（`strategy.ts:18-28, 116-135`）；
  - **安全切分点** `canSplitAfter`：不在 user 消息后切、不在带 toolCalls 的 assistant 后切、不在 tool 结果前切、不切进未闭合的 tool 交换（`strategy.ts:242-266`）；
  - **保留窗口**：默认保尾部 4 条消息、保尾部 size ≤ 20% 上下文（`maxRecentMessages: 4 / maxRecentSizeRatio: 0.2`），并按"能切就切、切完必须塞得进窗口"双向拟合（`computeCompactCount` / `fitCompactCountToWindow`，`strategy.ts:137-227`）；
  - **溢出递减**：压缩后仍溢出时按 `minOverflowReductionRatio: 0.05` 递减重试，上限 `maxOverflowCompactionAttempts: 3`（`strategy.ts:178-196`）。
- **压缩交接**：`contextMemory/compaction-summary-prefix.md` 与 `fullCompaction/compaction-instruction.md`、`context-recovery-footer.md` 三份提示词随源码入库（全树），**提示词是带文件的资产而不是散落字符串**；压缩后有 `contextRecovery`（恢复页脚）与 `compactionHandoff`（B 级，未逐行读）。
- **对话 undo**：`IAgentConversationUndoService.availability()` 返回 `{maxTurns, stoppedAtCompaction}`，`undo(turns)` 按回合回退（`agent/undo/undo.ts:3-13`）；可回退边界到压缩为止（`stoppedAtCompaction`），且存在 `conversationUndoParticipants` 注册表让任务通知等状态参与 undo（`taskService.ts:25` 引用）。
- **状态声明制**：任务通知去重键等引擎状态用 `defineState('task.notificationDelivery').replayable({schema}).undoable().on(...)` 声明——**可回放、可参与 undo、事件订阅三合一**（`taskService.ts:92-112`）。重放面还有 `replayBuilder/fold`（`src/index.ts:722-723` 导出）。

### 2.3 工具系统（A 级）

- **两段式工具**：`ExecutableTool.resolveExecution(input)` 先解析出 `ToolExecution`（`tool/toolContract.ts:92-94`），解析产物含：
  - `accesses: ToolAccesses`——结构化资源声明 `{kind:'file', operation:'read'|'write'|'readwrite'|'search', path, recursive?}` 或 `{kind:'all'}`（`toolContract.ts:123-137`）；
  - `display: ToolInputDisplay`——UI 展示形状（file_io 的 before/after、command 的 cwd/language 等）；
  - `approvalRule: string`——按规则语法 `Tool(subject)` 生成的字面模式（如 `Edit(/abs/path)`、`Bash(<command>)`）；
  - `matchesRule(ruleArgs)`——**参数匹配委托给工具自身**（Edit/Read/Write 用路径语义匹配 `matchesPathRuleSubject`，Bash 用 glob 匹配命令 `matchesGlobRuleSubject`，各 tool 文件 resolveExecution 内）；
  - `execute(ctx)`——真正执行，ctx 带 `signal / steerSignal / onUpdate / onForegroundTaskStart / metadata`（`toolContract.ts:68-77`）。
  解析期即抛错（路径非法、敏感文件）则连 execute 都不会出现——**失败前置，零执行成本**。
- **写冲突调度**：`ToolAccesses.conflict(left, right)`——任一方写、路径相等或递归前缀重叠即冲突（大小写折叠、反斜杠归一，`toolContract.ts:184-235`）。并行批次用冲突对串行化，读读并行、读写/写写互斥。
- **结果溢出**：`DEFAULT_TOOL_RESULT_MAX_CHARS = 50_000`，超限 `spill: {outputPath, totalChars, suffix}` 落盘并在尾部缀 `next_step: Use TaskOutput(task_id=...)` 提示（`toolContract.ts:7-15`；bashTool.ts:351-375）；`spillExempt` 标记豁免（Read 工具给自己的结果打豁免，readTool.ts:243）。
- **注册与装配**：贡献制 `registerAgentToolService(IReadTool, ReadTool, {name, domain, requiredRuntimeCapabilities})`（readTool.ts:623-626 等），运行时按能力装配（`requiredRuntimeCapabilities: ['fs']` 不满足则工具不出现）。
- **内置工具清单**（全树取证）：核心 `Bash / Read / Write / Edit / Glob / Grep / FetchUrl / WebSearch / ReadMediaFile / SelectTools / Agent（子代理）/ AskUserQuestion / TaskList / TaskOutput / TaskStop / TaskWait`；feature 层追加 `Todo / EnterPlanMode|ExitPlanMode / CreateGoal|GetGoal|UpdateGoal|SetGoalBudget / CronCreate|List|Delete / NotifyUser / Swarm(AgentSwarm) / Tower 10 具`（`src/index.ts:336-460`）。工具描述是 `.md` 模板经 `renderPrompt` 参数化渲染（bashTool.ts:65-67），且**描述随能力动态改写**：后台任务面不可用时整段替换描述文案（`withoutBackgroundDescription`，bashTool.ts:69-87）、Agent 工具按旗裁剪 fork 参数、按模型能力过滤 ReadMediaFile（agentTool.ts:110-117, 152-198）。
- **Read 的细节密度**（readTool.ts，626 行）：负 `line_offset` 尾部读取（单遍有界保留算法，`readTail` readTool.ts:553-619）；`finishPage` 生成 `<system>` 状态注记——已读行数/总行数/是否 EOF/`Next Read: {path, line_offset, n_lines...}` 续读参数（readTool.ts:448-551）；CRLF/混合换行可视化为 `\r` 并提示 Edit 时用转义（readTool.ts:497-499）；编码探测与 UTF-16 转码、二进制 NUL 检测、媒体文件按模型 `image_in/video_in` 能力门控（readTool.ts:285-342）；尾部读取完成后 stat 复核 mtime/ino 防文件中途变化（readTool.ts:355-363, 604-607）；识别自家 wire 日志路径时提示"一次读一条"（readTool.ts:494-496）。
- **Bash 的细节密度**（bashTool.ts，480 行）：前台超时命中**自动转后台**（`autoBackgroundOnTimeout`，bashTool.ts:118-120 + `timeout_detached` 场景，bashTool.ts:264-285）；后台启动要求必填 `description`、TaskOutput/TaskStop 未启用则拒绝 run_in_background（bashTool.ts:293-314）；非交互环境固定注入 `NO_COLOR=1 / TERM=dumb / GIT_TERMINAL_PROMPT=0`（bashTool.ts:165-170）；Windows 下 `2>NUL` 重写为 `/dev/null`（bashTool.ts:476-480）；`cd 'shell路径' && cmd` 经 shell 路径桥转换（bashTool.ts:163）；输出超限提前持久化到任务文件（bashTool.ts:215-229）；完成后 `next_step` 提示词区分三场景（后台启动/超时转后台/用户转后台，bashTool.ts:412-436）。

### 2.4 子代理机制（A/B 混合）

- **profile 制**：子代理 = 具名 profile（内置 `coder`（默认）/`explore`/`plan`，`session/subagent/spawn.ts:3`），每个 profile 可带工具 allowlist、模型、权限档。目录可扩展：`extra_agent_dirs` 加载用户 `*.md` agent 定义（config-manifest:19-20 + `workspaceAgentProfileLoader/`）。
- **spawn 计划**：`SpawnSubagentPlan {profileName, model, modelSource, thinking, fork}`；`fork` 是实验旗（`SUBAGENT_FORK_FLAG_ID`）控制的**当前上下文快照继承**——fork 与 resume/subagent_type/model 互斥（三条错误文案 `spawn.ts:5-12`），fork 出的子代理被注入明确声明："上面的对话不是你自己的历史：它是 fork 你的代理的一次性快照，只当参考资料——你是独立子代理，不是那个代理的延续"（`FORK_CONTEXT_NOTICE`，spawn.ts:13-14）。
- **工具描述动态组装**：`SubagentTool.description` 是运行时拼装的——基座描述 + 后台开/关两版 + fork 开/关两版 + **可用 profile 清单（含每个 profile 的工具过滤）** + 模型池说明（agentTool.ts:152-198）；参数 schema 同样按旗/配置裁剪（`stripSubagentForkParameter / stripSubagentModelParameter`）。
- **镜像运行**：`mirrorAgentRun` 把子代理运行镜像为父会话可订阅的事件流（SubagentSpawned/Started/Suspended/Completed/Failed/Cancelled，`src/events.ts:22`）。
- Tower（B 级）：实验旗 `KIMI_CODE_EXPERIMENTAL_TOWER` 控制的多代理编排，10 具工具 Plan/Spawn/Merge/Teardown/Send/Inbox/Finding/Review/Mission/Status + 专属 `tower-worker` profile（权限档被 pin 死，`tower.ts:3-20`）；同一 workspace 的 tower 单活（`owned-by-live-session` 拒绝，tower.ts:24-55）。

### 2.5 权限/审批模型（A 级）

四层：**mode（档位）→ 策略链（policy chain）→ 规则（pattern）→ 审批交互（ask/resolve）**。

1. **三档 mode**：`'manual' | 'yolo' | 'auto'`（`permissionPolicy/types.ts:6`），默认档可配置（`default_permission_mode`，config-manifest:126）。
2. **策略链**：`PermissionPolicy.evaluate(context) → approve | deny | ask | undefined`（types.ts:61-66），返回 undefined 即"本策略不管，下一位"。`policies/` 目录 12 个策略文件（全树）：`user-configured-deny → user-configured-ask → user-configured-allow → dangerous-command-ask → sensitive-file-access-ask → git-control-path-access-ask → git-cwd-write-approve → session-approval-history → auto-mode-approve → auto-mode-ask-user-question-deny → yolo-mode-approve → default-tool-approve → fallback-ask`（顺序为按文件名与语义的合理推断，精确次序**待核**——装配在 `permissionPolicyService.ts`，未逐行读）。两个实读样本：
   - `dangerous-command-ask`（377 行）：用自家 tree-sitter-bash 解析命令 AST（`timeoutMs: 500, maxNodes: 10_000` 预算，`dangerous-command-ask.ts:15`），递归穿透 `sudo/doas`、`env/command/exec/nohup/nice` 包装、`sh -c` 嵌套（**深度上限 4**）、`eval`、`busybox`，命中 `shutdown/mkfs/dd of=/dev/*（安全设备白名单外）/rm -rf（/tmp 下且无 `..` 才放行）/systemctl poweroff...` 判 dangerous；含 `$ \` * ? [ ] ~` 的操作数直接判**不可分析**（UNSAFE_OPERAND，:19），yolo 档下不可分析放行、manual/auto 档下不可分析也 ask（:141-145）。
   - `session-approval-history`：用户在会话内点过"always allow"的规则以 `session-runtime` scope 的模式缓存，命中即 approve（`session-approval-history.ts:16-39`）。
3. **规则语法与匹配**：模式 `ToolName` 或 `ToolName(argPattern)`（`matchesRule.ts:32-56`）；工具名支持 picomatch 通配；**argPattern 的语义由工具的 `matchesRule` 回调解释**（路径规则匹配归一化路径 + home 目录，命令规则匹配 glob），匹配结果带 `strategy: 'tool_name_only' | 'matches_rule'` 与 `hasRuleArgs` 供审批 UI 展示（`matchesRule.ts:60-83`）。规则四级 scope：`turn-override | session-runtime | project | user`（config-manifest:315）。
4. **ask 的可编程续接**：`ask` 结果可携带 `resolveApproval(response)` 回调——用户批准后把审批响应**转成替代执行或错误**而非机械放行原调用（`types.ts:53-58`）；审批响应带 `scope: 'session'`（记住到会话）与 `feedback`（`types.ts:17-22`）。
5. **路径防线**：`tool/path-access.ts`（319 行）是所有文件工具的必经口：
   - `isSensitiveFile`：`.env`（豁免 `.env.example/.sample/.template` 与 `*.pub`）、`id_rsa/id_ed25519/id_ecdsa/credentials` 及 `-`/`_` 变体、`.bak/.old/.pem/.tmp/...` 十种后缀变体、`.aws/credentials`、`.gcp/credentials` 路径段——命中即 `PATH_SENSITIVE` 硬拒（:15-83, 261-269）；
   - Windows 盘符相对路径（`C:foo`）直接 `PATH_INVALID`（:146-154）；`~` 展开 + shell 路径桥（`/c/...` ↔ `C:\...`）归一（:125-165, 295-302）；
   - 工作区外守卫双档：`absolute-outside-allowed`（默认）= **相对路径出工作区拒、绝对路径放行**（放行后走审批），`disabled` = 不设防（:271-286）。**注意：这比 Spark 的"cwd 外拒读优先于审批"宽松**，Spark 不应照搬此档位语义，但敏感文件模式层是 Spark 没有的防线。
6. **执行期租约**：工具 execute 内 `runtime.acquire(['fs']|['process'])` 拿独占租约，并复核 `runtime.identity.generation`——resolve 与 execute 之间若工作区/运行时已切换则报 "Runtime changed before execution. Retry the tool call."（editTool.ts:74-83、writeTool.ts:67-77）——**TOCTOU 防护**，Spark 无对应机制。
7. **外部 hooks**（用户可配的 shell 钩子，区别于内部 hook 槽）：20 事件 `PreToolUse / PostToolUse / PostToolUseFailure / PermissionRequest / PermissionResult / UserPromptSubmit / UserPromptQueued / TurnStarted / Stop / StopFailure / Interrupt / SessionStart / SessionEnd / SessionHeartbeat / SubagentStart / SubagentStop / TaskStarted / PreCompact / PostCompact / Notification`（`features/externalHooks/internal/types.ts:3-24`）；`HookDef {event, matcher, command, timeout(1-600s)}`（configSection.ts:10-17）；结果 `allow | block` + reason + structuredOutput（types.ts:37-47）。最新 commit 显示 hook stdout 可回注 prompt（2026-09-29 "fold UserPromptSubmit hook output into the prompt message"）。

### 2.6 持久化与客户端契约（B 级，未逐行读实现）

- **persistence 接口层**：`persistence/interface/{storage, appendLogStore, atomicDocumentStore, queryStore, blobStore}` 五接口 + node-fs/minidb/memory 三后端（`src/index.ts:563-578`）——append log（= 会话 wire）与文档库分离。
- **minidb**（B 级，读自 `packages/minidb/AGENTS.md`）：快照 + WAL + 独占写锁（输家只读并从 WAL 追）、倒排全文索引（CJK uni/bigram 分词 + trigram 子串）、持久化索引代际（generation 原子发布 + 损坏回退全量重建）、重活走 worker 线程（主线程只验证与换基）。141 文件的工程巨兽，为 kap-server 的会话搜索服务。
- **klient**（B 级，读自根 AGENTS.md:30 + contract/agent/events.ts 实读）：契约驱动客户端门面，`global.* / session(id).* / agent(id).*` 三命名空间、zod 校验、传输经子路径入口（`@moonshot-ai/klient/ipc|memory` 同一 `Klient` 类型）——**与 Spark `@spark/sdk` 双子入口（HTTP/inprocess）几乎是同构解**，连"内存传输用于测试"都对得上。

---

## 3. 可借鉴清单（设计思想级，12 条）

> 每条：机制 / kimi 实现位置 / 核心思路（≤5 行）/ Spark 落点。借鉴 = 学思想按 Spark 风格重写，不是搬文件。

| # | 机制 | kimi 位置 | 核心思路 | Spark 落点 |
| --- | --- | --- | --- | --- |
| 3.1 | **语法树级危险命令检测** | `policies/dangerous-command-ask.ts`（全 377 行）+ `packages/tree-sitter-bash` | 不做字符串黑名单，而是解析 AST 后按语义判：穿透 sudo/env/sh -c（深度 4）/eval/busybox 后再判内核命令；带元字符的操作数一律"不可分析"并按档位降级为 ask。误报率远低于关键词匹配 | `packages/engine/src/permission/`（策略挂点）+ 新 `tools/builtin/bash` 的审批预处理；解析器可整包复用（见 4.1） |
| 3.2 | **规则参数匹配委托工具自身** | `toolContract.ts:86` `matchesRule?` + `matchesRule.ts:60-83` | 规则写 `Edit(/path)`、`Bash(git *)`，但"括号里怎么算匹配"由工具自己解释（路径语义/glob 语义）——审批系统不需要理解每个工具的参数域 | Spark 审批规则目前按工具名+资源；可在 `ToolDefinition` 增可选 `matchesRule` 回调，permission/rules 只存模式 |
| 3.3 | **ToolAccesses 写冲突调度** | `toolContract.ts:123-235` | 工具解析期声明结构化资源访问（读/写/搜索 × 路径 × 递归），调度器用 `conflict()` 把并行批次中读写/写写对串行化——并行的收益拿满、竞态从源头排除 | Spark CK-17 已做声明制五维安全（ToolSafety + concurrentSafe），可补"路径级自动推导"这半边：工具声明 accesses 后冲突检测自动化 |
| 3.4 | **两段式工具执行** | `toolContract.ts:92-94` resolveExecution | resolve 阶段完成：路径校验、accesses/approvalRule/display 计算、错误前置——execute 只在一切合法后存在。审批 UI 拿到的 display 是解析后的规范形状 | `packages/engine/src/tools/` 的 ToolDefinition 流水线（pipeline.ts）可吸收"resolve 产物独立于 execute"的分层，审批卡展示更准 |
| 3.5 | **压缩安全切分点 + 保留窗口** | `fullCompaction/strategy.ts:137-266` | 压缩量不是拍脑袋：从尾部反向找"可切分点"（不切 user 后、不切 tool 交换中），保尾 4 条 / ≤20% 窗口，压缩结果必须塞回窗口内双向拟合；溢出按最小缩减比递减重试 ≤3 次 | Spark 上下文水位（工单 8.x）+ CK-7 溢出压缩：把 canSplitAfter 的四条规则与双向拟合吸收进 run-loop 压缩前置计算 |
| 3.6 | **敏感文件模式硬防线** | `tool/path-access.ts:15-83` | 与工作区边界正交的一层：`.env`/SSH key/云凭证及其 `.bak/.old/.pem` 变体直接拒，豁免 `.env.example` 与公钥——防"读个配置"顺手泄密 | `resolveInRoot`（cwd 硬边界）之外加 `isSensitiveFile` 纯函数层；落 `engine` 文件工具公共路径 + bash 目标扫描可复用 `agentsMdReminder/bashTargets.ts` 同思路 |
| 3.7 | **执行期租约 + generation 复核** | `editTool.ts:74-83`、`writeTool.ts:67-77`、`bashTool.ts:187` | resolve 与 execute 之间世界可能变化（工作区切换/运行时重建）：执行前拿资源租约并比对 generation，变了就明确报错重试而非写进旧世界 | Spark 引擎无多 workspace 运行时切换，暂无直接需求；但"工具执行拿资源租约"的形态可登记候选池（若日后做多工作区/沙箱） |
| 3.8 | **工具描述动态改写** | `bashTool.ts:69-135`、`agentTool.ts:110-198` | 描述/参数 schema 按能力裁剪：后台面关了就把描述里 run_in_background 整段换成禁用句、Agent 工具把可用 profile 清单和模型池拼进描述——模型永远看到与运行时一致的工具面 | Spark `BUILTIN_COMMANDS`/工具描述为静态；可在 toolRegistry 装配时按配置渲染描述模板（`.md` + renderPrompt 的形态值得学） |
| 3.9 | **外部 hooks 事件面** | `externalHooks/internal/types.ts:3-24` | 20 个生命周期挂点，Spark CK-2 已有 13 点；kimi 多出的：`PostToolUseFailure`（失败也通知）、`PermissionRequest/Result`（审批可被外部拦截）、`PreCompact/PostCompact`、`SessionHeartbeat`、`UserPromptQueued`（入队即通知） | `.agents/skills/` hooks 矩阵 + engine hooks 挂点：对照补 `pre_tool_use` 之外的审批挂点与压缩挂点（CK-2 批 2 留卡可参考） |
| 3.10 | **审批 ask 的可编程续接** | `permissionPolicy/types.ts:53-58` | ask 不只是"等用户点头"：携带 resolveApproval 回调，批准后可转成替代执行（如改参数重跑）或转错误；响应带 scope/feedback 结构化字段 | Spark ApprovalCard 已有 scope/feedback 雏形（会话内 always allow = session-approval-history 同款）；resolveApproval 编程续接登记候选池 |
| 3.11 | **"Prompt text is behavior" 审查规则** | 根 `AGENTS.md:108` | 提示词 `.md` 与代码同权管理：改一句提示词 = 改全体用户行为，PR 必须指明受众、原句约束了什么、现在由什么兜底；"没有测试引用这句"不构成无影响的证据 | Spark 提示词散在 engine/ 与 skills/：登记为 CONTRIBUTING/审查清单条款（纯流程，零代码） |
| 3.12 | **配置清单生成器** | `docs/config-manifest.toml`（508 行生成物） | 配置节注册制 + 生成器产出"节→源文件→默认值→env 映射"总清单入库，CI 校验；旧键改名走显式 deprecation 记录 | Spark 已有 gen:contract/gen:events 双生成物；settings 面扩大后可加第三件：settings schema → 配置清单（含 restartRequired 标注）生成器 |

---

## 4. 可复用清单（代码级，9 条）

> MIT 第一方允许直接抄（保留版权声明，落仓按 Spark 代码风格重写，AGENTS §6.2）。依赖度与移植代价：S = 半天内 / M = 一至数天 / L = 需要先铺前置设施。

| # | 来源文件 | 做什么 | 依赖 | 可移植性 | 估价 |
| --- | --- | --- | --- | --- | --- |
| 4.1 | `packages/tree-sitter-bash/`（36 文件） | 纯 TS bash 解析器，`parse(source, {timeoutMs, maxNodes})` 确定性预算 + `ParseResult` 判别联合，无 wasm 无原生依赖 | 零运行时依赖（自带语法表） | **极高**——独立包原样可用 | M（整包引入 + knip/typecheck 面登记；3.1 的前置） |
| 4.2 | `policies/dangerous-command-ask.ts` | 危险命令判定算法本体（穿透链 + 命令集 + rm -rf 例外 + dd 白名单） | 仅 bashParser/mode/config 三个接口 | 高——核心是 `analyzeSource/analyzeInvocation/literalText` 纯函数，接口对齐后即可搬 | M（配合 4.1） |
| 4.3 | `tool/path-access.ts` | `isSensitiveFile` + `canonicalizePath` + `isWithinDirectory` + `~` 展开/盘符路径校验 | 仅 `pathe`（或换 node:path）+ shellPathBridge | 高——三函数纯函数可直接抄进 Spark 工具层 | S（剥 shellPathBridge 依赖） |
| 4.4 | `agent/permissionRules/matchesRule.ts` | 规则模式解析 + picomatch 工具名匹配 + matchesRule 委托协议 | 仅 `picomatch`（Spark 生态可换 minimatch/picomatch 均可） | 极高 | S |
| 4.5 | `agent/fullCompaction/strategy.ts` | 压缩策略全算法（canSplitAfter / computeCompactCount / fitCompactCountToWindow / reduceCompactOnOverflow） | 零外部依赖（只吃 Message[] 与估算函数） | 极高——与 Spark 消息模型对齐后整类可搬 | S–M |
| 4.6 | `src/hooks.ts`（OrderedHookSlot） | 有序 hook 槽：id 注册/删除 + before/after 插入约束 + 洋葱式 run（next 链 + terminal） | 零依赖（只用自身 Disposable） | 极高 | S（Spark CK-2 hooks 引擎可对照增强排序能力） |
| 4.7 | `agent/tools/os/read/readTool.ts` 的尾部读取与续读算法 | `readTail` 单遍有界保留 + `finishPage` 的 `<system>` 注记与 `Next Read:` 参数生成 | 零依赖（纯算法段） | 高——函数级摘取，不改 Spark read 工具骨架 | M（对齐 Spark read 的行窗口模型） |
| 4.8 | `fullCompaction/compaction-instruction.md`、`contextMemory/compaction-summary-prefix.md`、`context-recovery-footer.md` | 压缩指令/摘要前缀/恢复页脚三份提示词（与实现配套、经过生产打磨） | 无 | 高——文案级资产，按 Spark 事件/上下文语义改写 | S |
| 4.9 | `agent/tools/os/bash/bash.md` 描述模板 + `renderPrompt` 形态 | 参数化工具描述（SHELL_TIMEOUT_VARS 注入）+ 按能力增删段落的写法 | 无 | 高——Spark 工具描述可直接套用此形态 | S |

不单列但顺手可查的：`spawn.ts` 的 FORK_CONTEXT_NOTICE 文案（若 Spark 做 fork 型子代理直接参考）；`bashTool.ts` 的非交互 env 注入与 Windows NUL 重写（各 5-10 行，Spark bash 工具改造时对照）。

---

## 5. 不可取清单（9 条）

| # | 部分 | 理由 |
| --- | --- | --- |
| 5.1 | **DI × Scope 四层生命周期架构**（`_base/di/` 全套：descriptors/graph/instantiationService/scope/collection/fiber/cascadeEngine，约 64+ 文件） | 与 Spark "boring code" 总则与现行 R-D 判决（engine.ts 门面不再拆）正面冲突；kimi 自己也承认"No App-level session lifecycle facade — callers compose"（根 AGENTS.md:21）——复杂度是真实代价，不是免费午餐 |
| 5.2 | **xstate actor 核心循环** | Spark run-loop 已是直写循环 + CK-3 观察器护栏；换 xstate 意味着重写整个循环且引入重心智模型。且 kimi 的 xstate2 包装里还有吞根错误这类平台补丁（`human/xstate2.ts:37-47`），说明 actor 模型在 abort 语义上并不省心 |
| 5.3 | **kosong / kaos / klient 三层抽象包** | 与 Spark protocol/engine/sdk 分层同构，重命名游戏无净增益；Spark 已有等价物且经过四端共享核纪律打磨 |
| 5.4 | **minidb 全文检索引擎**（141 文件） | Spark 会话检索无此规模需求；其工程水准高（代际/worker/有界恢复）但维护面巨大，抄进来是负资产 |
| 5.5 | **Tower 多代理编排**（10 工具 + swarm） | 实验旗默认关闭的特性；Spark /arena（D42）已有最小可用形态且更贴合 Spark 事件模型。若日后扩多代理再回看其 inbox/finding 消息协议 |
| 5.6 | **媒体/视频管线与 dist-web 预构建包** | 视频上传、webp wasm 解码、KaTeX 资产强绑定 Moonshot 服务端（`KIMI_MODEL_API_KEY`、`services.moonshot_search/fetch` 端点）；dist-web 产物入库与 Spark 源码单源纪律冲突 |
| 5.7 | **Node SEA 单二进制分发链**（`scripts/native/` 14 文件 + notarize/keychain CI） | 平台强绑定（macOS 公证/签名、 entitlements）；Spark 桌面走 Electron sidecar（D14），分发链不通用。可观察其 `05-verify` 冒烟形态 |
| 5.8 | **comment-free zone** | 与 Spark "文档与注释用中文" 的 §2.3 相反；且无注释代码对 AI 协作的可读性代价在本仓调研中直接可见（大量行为只能靠读实现反推） |
| 5.9 | **工作区外"绝对路径放行"守卫档**（`path-access.ts:271-276` 默认 `absolute-outside-allowed`） | 比 Spark "cwd 外拒读优先于审批"（§2 硬性约定 4/§6.4）宽松——绝对路径出工作区在 kimi 是放行走审批，在 Spark 是红线。**不可反向松动 Spark 语义**，此条只作差异登记 |

---

## 6. 与 Spark 现有机制对照表

| # | 机制 | kimi-code | Spark 现状 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 会话事件落盘 | wire.jsonl + metadata 行带 `protocol_version`（`wire/record.ts:23-44`） | 单写者 JSONL（SessionStore），无版本首行 | **有缺口**：协议版本行 + 迁移框架值得参考（待核：Spark 是否已有，grep 未做） |
| 2 | 事件词表 | 引擎约 50 种 + 客户端契约 19 种公开面 | 35 种（durable 31 / live 4 / surface 2） | 等价（规模不同）；kimi"引擎宽/契约严"分层与 Spark protocol 一致 |
| 3 | steer/queue | 状态机一等输入 `input.steer`（machine.ts:88） | 已有（抄 opencode 的 steer/queue） | 已有等价物 |
| 4 | 后台任务平面 | TaskList/Output/Stop/Wait + bash 超时自动转后台 + kill_grace | CK-1：task.started/completed/progress + runInBackground + 60s 前台预算转后台 | 已有等价物（kimi 多 TaskWait/90s cap 与 grace period，细节可回补） |
| 5 | 后台完成回注 | 合成 user 消息 `[async tool completed]`（machine.ts:159-186） | CK-1 完成回注合成 user.message | 已有等价物（设计互证） |
| 6 | 上下文压缩 | 全量压缩：策略类 + 安全切分 + 保留窗口 + 恢复页脚 | 上下文水位 + CK-7 溢出反应式压缩 | **有缺口**：切分点算法与保留窗口（见 3.5/4.5） |
| 7 | 对话 undo | undo(turns) + availability + 参与者注册表 | 无（Spark 回滚走 resetSlice + 全量重放） | **有缺口**（形态不同，是否要按回合 undo 待晚风定） |
| 8 | 权限档 | manual/yolo/auto 三档 | bash 全审批默认 + /trust 收紧语义（D 系 ADR） | 等价（档位命名不同） |
| 9 | 审批策略链 | 12 策略链式评估 + undefined 让位 | permission/rules evaluate + service 挂起/级联 | 等价偏弱：参数级匹配（3.2）与策略数量有差距 |
| 10 | 危险命令识别 | AST 语义判定 + 不可分析降级 | 无（默认全审批兜底） | **有缺口**（3.1/4.1/4.2 可补） |
| 11 | 敏感文件防线 | isSensitiveFile 硬拒层 | 无独立层（密钥只从 env/secrets 读是另一面） | **有缺口**（3.6/4.3 可补） |
| 12 | 路径边界 | 相对路径出工作区拒、绝对路径放行 + 敏感拒 | resolveInRoot 硬边界，越界优先于审批 | **Spark 更严**（5.9，不松动） |
| 13 | read-before-write 新鲜度 | **无**（Write 直接写，仅租约 + generation 检查） | ZC-5：read 登记 + E_NOT_READ/E_STALE | **Spark 更强**（差异化优势，kimi 的 TOCTOU 租约思路可观察） |
| 14 | 工具并发安全 | ToolAccesses 冲突检测（路径级自动推导） | CK-17：ToolSafety 五维 + concurrentSafe 声明制 | 同题异解（声明制 vs 推导制；可互补，见 3.3） |
| 15 | 工具结果溢出 | spill 落盘 + TaskOutput 提示（50k） | toolResultTruncation 已有截断（对账 LA 系已核） | 等价（spill 文件化细节可对照） |
| 16 | 子代理 | profile 制 + fork 快照继承（实验旗）+ 镜像事件 | 子代理已落地（16.2 /agents + D36 两层定义） | 已有等价物；fork 形态登记候选池 |
| 17 | ask_user | AskUserQuestion 工具 + 后台问题任务 | CK-6 ask_user + QuestionBoard | 已有等价物 |
| 18 | goal | Create/Get/Update/SetGoalBudget 四工具 | 16.7 /goal（D33：迭代上限/token 预算/judge 超时） | 已有等价物（kimi 的 budget 独立工具形态可对照） |
| 19 | 外部 hooks | 20 事件 + allow/block + 结构化输出 | CK-2：13 点 + pre_tool_use 阻塞 | **有缺口**（3.9 列了差集） |
| 20 | 工程流程 | "Prompt text is behavior" 等四条审查铁律 + 配置清单生成器 | 检查器 5/6 + gen:contract/events | **有缺口**（流程条款级，3.11/3.12） |

---

## 7. 裁决建议汇总

> **以下每条均待晚风逐条裁决，未获拍板前不落任何代码。** 建议 = 借鉴（学思想重写）/ 复用（抄代码保留署名）/ 不做。优先级：P1 = 下一批可开工；P2 = 排队；P3 = 观察项（挂触发条件）。

| 条目 | 来源 | 建议 | 理由一句话 | 优先级 |
| --- | --- | --- | --- | --- |
| 3.1+4.1+4.2 语法树危险命令检测 | dangerous-command-ask.ts + tree-sitter-bash | **复用** | bash 全审批的误报痛点真实存在，AST 判定是唯一降误报路径，且解析器零依赖整包可用 | P1 |
| 3.6+4.3 敏感文件模式防线 | path-access.ts isSensitiveFile | **复用** | 30 行纯函数补齐 Spark 密钥防线最后一层（.env/.pem 变体），与 resolveInRoot 正交 | P1 |
| 3.5+4.5 压缩安全切分点 | fullCompaction/strategy.ts | **复用**（算法） | canSplitAfter 四规则 + 双向拟合是纯算法零依赖，直接提升 CK-7 与水位压缩质量 | P1 |
| 3.2+4.4 规则参数匹配委托 | matchesRule.ts | **借鉴** | 与 CK-17 声明制方向一致，先立 ADR 定"声明 vs 委托"再动 | P2 |
| 3.4 两段式工具执行 | toolContract.ts resolveExecution | **借鉴** | 审批 display 精度与错误前置收益明确，但动 ToolDefinition 六要素，需过 new-tool SKILL 全流程评估 | P2 |
| 3.9 hooks 差集挂点 | externalHooks types.ts | **借鉴** | CK-2 批 2 留卡直接对照补（PostToolUseFailure/PermissionRequest/PreCompact 三个最值） | P2 |
| 4.6+3.10 OrderedHookSlot / resolveApproval | hooks.ts / permission types | **借鉴** | CK-2 hooks 引擎增强排序能力；resolveApproval 登记候选池（审批可编程续接是新面） | P2 |
| 3.8+4.9 工具描述模板化 | bash.md + renderPrompt | **借鉴** | 零风险改善：描述与运行时能力永同步，形态现成 | P2 |
| 3.12 配置清单生成器 | docs/config-manifest.toml | **借鉴** | settings 面扩大（D36/D41 之后）后第三生成物顺理成章；现在做略早 | P3 |
| 4.7 Read 尾部读取/续读算法 | readTool.ts | **借鉴** | Spark read 已有 first-N-lines 语义，续读参数生成是增量改善；等 read 工具有改造工单时搭车 | P3 |
| 4.8 压缩提示词三件 | compaction-instruction.md 等 | **复用**（文案） | 与 3.5 同批落地时一并按 Spark 语义改写 | P1（随 3.5） |
| #1 wire 版本行 + 迁移 | wire/record.ts | **借鉴** | 会话 JSONL 前向兼容的保险丝；加一行 metadata 成本极低（需先核 Spark 现状是否已有） | P2 |
| #7 按回合 undo | undo.ts + participants | **不做**（暂） | Spark 回滚语义已按"重放重建"统一（resetSlice + 全量重放），双轨 undo 制造两种真相 | P3（触发条件：用户明确要 undo 手感） |
| 5.1–5.9 不可取清单全项 | §5 | **不做** | 理由见 §5 逐条 | — |

**给晚风的三个决策问题**（裁决时可能用得上）：

1. **危险命令检测要不要接**：接 = bash 审批从"全问"变"危险的问、安全的过"（manual 档体验大变），需要拍板默认开还是 `/trust` 级开关（kimi 是 `permission.dangerous_command_guard` 独立开关，默认档位行为另有 `default_permission_mode`）。
2. **undo 双轨问题**：若要按回合 undo，Spark 的"回滚 = resetSlice + 全量重放"不变量是否松动？kimi 的做法是 undo 参与者的注册表制（谁影响会话状态谁注册），可作为松动时的形态参考。
3. **声明制与推导制并行**：CK-17 的 ToolSafety 声明与 kimi 的 ToolAccesses 推导不冲突（声明管 concurrentSafe 语义，推导管路径冲突），是否合并成一个 ADR 一次说清。

---

## 附：取证合规声明

- 全程 `gh api` 在线读取（元数据 / git trees / contents raw），未执行 `git clone`、未下载 tarball/zip、未拉取任何 CDN 资源（AGENTS §2.12/§2.3a）。
- 调研缓存文件在系统临时目录（仓库外），未写入仓库任何位置。
- 本报告只新增 `doc/14-kimi-code-analysis.md` 一个文件，未改动任何代码与其他文档。
- 网络抖动导致的零星取文件失败均以重试解决，未绕过约束。
