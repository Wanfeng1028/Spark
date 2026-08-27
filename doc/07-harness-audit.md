# Spark Harness 模块审计报告——对照业界 Agent Harness 模块全景的完备性核查

## 版本记录

| 版本 | 日期       | 作者                                                                                                                                                            | 变更内容                                                                                                                                                        |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0 | 2026-08-26 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；发起：晚风（Wanfeng1028，D1 审计指令） | 初稿：十九条学科×三态总表 / 工程六大类明细（逐条落源码证据）/ 四端复用矩阵 / 缺口优先级 P0–P2；Python Worker 判决"不做"；缺口编号 H01–H36 供 doc/02 §8 阶段六~九工单与 v2 候选池引用 |
| v1.1 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令） | §2.4 密钥鉴权改 🟡（H01 → 7.1 ✅ 已落地：SecretStore + resolveApiKey store>env + /api/secrets + 设置页 + Logger.registerSecrets 日志脱敏）；§4.3 H01 勾销注记 |
| v1.2 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令） | §2.4 I/O 护栏改 ✅（H02 → 7.2 ✅ 已落地：IoGuard 六条注入标记规则 + 四层敏感过滤挂 ToolPipeline，`io.warning` log-only 事件，redaction.ts 脱敏正则与 pino 单一来源；guard 14 例含管线 e2e）；§2.3 沙箱差距注记更新；§4.3 H02 勾销注记 |
| v1.3 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令） | §1 学科 11 Model Routing 改 ✅、小结计数 8/7→9/6；§2.1 Router 差距与 §2.4 预算与熔断改 ✅（H07 → 7.7 ✅ 已落地：FallbackGateway 未交付才切换 + CostTracker ~/.spark/usage.json 持久累计 + run-loop Budget 熔断双检点 + 任务路由档 title/subagent + /api/routing 热生效）；§2.6 Cost Tracker 差距更新；§4.3 H07 勾销注记 |
| v1.4 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令） | §1 学科 16 Hooks 生命周期改 ✅、小结计数 9/6→10/5（H03 → 7.3 ✅ 已落地：UserHookRunner——spark.json hooks 段四挂点 turn.before/after + permission.resolved/tool.completed → 外部命令（stdin 收 JSON 载荷，超时/非零退出/spawn 失败 warn 闭合）或 skill 插件事件双触发，fire-and-forget 不阻断主流程，载荷不含工具 output）；§4.4 H03 勾销注记 |
| v1.5 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令） | §4.4 H04 勾销注记（H04 → 7.4 ✅ 已落地：命令注册表三 kind——action（compact 引擎动作）/ client（model/mcp/skills/usage/resume 前端执行）/ prompt（~/.spark/commands/*.md 自定义，$ARGUMENTS 展开走 turn 通道）；GET /api/commands + POST sessions/:id/commands/:name + GET /api/mcp、/api/skills 只读面；Composer /compact 硬编码迁入注册表分发行为回归；CommandPalette 命令分组；设置中心 mcp/skills/usage 三页只读点亮；opencode leader 键归 8.3 键位表成文） |

> **审计时点**：main = `ace77d5`（阶段五收官，Spark v1）。全仓 456 例单测当日实测全绿（engine 324 / protocol 46 / web 53 / server 33）+ typecheck 全绿。
> **方法**：三条证据链——①引擎/服务端/前端逐模块源码走读（本文所有路径均为当日实测，非转抄文档）；②协议词表 19 种逐条核对（含 `user.message.attachments?`、`assistant.message.usage` 等已预留未消费字段）；③既有审计（doc/05 缺口 G1–G7）与用户侧能力对照清单合并盘点。
> **编号说明**：本文档编号 07——05 已被完成度审计（doc/05-completion-audit.md）占用，06 预留给测试计划（doc/06-testing-plan.md）。缺口编号 **H01–H36** 是本文与 doc/02 §8 阶段六~九工单、v2 候选池之间的引用锚点；每条缺口要么给出工单号，要么明确"不做 + 理由"，无悬置项。
> **遗留登记**：doc/05 G6（仓库根无 LICENSE 文件）至今未消解——属法律决策（MIT 或 Apache-2.0 由人作者定），本文不重复展开，仅在此催办。

---

# 1. 学科级十九条 × 三态总表

状态：✅ 已实现 / 🟡 部分具备 / ❌ 缺失。判定依据全部落在 §2 的源码证据上。

| #  | 学科                       | 状态      | 一句话现状                                                                                             | 缺口去向                     |
| -- | -------------------------- | --------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 1  | Harness 元学科             | ✅        | 项目本体：五阶段收官，456 例全绿，v1 已合并                                                            | —                            |
| 2  | Loop 循环工程              | ✅        | steer 注入、E_TRUNCATED 回喂、maxSteps=40、finally 失败闭合                                            | —                            |
| 3  | Context 上下文工程         | ✅        | Projector+Compaction：keptFromEventId 锚点、预算反推、二次压缩                                         | 文件级挑选 → H19（候选池）   |
| 4  | Prompt 提示工程            | 🟡        | system/压缩/标题三处提示词硬编码；AGENTS.md 注入已具备（截 8K）                                        | 可配模板 → H20（候选池）     |
| 5  | Tool 治理                  | ✅        | Registry+Pipeline+PermissionService+UserRuleStore 多 pattern                                           | —                            |
| 6  | Skills 技能工程            | 🟡        | 5.5 声明式清单 loader + plugin. 词表运行时扩展                                                         | 管理 UI/市场 → H17/H18       |
| 7  | MCP 集成                   | ✅        | 5.3 McpManager stdio + 真实子进程 e2e                                                                  | 管理 UI → H17；HTTP → V2-21  |
| 8  | Memory 记忆工程            | ❌        | 只有会话内 JSONL，无跨会话记忆                                                                         | → H05（工单 7.5）            |
| 9  | 状态机与恢复               | ✅        | 最强项：append-only、悬挂 turn 补闭合、kill-9 resume、checkpoint 回滚                                  | —                            |
| 10 | 沙箱与护栏                 | 🟡        | 5.2 bwrap/Seatbelt + 审批 fail-closed                                                                  | I/O 护栏 → H02；网络隔离 → H34 |
| 11 | Model Routing              | ✅        | fallback 链（未交付才切换）+ 主/压缩/标题/子代理四路由档 + 成本熔断（7.7）                              | —                            |
| 12 | 可观测与评估               | 🟡        | pino 三层脱敏 + /api/metrics 六类计数                                                                  | eval → H10；trace/成本 → H23/H27 |
| 13 | 流式与事件工程             | ✅        | durable/live 二分、SSE since=seq 续播、背压、ignorable 前跳                                            | —                            |
| 14 | Human-in-the-Loop          | ✅        | 审批卡、reject 级联、always 固化、规则管理 UI（4.7）                                                   | —                            |
| 15 | Sub-agent                  | 🟡        | 5.4 Task 工具、单层限制、父中断级联                                                                    | 并行+监控 → H08              |
| 16 | Hooks 生命周期             | ✅        | 作者侧 skill.json 声明式触发器 + 用户侧 spark.json hooks 四挂点（7.3，命令/skill 双触发 warn 闭合）     | —                            |
| 17 | Automation 自动化          | ❌        | 无任何触发器引擎                                                                                       | → H06（工单 7.6）            |
| 18 | Python Worker              | ❌→**不做** | 判决见 §4.1：主流本地编码 agent 均无此模块，bash + venv 已覆盖                                       | 未来以技能/MCP 外挂          |
| 19 | Browser/Computer Use       | ❌        | 无 browser 工具族                                                                                      | → H09（工单 7.10）           |

小结：扎实具备 10 项、部分具备 5 项、缺失 4 项（长期记忆/自动化/Python Worker/浏览器操控），其中 Python Worker 经评估判决**不做**。

---

# 2. 工程六大类 × 子模块明细

每条四行：**结论 / 证据 / 差距 / 参考实现 + 建议工单**。参考实现指向 doc/01 §10 参考体系与 doc/02 §9 速查表已核实的机制（外部项目路径不在反引号内，避免与本仓路径混淆）。

## 2.1 核心控制（Agent Loop / Prompt Builder / Planner-Router / State Machine）

**Agent Loop** —— ✅ 已实现
- 证据：`packages/engine/src/run-loop.ts`（step 循环：drainSteer 注入 L174 → 压缩判据 → 流式采样 → 截断保护 → 工具执行）；`packages/engine/src/session/input-queue.ts`（now/steer/queue FIFO）；`packages/engine/src/config.ts`（maxStepsPerTurn=40）。
- 差距：无。
- 参考：pi agent-loop（终止靠 terminate 钩子，我们保留步数防御线，ADR D13）+ opencode pendingWake（唤醒合并）。工单：—。

**Prompt Builder** —— 🟡 部分
- 证据：`packages/engine/src/prompts.ts` buildSystemPrompt（BASE_PROMPT + 环境块 + AGENTS.md 截 8K 注入）；`packages/engine/src/compaction.ts` COMPACTION_PROMPT；`packages/engine/src/title.ts` TITLE_PROMPT。
- 差距：三处提示词全部硬编码，用户不可配模板；AGENTS.md 注入已具备（H20 只剩模板可配化）。
- 参考：Claude Code 系统提示词分层（官方 plugins/ 工作流）；pi 极简提示词哲学（提示词+工具 ≈1000 token 内）。工单：H20 → v2 候选池（P2，先 CLI 键位/命令成文再统一抽模板层）。

**Planner-Router** —— 🟡 Router 已补全（7.7），**刻意不做显式 Planner**
- 证据：全仓无 plan/调度器模块；模型侧自主规划（system prompt 工作规则 + 工具循环）。Router 侧 7.7 已落地：`packages/engine/src/fallback-gateway.ts`（fallback 链）+ config 四路由档（主/压缩/标题/子代理）+ `engine.ts` 路由热生效（/api/routing）。
- 差距：无显式任务分解器（刻意）。
- 参考：pi 实证"模型即 planner"（无 todo/plan mode 仍达 Terminal-Bench 竞争力）；Claude Code Plan Mode 是交互层不是引擎层。工单：Planner **不做**（与 pi 同判：加显式规划器是云端长任务场景需求）；Router 增强归 H07（7.7 ✅）。

**State Machine & Recovery** —— ✅ 已实现（全仓最强项）
- 证据：`packages/engine/src/session/store.ts`（单写者 Promise 链、先盘后树、尾行半写丢弃/非尾行 fail-closed、seq 断洞拒载）；`packages/engine/src/engine.ts` loadSession（danglingTurnIds 补 emit turn.completed{aborted}）；kill-9 resume 已在阶段三 e2e 验收。
- 差距：无。
- 参考：Codex reverse_jsonl_scanner（反向扫描恢复）；pi migrateV1→V3 迁移链（ADR D12 已吸收）。工单：—。

## 2.2 记忆上下文（窗口管理 / 短期 Scratchpad / 长期记忆+RAG）

**窗口管理** —— ✅ 已实现
- 证据：`packages/engine/src/compaction.ts`（computeKeptFromEventId 锚点过滤 + 尾部预算反推）；`packages/engine/src/projector.ts` projectSurface（锚点定位、悬空退化 + onDanglingAnchor 告警）；触发判据 tokens > 0.8×contextWindow（config.ts）。
- 差距：无（手动 /compact 4.3 已全链路）。
- 参考：pi firstKeptEntryId / Gemini CLI 压缩双层（工具输出蒸馏未做——见 H02 关联）。工单：—。

**短期 Scratchpad** —— 🟡 以摘要形态覆盖
- 证据：compaction.completed 摘要作为投影首条 user 消息（`packages/engine/src/projector.ts` modelContext）；会话 JSONL 本身即工作记忆。
- 差距：无独立工作笔记文件（TODO.md/PLAN.md 式）。判：**不单独立项**——pi 用文件态替代 scratchpad，我们由会话流+摘要承担同等职能，加一层是重复状态源。
- 参考：pi 文件态哲学（file-based state）。工单：不做。

**长期记忆 + RAG** —— ❌ 缺失（H05）
- 证据：全仓无 memory 模块；`~/.spark/` 下仅 sessions/permissions/mcp.json/skills/logs/index.db/tool-outputs。
- 差距：跨会话记忆存储、检索注入、管理界面全部没有。
- 参考：Claude Code memory 目录约定；Qwen Code Auto-Memory（doc/01 §7.3）。工单：**7.5**（node:sqlite FTS5，向量后置）；代码库语义索引单列 H33（v2 候选池，与记忆分离——索引的是 repo 不是记忆）。

## 2.3 工具执行（Registry / 沙箱 / 虚拟文件系统 / 集成网关）

**Registry** —— ✅ 已实现
- 证据：`packages/engine/src/tools/registry.ts`（register/materialize zod→JSONSchema/重复名 E_TOOL_DUPLICATE）；`packages/engine/src/tools/pipeline.ts`（并行分组 barrier、权限门、32KB 溢写 output-store、ProgressGate 节流）。
- 差距：无。
- 参考：opencode tool.ts schema-first；Codex parallel.rs 门控。工单：—。

**沙箱** —— 🟡 部分（H02 关联）
- 证据：`packages/engine/src/tools/sandbox.ts`（Linux bwrap --ro-bind / /、macOS Seatbelt profile、wrapper 不可用 E_SANDBOX_UNAVAILABLE fail-closed）；spark.json engine.bashSandbox（默认 off）；Windows 返回 null 拒跑（ADR D15）。
- 差距：网络隔离 v1 不做（D15 记录：沙箱外 SOCKS5+域名清单方案后置）→ H34 候选池；Windows OS 级不做（D15 三备选全否决，维持"全审批+路径硬边界"防线）；工具输出→模型通道的注入检测已由 7.2 IoGuard 覆盖（H02 ✅，见 §2.4）。
- 参考：Claude Code sandboxing 官方文档（同款 workspace-write 姿态）。工单：H02 → **7.2**；H34 → v2 候选池（P2）。

**虚拟文件系统** —— ❌ 无，**不做**
- 证据：read/write/edit 直接 fs + `resolveInRoot` 路径硬边界（`packages/engine/src/tools/builtin/` 各文件，越界 E_PATH_OUTSIDE）。
- 差距：无 VFS/快照层（checkpoint 的 git 两域快照已承担"文件态回滚"职能）。
- 参考：E2B/Jupyter 类 VFS 属云端隔离场景；本地工作台用"路径硬边界 + 审批 + OS 沙箱"三层覆盖（§1.4 安全模型）。工单：**不做**（与 Python Worker 同理：云端形态误植本地场景）。

**集成网关** —— ✅ 已实现（MCP，ADR D16）
- 证据：`packages/engine/src/mcp/manager.ts`（stdio 子进程、10s 连接上限、mcp__<server>__<tool> 注册同一 Registry、mcp.call 默认 ask）；`packages/engine/src/mcp/config.ts`（~/.spark/mcp.json）。
- 差距：管理 UI/连接状态展示没有（H17）；HTTP/SSE transport 未做（D16 否决旁路，远程 server 有真实诉求再立项 → V2-21）。
- 参考：OpenClaw gateway-protocol 独立协议包范本。工单：H17 → v2 候选池（P1，依赖 6.4 设置骨架）。

## 2.4 护栏（I/O 护栏 / HITL 审批门 / 密钥鉴权 / 预算与熔断）

**I/O 护栏** —— ✅ 已落地（H02 → 7.2 ✅）
- 证据（7.2 已落地）：`packages/engine/src/tools/guard.ts` IoGuard（六条注入标记协议规则 + 敏感过滤四层——sk-token/Bearer/env 值/secrets store 值）挂 `tools/pipeline.ts` 成功路径输出限界之后，tool.completed 事件与 run-loop toolResult 回填同源一次过滤；脱敏正则抽至 `observability/redaction.ts` 单一来源与 pino logger 共用；告警走新增 `io.warning` 事件（log-only durable 不 surface，只含结构化规则名不含原文）；`/g` 正则 lastIndex 复位防跨调用漏检；guard 单测 14 例（含管线集成 e2e 与事件原文泄漏自检）。
- 差距：注入模式集为保守小集（六条），更全面的样本集与蒸馏式压缩（Gemini CLI toolDistillationService）后置 v2 评估。
- 参考：Gemini CLI toolDistillationService（输出蒸馏位）；dsh surface 纪律。工单：H02 → **7.2 ✅ 已勾销（2026-08-27）**。

**HITL 审批门** —— ✅ 已实现
- 证据：`packages/engine/src/permission/service.ts`（挂起表、超时 300s/dispose 一律 resolve(deny) fail-closed、always 先落盘再写会话临时层、同批放行级联、reject 同会话级联）；`packages/engine/src/permission/rules.ts`（findLast 胜出、任一 deny 短路）；前端 ApprovalCard 多 pattern 展示（4.7）。
- 差距：无。
- 参考：opencode permission.ts + dsh decide() + Codex ReviewDecision（审批=学习）。工单：—。

**密钥鉴权** —— 🟡 secrets 已落地（H01 → 7.1 ✅）；配对鉴权仍缺（9.1）
- 证据（7.1 已落地）：`packages/engine/src/secrets/store.ts` SecretStore（~/.spark/secrets.json，原子写+0600+坏 JSON fail-closed）+ `resolveApiKey` 单点（store > env 迁移兼容）+ `engine.ts` resolveModel 接线 + GET/PUT/DELETE /api/secrets（值永不回传）+ 设置页录入（SettingsDialog）+ `Logger.registerSecrets`（store 值单点注册进 pino 脱敏层，日志无明文断言在 logger.test/secrets.test）。
- 差距：非环回绑定无 token 鉴权（移动端 9.1 的前置）；OS 级加密存储（safeStorage）后置——本地单用户场景 JSON+0600 判定够用。
- 参考：Claude Code apiKeyHelper；系统钥匙串（keytar 已废，Electron safeStorage 现役——远端访问形态时再评估）。工单：H01 → **7.1 ✅**；配对鉴权 → **9.1**（ADR D24）。

**预算与熔断** —— ✅ 已落地（H07 → 7.7）
- 证据（7.7 已落地）：`packages/engine/src/cost-tracker.ts`（~/.spark/usage.json 原子写持久累计，坏 JSON/形状 fail-closed E_CONFIG）+ run-loop `Budget` 端口双检点（新 turn 拒绝 + assistant.message 定稿后中断，`E_BUDGET_EXCEEDED` 人话含解除路径）+ engine resetUsage（DELETE /api/routing/usage，解除熔断唯一入口）。
- 差距：无单会话 token 预算闸（只有全局累计成本熔断——判定够用，会话级后置）。
- 参考：Claude Code /usage 与限额提示；Gemini CLI policy 带数值阈值思路。工单：**7.7 ✅**。

## 2.5 容错（错误恢复自修正 / Checkpoint 断点续传）

**错误恢复自修正** —— ✅ 够用，不单独立项
- 证据：E_TRUNCATED 截断回喂重发完整调用（`packages/engine/src/run-loop.ts` L236-266）；`packages/engine/src/pi-gateway.ts` 错误四类分类 + 3 次指数退避 ±20% jitter、已交付 delta 不重试；工具错误 isError 回喂模型自行纠偏。
- 差距：无自动 lint/test 修复回路——判：**不单独立项**，那是工作流（技能/命令）不是引擎职责。
- 参考：pi handleRunFailure。工单：不做（由 7.4 自定义命令承载工作流）。

**Checkpoint 断点续传** —— ✅ 已实现
- 证据：`packages/engine/src/checkpoint.ts` GitCheckpointer（两域一棵树：work-tree 全量 add + 会话文件 hash-object 别名入索引；turn.completed 后快照）；engine.ts rollbackToCheckpoint（idle 前置 → reset --hard + clean + blob 覆写 → 重载补 session.resumed）。
- 差距：无（DTO 不含 sha 是刻意的，4.6 已定）。
- 参考：Grok checkpoint.rs 多域捆绑。工单：—。

## 2.6 可观测（Tracing / Eval / Cost Tracker）

**Tracing** —— 🟡 部分（H27）
- 证据：`packages/engine/src/logger.ts` pino v10 双路（stdout + ~/.spark/logs/engine.log）+ 三层脱敏；`apps/server/src/routes.ts` GET /api/metrics Prometheus 文本。
- 差距：无 trace 视图/请求级链路聚合；日志是人看不是机查。
- 参考：opencode 事件流即 trace（我们的 JSONL 本身具备该潜质）。工单：H27 → v2 候选池（P2）；审计明细流单列 H11 → **7.12**。

**Eval** —— ❌ 缺失（H10）
- 证据：无 eval 目录/脚本；测试全绿但都是确定性单测（ScriptedLlm），无模型质量回归。
- 差距：无场景集、无评分、无 nightly 接线。
- 参考：pi Terminal-Bench 接法（外部 harness 评内部 agent）。工单：**7.11**（examples/evals + pnpm eval + nightly）。

**Cost Tracker** —— 🟡 数据已齐、消费缺位（H23 + 6.6）
- 证据：`assistant.message.usage`（inputTokens/outputTokens + costUsd?）每回合落盘（protocol events.ts）；前端 StatusBar 已显示会话累计 in/out（`apps/web/src/components/layout/StatusBar.tsx`）；`/api/metrics` 有 tokens 计数。
- 差距：无按日/按供应商聚合、无费用换算看板（超限动作已在 7.7 落地——CostTracker 全局累计熔断）。
- 参考：Claude Code /usage。工单：UI 条 → **6.6**；看板 → H23 v2 候选池（P1，依赖 6.6 与聚合端点）。

## 2.7 平台与产品化缺口（补充盘点——用户对照清单 16 项 + 暗坑清单）

> 这一节超出 D1 原定六大类框架，来源是用户侧"ZCode 能力 × Spark 现状"对照与暗坑盘点；逐项给出证据与去向，与 §4 优先级合并排序。

| 编号 | 缺口 | 证据（现状） | 去向 |
| ---- | ---- | ---- | ---- |
| H13 | 设置中心/模型选择器/用量条 | SettingsDialog 仅四区（主题/delivery/默认模型文本框/权限规则），`apps/web/src/features/settings/SettingsDialog.tsx`；模型切换是手填文本框 | **6.4/6.5/6.6** |
| H14 | 断线与错误态人话化 | 前端无错误码→文案映射表，各消费点直接渲染 `${code}: ${message}`（`apps/web/src/transports/http.ts` L170） | **6.7** |
| H15 | 项目/工作区分组 | 数据源已就绪：mungeDir 按 cwd 分目录（`packages/engine/src/session/store.ts`）+ index.db sessions 表含 cwd 列（`packages/engine/src/session/index.ts`）——纯前端可点亮 | **6.2** |
| H16 | 沙箱设置入口 | engine.bashSandbox 配置键存在（config.ts），设置界面无此项 | **6.4**（工具分区） |
| H17 | MCP/技能管理页（列表/启停/连接状态） | 手编 ~/.spark/mcp.json；skills 无 UI | v2 候选池 V2-01（P1，依赖 6.4） |
| H18 | 插件市场壳 | skills loader 就绪（5.5），无市场/发现形态 | v2 候选池 V2-02（P2） |
| H19 | 附件/图片粘贴 + @file 引用 | protocol `user.message.attachments?: string[]` 阶段一已预留；HttpTransport sendMessage 注释明确暂不发送（`apps/web/src/transports/http.ts`）；全库无 onPaste | v2 候选池 V2-03（P1，需后端接收端点+工具读图） |
| H20 | 用户可配提示词模板 | 三处硬编码（§2.1 Prompt Builder） | v2 候选池 V2-16（P2） |
| H21 | 文件树面板 | 无（会话页无目录列举端点） | v2 候选池 V2-04（P1，轻后端） |
| H22 | 审查模式（多文件 diff 聚合+批量放行） | 仅工具级 ApprovalCard + ToolCard 内嵌 DiffViewer（`apps/web/src/features/chat/ToolCard.tsx` L210）；Codex app 已实证 Diff/Logs 双栏工作区形态 | v2 候选池 V2-08（P2） |
| H23 | 成本看板 | §2.6 | v2 候选池 V2-07（P1） |
| H24 | 辅助会话抽屉 | 引擎跨会话并发是阶段三既有能力（Engine 门面 per-session 循环），无 UI 形态 | v2 候选池 V2-09（P2，纯前端） |
| H25 | 内置终端面板 | bash 是引擎工具非用户终端；Electron 无 preload/IPC（`apps/desktop/src/main.ts` 仅 142 行三件事） | v2 候选池 V2-10（P2，桌面 pty） |
| H26 | 通知推送（turn 完成/审批等待） | 无 Notification API 使用；无托盘 | v2 候选池 V2-05（P1，Electron notification） |
| H27 | trace 视图 | §2.6 | v2 候选池 V2-11（P2） |
| H28 | i18n | 前端文案全部硬编码中文 | v2 候选池 V2-12（P2） |
| H29 | 数据管理（占用/清理/导出导入） | 无 | v2 候选池 V2-13（P2） |
| H30 | 诊断页（日志查看器/导出） | logs/engine.log 存在但无 UI | v2 候选池 V2-14（P2） |
| H31 | 自更新 | electron-builder 未配 updater；包未签名（signAndEditExecutable: false，D14） | v2 候选池 V2-15（P2，签名前置） |
| H32 | onboarding 引导流 | /welcome 简版（标题+说明+新建按钮+3 chips） | v2 候选池 V2-17（P2） |
| H33 | 代码库语义索引（RAG） | index.db 是会话列表索引非代码索引（4.8） | v2 候选池 V2-18（P3，大件） |
| H34 | 沙箱网络隔离 | D15 明确后置 | v2 候选池 V2-19（P2） |
| H35 | 多窗口多会话 | Electron 单 BrowserWindow（1440×900） | v2 候选池 V2-20（P3） |
| H36 | 快捷键 keymap 成文/自定义 | 仅 Cmd/Ctrl+K、Cmd/Ctrl+, 两个全局键 + CommandPalette（`apps/web/src/features/palette/CommandPalette.tsx`） | 8.3 CLI 先成文共享表，web 自定义 → v2 候选池 V2-22（P2） |
| —   | 全文搜索 | `listSessions?q=` 仅标题 LIKE 子串（`packages/engine/src/session/index.ts`） | H12 → **7.13**（事件内容入 FTS5） |
| —   | 审计日志明细 | metrics 只有计数，无"何时 allow/deny 了什么"明细流 | H11 → **7.12** |
| —   | LICENSE 缺失 | doc/05 G6 未消解 | 法律决策，人作者定 MIT/Apache-2.0 |

---

# 3. 四端复用矩阵（web / desktop / cli / mobile）

复用边界与 ADR D22 一致：**协议、applyEvent reducer、错误码人话文案表、设计 token 四件全端共享；UI 层各端原生；引擎零 fork，所有端一律 REST+SSE**。

| 模块 | web | desktop | cli | mobile(RN/小程序) |
| ---- | --- | ------- | --- | ----------------- |
| @spark/protocol（词表/DTO/Transport 接口） | 直接复用 | 直接复用 | 直接复用 | 直接复用 |
| applyEvent reducer（事件→UI 状态） | 直接复用 | 直接复用 | 直接复用（Ink 渲染树状态） | 直接复用 |
| HttpTransport 内核（SSE 解析/重连/错误映射） | 直接复用（8.1 下沉 protocol） | 直接复用 | 直接复用（node 运行时） | 端特化（RN fetch/EventSource 适配层） |
| 错误码人话文案表 | 直接复用 | 直接复用 | 直接复用 | 直接复用 |
| 设计 token（色板/密度/字号） | 直接复用 | 直接复用 | 端特化（ANSI 256/真彩映射） | 端特化（RN Theme 映射） |
| 会话流渲染（消息/工具卡/思考块） | 端特化（React DOM） | 直接复用 web | 端特化（Ink 组件） | 端特化（RN 组件） |
| 审批卡交互 | 端特化 | 直接复用 web | 端特化（y/a/n 键） | 端特化（原生按钮） |
| Composer（三模式/chips/多行） | 端特化 | 直接复用 web | 端特化（行输入） | 端特化（键盘避让） |
| 设置中心（六分区） | 端特化 | 直接复用 web | 不适用（spark.json 手编+命令） | 端特化（精简三区） |
| 命令面板 | 端特化 | 直接复用 web | 端特化（/ 命令 + leader 键） | 不适用 |
| 侧栏/会话列表 | 端特化 | 直接复用 web | 端特化（<80 列隐藏） | 端特化（下拉刷新） |
| StatusBar | 端特化 | 直接复用 web | 端特化（底部细条） | 端特化（安全区） |
| 管理域页面（市场/自动化/MCP 管理） | 端特化 | 直接复用 web | 不适用 | 不适用（v1） |
| 内置终端/浏览器面板 | 不适用 | 端特化（Electron pty/WebView） | 不适用 | 不适用 |
| 系统通知/托盘 | 不适用 | 端特化（Electron） | 不适用 | 端特化（系统推送） |
| 配对鉴权 UI（9.1） | 端特化 | 直接复用 web | 不适用 | 端特化（配对码输入） |

---

# 4. 缺口优先级（P0 安全 → P1 体验 → P2 能力）

> 本节排序直接被 doc/02 §8 阶段七工单顺序引用；候选池项不阻塞四阶段。

## 4.1 判决记录：Python Worker —— 不做

- **结论**：❌ → 评估后**不做**。阶段七原 7.9（venv 沙箱 python.run 工具）从路线图删除，编号顺延不变（7.10–7.13 保留原号）。
- **理由**：主流本地编码 agent（Claude Code / opencode / pi / Codex CLI）均无独立 Python 执行模块——Claude Code 全部能力经 Bash 工具执行（命令集是 /compact /model /mcp /skills /usage 斜杠命令 + --allowedTools 预授权）；opencode 是 `!` 前缀跑 shell、`@` 引文件；pi 刻意只保留 read/write/edit/bash 四工具，连 MCP 都拒绝内置（实测 Playwright MCP 仅系统提示词就吃 13.7k token），哲学是"CLI 工具 + 按需查阅 README 的渐进披露"。独立 Python Worker（E2B 容器、Jupyter 内核那种）是**云端数据分析型 agent** 的配置——为隔离与跨调用保持内核状态；Spark 是本地工作台，5.2 沙箱已合入，Python 经 bash + venv 完全覆盖。
- **未来路径**：真需要时以**技能或 MCP server 形态外挂**（pi 渐进披露路线），不进内核——D18 的 skills 声明式清单与 D16 的 MCP 管线就是为这种外挂预留的两个正规入口。

## 4.2 其余"不做"判决汇总

| 项 | 判决 | 理由 |
| -- | ---- | ---- |
| 显式 Planner | 不做 | pi 实证模型即 planner；显式规划器属云端长任务场景（§2.1） |
| 虚拟文件系统 | 不做 | 本地场景由路径硬边界+审批+OS 沙箱三层覆盖，checkpoint 承担回滚（§2.3） |
| 短期 Scratchpad 独立项 | 不做 | 会话流+compaction 摘要已承担，加层是重复状态源（§2.2） |
| 错误自修正独立回路 | 不做 | E_TRUNCATED 回喂+isError 回喂已覆盖；工作流归 7.4 自定义命令（§2.5） |
| 沙箱网络隔离 / Windows OS 级 | v1 不做 | ADR D15 已论证三备选全否决；有原生组件诉求再立项（H34） |

## 4.3 P0 —— 安全（先于一切体验项）

| 编号 | 缺口 | 工单 |
| ---- | ---- | ---- |
| H01 | secrets 管理（~/.spark/secrets + 设置页录入 + store>env 优先级） | 7.1 ✅ 已勾销（2026-08-27） |
| H02 | I/O 护栏（注入检测 + 敏感输出过滤） | 7.2 ✅ 已勾销（2026-08-27） |
| H07 | model routing 增强（fallback 链/按任务路由/**成本熔断**） | 7.7 ✅ 已勾销（2026-08-27） |
| —   | 配对鉴权（非环回强制 token，缺省 127.0.0.1 行为不变为红线） | 9.1（ADR D24） |

## 4.4 P1 —— 体验

| 编号 | 缺口 | 工单/候选池 |
| ---- | ---- | ---- |
| H05 | 长期记忆（FTS5，向量后置） | 7.5 |
| H06 | 自动化触发器（cron/watch/webhook） | 7.6 |
| H03 | 用户侧 hooks | 7.3 ✅ 已勾销（2026-08-27） |
| H04 | 命令注册表（/compact 迁入 + 自定义命令；命令集基线对齐 Claude Code 命令面 + opencode leader 键模式） | 7.4 ✅ 已勾销（2026-08-27；opencode leader 键归 8.3 CLI 键位表统一成文） |
| H12 | 会话全文搜索 | 7.13 |
| H11 | 审计日志明细流 | 7.12 |
| H08 | 并行子代理 + 树状监控 | 7.8 |
| H13/H14/H15/H16 | 设置中心/模型选择器/用量条/错误人话化/项目分组/沙箱入口 | 6.2–6.7 |
| H19/H21/H26 | 附件粘贴/文件树/通知推送 | V2-03/V2-04/V2-05 |
| H17/H23 | MCP·技能管理页/成本看板 | V2-01/V2-07 |

## 4.5 P2 —— 能力

| 编号 | 缺口 | 工单/候选池 |
| ---- | ---- | ---- |
| H09 | browser 工具族（Playwright，审批默认 ask） | 7.10 |
| H10 | eval harness | 7.11 |
| H20/H22/H24/H25/H27/H28/H29/H30/H31/H32/H36 | 提示词模板/审查模式/辅助会话/内置终端/trace/i18n/数据管理/诊断页/自更新/onboarding/keymap | V2-16/08/09/10/11/12/13/14/15/17/22 |
| H33/H34/H35 | 代码语义索引/网络隔离/多窗口 | V2-18/19/20 |
| — | MCP HTTP/SSE transport（远程 server） | V2-21 |
| H18 | 插件市场壳 | V2-02 |

---

_本文完（v1.0）。缺口编号 H01–H36 与 doc/02 §8 阶段六~九工单、v2 候选池一一对应；工单内容与 doc/02 冲突时以 doc/02 定稿为准。_
