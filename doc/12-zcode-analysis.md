# ZCode（zai-org/ZCode）源码全面分析报告

> 调研对象：zai-org/ZCode v3.14.3（TypeScript，Apache-2.0，约 6.8k★，2026-09-20 建仓）
> 方法：全程 gh api + raw 直读，未克隆未下载（§2.12 合规）；所有结论标注 [读码] 或 [推断]
> 三路并行调研：① 架构与工具系统 ② 权限与协议 ③ UI 与亮点功能
> 用途：Spark 参考项目 #12——分析 ZCode 有什么值得 Spark 借鉴的设计与实现

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| --- | --- | --- | --- |
| v1.0 | 2026-09-26 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"参考项目中加入 ZCode，质谱的开源版本，你去分析一下源码"指令） | 初稿：三路并行调研合并——架构/循环/工具/上下文/权限/协议/MCP/hooks/亮点。与 AGENTS v1.65、doc/01 v2.0（§10 #12 行）、doc/02 v4.136 同批 |
| v1.1 | 2026-09-26 | 同上 | 第三路调研（UI/亮点/可借鉴）完成合并——新增 §10 UI 渲染（OpenTUI 非 Ink/streamProjected 标记/workflow 镜像三纪律）、§10.2 桌面五进程面（VS Code 同款 RPC）、§10.3 远程三后端（协议差异为零）、§11 亮点功能七项（Stream Recovery/Steer Queue CAS/Checkpoint git 隐藏提交/Microcompact/Memory/formal-proof/CUA 占位）、§12 TOP 10 终版（三路合并取代初版 5 条） |

---

## 1. 仓库全貌与架构

### 1.1 Monorepo 布局

[读码] pnpm workspace，四球：`packages/*`、`apps/zcode-cli`、`apps/zcode-cli/packages/*`、`apps/zcode-cli/tools/*`。Node ≥24，pnpm 10。

```
packages/              ← 产品侧
  ui/                  (1555 文件) 共享 React 组件库
  desktop/             (1480)      Electron 壳（四 tsconfig）
  web/                 (1168)      React Web 前端
  server/              (54)        Hono HTTP+WS 薄壳
  services/            (331)       领域服务（session/zcode-agent/bots/oauth/git…）
  client/ + rpc/       (30)        客户端连接层 + Channel RPC 协议
  shared/              (228)       跨包常量与 schema
apps/zcode-cli/packages/  ← Agent 本体（17 个嵌套包）
  core/       (500)    agent 循环、工具执行、权限、compact、上下文
  contracts/  (115)    跨包契约：类型 + zod schema + 25 个 port 接口
  adapters/   (204)    端口实现：AI SDK、MCP、fs/exec、playwright、SQLite
  bootstrap/  (234)    装配层（create-app、model-factory、动态工作流）
  cli/        (99)     zcode 命令入口（TUI/Web/Agent 三模式分流）
  tui/        (95)     Ink 终端界面（只依赖 contracts/i18n/shared）
  dynamic-workflow/ (102)  脚本化多子代理工作流引擎
  + node-repl-host / browser-use-plugin / telemetry / i18n / debug
```

### 1.2 依赖方向（六边形架构贯彻）

[读码] 依赖拓扑严格单向：`shared ← contracts ← core ← bootstrap ← cli`；adapters 实现 contracts 的 port 接口；tui 只依赖 contracts/i18n/shared（不依赖 core）。contracts/src/interfaces/ 有 25 个 `*.port.ts`（ExecutionPort/FileSystemPort/HttpClientPort/SubagentPort/SkillPort/SessionStorePort/PermissionPort…）。CLI 侧 AGENTS.md 明文规定：业务模块不得直接调 `fetch/fs/child_process/process.env`，一切外部副作用收敛到 adapter。

[读码] 架构检查有 `architecture-policy.yaml` + `scripts/architecture/`（`pnpm architecture:check` 进 pre-push 钩子）。

