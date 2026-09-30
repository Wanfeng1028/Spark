# v2 工单库·续篇（可抄挖掘批 CK 起）

> 本篇是 `doc/08-v2-roadmap.md` 的续篇——该篇 2026-09-27 达 2990 行触顶（AGENTS §2.14 文档长度上限与续篇拆分），后续新工单批次一律写进本篇（第三篇将是 doc/08-v2-roadmap-3.md）。`doc/02-development-plan.md` 同步触顶：工单执行细则以本篇为准，doc/02 §8 只留指针。

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| --- | --- | --- | --- |
| v1.0 | 2026-09-27 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，"能抄的全部写进工单"指令） | 初稿：可抄挖掘批 **CK-1~17** 立项。来源 = 四路子代理在线调研（全程 gh api/raw 直读，§2.12 禁克隆合规）：claude-code-analysis（AGENTS §6.1 v1.69 翻案后纳入）、MiniMax-AI/minimax-code、pi（earendil-works/pi）、deepseek-ai/deepseek-harness、opencode（anomalyco/opencode，已从 sst 迁移）、google-gemini/gemini-cli、openai/codex、xai-org/grok-build、openclaw/openclaw、qwenlm/qwen-code。doc/12 §12 遗漏未入池两条一并收录：hook-broker 竞速（并入 CK-2）、工具声明式安全六维（CK-17）。评估后不入池六项判决见附录。与 AGENTS v1.70、doc/02 v4.156、doc/08 v2.08 同批。本批纯规划零代码，本机零验证，CI 裁决 |

## 0. 批次说明

- **编号 = 建议执行顺序**（已按价值降序：多源独立收敛的排前）。优先级：P0 下一程先做 / P1 排队 / P2 观察后排 / P3 触发条件驱动。
- 每条候选都经三重排除后保留：Spark 已有清单、已立项工单（微压缩/alwaysAsk/输出续写/resolveInput/Stream Recovery/checkpoint git 隐藏提交/输入 CAS+hook 信任门/fig 注册表）、已判决不做（JSONL→SQLite/Vercel AI SDK/OpenTUI/多用户公网/Effect-RxJS）。
- 许可证口径：Claude Code 泄露源码按 §6.1（可抄，落仓按本仓风格重写）；MiniMax Code 第一方 MIT（third_party/sandbox-runtime 与 Pi 派生目录保留原声明）；pi/dsh/opencode/OpenClaw MIT；Gemini CLI/Codex/Grok Apache-2.0。Rust 实现（Codex/Grok）按"翻译思路"重写。
- 与 ZC-1~4（doc/02 §8 ZC 表，微压缩/alwaysAsk/输出续写/resolveInput）并行无冲突；ZC-Q1~Q4 待拍板项不受本批影响。

## 1. 索引

| 编号 | 工单 | 来源 | 优先级 | 成本 |
| --- | --- | --- | --- | --- |
| CK-1 | 后台任务平面（run_in_background + TaskOutput/TaskStop + 完成通知回注） | Claude Code + MiniMax + Grok + OpenClaw | P0 | M（批 1 bash）/ L（批 2 agent） |
| CK-2 | Hooks 全生命周期事件面（12 挂点 × command 形态 + hook-broker 竞速） | Claude Code + MiniMax + doc/12 #3 | P0 | M |
| CK-3 | 循环/空转指纹检测与 steer 纠偏 | MiniMax runaway-guard + Gemini CLI | P0 | M |
| CK-4 | TodoWrite/TodoRead 会话任务清单 + 验证 nudge | Claude Code + dsh + opencode | P1 | M |
| CK-5 | MCP 韧性四小件（截断/认证缓存短路/过期重连/OAuth） | Claude Code + Gemini CLI | P1 | S（批 1）+ M（批 2） |
| CK-6 | AskUserQuestion 结构化提问工具 | Claude Code | P1 | M |
| CK-7 | 溢出即压缩（context-overflow 分类 → 反应式压缩重试） | opencode | P1 | S |
| CK-8 | prompt cache_control 自动断点策略 | opencode + pi | P1 | S-M |
| CK-9 | Unicode 隐写防御（递归脱敏） | Claude Code | P1 | S |
| CK-10 | edit 容错匹配（fuzzy 归一 + CRLF 保持 + is_exact 上报） | pi | P2 | S-M |
| CK-11 | ToolSearch 延迟工具加载 | Claude Code | P2 | M |
| CK-12 | 压缩后状态复灌 + 滚动会话摘要 | Claude Code | P2 | M |
| CK-13 | turn 级变更交付面（workspace-changes + present 工具） | dsh | P2 | M |
| CK-14 | 无头模式结构化输出（--output-schema + resume --last） | Codex | P2 | S |
| CK-15 | @-mention 文件/目录上下文注入 | Gemini CLI | P2 | S |
| CK-16 | ACP 服务端（编辑器标准协议接入） | MiniMax（协议重写） | P3 | M |
| CK-17 | 工具声明式安全六维（一处声明处处消费） | doc/12 §12 #6（ZCode） | P2 | M |