### 1.3 LLM 供应商层

[读码] 建在 **Vercel AI SDK v6** 之上（`ai@6.0.193`、`@ai-sdk/anthropic@3.0.81`、`@ai-sdk/openai@^3.0.58`），不自写各 provider 客户端。contracts 的流事件形状就是 AI SDK 归一化后的形状（`model.ts:39-40` 注释明说）。根 package.json 带 `@ai-sdk/*` 的 patchedDependencies（补丁修上游行为）。

---

## 2. Agent 循环（run-loop）

### 2.1 驱动方式

[读码] `core/src/runtime/methods/turn-loop.ts:43` `runRegularTurnLoop`——**`while(true)` 异步循环**，每轮迭代固定序列，模型步返回 `"break"` 才退出。循环不直接操作可变状态，而是每步替换**纯状态机 TurnMachine** 的不可变快照（`state.turnMachine = new TurnMachineImpl(state.turnMachine.xxx())`）。

[读码] 相位图（`agent/turn-state.ts:25-36`）：
```
idle → processing_input → awaiting_model_response → streaming
     → scheduling_tools → executing_tools (⇄ awaiting_permission)
     → aggregating_results → completing | error
```
相位迁移不合法直接抛 `InvalidTurnPhase`。

[读码] **"长程任务不设 tool-call 硬上限"** 是成文规则（CLI 侧 AGENTS.md 第一条）："核心 agent loop 默认面向可持续运行的复杂任务设计，不用 tool call 次数做硬停止。资源与安全边界应由 token/context limit 自动 compact、用户取消、权限拒绝、工具超时、输出截断、provider retry 上限等明确条件承担"。

### 2.2 turn 生命周期

[读码] 入口**排队制**：`executeTurn` 不直接执行，而是 `enqueueCancellableRuntimeCommand` 把 prompt 投进 runtime 命令队列（串行化、可取消、可抢占）。执行前**冻结本轮模型选择/输出样式**（"任何 await 之前冻结本轮事实"）。

[读码] 每轮 while 迭代按序：
1. abort 检查 + **排空 steer/runtime 命令**（用户中途插入的输入并入下一请求）
2. **microcompact**（轮内微压缩，详见 §5）
3. **auto compact**（阈值压缩）
4. MCP 初始化 + 工具表构建（按 turn 级 disallow 名单过滤）
5. 注入 system-reminder 附件（plan 退出提醒/Todo 提醒/输出样式）
6. **provider 投影**（buildRuntimeProviderRequestMessages 把 entries 投影成消息数组并统一打 cache-control）
7. `startModelRequest` → `runModelBackedTurnStep`

### 2.3 模型步的失败恢复

[读码] `turn-model-step.ts:88-733` 的失败路径**层层设防**：
- **流恢复**：streamingToolCoordinator.recoverFromModelFailure
- **上下文超窗 → 反应式 compact 重试**（每模型步只试一次）
- **输出 token 截断自动续写**：finishReason=length 且无工具调用时追加续写指令再跑（classifyOutputTokenContinuation），超过恢复次数才抛
- **取消时已流出内容 commit 进历史**（保持 live/cold-resume 一致）
- 可疑空结果检测

### 2.4 工具批执行

[读码] 拓扑排序 → 依赖分层 → 层内并行。并行资格：`destructive` 一票否决；`concurrentSafe===true` 一票通过；否则看 `readOnly` 或 `sideEffectScope==="none"`。默认最大并发 10。批执行器是 **AsyncGenerator**，逐组 yield 事件（batch_start/tool_start/tool_complete/batch_complete）——事件驱动 UI 与执行解耦。

### 2.5 流式输出

[读码] `runModelTextRequest` 的流式分支返回 **AsyncIterable\<ModelEvent\>**（start/text_delta/reasoning_delta/tool_input_delta/tool_call/finish），`for await` 消费。tool_input_delta 有 **换行/4096 字符缓冲刷出**策略。tool_call 按 id **去重防重放**。流式事件经背压队列写成会话事件。流断线恢复有专门事件族（StreamRecoveryAnchorCreated 等）。

[读码] UI 传输不是 SSE 而是 **WebSocket + 自研 Channel RPC**（packages/rpc）；桌面端走 IPC messageport。

---

## 3. 工具系统

### 3.1 ToolDefinition：两份声明 + 运行时钩子

[读码] 契约层 `ToolContractDeclaration` 是仓库把 AGENTS.md 里的工具规范逐字落进类型：
- `capability`、`inputSchema/outputSchema`、`strict`（Anthropic constrained decoding 资格）
- `permission`：`needsApproval`、`riskLevel`、`sideEffectScope`（7 枚举）、`alwaysAsk`（"压过一切权限模式的放行"）、`askOptions.allowAlways: false | "session"`
- `resultBudget`：`maxInlineBytes/maxModelBytes` + `strategy: inline|truncate|artifact` + preview + artifact 保留期
- `timeout`：`defaultMs/maxMs/allowCallOverride/cleanupGraceMs`
- `cancellation`：supported/cleanup 等级/用户文案
- `trace`：required + recordInput/Output: summary|full|none

[读码] 运行时层 `ToolEntry` 再加：
- `metadata`：`readOnly/destructive/concurrentSafe/providerVisible`、**`stopTurnOnSuccess`**（成功即终止 turn 的终态工具——由 executor 读取，不在调用点按工具名猜测）
- `resolveInput`：把模型入参"归一化成将要发生的执行事实"——"确认与执行同字节，不存在批准 A 跑 B"
- `prepareApproval`：权限判 ask 后调用，"只能把 ask 收窄成 proceed，永远不能把 allow 变成 ask"
- `formatModelContent`、`validateInput`、`resolveModelContract`

### 3.2 内置工具（约 37 个）

Read（text/image/video/pdf 五种输出）/ Write / Edit / Bash / js（node-repl，默认关）/ Glob / Grep / WebFetch / WebSearch / TodoRead / TodoWrite / TaskOutput / TaskStop / Agent(subagent) / Skill / EnterPlanMode / ExitPlanMode / AskUserQuestion / SendMessage / CronCreate~Delete / OffPeakCreate / 动态工作流十个（CreateWorkflow~ResolveWorkflowQuestion）/ MCP 动态注册

### 3.3 执行流水线

[读码] `call-runner.ts:85-639` 完整顺序：
```
registry 查找 → abort 检查 → 输入归一化 + JSON Schema 校验 → validateInput
→ resolveInput 归一化 → PreToolUse hooks（deny 即拒；改写输入重新校验）
→ 权限流 resolveToolPermission（挂起点）→ ToolCallStarted 事件
→ 超时 deadline（可暂停）+ handler 执行 → validateOutput
→ serializeOutput（预算/artifact）→ PostToolUse hooks → display
→ ToolExecutionResult → backgroundTasks.track
```

### 3.4 工具输出形状

[读码] `ToolExecutionResult`：`success/output(结构化)/display(UI)/modelContent/serialization(预算事实)/error{type,code,message}/performance`。大结果按 `resultBudget.strategy:"artifact"` 落 artifact store，模型只拿预览 + 路径引用。

---

## 4. 权限模型

### 4.1 判定阶梯（顺序即优先级）

[读码] `service.ts:97-231` checkPermission 的完整阶梯：
1. Plan 模式进出（专用裁决）
2. `requiresUserInteraction` → ask
3. **alwaysAsk 门**——压过一切放行但压不过阻断；只认会话级 allow 规则
4. yolo 直通；auto = "保留未实现" 一律 deny（fail-closed）
5. disallowedTools → project deny → project ask → plan 只读闸 → project allow → WebFetch 预批 URL → workflow 草稿免确认 → allowedTools → edit 模式 → build 模式风险分级

### 4.2 审批交互