## 2. 工单卡

### CK-1 后台任务平面：run_in_background + TaskOutput/TaskStop + 完成通知回注（P0）

**出处**：Claude Code src/tools/BashTool/BashTool.tsx（run_in_background 参数；detectBlockedSleepPattern 拦截 `sleep 300` 类阻塞命令强制转后台并给改写建议；assistantAutoBackgrounded 前台阻塞预算超限自动后台化，回执带任务 id 与输出路径）+ src/tasks.ts 统一 Task 注册表（shell/agent 两族 + TaskOutput/TaskStop/TaskList）+ src/coordinator/coordinatorMode.ts 的 task-notification 完成回注；MiniMax packages/agent-modules/background-task/src/manager.ts（前台 60s 无返回自动后台化、task_output 按字节偏移续读、首响应 24KiB 头尾预算）；Grok Build task/task_output/wait_tasks/kill_task 工具族；OpenClaw heartbeat 的 notifyOnExit 定向唤醒。

**Spark 缺口**：bash 常驻池是交互式池化（无模型侧后台语义）；task 子代理同步阻塞等最终文本；无任何"完成后主动唤醒主会话"机制。

**内容**：① bash 工具增 runInBackground 入参 + 前台阻塞预算（超时自动转后台返回 task id）；② TaskOutput（字节偏移续读 + 首响应头尾预算 + 溢写引用）/ TaskStop 工具族；③ 后台任务完成 → 经输入队列以 delivery=queue 回注系统通知，驱动主会话主动汇报一轮（复用 19.22 交付语义）；④ task 子代理后台化（返回 task id，完成后回注 + SendMessage 续聊）；⑤ task.started/progress/completed 事件面（durable/live 归类按词表纪律评估，走 new-event-type 全流程）。

**验收**：单测（后台化/预算转后台/偏移续读/完成回注入队/TaskStop 中断事件对）+ 四端任务卡展示；真实长命令走查留用户。**依赖**：无；与 ZC-Q1 正交。**分批**：批 1 = bash 半边（M）；批 2 = agent 半边（L）。

### CK-2 Hooks 全生命周期事件面：12 挂点 × command 形态 + hook-broker 竞速（P0）

**出处**：Claude Code src/entrypoints/sdk/coreTypes.ts（HOOK_EVENTS 全量：PreToolUse/PostToolUse/PostToolUseFailure/UserPromptSubmit/SessionStart/SessionEnd/Stop/SubagentStart/SubagentStop/PreCompact/PostCompact/PermissionRequest 等）+ src/utils/hooks/（命令 hook 经 stdin/stdout JSON 协议，started/progress/response 三段事件；hook 可改写输入/拒绝/注上下文）；MiniMax plugin-hooks 的 11 点位清单与 matcher/condition/timeout 声明；**doc/12 §12 #3（hook 与审批 broker 并发竞速）**——ask 时 hook 链与确认窗竞速而非串行（同步 hook 会闷死确认窗，ZCode 注释记录过真实事故），败者 abort，hook 改写输入后强制重过权限判定。

**Spark 缺口**：user hooks 仅 tool.completed 单挂点；无 PreToolUse 拦截/改写、无会话生命周期、无压缩钩子。