[读码] **端口倒置**：core 定义 PermissionBrokerPort，判 ask 时调 `deps.permissionBroker.requestPermission()`。CLI 走 TUI 内键盘决策（方向键选/Return 确认/Escape=deny）；桌面/Web 走 v4 协议 interaction broker。

[读码] **并发竞速**：ask 时 hook 链与确认窗 **并发竞速而非串行**——串行时同步 hook 阻塞会让确认窗"永久死亡"（注释记录了真实事故）。hook 改写输入后**强制重过权限判定**。

### 4.3 只读命令分类器

[读码] 分四层：
1. `analyzeBashCommand` 解析（pipeline 拆分、wrapper 识别、动态词检测）
2. 逐命令查策略表（safeFlags 白名单 + dangerousCallback 回调判定）
3. 参数级 flag 校验
4. **fig 自动补全注册表**（1.8MB 生成物，从 `@withfig/autocomplete` 确定性生成）用于稳定前缀规则建议

### 4.4 fail-closed 五处落点

默认 broker 全拒 / 超时即错 / 判定异常=拒 / 预览钩子 fail-open 到 ask / hook 改写输入后强制重检

---

## 5. 协议/事件/持久化

### 5.1 事件系统

[读码] **~88 种会话事件**（单一信封 SessionEvent），**纯 reducer 投影**为 UI 状态（SessionProjection）。事件与 SQLite 消息库分离，有独立 EventStore 契约。

### 5.2 双协议

[读码] v3：NDJSON over stdio（~70 个方法）。v4（现行）：主题化 pub/sub（per-session topic + sessions-index/workspace-config），gap buffer 乱序重排、transport 背压按 connectionId 隔离。物理承载：CLI=stdio、Web=WebSocket（Hono + @hono/node-ws）、桌面=IPC messageport。

### 5.3 持久化

[读码] **SQLite（node:sqlite 零原生依赖）**，不是 JSONL——`~/.zcode/cli/db/db.sqlite`。一个类实现五个端口，17 个 repository 文件，版本化 migrations。权限规则/full-access receipt/workflow journal 都在这个库里。fork 是事务化操作。

---

## 6. 上下文管理

### 6.1 三层递进压缩

[读码]
1. **microcompact**（轮内）：旧 tool result 内容清成占位符，保留最近 5 组；省 256 token 以下不划算则回滚
2. **auto compact**（阈值）：有效窗口 = contextWindow − output 预留 − 13k buffer；token 数优先用 provider usage；保险丝三道（消息不足两轮不压/连续失败 3 次熔断/rapid-refill 熔断）
3. **reactive compact**（超窗抢救）：provider 报 context exceeded 时每步只试一次

### 6.2 摘要 prompt

[读码] 经典 9 段结构化总结 + `<analysis>`/`<summary>` 两段；**安全相关约束必须逐字保留**；预算 20K tokens；太长 3 次截断重试。

### 6.3 token 预算三层

请求级（上下文越满输出越小）/ turn 级（tokenCount 累加 + contextUsageBreakdown）/ 会话级（usage-observability 汇总）。

---

## 7. MCP / Hooks / Skills / 插件

### 7.1 MCP

[读码] 官方 TS SDK（`@modelcontextprotocol/client@2.0.0`）三 transport 全支持。stdio 深度加固：自定义 ProcessTreeStdioClientTransport 接管整棵进程树回收 + **Windows Job Object** 防孤儿。连接池（30s idle 宽限）。工具 annotation（readOnlyHint/destructiveHint）直接喂权限判定。OAuth 双形态。

### 7.2 Hooks

[读码] 7 个生命周期事件（SessionStart/UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/PostToolUseFailure/Stop）。**PermissionRequest hook 可返回 permissionDecision + permissionUpdates + updatedInput**。运行结果经 stdin/stdout JSON 协议。Stop hook 连续续跑上限 3 次。