**内容**：① 挂点矩阵铺设（12 挂点，engine 现有 runner.ts 扩展）；② command hook 形态（stdin/stdout JSON 协议 + matcher + condition 谓词 + timeoutMs，超时/异常 fail-closed）；③ PreToolUse 可 deny / 改写输入（改写后强制重过 zod 校验与权限判定）；④ PermissionRequest hook 与审批 broker **并发竞速**（防同步 hook 闷死确认窗）；⑤ 声明落 .spark/hooks/（项目层声明变更信任门接 ZC-Q3，未拍板前先按 settings 重启档登记）。

**验收**：挂点矩阵单测（每挂点触发/拒绝/改写重校验/竞速超时 fail-closed）+ 用户 hook 真实脚本走查留用户。**依赖**：无；ZC-Q3 拍板后补信任门。**成本**：M。

### CK-3 循环/空转指纹检测与 steer 纠偏（P0）

**出处**：MiniMax packages/agent-modules/runaway-guard/（六信号：exact_action_repeat / exact_result_repeat / same_error_family / abab_action_cycle / polling_repeat / unchanged_progress_repeat；工具三档策略 detect/polling/exempt；turn-local shadow state 于 finishTurn 出 summary；提醒每 turn 限一次走 steer 且文案自带防持久化子句）；Gemini CLI packages/core/src/services/loopDetectionService.ts（流式历史窗口 5000、LLM 复核间隔 15 轮、置信度阈值，命中后询问用户是否继续）。

**Spark 缺口**：run-loop 只有 step 上限/预算/失败闭合的粗粒度事后熔断；无任何重复指纹/环检测。

**内容**：① run-loop step 边界挂观察器（引擎内存态，不出协议事件）；② 六信号检测 + bash 命令归一化指纹（复用 bash-command-parser）；③ 命中 → steer 通道注入纠偏提醒（每 turn 一次）；连续命中 → 按严重度升级为询问用户（审批面）；④ 轮询类工具/命令豁免档（防误报长跑任务）。**验收**：六信号注入式单测 + 提醒限频断言 + 豁免档。**依赖**：无（提醒通道现成）。**成本**：M。

### CK-4 TodoWrite/TodoRead 会话任务清单 + 验证 nudge（P1）

**出处**：Claude Code TodoWriteTool（todos 按 session 键控；**verificationNudgeNeeded**——主线程关掉 3+ 项却无任何验证步骤时，tool_result 注入"先派验证代理，不许用列举 caveat 冒充完成"的结构化 nudge）；dsh packages/todo（整表替换 + 会话日志事件持久 + 宿主常驻计划展示）；opencode session/todo（DB 表 + Updated 事件）。

**Spark 缺口**：无清单类工具（task 是子代理非清单）；无验证强制机制。

**内容**：① protocol 新事件 todo.updated（durable；surface 归类按词表纪律评估，走 new-event-type 全流程）；② 工具 todo_write（整表替换）+ todo_read；③ 验证 nudge（关 3+ 项且本 turn 无验证类工具调用 → tool_result 注入提醒文案）；④ 四端面板（web TodoPanel / CLI 区块 / mobile+miniapp 只读行）。**验收**：reducer 单测 + nudge 触发条件单测 + 四端投影。**依赖**：无。**成本**：M。

### CK-5 MCP 韧性四小件（P1，批 1 三小件 S / 批 2 OAuth M）

**出处**：Claude Code src/services/mcp/client.ts（MAX_MCP_DESCRIPTION_LENGTH=2048 截断；mcp-needs-auth-cache 认证失败 15 分钟内同 server 全部短路，防百级并发同时刷 token 雪崩；isMcpSessionExpiredError——HTTP 404 / JSON-RPC -32001 → 清连接缓存自动重连）+ auth.ts OAuth；Gemini CLI packages/core/src/mcp/oauth-provider.ts（PKCE + 动态客户端注册 + refresh）。

**Spark 缺口**：mcp client 只有 stdio+streamable-http + 静态 headers；无截断、无失败缓存、无过期重连、无 OAuth。