[读码] **项目 hook 的 digest 信任门**（区别于 Claude Code 的点）：项目 hooks 不直接生效——先经发现→用户审阅摘要→状态机 7 态→声明变更即 stale 需重审→每次派发前二次 admission。

### 7.3 Skills

[读码] frontmatter Markdown 指令包，五来源（agents/zcode/bundled/plugin/remote）四作用域（project/user/system/admin）。根目录解析从 cwd 向上走到 git worktree 根逐层收集。

### 7.4 插件

[读码] manifest 包携带 **agent/command/skill/hook/mcp 五类组件**。marketplace 六种来源（url/github/git/npm/file/directory）。官方市场 `zcode-plugins-official`。CUA（computer-use）是一个 bundled 插件。

---

## 8. 对 Spark 的借鉴建议（TOP 10）

| # | 设计 | ZCode 做法 | Spark 怎么用 |
| --- | --- | --- | --- |
| 1 | **alwaysAsk 双分支** | "压过放行、压不过阻断"的结构化标记（service.ts L326-331） | Spark 审批策略引擎可吸收——不可抹掉的确认用结构化标记而非字符串 ruleId |
| 2 | **hook 与 broker 竞速** | 并发竞速而非串行，败者 abort（permission-flow.ts L179-236） | Spark permission service 的挂起/级联可参考其幂等 claim |
| 3 | **fig 注册表生成规则建议** | 1.8MB 生成物 + 5 条上限 + 高危命令黑名单（防 `bash -c` 包装绕过） | Spark 的 bash 审批规则建议可自动化生成，不用手写 |
| 4 | **三层递进压缩** | microcompact（清旧工具结果）→ auto compact → reactive compact + rapid-refill 熔断 | Spark 的 compaction 可加 microcompact 层（清旧 tool result），成本最低收益最高 |
| 5 | **工具声明式安全六维** | readOnly/destructive/concurrentSafe/sideEffectScope/riskLevel/alwaysAsk 六正交声明同时驱动调度/权限/UI/遥测 | Spark 的 ToolDefinition 可对齐——一处声明处处消费 |
| 6 | **SQLite 替代 JSONL** | node:sqlite 零原生依赖，17 个 repository，版本化 migrations | Spark 的单写者 JSONL 可评估——但 JSONL 的 append-only 语义与 Spark 的 checkpoint/fork 纪律深度耦合，不宜轻易换 |
| 7 | **resolveInput 单次归一** | "确认与执行同字节，不存在批准 A 跑 B" | Spark 的 PermissionCheck 与实际执行可对齐 |
| 8 | **输出续写自动恢复** | finishReason=length 且无工具调用时追加续写指令再跑 | Spark 的 run-loop 可加 output-limit 续写 |
| 9 | **行式 0x1F 分列** | macOS 窗口/进程清单改行式输出避免逗号歧义（同 LA-08 红修） | 已独立发现并修复——两个项目同题同解 |
| 10 | **项目 hook digest 信任门** | 声明变更即 stale 需重审 + 派发前二次 admission | Spark 16.5 式声明式扩展可吸收此信任模型 |

---

## 9. 与 Spark 的架构对照

| 维度 | Spark | ZCode | 差异要点 |
| --- | --- | --- | --- |
| LLM 层 | 自写 pi-gateway | Vercel AI SDK v6 | ZCode 靠 SDK 归一化，Spark 自控粒度更细 |
| 持久化 | 单写者 JSONL（append-only + checkpoint/fork） | SQLite（关系化 + migrations） | Spark 的 fork/rollback 依赖 JSONL 线性语义 |
| UI 传输 | SSE | WebSocket + Channel RPC | ZCode 的 v4 主题订阅更丰富 |
| 审批 | PermissionService 挂起/级联 | PermissionService 竞速 + alwaysAsk | ZCode 的竞速模式防死锁更优雅 |
| 压缩 | auto compact + 手动 /compact | microcompact + auto + reactive + 手动 | ZCode 多一层轮内微压缩 |
| 工具 | ToolDefinition 六要素 | ToolContractDeclaration + ToolEntry（更多维度） | ZCode 的 resultBudget/cancellation/trace 更全面 |
| 事件 | 27 种 applyEvent reducer | ~88 种 event-reducer | ZCode 的事件粒度更细（如 hook 生命周期五种） |
| 参考 | pi/dsh/opencode/Codex | Claude Code 同构点很多但实现独立 | 两者可互相校准 |