**内容**：批 1：① 工具描述装配时 2048 截断（防 OpenAPI 型 server 挤爆上下文）；② needs-auth 缓存短路（15min）；③ 会话过期自动重连。批 2：④ OAuth（PKCE + 动态注册 + refresh + token 存储 0o600 走 secrets 纪律 + /mcp auth 命令面）。**验收**：三小件注入式单测 + OAuth 全流程走查留用户（真实 OAuth server）。**依赖**：无。**成本**：S + M。

### CK-6 AskUserQuestion 结构化提问工具（P1）

**出处**：Claude Code `src/tools/AskUserQuestionTool/`（1-4 问 × 每问 2-4 选项，label/description/preview 聚焦预览，multiSelect，用户可附 notes；提问走权限管线渲染；requiresUserInteraction + shouldDefer 标记；答案结构化回给模型）。

**Spark 缺口**：无此工具；exit_plan_mode 只覆盖计划审批一种交互，模型需要决策时只能自由文本追问。

**内容**：① 新工具 ask_user（zod input：questions 数组封闭形状）；② 复用审批挂起通道渲染（选项按钮 + 预览 + 多选 + 备注，超时 fail-closed 同审批纪律；未连接任何端时如实报错不假装已问）；③ 答案结构化进 tool result 回模型；④ 四端渲染 web/CLI 先行，mobile/miniapp 跟随。**验收**：工具单测（形状/超时 fail-closed/答案回环）+ web/CLI 渲染走查。**依赖**：无。**成本**：M。

### CK-7 溢出即压缩：context-overflow 分类 → 同 turn 反应式压缩重试（P1，S）

**出处**：opencode packages/llm/src/provider-error.ts（28 条 "prompt is too long / context window exceeded / request_too_large" 归一化正则 + rate-limit 排除表；isContextOverflow 判定 400/413）。

**Spark 缺口**：pi-gateway.ts 的 FATAL_PATTERN 把 invalid_request_error 一律判 fatal；上下文超窗是确定性错误，不该让整 turn 失败闭合。

**内容**：① 错误分类加 context-overflow 桶（正则表照抄重写）；② run-loop 捕获后同 turn 触发既有 compaction → 重注入重试**一次**（每 turn 限一次，再溢出仍 fatal——失败闭合不变）；③ 与水位前瞻压缩、已立项微压缩、ZC-Q1 Stream Recovery 三者正交（错误驱动 vs 阈值驱动 vs 粒度 vs 流断恢复）。**验收**：分类单测 + 溢出→压缩→重试一次→二次溢出 fatal 的闭环单测。**依赖**：无。**成本**：S。

### CK-8 prompt cache_control 自动断点策略（P1，S-M）

**出处**：opencode packages/llm/src/cache-policy.ts（auto = 最后一个工具定义 + 最后一个 system part + 最新 user 消息三处 CacheHint 断点；RESPECTS_INLINE_HINTS 集合外协议整段跳过）；pi 的 openai prompt-cache key（≤64 截断）。

**Spark 缺口**：engine 全仓无 cache_control 注入；cost-tracker 已有 cacheRead/cacheWrite 记账但请求侧从不打缓存标记——长会话输入费用大头，Anthropic 缓存读 0.1x 定价。

**内容**：LlmGateway 出站装配加 auto 断点策略（三断点；OpenAI 走 prompt_cache_key；不支持的 provider 跳过）+ spark.json 开关（缺省开）。**验收**：装配单测（断点位置/provider 跳过/开关）+ 用 cost-tracker 缓存分量验证命中。**依赖**：无。**成本**：S-M。

### CK-9 Unicode 隐写防御：递归脱敏（P1，S）

**出处**：Claude Code src/utils/sanitization.ts（partiallySanitizeUnicode：NFKC + 剥 Unicode Cf/Co/Cn 类 + 零宽/方向控制字符显式范围 + 迭代上限 10；recursivelySanitizeUnicode 连 object key 都脱敏；文件头注释引用 HackerOne #3086545——ASCII smuggling 经 MCP 注入 Claude Desktop 的真实案例）。

**Spark 缺口**：mcp client、browser.read、memory 检索、bash 输出多个外部内容进模型上下文的通道，零防御。

**内容**：纯函数脱敏模块（照设计重写）+ 接入面：MCP 工具输入/输出、browser.read 正文、memory 检索结果、bash 输出（guard.ts 管线点一次覆盖）。**验收**：纯函数单测（各类不可见字符/嵌套对象/迭代上限）+ 接入面抽查。**依赖**：无。**成本**：S。

### CK-10 edit 容错匹配：fuzzy 归一 + CRLF 保持 + is_exact 上报（P2，S-M）

**出处**：pi packages/coding-agent/src/core/tools/edit-diff.ts（normalizeForFuzzyMatch：NFKC + 智能引号→ASCII + 七种连字符归一 + NBSP/全角空格 + 逐行 trimEnd，渐进匹配；detectLineEnding/restoreLineEndings 保 CRLF；多段 MatchedEdit）。

**Spark 缺口**：edit.ts 裸 indexOf 精确匹配——模型给的 old_string 常带智能引号/NBSP/行尾空白差异，E_NOT_FOUND 失败率高。

**内容**：纯函数匹配层（精确 → 逐行 trimEnd → 全归一渐进）；CRLF 检测与回写保持；匹配结果带 is_exact 标记进 tool.completed output（非精确命中前端可提示）。**不碰 ZC-5 read-state 守卫**（守卫在匹配前已过）。**验收**：匹配策略单测 + CRLF 文件回写不翻行尾断言。**依赖**：无。**成本**：S-M。

### CK-11 ToolSearch 延迟工具加载（P2）

**出处**：Claude Code `src/tools/ToolSearchTool/`（工具声明 deferred 后不进初始 schema；模型 query 检索 + select:name 显现；精确名快路径、server 前缀匹配、searchHint 打分、描述 memoize 失效）。

**Spark 缺口**：mcp client 全量加载工具 schema 进上下文——OpenAPI 型 server 动辄 15-60KB 描述。

**内容**：① ToolDefinition 增 deferred 位（MCP server per-server 配置或按广告面总字节阈值自动 deferred 化）；② tool_search 工具（query/select）；③ 显现的动态 schema 注入下一轮广告面。**验收**：deferred 化/检索/显现回收单测 + 广告面字节断言。**依赖**：无；与 CK-5 截断互补。**成本**：M。

### CK-12 压缩后状态复灌 + 滚动会话摘要（P2）

**出处**：Claude Code src/services/compact/compact.ts（压缩后重建：正在读的文件内文截取 + 进行中的 Plan/Skill 附件 + deferred 工具清单 delta 重新声明；PTL 剥洋葱重试——每次剥 20% 旧历史）+ sessionMemory.ts（后台 forked 子代理双阈值——token 增量 + 工具调用次数/自然断点——滚动维护会话摘要，压缩时直接复用省一次大模型调用）。

**Spark 缺口**：有水位 + 冷却的压缩，但压缩后"工作台状态"断裂（手里正读的文件、正做的计划、可用工具清单全部丢失）。

**内容**：① 压缩完成后重建状态注入摘要后缀；② 滚动会话摘要（后台子代理，压缩时复用）；③ 剥洋葱重试档。**与已立项 microcompact 正交**（microcompact 缩中间态，本单管压缩后重建）。**验收**：复灌内容单测 + 摘要复用路径单测。**依赖**：无。**成本**：M。

### CK-13 turn 级变更交付面：workspace-changes + present 工具（P2）

**出处**：dsh packages/deliverables/（present 工具：模型显式声明最终交付文件；workspace-changes 记录器：按 turn 从 git 工作树快照汇总变更文件与行数，产出 client-only durable 事件，turn 尾渲染变更卡片）。

**Spark 缺口**：无 turn 级"改了什么/交付了什么"汇总面（checkpoint.created 是快照通知非变更摘要；用户只能翻 tool.completed）。

**内容**：① workspace-changes 记录器（借 checkpoint 快照原料做 git diff 摘要）；② present 工具（显式交付声明）；③ durable 事件（new-event-type 全流程）→ 四端 turn 尾变更卡片。**验收**：记录器单测（变更归集/空 turn 零事件）+ present 单测 + 卡片投影。**依赖**：无。**成本**：M。

### CK-14 无头模式结构化输出与免记 id 续跑（P2，S）