---

## 10. UI 渲染（第三路调研补充）

### 10.1 Terminal UI：OpenTUI（非 Ink）

[读码] `@mbears/opentui-core` + `opentui-react` 0.2.15——Yoga 布局 + React 19 reconciler 的终端渲染器（flexbox 语义的 `box`/`text` 元素），配 shiki 4 + web-tree-sitter 做语法高亮。渲染循环 `createCliRenderer({ targetFps: 30 })`；首帧后挂载真实 App（"没有运行时工作能阻塞第一帧"）；退出信号表显式剔除 SIGPIPE（MCP 管道关闭会误杀 TUI）。

[读码] 流式输出：**不可变消息数组 + delta 追加 + streamProjected 标记**。delta 到来时 map 全量消息、只改目标消息的 parts 尾部；找不到就乐观创建 `streamProjected: true` 的消息；完成时收口，`finalizeStreamProjectedMessages` 把投影态与 durable 事实对账。与 Spark 的 live-only delta + seq 对账同思路，但多一个**显式 projected 标记位**。

[读码] 最漂亮的设计——**workflow 运行卡镜像三纪律**：运行态只由共享 reducer 逐事件归约（无轮询无 setInterval）；冷启动从 journal 回放；无变化时返回传入的同一个引用让 React 免重渲染。

### 10.2 桌面应用（Electron 五进程面）

[读码] main / preload / renderer / host / scheduler 五进程面。每窗口一个 **host utilityProcess**：所有业务服务跑在 host 里，main 只做窗口/托盘/更新/遥测。渲染进程和手机端都通过 MessagePort attachment 到同一个 host。RPC 是 **VS Code 同款分层**（VSBuffer/SocketProtocol/ChannelServer/ChannelClient/proxy-channel/persistent-protocol）。安全：`contextIsolation: true, nodeIntegration: false`；内嵌浏览器走独立 session partition。

### 10.3 远程工作区

[读码] 远程三后端统一接口 `IRemoteBackend`（detect/upload/exec/exists/readFile/onDidDisconnect），SSH/WSL/Docker 三实现。**协议差异为零**：远端跑同一个 server bundle，差异压进传输层。自部署设计：连远程时把 node 运行时、server bundle 按 CDN manifest 装到远端 `~/.zcode`，带 deploy lock + live-identity 校验 + CDN 多候选回退。

[读码] v4 实时协议：topic 订阅制——`deliveryKind: initial | online | recovery`（等价 Spark 的 `since=seq` 三态）；超大帧 UTF-8 字节层分片 + CRC32 + base64 重组成原子 logical frame；命令面走 **CommandInbox**（CAS 校验 epoch→revision 双层，晚到者静默收口不报错）。

---

## 11. 亮点功能（Spark 没有或更弱的）

### 11.1 Stream Recovery + 流式工具账本

[读码] 流中断后不盲目重放，先按 **StreamingToolLedger**（8 态：input_streaming→closed→queued→started→committed/cancelled/abandoned/blocked）判定哪些副作用已落地，从最近 durable anchor 重试，半截 assistant 输出用专门墓碑标记隔离。比 Spark 的"resetSlice+全量重放"细一个量级：**重放前先精确结算半途副作用**。

### 11.2 Steer/Queue 全事件化 + CommandInbox 对账

[读码] 输入的排队/插队/提升/丢弃全是协议事件（~10 种 steer/queue 事件），命令提交带 **epoch+revision CAS**，晚到命令 noop 收口——"可回放的协议事实，不是 UI 本地状态"。