**出处**：Codex codex-rs/exec/src/cli.rs（--output-schema FILE：最终答案按 JSON Schema 校验；--output-last-message；codex resume --last 把位置参数重解释为 prompt——免记 session id 续跑）。

**Spark 缺口**：spark -p 已有 text/json 输出与退出码纪律，但无 schema 校验、续跑必须记 session id。

**内容**：print.ts 增 --output-schema（校验不过 exit 非零 + stderr 说明）与 resume --last；SDK/Transport 对等暴露。**验收**：schema 合格/不合格两路单测 + resume --last 单测。**依赖**：无。**成本**：S。

### CK-15 @-mention 文件/目录上下文注入（P2，S）

**出处**：Gemini CLI packages/cli/src/ui/hooks/atCommandProcessor.ts（@文件/@目录解析为内容与目录树注入 + 权限检查 + shell 补全源）。

**Spark 缺口**：composer 文件树弹窗（12.5）只插入路径文本，无引擎侧内容注入。

**内容**：composer @路径补全 → 提交时展开为附件式内容注入（文件全文 / 目录树摘要；大小限额与截断；注入通道走附件/user.message 扩展，取舍工单内定）。**验收**：解析/限额/截断单测 + web/CLI 走查。**依赖**：12.5 文件树。**成本**：S。

### CK-16 ACP 服务端：编辑器标准协议接入（P3）

**出处**：MiniMax packages/tui/src/acp/（完整 Agent Client Protocol agent 实现：会话创建/恢复/fork、skills 与斜杠命令暴露给编辑器客户端）。

**Spark 缺口**：对外只有 REST/SSE + MCP server + SDK 三入口，无编辑器标准协议；后置池"IDE 集成"观察项（触发条件：编辑器用户群出现）。

**内容**：按 ACP 协议规范**重写**（不拷 MiniMax 的 Pi 派生目录——保留原声明）stdio agent 面。**验收**：协议一致性测试 + Zed 实接走查留用户。**依赖**：触发条件驱动。**成本**：M。

### CK-17 工具声明式安全六维：一处声明处处消费（P2）

**出处**：doc/12 §12 #6——ZCode ToolContractDeclaration 的六正交声明（readOnly / destructive / concurrentSafe / sideEffectScope / riskLevel / timeout 三元组），同时驱动调度、权限、UI、遥测。

**Spark 缺口**：ToolDefinition 只有 parallelizable 布尔 + permission.action；风险分级/破坏性/并发安全靠约定俗成，无结构化消费方。

**内容**：ToolDefinition 增六维声明位；① 调度：并行分组按 concurrentSafe/destructive 判定（替代现布尔，迁移兼容）；② 权限：riskLevel 进审批 reason 与审计；③ 超时：defaultMs/maxMs/allowCallOverride 统一进 timeout 档。**验收**：声明位编译期封闭断言 + 调度/权限消费单测 + 既有工具逐个补声明的迁移清单。**依赖**：无；是后续任何工具面工单的地基。**成本**：M。

## 附录：评估后不入池（判决记录，防重提）

| 项 | 来源 | 判决与理由 |
| --- | --- | --- |
| Thread Goal 状态机 | MiniMax agent-modules/goal | 与 16.7 /goal（D33 三护栏：迭代 50/预算 200k/judge 25s）重叠，不另立 |
| OS 原生沙箱（Seatbelt/Landlock/execpolicy） | Codex | 与 19.6 spike 判决（Windows 无低成本可行路径）冲突，收益限 mac/linux；execpolicy 前缀规则思想由 fig 注册表（ZC-Q4）覆盖 |
| OTel 标准遥测 | Gemini CLI | 自研 metrics 够用，标准出口收益不抵依赖面；观察 |
| 模型路由分类器策略链 | Gemini CLI modelRouterService | 与静态 fallback 路由口径相性一般（boring code）；观察 |
| durable 图像附件管线 | dsh packages/attachment | **调研误判**：Spark 12.2a/12.2b + 19.21 已有附件上传/展示/投影全链路 |
| ignore 清单扩展（31 项 + whitelist） | opencode filesystem/ignore | 增量仅是硬编码清单扩展；随下次触碰 grep 的工单顺手做，不单立 |