### 11.3 Checkpoint 的 git 隐藏提交

[读码] `gitCheckpointRepo.ts:245-317`：临时 `GIT_INDEX_FILE` 收集 live worktree → `write-tree`/`commit-tree` 生成内部隐藏 commit → hidden ref 挂住防 GC；空 index 优化避开全量 add；恢复校验用 **blob hash** 而非时间戳。比 Spark 当前 checkpoint（快照目录抄 Grok）更省、更安全（不动用户 index）。

### 11.4 Microcompact

[读码] 独立于整段 compact 的**工具结果级清理**：上下文到 0.9×阈值时触发，清旧工具结果只留最近 5 条、最小节省 256 token；事件 `microcompact_boundary` 进流可回放。

### 11.5 Memory 系统

[读码] 三件套：① memory agent loop（独立小循环，权限收窄到 Read/Grep/Glob）；② manifest 召回（扫目录+YAML frontmatter+mtime 排序+200 文件×30 行预览封顶）；③ 回合边界后的**后台抽取调度器**。

### 11.6 formal-proof（行为状态空间枚举器）

[读码] `packages/formal-proof/src/model.ts`：把 runPhase×queue×compactMemory×goal×selectedTurn×forked 的组合枚举成决策树（guard/decision/assertion/e2e 引用），可视化验证交互不漏分支。业界罕见。

### 11.7 CUA 开源姿态

[读码] `packages/zcode-cua/`：开源包是 **API 兼容的 fail-closed 占位**——"每个 runtime 面报告 unavailable 并失败闭合"。全部调用点可编译、行为可测，但闭源实现零泄露。

---

## 12. 值得 Spark 借鉴的 TOP 10（三路合并终版）

| # | 设计 | ZCode 做法 | Spark 怎么用 |
| --- | --- | --- | --- |
| 1 | **Stream Recovery + 流式工具账本** | 流中断后按账本结算半途副作用再重试 | protocol 新增 anchor/ledger 两类事件，reducer 区分半截 delta 与墓碑 |
| 2 | **alwaysAsk 双分支** | "压过放行、压不过阻断"结构化标记 | 审批策略引擎吸收——不可抹掉的确认 |
| 3 | **hook 与 broker 竞速** | 并发竞速防死锁，败者 abort | permission service 挂起/级联参考幂等 claim |
| 4 | **三层递进压缩** | microcompact → auto → reactive + rapid-refill 熔断 | compaction 加 microcompact 层（成本最低收益最高） |
| 5 | **Checkpoint git 隐藏提交** | 临时 GIT_INDEX_FILE + write-tree + hidden ref + blob hash 校验 | engine session/ 旁新增 checkpoint 模块 |
| 6 | **工具声明式安全六维** | readOnly/destructive/concurrentSafe/sideEffectScope/riskLevel/alwaysAsk | ToolDefinition 对齐——一处声明处处消费 |
| 7 | **fig 注册表生成规则建议** | 1.8MB 生成物 + 高危黑名单 | bash 审批规则建议可自动化生成 |
| 8 | **Steer/Queue 全事件化 + CAS** | 输入排队/插队全是协议事件 + epoch/revision CAS | protocol api.ts 增 command envelope |
| 9 | **Microcompact** | 清旧工具结果只留最近 5 条，边界落事件 | 与既有上下文水位线挂钩 |
| 10 | **项目 hook digest 信任门** | 声明变更即 stale 需重审 + 派发前二次 admission | 16.5 式声明式扩展的信任模型 |

---

## 13. 静态无法判定项

1. 术语 table 驱动的只读分类器在实际 bash 命令覆盖率
2. v4 协议在弱网下的 gap buffer 重排正确性
3. Electron 桌面端与 CLI 端的 IPC 延迟
4. 大规模 MCP 连接池的内存水位
5. OpenTUI 在低性能终端的渲染帧率
6. formal-proof 枚举器对新增事件的扩展成本
